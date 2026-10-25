import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ConsentStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createShortlistSchema = z.object({
  title: z.string().trim().min(2, "Le titre de la shortlist doit comporter au moins 2 caractères"),
  message: z.string().trim().optional(),
  items: z.array(
    z.object({
      applicationId: z.string().min(1, "ID de candidature obligatoire"),
      summary: z.string().trim().optional(),
      showTestResult: z.boolean().default(true),
      showSubscores: z.boolean().default(true),
      cvShared: z.boolean().default(true),
      consentStatus: z.nativeEnum(ConsentStatus).default(ConsentStatus.PENDING),
      consentAt: z.string().datetime().optional().nullable(),
    })
  ).default([]),
});

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(auth.session);

  try {
    const jobOffer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      select: { id: true, title: true, company: { select: { id: true, name: true } } },
    });

    if (!jobOffer) {
      return NextResponse.json({ error: "Offre d'emploi introuvable." }, { status: 404 });
    }

    const shortlists = await db.shortlist.findMany({
      where: { jobOfferId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            application: {
              include: {
                candidate: {
                  select: { id: true, firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      jobOffer,
      shortlists,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture shortlists:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: jobOfferId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide" }, { status: 400 });
  }

  const parsed = createShortlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { title, message, items } = parsed.data;
  const db = forAgency(auth.session);

  try {
    const jobOffer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      select: { id: true, title: true, agencyId: true },
    });

    if (!jobOffer) {
      return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
    }

    // Si des items sont fournis, vérifier qu'ils appartiennent tous à cette offre et ce cabinet
    if (items.length > 0) {
      const applicationIds = items.map((i) => i.applicationId);
      const validApplications = await db.application.findMany({
        where: {
          id: { in: applicationIds },
          jobOfferId,
        },
        select: { id: true },
      });

      if (validApplications.length !== applicationIds.length) {
        return NextResponse.json(
          { error: "Une ou plusieurs candidatures sélectionnées n'appartiennent pas à cette offre." },
          { status: 400 }
        );
      }
    }

    const shortlist = await db.shortlist.create({
      data: {
        agencyId: auth.session.agencyId!,
        jobOfferId,
        createdById: auth.session.userId,
        title,
        message: message || null,
        status: "DRAFT",
        items: {
          create: items.map((item) => ({
            agencyId: auth.session.agencyId!,
            applicationId: item.applicationId,
            summary: item.summary || null,
            showTestResult: item.showTestResult,
            showSubscores: item.showSubscores,
            cvShared: item.cvShared,
            consentStatus: item.consentStatus,
            consentAt: item.consentStatus === ConsentStatus.GRANTED
              ? (item.consentAt ? new Date(item.consentAt) : new Date())
              : null,
          })),
        },
      },
      include: {
        items: {
          include: {
            application: {
              include: {
                candidate: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "SHORTLIST_CREATE",
        targetType: "Shortlist",
        targetId: shortlist.id,
        metadata: {
          jobOfferId,
          title,
          candidatesCount: items.length,
        },
      },
    });

    return NextResponse.json({ shortlist }, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur création shortlist:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
