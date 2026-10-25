import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ConsentStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const addItemSchema = z.object({
  applicationId: z.string().min(1, "ID de candidature obligatoire"),
  summary: z.string().trim().optional(),
  showTestResult: z.boolean().default(true),
  showSubscores: z.boolean().default(true),
  cvShared: z.boolean().default(true),
  consentStatus: z.nativeEnum(ConsentStatus).default(ConsentStatus.PENDING),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: shortlistId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const shortlist = await db.shortlist.findUnique({
      where: { id: shortlistId },
      select: { id: true, status: true, jobOfferId: true },
    });

    if (!shortlist) {
      return NextResponse.json({ error: "Shortlist introuvable." }, { status: 404 });
    }

    if (shortlist.status === "SENT") {
      return NextResponse.json(
        { error: "Impossible d'ajouter un candidat à une shortlist déjà envoyée." },
        { status: 400 }
      );
    }

    const application = await db.application.findUnique({
      where: { id: parsed.data.applicationId },
      select: { id: true, jobOfferId: true },
    });

    if (!application || application.jobOfferId !== shortlist.jobOfferId) {
      return NextResponse.json(
        { error: "Cette candidature ne correspond pas au poste associé à cette shortlist." },
        { status: 400 }
      );
    }

    const item = await db.shortlistItem.create({
      data: {
        agencyId: auth.session.agencyId!,
        shortlistId,
        applicationId: parsed.data.applicationId,
        summary: parsed.data.summary || null,
        showTestResult: parsed.data.showTestResult,
        showSubscores: parsed.data.showSubscores,
        cvShared: parsed.data.cvShared,
        consentStatus: parsed.data.consentStatus,
        consentAt: parsed.data.consentStatus === ConsentStatus.GRANTED ? new Date() : null,
      },
      include: {
        application: {
          include: {
            candidate: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
