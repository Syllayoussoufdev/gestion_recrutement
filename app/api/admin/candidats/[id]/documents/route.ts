import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const documentCreateSchema = z.object({
  label: z.string().trim().min(1, "Le libellé est requis"),
  publicId: z.string().trim().min(1, "L'identifiant de document (publicId) est requis"),
  resourceType: z.string().default("raw"),
  deliveryType: z.string().default("authenticated"),
  mimeType: z.string().trim().min(1, "Le type MIME est requis"),
  sizeBytes: z.number().int().nonnegative("La taille doit être positive"),
});

export async function POST(request: Request, context: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: candidateId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = documentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);
  const data = parsed.data;

  try {
    // Vérifier l'existence du candidat dans le cabinet
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    }

    const doc = await db.document.create({
      data: {
        agencyId: auth.session.agencyId!,
        candidateId,
        label: data.label,
        publicId: data.publicId,
        resourceType: data.resourceType,
        deliveryType: "authenticated",
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      },
    });

    // Mettre à jour lastActivityAt du candidat
    await db.candidate.update({
      where: { id: candidateId },
      data: { lastActivityAt: new Date() },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur création document:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
