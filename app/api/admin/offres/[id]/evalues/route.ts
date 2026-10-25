import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: jobOfferId } = await params;
  const db = forAgency(auth.session);

  try {
    const offer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      include: {
        assessment: {
          include: {
            questions: true,
          },
        },
        applications: {
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                currentTitle: true,
                skills: true,
                availableFrom: true,
                cvPublicId: true,
              },
            },
            assessmentAttempts: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                answers: true,
                gradedBy: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: "Offre d'emploi introuvable" }, { status: 404 });
    }

    // Calculer les éléments d'évaluation et de couverture pour chaque candidat
    const requiredSkills = offer.skills || [];

    const evaluatedCandidates = offer.applications
      .filter((app) => app.assessmentAttempts.length > 0)
      .map((app) => {
        const attempt = app.assessmentAttempts[0];

        // Calcul de la couverture des compétences requises de l'offre
        const candidateSkillsSet = new Set(
          (app.candidate.skills || []).map((s) => s.toLowerCase().trim())
        );
        const coveredCount = requiredSkills.filter((s) =>
          candidateSkillsSet.has(s.toLowerCase().trim())
        ).length;

        return {
          applicationId: app.id,
          candidate: app.candidate,
          status: app.status,
          attempt: {
            id: attempt.id,
            status: attempt.status,
            percent: attempt.percent,
            autoPoints: attempt.autoPoints,
            manualPoints: attempt.manualPoints,
            maxPoints: attempt.maxPoints,
            suggestion: attempt.suggestion,
            submittedAt: attempt.submittedAt,
            gradedAt: attempt.gradedAt,
            gradedBy: attempt.gradedBy,
          },
          skillsCoverage: {
            covered: coveredCount,
            total: requiredSkills.length,
            ratioText: `${coveredCount} sur ${requiredSkills.length}`,
          },
        };
      });

    return NextResponse.json({
      offerTitle: offer.title,
      assessment: offer.assessment,
      evaluatedCandidates,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur candidats évalués:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
