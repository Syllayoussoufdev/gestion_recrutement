import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse, TenantResourceNotFoundError } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

const updateCompanySchema = z.object({
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
    .url("L'adresse du site web est invalide")
    .optional()
    .or(z.literal(""))
    .nullable(),
  logoUrl: z.string().trim().optional().nullable(),
  logoPublicId: z.string().trim().optional().nullable(),
  contacts: z.array(contactSchema).optional(),
});

const patchArchiveSchema = z.object({
  archived: z.boolean(),
});

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const db = forAgency(auth.session);

  try {
    const company = await db.company.findUniqueOrThrow({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        offers: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: { applications: true },
            },
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(company);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Entreprise introuvable" },
      { status: 404 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
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

  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { contacts, ...companyData } = parsed.data;
  const db = forAgency(auth.session);

  try {
    // Vérifier l'existence et appartenance de l'entreprise
    const existing = await db.company.findUnique({
      where: { id },
      select: { id: true, siret: true },
    });

    if (!existing) {
      throw new TenantResourceNotFoundError("Company");
    }

    // Collision SIRET si modifié
    if (companyData.siret && companyData.siret !== existing.siret) {
      const collision = await db.company.findFirst({
        where: {
          siret: companyData.siret,
          id: { not: id },
        },
      });
      if (collision) {
        return NextResponse.json(
          { error: `Une autre entreprise de votre cabinet possède déjà ce SIRET (${collision.name}).` },
          { status: 409 }
        );
      }
    }

    // Mise à jour de l'entreprise
    const updated = await db.company.update({
      where: { id },
      data: {
        name: companyData.name,
        sector: companyData.sector || null,
        siret: companyData.siret || null,
        address: companyData.address || null,
        city: companyData.city || null,
        website: companyData.website || null,
        logoUrl: companyData.logoUrl || null,
        logoPublicId: companyData.logoPublicId || null,
      },
      include: {
        contacts: true,
      },
    });

    // Mise à jour des contacts si fournis
    if (contacts !== undefined) {
      // Supprimer les anciens contacts et recréer les nouveaux pour synchro propre
      await db.companyContact.deleteMany({
        where: { companyId: id },
      });

      if (contacts.length > 0) {
        await db.companyContact.createMany({
          data: contacts.map((c, idx) => ({
            agencyId: auth.session.agencyId!,
            companyId: id,
            firstName: c.firstName,
            lastName: c.lastName,
            position: c.position || null,
            email: c.email || null,
            phone: c.phone || null,
            isPrimary: idx === 0 ? true : Boolean(c.isPrimary),
          })),
        });
      }
    }

    const finalCompany = await db.company.findUniqueOrThrow({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    return NextResponse.json(finalCompany);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'entreprise" },
      { status: 500 }
    );
  }
}

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

  const parsed = patchArchiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const updated = await db.company.update({
      where: { id },
      data: {
        archived: parsed.data.archived,
      },
    });

    return NextResponse.json({
      success: true,
      company: {
        id: updated.id,
        name: updated.name,
        archived: updated.archived,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors du changement de statut de l'entreprise" },
      { status: 500 }
    );
  }
}
