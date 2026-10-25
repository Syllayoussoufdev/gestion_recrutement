import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { Prisma, ContractType, OfferStatus } from "@prisma/client";

const createOfferSchema = z
  .object({
    companyId: z.string().min(1, "L'entreprise cliente est requise"),
    title: z.string().trim().min(2, "Le titre doit comporter au moins 2 caractères"),
    description: z.string().trim().min(5, "La description est requise (markdown)"),
    skills: z.array(z.string().trim()).default([]),
    contractType: z.nativeEnum(ContractType, {
      errorMap: () => ({ message: "Type de contrat invalide" }),
    }),
    location: z.string().trim().optional().nullable(),
    salaryMin: z.number().int().nonnegative().optional().nullable(),
    salaryMax: z.number().int().nonnegative().optional().nullable(),
    status: z.nativeEnum(OfferStatus).default(OfferStatus.DRAFT),
  })
  .refine(
    (data) => {
      if (data.salaryMin != null && data.salaryMax != null) {
        return data.salaryMin <= data.salaryMax;
      }
      return true;
    },
    {
      message: "Le salaire minimum ne peut pas dépasser le salaire maximum",
      path: ["salaryMax"],
    }
  );

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const search = searchParams.get("search")?.trim() || "";
  const companyId = searchParams.get("companyId")?.trim();
  const status = searchParams.get("status")?.trim() as OfferStatus | undefined;

  const db = forAgency(auth.session);

  const whereClause: Prisma.JobOfferWhereInput = {};

  if (search) {
    whereClause.title = { contains: search, mode: "insensitive" };
  }

  if (companyId) {
    whereClause.companyId = companyId;
  }

  if (status && Object.values(OfferStatus).includes(status)) {
    whereClause.status = status;
  }

  try {
    const [total, data] = await Promise.all([
      db.jobOffer.count({ where: whereClause }),
      db.jobOffer.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
    ]);

    // Récupérer la répartition des candidatures par statut pour ces offres
    const offerIds = data.map((o) => o.id);
    const applicationsByStatus = await db.application.groupBy({
      by: ["jobOfferId", "status"],
      where: {
        jobOfferId: { in: offerIds },
      },
      _count: {
        id: true,
      },
    });

    const countsMap = new Map<string, Record<string, number>>();
    for (const item of applicationsByStatus) {
      if (!countsMap.has(item.jobOfferId)) {
        countsMap.set(item.jobOfferId, {});
      }
      countsMap.get(item.jobOfferId)![item.status] = item._count.id;
    }

    const enhancedData = data.map((offer) => ({
      ...offer,
      statusCounts: countsMap.get(offer.id) || {},
    }));

    return NextResponse.json({
      data: enhancedData,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Impossible de récupérer les offres" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = createOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const db = forAgency(auth.session);

  try {
    // Vérifier que l'entreprise ciblée appartient bien à ce cabinet
    const company = await db.company.findUnique({
      where: { id: data.companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "L'entreprise cliente spécifiée est introuvable ou n'appartient pas à votre cabinet." },
        { status: 404 }
      );
    }

    const created = await db.jobOffer.create({
      data: {
        agencyId: auth.session.agencyId!,
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        skills: data.skills,
        contractType: data.contractType,
        location: data.location || null,
        salaryMin: data.salaryMin || null,
        salaryMax: data.salaryMax || null,
        status: data.status,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors de la création de l'offre" },
      { status: 500 }
    );
  }
}
