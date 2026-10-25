import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus, AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: applicationId } = await params;
  const db = forAgency(auth.session);

  try {
    // 1. Récupérer la candidature et l'offre associée avec l'évaluation
    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        jobOffer: {
          select: {
            id: true,
            title: true,
            assessmentId: true,
            assessment: {
              include: {
                questions: {
                  select: { id: true, points: true },
                },
              },
            },
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
    }

    if (!application.jobOffer.assessmentId || !application.jobOffer.assessment) {
      return NextResponse.json(
        {
          error:
            "Aucun questionnaire d'évaluation n'est associé à cette offre d'emploi. Veuillez d'abord associer une évaluation à l'offre.",
        },
        { status: 400 }
      );
    }

    const assessment = application.jobOffer.assessment;

    // 2. Générer le jeton secret de 32 octets aléatoires (R6 / PRD V2 §10.2)
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Expiration par défaut : 7 jours
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Calcul du total des points maximaux
    const maxPoints = assessment.questions.reduce((sum, q) => sum + (q.points || 1.0), 0);

    // 3. Créer l'enregistrement AssessmentAttempt
    const attempt = await db.assessmentAttempt.create({
      data: {
        agencyId: auth.session.agencyId!,
        assessmentId: assessment.id,
        applicationId,
        candidateId: application.candidateId,
        tokenHash,
        expiresAt,
        status: AttemptStatus.SENT,
        maxPoints,
      },
    });

    // 4. Mettre à jour le statut de la candidature vers ASSESSMENT_SENT si applicable
    const fromStatus = application.status;
    const toStatus = ApplicationStatus.ASSESSMENT_SENT;

    await Promise.all([
      db.application.update({
        where: { id: applicationId },
        data: { status: toStatus },
      }),
      db.applicationHistory.create({
        data: {
          agencyId: auth.session.agencyId!,
          applicationId,
          fromStatus,
          toStatus,
          changedByUserId: auth.session.userId,
          note: `Lien du test "${assessment.title}" généré et envoyé au candidat.`,
        },
      }),
      db.candidate.update({
        where: { id: application.candidateId },
        data: { lastActivityAt: new Date() },
      }),
    ]);

    const testUrl = `/test/${rawToken}`;

    return NextResponse.json(
      {
        attemptId: attempt.id,
        testUrl,
        rawToken,
        expiresAt: expiresAt.toISOString(),
        candidate: application.candidate,
        assessmentTitle: assessment.title,
      },
      { status: 201 }
    );
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur génération lien test:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
