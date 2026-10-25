import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { generateInterviewToken } from "@/lib/interviews";
import { InterviewMode, Role } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const slotSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const clientProposalSchema = z.object({
  mode: z.nativeEnum(InterviewMode).default(InterviewMode.VISIO),
  locationOrLink: z.string().trim().optional(),
  message: z.string().trim().optional(),
  slots: z.array(slotSchema).min(1, "Veuillez proposer au moins 1 créneau").max(5, "Maximum 5 créneaux autorisés"),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId || !session.agencyId) {
    return NextResponse.json({ error: "Non rattaché à une entreprise cliente." }, { status: 403 });
  }

  const { id: applicationId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = clientProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { mode, locationOrLink, message, slots } = parsed.data;
  const db = forAgency(session);

  try {
    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        jobOffer: { select: { companyId: true, title: true } },
      },
    });

    if (!application || application.jobOffer.companyId !== session.companyId) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    }

    for (const slot of slots) {
      const s = new Date(slot.startsAt);
      const e = new Date(slot.endsAt);
      if (s >= e) {
        return NextResponse.json(
          { error: "Chaque créneau doit avoir une heure de début antérieure à l'heure de fin." },
          { status: 400 }
        );
      }
    }

    const { token, tokenHash } = generateInterviewToken();
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 jours

    const proposal = await db.interviewProposal.create({
      data: {
        agencyId: session.agencyId,
        applicationId,
        proposedByRole: Role.CLIENT,
        proposedById: session.userId,
        status: "PENDING",
        expiresAt,
        tokenHash,
        mode,
        locationOrLink: locationOrLink || null,
        message: message || null,
        slots: {
          create: slots.map((s) => ({
            agencyId: session.agencyId!,
            startsAt: new Date(s.startsAt),
            endsAt: new Date(s.endsAt),
          })),
        },
      },
      include: { slots: true },
    });

    await db.auditLog.create({
      data: {
        agencyId: session.agencyId,
        actorUserId: session.userId,
        action: "CLIENT_INTERVIEW_PROPOSAL_CREATE",
        targetType: "InterviewProposal",
        targetId: proposal.id,
        metadata: {
          applicationId,
          slotsCount: slots.length,
          mode,
        },
      },
    });

    return NextResponse.json(
      {
        proposal,
        schedulingUrl: `/rdv/${token}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
