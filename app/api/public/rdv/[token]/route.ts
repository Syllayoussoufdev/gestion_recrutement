import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInterviewToken } from "@/lib/interviews";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Lien d'entretien invalide" }, { status: 400 });
  }

  const tokenHash = hashInterviewToken(token);

  try {
    const proposal = await prisma.interviewProposal.findUnique({
      where: { tokenHash },
      include: {
        agency: {
          select: { name: true, logoUrl: true, brandKey: true },
        },
        slots: {
          orderBy: { startsAt: "asc" },
        },
        interview: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            mode: true,
            locationOrLink: true,
            status: true,
          },
        },
        application: {
          include: {
            candidate: {
              select: { firstName: true, lastName: true },
            },
            jobOffer: {
              select: {
                title: true,
                contractType: true,
                location: true,
                company: { select: { name: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposition d'entretien introuvable." }, { status: 404 });
    }

    const isExpired = proposal.expiresAt < new Date() && proposal.status === "PENDING";

    return NextResponse.json({
      proposal: {
        id: proposal.id,
        status: isExpired ? "EXPIRED" : proposal.status,
        mode: proposal.mode,
        locationOrLink: proposal.locationOrLink,
        message: proposal.message,
        expiresAt: proposal.expiresAt,
        agency: proposal.agency,
        candidateName: `${proposal.application.candidate.firstName} ${proposal.application.candidate.lastName.charAt(0)}.`,
        jobOffer: proposal.application.jobOffer,
        slots: proposal.slots.map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          isChosen: s.isChosen,
        })),
        confirmedInterview: proposal.interview,
      },
    });
  } catch (error) {
    console.error("Erreur lecture proposition publique:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
