import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  applySessionCookie,
  getRoleRedirectPath,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, getClientIp, verifyOrigin } from "@/lib/security";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Format d'email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

const GENERIC_AUTH_ERROR = "Email ou mot de passe incorrect";

/**
 * POST /api/auth/login
 * Test curl attendu :
 * curl -i -X POST http://localhost:3000/api/auth/login \
 *   -H "Origin: http://localhost:3000" \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"admin@stratosconseil.test","password":"..."}'
 * -> 200 OK + Set-Cookie: stratos_session=...; HttpOnly; SameSite=Lax + {"role":"AGENCY_ADMIN","redirectTo":"/admin"}
 */
export async function POST(request: Request) {
  const originError = verifyOrigin(request);
  if (originError) {
    return originError;
  }

  const clientIp = getClientIp(request);
  const ipRateLimit = await checkRateLimit(`login:ip:${clientIp}`, 10, 15 * 60);
  if (!ipRateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Trop de tentatives de connexion. Veuillez réessayer plus tard.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil((ipRateLimit.resetAt.getTime() - Date.now()) / 1000)
            )
          ),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Données de connexion invalides",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      agency: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // Si l'utilisateur appartient à un cabinet suspendu, refuser la connexion
  if (user.agency && user.agency.status === "SUSPENDED") {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  const redirectTo = getRoleRedirectPath(user.role);
  const response = NextResponse.json(
    {
      role: user.role,
      agencyId: user.agencyId,
      redirectTo,
    },
    { status: 200 }
  );

  await applySessionCookie(response, {
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
    tokenVersion: user.tokenVersion,
    email: user.email,
  });

  return response;
}
