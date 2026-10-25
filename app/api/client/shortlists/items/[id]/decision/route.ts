import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus, ClientDecision } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const clientDecisionSchema = z.object({
  decision: z.nativeEnum(ClientDecision),
  reason: z.string().trim().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId || !session.agencyId) {
    return NextResponse.json({ error: "Utilisateur non associé à une entreprise cliente." }, { status: 403 });
  }

  const { id: itemId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = clientDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { decision, reason } = parsed.data;

  // Règle qualité feedback : motif obligatoire pour NOT_FOR_THIS_ROLE ou NEEDS_INFO
  if (decision === ClientDecision.NOT_FOR_THIS_ROLE && (!reason || reason.length < 3)) {
    return NextResponse.json(
      { error: "Veuillez indiquer un motif de refus (au moins 3 caractères) pour orienter votre consultant." },
      { status: 400 }
    );
  }

  if (decision === ClientDecision.NEEDS_INFO && (!reason || reason.length < 3)) {
    return NextResponse.json(
      { error: "Veuillez préciser les informations complémentaires souhaitées (au moins 3 caractères)." },
      { status: 400 }
    );
  }

  const db = forAgency(session);

  try {
    const item = await db.shortlistItem.findUnique({
      where: { id: itemId },
      include: {
        shortlist: {
          select: {
            id: true,
            status: true,
            jobOfferId: true,
            jobOffer: {
              select: { companyId: true, title: true },
            },
          },
        },
        application: {
          select: { id: true, status: true, candidateId: true },
        },
      },
    });

    if (!item || item.shortlist.jobOffer.companyId !== session.companyId) {
      return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
    }

    if (item.shortlist.status !== "SENT") {
      return NextResponse.json(
        { error: "Impossible d'enregistrer une décision sur une shortlist non validée/envoyée." },
        { status: 400 }
      );
    }

    const now = new Date();
    const updatedItem = await db.shortlistItem.update({
      where: { id: itemId },
      data: {
        clientDecision: decision,
        clientReason: reason || null,
        clientDecidedAt: now,
      },
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
          },
        },
      },
    });

    // Évolution de la candidature selon le retour
    if (decision === ClientDecision.INTERESTED) {
      if (item.application.status === ApplicationStatus.PRESENTED) {
        await db.application.update({
          where: { id: item.applicationId },
          data: { status: ApplicationStatus.INTERVIEW_REQUESTED },
        });

        await db.applicationHistory.create({
          data: {
            agencyId: session.agencyId,
            applicationId: item.applicationId,
            fromStatus: ApplicationStatus.PRESENTED,
            toStatus: ApplicationStatus.INTERVIEW_REQUESTED,
            changedByUserId: session.userId,
            note: "Intérêt manifesté par l'entreprise cliente : entretien demandé.",
          },
        });
      }
    } else if (decision === ClientDecision.NOT_FOR_THIS_ROLE) {
      // Trace dans l'historique de candidature sans rejet automatique (Règle R2 décision humaine)
      await db.applicationHistory.create({
        data: {
          agencyId: session.agencyId,
          applicationId: item.applicationId,
          fromStatus: item.application.status,
          toStatus: item.application.status,
          changedByUserId: session.userId,
          note: `Retour client : Non retenu pour ce poste. Motif : ${reason}`,
        },
      });
    } else if (decision === ClientDecision.NEEDS_INFO) {
      await db.applicationHistory.create({
        data: {
          agencyId: session.agencyId,
          applicationId: item.applicationId,
          fromStatus: item.application.status,
          toStatus: item.application.status,
          changedByUserId: session.userId,
          note: `Demande d'information complémentaire client : ${reason}`,
        },
      });
    }

    // Journal d'audit
    await db.auditLog.create({
      data: {
        agencyId: session.agencyId,
        actorUserId: session.userId,
        action: "CLIENT_SHORTLIST_DECISION",
        targetType: "ShortlistItem",
        targetId: item.id,
        metadata: {
          decision,
          reason,
          candidateId: item.application.candidateId,
          jobOfferId: item.shortlist.jobOfferId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      decision,
      item: {
        id: updatedItem.id,
        clientDecision: updatedItem.clientDecision,
        clientReason: updatedItem.clientReason,
        clientDecidedAt: updatedItem.clientDecidedAt,
        candidate: updatedItem.application.candidate,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
