import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { deleteCloudinaryAsset } from "@/lib/cloudinary";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const db = forAgency(auth.session);

  try {
    const doc = await db.document.findUnique({
      where: { id },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    // Supprimer sur Cloudinary (non bloquant si Cloudinary échoue)
    await deleteCloudinaryAsset(
      doc.publicId,
      doc.resourceType as "raw" | "image",
      doc.deliveryType
    );

    // Supprimer en base
    await db.document.delete({
      where: { id },
    });

    // Enregistrer dans le journal d'audit
    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "DOCUMENT_DELETE",
        targetType: "Document",
        targetId: id,
        metadata: {
          publicId: doc.publicId,
          label: doc.label,
          candidateId: doc.candidateId,
        },
      },
    });

    return NextResponse.json({ success: true, message: "Document supprimé avec succès." });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur suppression document:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
