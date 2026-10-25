import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashInterviewToken, checkCandidateConflict } from "@/lib/interviews";
import { ApplicationStatus, InterviewStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ token: string }>;
}

const chooseSlotSchema = z.object({
  slotId: z.string().min(1, "Identifiant de créneau obligatoire"),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Jeton d'entretien invalide" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = chooseSlotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { slotId } = parsed.data;
  const tokenHash = hashInterviewToken(token);

  try {
    const proposal = await prisma.interviewProposal.findUnique({
      where: { tokenHash },
      include: {
        slots: true,
        application: {
          select: { id: true, candidateId: true, status: true },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 });
    }

    if (proposal.status !== "PENDING") {
      return NextResponse.json(
        { error: "Cette proposition a déjà été traitée ou annulée." },
        { status: 400 }
      );
    }

    if (proposal.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Ce lien d'invitation a expiré. Veuillez contacter votre consultant." },
        { status: 410 }
      );
    }

    const selectedSlot = proposal.slots.find((s) => s.id === slotId);
    if (!selectedSlot) {
      return NextResponse.json(
        { error: "Le créneau sélectionné ne fait pas partie de cette proposition." },
        { status: 400 }
      );
    }

    // Règle PRD V2 §7.2 : Détection des conflits d'agenda pour le candidat
    const hasConflict = await checkCandidateConflict(
      proposal.agencyId,
      proposal.application.candidateId,
      selectedSlot.startsAt,
      selectedSlot.endsAt
    );

    if (hasConflict) {
      return NextResponse.json(
        { error: "Vous avez déjà un autre entretien confirmé sur cette plage horaire. Veuillez choisir un autre créneau." },
        { status: 409 }
      );
    }

    // Confirmation atomique en transaction
    const icsUid = crypto.randomUUID();

    const [updatedProposal, interview] = await prisma.$transaction([
      prisma.interviewProposal.update({
        where: { id: proposal.id },
        data: {
          status: "ACCEPTED",
          slots: {
            update: {
              where: { id: slotId },
              data: { isChosen: true },
            },
          },
        },
      }),
      prisma.interview.create({
        data: {
          agencyId: proposal.agencyId,
          applicationId: proposal.applicationId,
          proposalId: proposal.id,
          startsAt: selectedSlot.startsAt,
          endsAt: selectedSlot.endsAt,
          mode: proposal.mode,
          locationOrLink: proposal.locationOrLink,
          status: InterviewStatus.SCHEDULED,
          icsUid,
        },
      }),
      prisma.application.update({
        where: { id: proposal.applicationId },
        data: {
          status: ApplicationStatus.INTERVIEW_SCHEDULED,
        },
      }),
      prisma.applicationHistory.create({
        data: {
          agencyId: proposal.agencyId,
          applicationId: proposal.applicationId,
          fromStatus: proposal.application.status,
          toStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
          note: `Créneau d'entretien confirmé par le candidat (${selectedSlot.startsAt.toISOString()} UTC)`,
        },
      }),
      prisma.auditLog.create({
        data: {
          agencyId: proposal.agencyId,
          action: "INTERVIEW_CONFIRMED_PUBLIC",
          targetType: "Interview",
          targetId: proposal.id,
          metadata: {
            slotId,
            startsAt: selectedSlot.startsAt,
            endsAt: selectedSlot.endsAt,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Votre créneau d'entretien a été confirmé avec succès !",
      interview: {
        id: interview.id,
        startsAt: interview.startsAt,
        endsAt: interview.endsAt,
        mode: interview.mode,
        locationOrLink: interview.locationOrLink,
        status: interview.status,
      },
      proposalStatus: updatedProposal.status,
    });
  } catch (error) {
    console.error("Erreur sélection créneau entretien:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
