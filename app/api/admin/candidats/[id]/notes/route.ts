import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const noteSchema = z.object({
  content: z.string().trim().min(1, "Le contenu de la note est requis"),
  tag: z.enum(["INTERNAL", "CLIENT_FEEDBACK"]).default("INTERNAL"),
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

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    // Vérifier l'existence du candidat dans le cabinet
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    }

    const note = await db.note.create({
      data: {
        agencyId: auth.session.agencyId!,
        candidateId,
        authorId: auth.session.userId,
        content: parsed.data.content,
        tag: parsed.data.tag,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Mettre à jour lastActivityAt du candidat
    await db.candidate.update({
      where: { id: candidateId },
      data: { lastActivityAt: new Date() },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur création note:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
