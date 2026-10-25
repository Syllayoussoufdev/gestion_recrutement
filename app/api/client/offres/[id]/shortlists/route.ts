import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId || !session.agencyId) {
    return NextResponse.json({ error: "Utilisateur non associé à une entreprise cliente." }, { status: 403 });
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(session);

  try {
    const jobOffer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      select: {
        id: true,
        title: true,
        description: true,
        contractType: true,
        location: true,
        companyId: true,
      },
    });

    if (!jobOffer || jobOffer.companyId !== session.companyId) {
      return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
    }

    const agency = await prisma.agency.findUnique({
      where: { id: session.agencyId },
      select: {
        name: true,
        anonymizeUntilInterest: true,
      },
    });

    const anonymizeSetting = agency?.anonymizeUntilInterest ?? true;

    const shortlists = await db.shortlist.findMany({
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
                    gradedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Formatage avec anonymisation dynamique (PRD V2 §6.2)
    const formattedShortlists = shortlists.map((sl) => ({
      id: sl.id,
      title: sl.title,
      message: sl.message,
      sentAt: sl.sentAt,
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
              }
            : null,
          clientDecision: item.clientDecision,
          clientReason: item.clientReason,
          clientDecidedAt: item.clientDecidedAt,
        };
      }),
    }));

    return NextResponse.json({
      jobOffer,
      shortlists: formattedShortlists,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
