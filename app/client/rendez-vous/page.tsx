import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import ClientInterviewView, { ClientInterviewItem, ClientProposalItem } from "@/components/client/ClientInterviewView";

export default async function ClientRendezVousPage() {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.agencyId || !session.companyId) {
    redirect("/login");
  }

  const db = forAgency(session);

  const rawInterviews = await db.interview.findMany({
    where: {
      application: { jobOffer: { companyId: session.companyId } },
    },
    orderBy: { startsAt: "asc" },
    include: {
      application: {
        include: {
          candidate: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              currentTitle: true,
            },
          },
          jobOffer: {
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  const rawProposals = await db.interviewProposal.findMany({
    where: {
      application: { jobOffer: { companyId: session.companyId } },
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: {
      slots: { orderBy: { startsAt: "asc" } },
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          jobOffer: { select: { title: true } },
        },
      },
    },
  });

  const initialInterviews: ClientInterviewItem[] = rawInterviews.map((i) => ({
    id: i.id,
    startsAt: i.startsAt.toISOString(),
    endsAt: i.endsAt.toISOString(),
    mode: i.mode,
    locationOrLink: i.locationOrLink,
    status: i.status,
    cancelReason: i.cancelReason,
    application: {
      candidate: i.application.candidate,
      jobOffer: i.application.jobOffer,
    },
  }));

  const initialProposals: ClientProposalItem[] = rawProposals.map((p) => ({
    id: p.id,
    status: p.status,
    mode: p.mode,
    locationOrLink: p.locationOrLink,
    expiresAt: p.expiresAt.toISOString(),
    message: p.message,
    application: p.application,
    slots: p.slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      isChosen: s.isChosen,
    })),
  }));

  return (
    <ClientInterviewView
      initialInterviews={initialInterviews}
      initialProposals={initialProposals}
    />
  );
}
