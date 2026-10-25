import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: applicationId } = await params;
  const db = forAgency(auth.session);

  try {
    const application = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Candidature introuvable." },
        { status: 404 }
      );
    }

    await db.application.delete({
      where: { id: applicationId },
    });

    return NextResponse.json({
      success: true,
      message: "Candidature retirée de l'offre.",
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur suppression candidature:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
