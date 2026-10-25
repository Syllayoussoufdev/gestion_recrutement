import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import ShortlistManager from "@/components/admin/ShortlistManager";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOfferShortlistsPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || !["AGENCY_ADMIN", "CONSULTANT"].includes(session.role) || !session.agencyId) {
    redirect("/login");
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(session);

  const jobOffer = await db.jobOffer.findUnique({
    where: { id: jobOfferId },
    include: {
      company: {
        select: { id: true, name: true },
      },
      applications: {
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              currentTitle: true,
            },
          },
          assessmentAttempts: {
            where: { status: "GRADED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { percent: true },
          },
        },
      },
      shortlists: {
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: {
            include: {
              application: {
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
                    },
                  },
                  assessmentAttempts: {
                    where: { status: "GRADED" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                      id: true,
                      autoPoints: true,
                      manualPoints: true,
                      maxPoints: true,
                      percent: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!jobOffer) {
    notFound();
  }

  const availableCandidates = jobOffer.applications.map((app) => ({
    applicationId: app.id,
    candidateId: app.candidate.id,
    firstName: app.candidate.firstName,
    lastName: app.candidate.lastName,
    email: app.candidate.email,
    currentTitle: app.candidate.currentTitle,
    status: app.status,
    latestScorePercent: app.assessmentAttempts[0]?.percent ?? null,
  }));

  const initialShortlists = jobOffer.shortlists.map((sl) => ({
    id: sl.id,
    title: sl.title,
    message: sl.message,
    status: sl.status,
    sentAt: sl.sentAt ? sl.sentAt.toISOString() : null,
    createdAt: sl.createdAt.toISOString(),
    createdBy: sl.createdBy,
    items: sl.items.map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      summary: item.summary,
      showTestResult: item.showTestResult,
      showSubscores: item.showSubscores,
      cvShared: item.cvShared,
      consentStatus: item.consentStatus,
      consentAt: item.consentAt ? item.consentAt.toISOString() : null,
      clientDecision: item.clientDecision,
      clientReason: item.clientReason,
      clientDecidedAt: item.clientDecidedAt ? item.clientDecidedAt.toISOString() : null,
      application: {
        id: item.application.id,
        status: item.application.status,
        candidate: item.application.candidate,
        assessmentAttempts: item.application.assessmentAttempts.map((att) => ({
          id: att.id,
          score: Math.round(((att.autoPoints ?? 0) + (att.manualPoints ?? 0)) * 10) / 10,
          maxScore: att.maxPoints,
          scorePercent: att.percent ?? 0,
          isComplete: true,
          subscores: null,
        })),
      },
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Gestion des Shortlists • {jobOffer.title}
        </h1>
        <p className="text-sm text-slate-500">
          Sélectionnez les candidats validés, gérez leur accord préalable (consentement) et transmettez la shortlist directement au portail client de {jobOffer.company.name}.
        </p>
      </div>

      <ShortlistManager
        jobOfferId={jobOffer.id}
        jobOfferTitle={jobOffer.title}
        companyName={jobOffer.company.name}
        initialShortlists={initialShortlists}
        availableCandidates={availableCandidates}
      />
    </div>
  );
}
