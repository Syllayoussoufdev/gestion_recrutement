import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: applicationId } = await params;
  const db = forAgency(auth.session);

  try {
    // Vérifier l'accès à la candidature
    const application = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, agencyId: true },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Candidature introuvable." },
        { status: 404 }
      );
    }

    const historyItems = await db.applicationHistory.findMany({
      where: { applicationId },
      orderBy: { changedAt: "desc" },
    });

    // Récupérer les noms des utilisateurs ayant effectué les changements
    const userIds = Array.from(
      new Set(historyItems.map((h) => h.changedByUserId).filter(Boolean) as string[])
    );

    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedHistory = historyItems.map((item) => ({
      ...item,
      changedByUser: item.changedByUserId ? userMap.get(item.changedByUserId) || null : null,
    }));

    return NextResponse.json(enrichedHistory);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture historique candidature:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
