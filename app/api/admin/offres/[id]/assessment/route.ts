import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const linkAssessmentSchema = z.object({
  assessmentId: z.string().nullable(),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: jobOfferId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = linkAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { assessmentId } = parsed.data;
  const db = forAgency(auth.session);

  try {
    // 1. Vérifier l'offre
    const offer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      select: { id: true },
    });
    if (!offer) {
      return NextResponse.json({ error: "Offre d'emploi introuvable" }, { status: 404 });
    }

    // 2. Si assessmentId fourni, vérifier qu'il appartient bien au cabinet
    if (assessmentId) {
      const assessment = await db.assessment.findUnique({
        where: { id: assessmentId },
        select: { id: true },
      });
      if (!assessment) {
        return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
      }
    }

    const updated = await db.jobOffer.update({
      where: { id: jobOfferId },
      data: { assessmentId },
      include: {
        assessment: {
          select: { id: true, title: true, passPercent: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur association évaluation à l'offre:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
