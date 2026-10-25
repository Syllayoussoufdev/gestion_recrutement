import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "stratos_session";

export interface SessionJwtPayload {
  userId: string;
  role: Role;
  agencyId: string | null;
  tokenVersion: number;
  email: string;
}

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET manquant ou trop court dans les variables d'environnement (32 caractères minimum requis)."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Durée de session selon le rôle (PRD V2 §10.3) :
 * - 7 jours pour PLATFORM_ADMIN, AGENCY_ADMIN, CONSULTANT
 * - 24 heures pour CLIENT et CANDIDAT
 */
export function getSessionMaxAgeSeconds(role: Role): number {
  if (role === "CLIENT" || role === "CANDIDAT") {
    return 60 * 60 * 24; // 24 heures
  }
  return 60 * 60 * 24 * 7; // 7 jours
}

/**
 * Route de redirection post-login selon le rôle.
 */
export function getRoleRedirectPath(role: Role): string {
  switch (role) {
    case "PLATFORM_ADMIN":
      return "/platform";
    case "AGENCY_ADMIN":
    case "CONSULTANT":
      return "/admin";
    case "CLIENT":
      return "/client";
    case "CANDIDAT":
      return "/candidat";
  }
}

/**
 * Signe un JWT HS256 contenant { userId, role, agencyId, tokenVersion, email }.
 */
export async function signSessionJwt(
  payload: SessionJwtPayload
): Promise<{ token: string; maxAge: number }> {
  const maxAge = getSessionMaxAgeSeconds(payload.role);
  const token = await new SignJWT({
    userId: payload.userId,
    role: payload.role,
    agencyId: payload.agencyId,
    tokenVersion: payload.tokenVersion,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getJwtSecretKey());

  return { token, maxAge };
}

/**
 * Vérifie la signature et l'expiration d'un JWT de session.
 */
export async function verifySessionJwt(
  token: string
): Promise<SessionJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.tokenVersion !== "number" ||
      typeof payload.email !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role as Role,
      agencyId: typeof payload.agencyId === "string" ? payload.agencyId : null,
      tokenVersion: payload.tokenVersion,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
