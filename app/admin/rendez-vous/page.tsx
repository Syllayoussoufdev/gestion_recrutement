import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import InterviewManager, { InterviewItem, ProposalItem } from "@/components/admin/InterviewManager";

export default async function AdminRendezVousPage() {
  const session = await getSession();
  if (!session || !["AGENCY_ADMIN", "CONSULTANT"].includes(session.role) || !session.agencyId) {
    redirect("/login");
  }

  const db = forAgency(session);

  const rawInterviews = await db.interview.findMany({
    orderBy: { startsAt: "desc" },
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
            },
          },
          jobOffer: {
            select: {
              id: true,
              title: true,
              company: { select: { id: true, name: true, logoUrl: true } },
            },
          },
        },
      },
    },
  });

  const rawProposals = await db.interviewProposal.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      slots: { orderBy: { startsAt: "asc" } },
      proposedBy: { select: { id: true, firstName: true, lastName: true } },
      application: {
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          jobOffer: { select: { id: true, title: true, company: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const initialInterviews: InterviewItem[] = rawInterviews.map((i) => ({
    id: i.id,
    startsAt: i.startsAt.toISOString(),
    endsAt: i.endsAt.toISOString(),
    timezone: i.timezone,
    mode: i.mode,
    locationOrLink: i.locationOrLink,
    status: i.status,
    cancelReason: i.cancelReason,
    resultNote: i.resultNote,
    application: {
      candidate: i.application.candidate,
      jobOffer: i.application.jobOffer,
    },
  }));

  const initialProposals: ProposalItem[] = rawProposals.map((p) => ({
    id: p.id,
    mode: p.mode,
    status: p.status,
    expiresAt: p.expiresAt.toISOString(),
    message: p.message,
    proposedBy: p.proposedBy,
    application: p.application,
    slots: p.slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      isChosen: s.isChosen,
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Agenda &amp; Suivi des Entretiens</h1>
        <p className="text-sm text-slate-500">
          Suivez les entretiens planifiés, les créneaux proposés aux candidats et consignez les résultats des échanges.
        </p>
      </div>

      <InterviewManager
        initialInterviews={initialInterviews}
        initialProposals={initialProposals}
      />
    </div>
  );
}
