import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyOrigin } from "@/lib/security";
import {
  SESSION_COOKIE_NAME,
  SessionJwtPayload,
  signSessionJwt,
  verifySessionJwt,
  getRoleRedirectPath,
} from "@/lib/jwt";

export {
  SESSION_COOKIE_NAME,
  type SessionJwtPayload,
  getRoleRedirectPath,
};

export interface AuthenticatedSession extends SessionJwtPayload {
  firstName: string;
  lastName: string;
  companyId: string | null;
  candidateId: string | null;
  agencyName: string | null;
  agencySlug: string | null;
}

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Extrait la valeur brute du cookie de session depuis une Request ou via next/headers.
 */
async function extractSessionToken(request?: Request): Promise<string | null> {
  if (request) {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;
    const match = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!match) return null;
    return decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1));
  }

  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * PRD V2 §2.4 & §10.3 :
 * Lit le cookie "stratos_session", vérifie le JWT avec jose, puis vérifie en base :
 * 1) que l'utilisateur existe et est actif (isActive === true)
 * 2) que user.tokenVersion === jwt.tokenVersion (invalidation immédiate des sessions)
 * 3) que le cabinet associé (si applicable) n'est pas SUSPENDED
 */
export async function getSession(
  request?: Request
): Promise<AuthenticatedSession | null> {
  const rawToken = await extractSessionToken(request);
  if (!rawToken) return null;

  const jwtPayload = await verifySessionJwt(rawToken);
  if (!jwtPayload) return null;

  const user = await prisma.user.findUnique({
    where: { id: jwtPayload.userId },
    include: {
      agency: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  // Vérification stricte de tokenVersion (R5 / PRD V2 §10.3)
  if (user.tokenVersion !== jwtPayload.tokenVersion) {
    return null;
  }

  // Vérification que le rôle et le cabinet n'ont pas divergé
  if (user.role !== jwtPayload.role || user.agencyId !== jwtPayload.agencyId) {
    return null;
  }

  // Un cabinet suspendu ne peut plus accéder à l'application
  if (user.agency && user.agency.status === "SUSPENDED") {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
    tokenVersion: user.tokenVersion,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    companyId: user.companyId,
    candidateId: user.candidateId,
    agencyName: user.agency?.name ?? null,
    agencySlug: user.agency?.slug ?? null,
  };
}

export type RequireRoleResult =
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; response: NextResponse };

/**
 * Vérifie :
 * 1) L'en-tête Origin sur les requêtes mutantes (POST/PUT/PATCH/DELETE)
 * 2) La session authentifiée (y compris tokenVersion en base)
 * 3) Le rôle autorisé (accepte un Role ou un tableau de Role[])
 */
export async function requireRole(
  request: Request,
  allowedRoles: Role | Role[]
): Promise<RequireRoleResult> {
  const originError = verifyOrigin(request);
  if (originError) {
    return { ok: false, response: originError };
  }

  const session = await getSession(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Non authentifié ou session expirée" },
        { status: 401 }
      ),
    };
  }

  const rolesArray = Array.isArray(allowedRoles)
    ? allowedRoles
    : [allowedRoles];

  if (!rolesArray.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accès refusé pour ce rôle" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}

/**
 * Génère le JWT et applique le cookie HttpOnly, Secure, SameSite=Lax sur une NextResponse.
 */
export async function applySessionCookie(
  response: NextResponse,
  payload: SessionJwtPayload
): Promise<NextResponse> {
  const { token, maxAge } = await signSessionJwt(payload);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
  return response;
}

/**
 * Efface le cookie de session sur une NextResponse.
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
