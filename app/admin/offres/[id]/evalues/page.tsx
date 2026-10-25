import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, HelpCircle, Briefcase, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EvaluatedCandidatesView from "@/components/admin/EvaluatedCandidatesView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOfferEvaluatedCandidatesPage({ params }: PageProps) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let offer;
  try {
    offer = await db.jobOffer.findUnique({
      where: { id },
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
                gradedBy: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
  }

  if (!offer) {
    notFound();
  }

  const requiredSkills = offer.skills || [];

  const evaluatedCandidates = offer.applications
    .filter((app) => app.assessmentAttempts.length > 0)
    .map((app) => {
      const attempt = app.assessmentAttempts[0];

      const candidateSkillsSet = new Set(
        (app.candidate.skills || []).map((s) => s.toLowerCase().trim())
      );
      const coveredCount = requiredSkills.filter((s) =>
        candidateSkillsSet.has(s.toLowerCase().trim())
      ).length;

      return {
        applicationId: app.id,
        candidate: {
          ...app.candidate,
          availableFrom: app.candidate.availableFrom?.toISOString() || null,
        },
        status: app.status,
        attempt: {
          id: attempt.id,
          status: attempt.status,
          percent: attempt.percent,
          autoPoints: attempt.autoPoints,
          manualPoints: attempt.manualPoints,
          maxPoints: attempt.maxPoints,
          suggestion: attempt.suggestion,
          submittedAt: attempt.submittedAt?.toISOString() || null,
          gradedAt: attempt.gradedAt?.toISOString() || null,
          gradedBy: attempt.gradedBy,
        },
        skillsCoverage: {
          covered: coveredCount,
          total: requiredSkills.length,
          ratioText: `${coveredCount} sur ${requiredSkills.length}`,
        },
      };
    });

  return (
    <div className="space-y-6">
      {/* Barre de navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/offres/${offer.id}`}
            className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-primary" />
                Candidats Évalués : {offer.title}
              </h1>
              <Badge variant="outline" className="text-xs">
                {offer.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-0.5">
              Évaluation associée :{" "}
              <strong>{offer.assessment?.title || "Aucune évaluation associée"}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/offres/${offer.id}/pipeline`}>
              Vue Pipeline (Kanban)
            </Link>
          </Button>
        </div>
      </div>

      <EvaluatedCandidatesView
        offerId={offer.id}
        offerTitle={offer.title}
        assessmentTitle={offer.assessment?.title || "Évaluation"}
        initialItems={evaluatedCandidates}
      />
    </div>
  );
}
