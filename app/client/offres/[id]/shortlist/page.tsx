import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forAgency } from "@/lib/tenant";
import ClientShortlistView, { ClientShortlistGroup } from "@/components/client/ClientShortlistView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientOfferShortlistPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.agencyId || !session.companyId) {
    redirect("/login");
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(session);

  const jobOffer = await db.jobOffer.findUnique({
    where: { id: jobOfferId },
    select: {
      id: true,
      title: true,
      contractType: true,
      location: true,
      companyId: true,
      agencyId: true,
    },
  });

  if (!jobOffer || jobOffer.companyId !== session.companyId) {
    notFound();
  }

  const agency = await prisma.agency.findUnique({
    where: { id: session.agencyId },
    select: {
      anonymizeUntilInterest: true,
    },
  });

  const anonymizeSetting = agency?.anonymizeUntilInterest ?? true;

  const rawShortlists = await db.shortlist.findMany({
    where: {
      jobOfferId,
      status: "SENT",
    },
    orderBy: { sentAt: "desc" },
    include: {
      createdBy: {
        select: { firstName: true, lastName: true },
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
                  cvPublicId: true,
                  documents: {
                    select: { id: true, label: true, sizeBytes: true },
                    take: 1,
                  },
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
  });

  const formattedShortlists: ClientShortlistGroup[] = rawShortlists.map((sl) => ({
    id: sl.id,
    title: sl.title,
    message: sl.message,
    sentAt: sl.sentAt ? sl.sentAt.toISOString() : null,
    consultant: `${sl.createdBy.firstName} ${sl.createdBy.lastName}`,
    items: sl.items.map((item) => {
      const c = item.application.candidate;
      const isInterested = item.clientDecision === "INTERESTED";
      const isAnonymized = anonymizeSetting && !isInterested;

      const displayName = isAnonymized
        ? `${c.firstName} ${c.lastName ? c.lastName.charAt(0).toUpperCase() + "." : ""}`
        : `${c.firstName} ${c.lastName}`;

      const cvDoc = c.documents[0] ?? null;
      const latestAttempt = item.application.assessmentAttempts[0] ?? null;

      return {
        id: item.id,
        applicationId: item.applicationId,
        isAnonymized,
        displayName,
        email: isAnonymized ? null : c.email,
        phone: isAnonymized ? null : c.phone,
        currentTitle: c.currentTitle,
        skills: c.skills,
        summary: item.summary,
        cvAvailable: item.cvShared && (isInterested || !anonymizeSetting),
        cvDocumentId: (item.cvShared && (isInterested || !anonymizeSetting))
          ? (cvDoc ? cvDoc.id : (c.cvPublicId ? c.id : null))
          : null,
        testResult: item.showTestResult && latestAttempt
          ? {
              score: Math.round(((latestAttempt.autoPoints ?? 0) + (latestAttempt.manualPoints ?? 0)) * 10) / 10,
              maxScore: latestAttempt.maxPoints,
              scorePercent: latestAttempt.percent ?? 0,
              isComplete: true,
              subscores: null,
            }
          : null,
        clientDecision: item.clientDecision,
        clientReason: item.clientReason,
        clientDecidedAt: item.clientDecidedAt ? item.clientDecidedAt.toISOString() : null,
      };
    }),
  }));

  return (
    <ClientShortlistView
      jobOfferId={jobOffer.id}
      jobOfferTitle={jobOffer.title}
      jobOfferContract={jobOffer.contractType}
      jobOfferLocation={jobOffer.location}
      initialShortlists={formattedShortlists}
    />
  );
}
