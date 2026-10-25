import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { Prisma } from "@prisma/client";

const contactSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1, "Le prénom est requis"),
  lastName: z.string().trim().min(1, "Le nom est requis"),
  position: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email("Email de contact invalide")
    .optional()
    .or(z.literal(""))
    .nullable(),
  phone: z.string().trim().optional().nullable(),
  isPrimary: z.boolean().default(false),
});

const createCompanySchema = z.object({
  name: z.string().trim().min(2, "Le nom doit comporter au moins 2 caractères"),
  sector: z.string().trim().optional().nullable(),
  siret: z
    .string()
    .trim()
    .regex(/^[0-9]{14}$/, "Le numéro SIRET doit comporter exactement 14 chiffres")
    .optional()
    .or(z.literal(""))
    .nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  website: z
    .string()
    .trim()
    .url("L'adresse du site web est invalide (ex: https://example.com)")
    .optional()
    .or(z.literal(""))
    .nullable(),
  logoUrl: z.string().trim().optional().nullable(),
  logoPublicId: z.string().trim().optional().nullable(),
  contacts: z.array(contactSchema).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const search = searchParams.get("search")?.trim() || "";
  const showArchived = searchParams.get("archived") === "true";

  const db = forAgency(auth.session);

  const whereClause: Prisma.CompanyWhereInput = {
    archived: showArchived,
  };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sector: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [total, data] = await Promise.all([
      db.company.count({ where: whereClause }),
      db.company.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          _count: {
            select: {
              offers: true,
              contacts: true,
            },
          },
        },
      }),
    ]);

    // Offres actives par entreprise
    const activeOffersCounts = await db.jobOffer.groupBy({
      by: ["companyId"],
      where: {
        status: "OPEN",
      },
      _count: {
        id: true,
      },
    });

    const activeMap = new Map<string, number>();
    for (const item of activeOffersCounts) {
      activeMap.set(item.companyId, item._count.id);
    }

    const enhancedData = data.map((comp) => ({
      ...comp,
      activeOffersCount: activeMap.get(comp.id) ?? 0,
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
      { error: "Impossible de récupérer les entreprises" },
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

  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { contacts, ...companyData } = parsed.data;
  const db = forAgency(auth.session);

  // Vérification de collision SIRET au sein du cabinet si renseigné
  if (companyData.siret) {
    const existingSiret = await db.company.findFirst({
      where: { siret: companyData.siret },
      select: { id: true, name: true },
    });
    if (existingSiret) {
      return NextResponse.json(
        { error: `Une entreprise avec ce SIRET existe déjà dans votre cabinet (${existingSiret.name}).` },
        { status: 409 }
      );
    }
  }

  try {
    const created = await db.company.create({
      data: {
        agencyId: auth.session.agencyId!,
        name: companyData.name,
        sector: companyData.sector || null,
        siret: companyData.siret || null,
        address: companyData.address || null,
        city: companyData.city || null,
        website: companyData.website || null,
        logoUrl: companyData.logoUrl || null,
        logoPublicId: companyData.logoPublicId || null,
        contacts: contacts && contacts.length > 0
          ? {
              create: contacts.map((c, idx) => ({
                agencyId: auth.session.agencyId!,
                firstName: c.firstName,
                lastName: c.lastName,
                position: c.position || null,
                email: c.email || null,
                phone: c.phone || null,
                isPrimary: idx === 0 ? true : Boolean(c.isPrimary),
              })),
            }
          : undefined,
      },
      include: {
        contacts: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors de la création de l'entreprise" },
      { status: 500 }
    );
  }
}
