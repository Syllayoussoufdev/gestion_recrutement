import crypto from "node:crypto";

/**
 * R6 / PRD V2 §10.2 :
 * Jeton aléatoire de 32 octets encodé en base64url.
 * Seule l'empreinte SHA-256 (tokenHash) est stockée en base de données.
 * Jamais cuid() pour un secret.
 */
export function generateSecureToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

/**
 * Calcule l'empreinte SHA-256 hexadécimale d'un jeton brut.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}
