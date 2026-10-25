import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { OfferStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const statusSchema = z.object({
  status: z.nativeEnum(OfferStatus, {
    errorMap: () => ({ message: "Statut d'offre invalide (DRAFT, OPEN, CLOSED)" }),
  }),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const updated = await db.jobOffer.update({
      where: { id },
      data: {
        status: parsed.data.status,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors du changement de statut de l'offre" },
      { status: 500 }
    );
  }
}
