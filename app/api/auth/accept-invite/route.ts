import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  applySessionCookie,
  getRoleRedirectPath,
  hashPassword,
} from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import { checkRateLimit, getClientIp, verifyOrigin } from "@/lib/security";

const acceptInviteSchema = z
  .object({
    token: z.string().min(16, "Jeton d'invitation invalide"),
    firstName: z.string().trim().min(1, "Prénom requis"),
    lastName: z.string().trim().min(1, "Nom requis"),
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

/**
 * POST /api/auth/accept-invite
 * R6 : Le jeton reçu dans l'URL est haché en SHA-256 avant comparaison avec Invitation.tokenHash.
 */
export async function POST(request: Request) {
  const originError = verifyOrigin(request);
  if (originError) {
    return originError;
  }

  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit(
    `accept-invite:ip:${clientIp}`,
    10,
    15 * 60
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Veuillez réessayer plus tard." },
      { status: 429 }
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

  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Données invalides",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { token, firstName, lastName, password } = parsed.data;
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      agency: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation introuvable ou invalide" },
      { status: 404 }
    );
  }

  if (invitation.usedAt) {
    return NextResponse.json(
      { error: "Cette invitation a déjà été utilisée" },
      { status: 400 }
    );
  }

  if (invitation.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "Cette invitation a expiré" },
      { status: 400 }
    );
  }

  if (invitation.agency.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "Le cabinet rattaché à cette invitation est suspendu" },
      { status: 403 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email.toLowerCase() },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Un compte existe déjà pour cette adresse email" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        agencyId: invitation.agencyId,
        email: invitation.email.toLowerCase(),
        passwordHash,
        role: invitation.role,
        firstName,
        lastName,
        companyId: invitation.companyId,
        candidateId: invitation.candidateId,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    });

    return user;
  });

  const redirectTo = getRoleRedirectPath(createdUser.role);
  const response = NextResponse.json(
    {
      role: createdUser.role,
      agencyId: createdUser.agencyId,
      redirectTo,
    },
    { status: 201 }
  );

  await applySessionCookie(response, {
    userId: createdUser.id,
    role: createdUser.role,
    agencyId: createdUser.agencyId,
    tokenVersion: createdUser.tokenVersion,
    email: createdUser.email,
  });

  return response;
}
