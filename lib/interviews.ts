import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { InterviewStatus } from "@prisma/client";

/**
 * Génère un jeton aléatoire de 32 octets et son hachage SHA-256 (Règle R6 / PRD V2 §10.2).
 */
export function generateInterviewToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashInterviewToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Vérifie si le candidat a déjà un entretien confirmé qui chevauche la plage [startsAt, endsAt[ (PRD V2 §7.2).
 */
export async function checkCandidateConflict(
  agencyId: string,
  candidateId: string,
  startsAt: Date,
  endsAt: Date,
  excludeInterviewId?: string
): Promise<boolean> {
  const conflicting = await prisma.interview.findFirst({
    where: {
      agencyId,
      application: { candidateId },
      status: InterviewStatus.SCHEDULED,
      ...(excludeInterviewId ? { id: { not: excludeInterviewId } } : {}),
      AND: [
        { startsAt: { lt: endsAt } },
        { endsAt: { gt: startsAt } },
      ],
    },
    select: { id: true },
  });

  return Boolean(conflicting);
}
