import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const statusUpdateSchema = z.object({
  toStatus: z.nativeEnum(ApplicationStatus),
  note: z.string().trim().optional(),
  reason: z.string().trim().optional(),
  cvSharedClient: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: applicationId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { toStatus, note, reason, cvSharedClient } = parsed.data;
  const db = forAgency(auth.session);

  try {
    // 1. Vérifier l'existence et l'appartenance au cabinet
    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Candidature introuvable." },
        { status: 404 }
      );
    }

    const fromStatus = application.status;

    // Règle R2 : Pas de rejet automatique — décision humaine tracée
    // Si passage à REJECTED, s'assurer que le motif ou note est pris en compte
    const rejectionReason = toStatus === ApplicationStatus.REJECTED ? (reason || note || "Non retenu") : null;

    // Mise à jour cvSharedClient si spécifié ou par défaut à true lors du passage à PRESENTED
    let updateCvShared = application.cvSharedClient;
    if (typeof cvSharedClient === "boolean") {
      updateCvShared = cvSharedClient;
    } else if (toStatus === ApplicationStatus.PRESENTED) {
      updateCvShared = true;
    }

    // 2. Mettre à jour l'application et insérer l'historique dans la même transaction
    const [updatedApp, historyEntry] = await Promise.all([
      db.application.update({
        where: { id: applicationId },
        data: {
          status: toStatus,
          rejectionReason,
          cvSharedClient: updateCvShared,
        },
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              currentTitle: true,
              skills: true,
              cvPublicId: true,
            },
          },
        },
      }),
      db.applicationHistory.create({
        data: {
          agencyId: auth.session.agencyId!,
          applicationId,
          fromStatus,
          toStatus,
          changedByUserId: auth.session.userId,
          note: note || null,
          reason: reason || rejectionReason || null,
        },
      }),
      // Mettre à jour lastActivityAt du candidat
      db.candidate.update({
        where: { id: application.candidateId },
        data: { lastActivityAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      application: updatedApp,
      history: historyEntry,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur mise à jour statut candidature:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut" },
      { status: 500 }
    );
  }
}
