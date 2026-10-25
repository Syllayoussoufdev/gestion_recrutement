import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus, ConsentStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: shortlistId } = await params;
  const db = forAgency(auth.session);

  try {
    const shortlist = await db.shortlist.findUnique({
      where: { id: shortlistId },
      include: {
        jobOffer: {
          select: { id: true, title: true, companyId: true },
        },
        items: {
          include: {
            application: {
              select: { id: true, status: true, candidateId: true },
            },
          },
        },
      },
    });

    if (!shortlist) {
      return NextResponse.json({ error: "Shortlist introuvable." }, { status: 404 });
    }

    if (shortlist.status === "SENT") {
      return NextResponse.json(
        { error: "Cette shortlist a déjà été transmise au client." },
        { status: 400 }
      );
    }

    if (shortlist.items.length === 0) {
      return NextResponse.json(
        { error: "La shortlist ne contient aucun candidat. Veuillez ajouter au moins un candidat." },
        { status: 400 }
      );
    }

    // ── Règle stricte PRD V2 §6.2 : Consentement candidat préalable obligatoire ──
    const missingConsentItems = shortlist.items.filter(
      (item) => item.consentStatus !== ConsentStatus.GRANTED
    );

    if (missingConsentItems.length > 0) {
      return NextResponse.json(
        {
          error: "Transmission bloquée : tous les candidats doivent avoir donné leur accord préalable (consentement statut GRANTED obligatoire) avant envoi au client.",
          unconsentedCount: missingConsentItems.length,
        },
        { status: 400 }
      );
    }

    // Mise à jour en transaction : passage en SENT + transition des candidatures vers PRESENTED
    const now = new Date();
    await db.shortlist.update({
      where: { id: shortlistId },
      data: {
        status: "SENT",
        sentAt: now,
      },
    });

    const eligibleForPresented: ApplicationStatus[] = [
      ApplicationStatus.IDENTIFIED,
      ApplicationStatus.CONTACTED,
      ApplicationStatus.ASSESSMENT_SENT,
      ApplicationStatus.ASSESSMENT_DONE,
      ApplicationStatus.VALIDATED,
      ApplicationStatus.RH_INTERVIEW,
    ];

    for (const item of shortlist.items) {
      const app = item.application;
      if (eligibleForPresented.includes(app.status)) {
        await db.application.update({
          where: { id: app.id },
          data: {
            status: ApplicationStatus.PRESENTED,
            cvSharedClient: item.cvShared,
          },
        });

        await db.applicationHistory.create({
          data: {
            agencyId: auth.session.agencyId!,
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: ApplicationStatus.PRESENTED,
            changedByUserId: auth.session.userId,
            note: `Profil présenté à l'entreprise cliente dans la shortlist « ${shortlist.title} »`,
          },
        });
      }
    }

    // AuditLog
    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "SHORTLIST_SENT",
        targetType: "Shortlist",
        targetId: shortlist.id,
        metadata: {
          jobOfferId: shortlist.jobOfferId,
          title: shortlist.title,
          candidatesCount: shortlist.items.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `La shortlist « ${shortlist.title} » (${shortlist.items.length} candidat(s)) a été transmise au client avec succès.`,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
