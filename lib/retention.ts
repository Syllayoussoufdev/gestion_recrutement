import { prisma } from "@/lib/prisma";
import { deleteCloudinaryAsset } from "@/lib/cloudinary";

export interface PurgeResult {
  purgedAnswersCount: number;
  purgedCandidatesCount: number;
  purgedDocumentsCount: number;
}

/**
 * Exécute la purge automatisée de rétention RGPD pour un cabinet donné (PRD V2 §10.3).
 *
 * 1. Purge des réponses détaillées aux tests (AttemptAnswer) au-delà de testRetentionMonths (défaut 12 mois).
 *    Le score global et les sous-scores sur AssessmentAttempt restent conservés.
 * 2. Purge des candidats inactifs sans candidature en cours au-delà de retentionMonths (défaut 24 mois).
 *    Supprime les documents privés Cloudinary et supprime le candidat.
 * 3. Journalise l'opération dans AuditLog (action: "RETENTION_PURGE").
 */
export async function executeRetentionPurge(
  agencyId: string,
  actorUserId?: string | null,
  ipAddress?: string | null
): Promise<PurgeResult> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: {
      id: true,
      name: true,
      retentionMonths: true,
      testRetentionMonths: true,
    },
  });

  if (!agency) {
    throw new Error(`Cabinet introuvable pour agencyId: ${agencyId}`);
  }

  const now = new Date();

  // 1. Purge des réponses détaillées aux évaluations (testRetentionMonths)
  const testRetentionLimit = new Date(now);
  testRetentionLimit.setMonth(testRetentionLimit.getMonth() - agency.testRetentionMonths);

  const expiredAnswers = await prisma.attemptAnswer.deleteMany({
    where: {
      agencyId,
      attempt: {
        createdAt: { lt: testRetentionLimit },
      },
    },
  });

  const purgedAnswersCount = expiredAnswers.count;

  // 2. Purge des candidats inactifs (retentionMonths)
  const candidateRetentionLimit = new Date(now);
  candidateRetentionLimit.setMonth(candidateRetentionLimit.getMonth() - agency.retentionMonths);

  // Un candidat est éligible s'il est archivé OU sans activité depuis retentionMonths,
  // ET qu'il n'a AUCUNE candidature dans un statut actif en cours.
  const ACTIVE_STATUSES = [
    "RH_INTERVIEW",
    "PRESENTED",
    "INTERVIEW_REQUESTED",
    "INTERVIEW_SCHEDULED",
    "CLIENT_INTERVIEW",
    "OFFER",
    "PLACED",
  ];

  const inactiveCandidates = await prisma.candidate.findMany({
    where: {
      agencyId,
      OR: [
        { archived: true },
        { updatedAt: { lt: candidateRetentionLimit } },
      ],
      applications: {
        none: {
          status: { in: ACTIVE_STATUSES as never },
        },
      },
    },
    include: {
      documents: { select: { id: true, publicId: true, resourceType: true } },
    },
  });

  let purgedDocumentsCount = 0;
  let purgedCandidatesCount = 0;

  for (const cand of inactiveCandidates) {
    // Suppression des documents Cloudinary privés associés
    for (const doc of cand.documents) {
      if (doc.publicId) {
        try {
          await deleteCloudinaryAsset(doc.publicId, (doc.resourceType as "raw" | "image") || "raw");
          purgedDocumentsCount++;
        } catch (err) {
          console.error(`Erreur suppression Cloudinary doc ${doc.id}:`, err);
        }
      }
    }

    // Si le candidat a son CV direct sur le modèle Candidate
    if (cand.cvPublicId) {
      try {
        await deleteCloudinaryAsset(cand.cvPublicId, (cand.cvResourceType as "raw" | "image") || "raw");
        purgedDocumentsCount++;
      } catch (err) {
        console.error(`Erreur suppression Cloudinary cvPublicId ${cand.id}:`, err);
      }
    }

    // Suppression en cascade du candidat et de ses données associées
    await prisma.candidate.delete({
      where: { id: cand.id },
    });
    purgedCandidatesCount++;
  }

  // 3. Journal d'audit (R10 / PRD V2 §10.4 & §10.6)
  await prisma.auditLog.create({
    data: {
      agencyId,
      actorUserId: actorUserId || null,
      action: "RETENTION_PURGE",
      targetType: "Agency",
      targetId: agencyId,
      ipAddress: ipAddress || null,
      metadata: {
        purgedAnswersCount,
        purgedCandidatesCount,
        purgedDocumentsCount,
        candidateRetentionMonths: agency.retentionMonths,
        testRetentionMonths: agency.testRetentionMonths,
      },
    },
  });

  return {
    purgedAnswersCount,
    purgedCandidatesCount,
    purgedDocumentsCount,
  };
}
