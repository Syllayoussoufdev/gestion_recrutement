import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse, TenantResourceNotFoundError } from "@/lib/tenant";
import { ContractType, OfferStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateOfferSchema = z
  .object({
    companyId: z.string().min(1, "L'entreprise cliente est requise"),
    title: z.string().trim().min(2, "Le titre doit comporter au moins 2 caractères"),
    description: z.string().trim().min(5, "La description est requise (markdown)"),
    skills: z.array(z.string().trim()).default([]),
    contractType: z.nativeEnum(ContractType),
    location: z.string().trim().optional().nullable(),
    salaryMin: z.number().int().nonnegative().optional().nullable(),
    salaryMax: z.number().int().nonnegative().optional().nullable(),
    status: z.nativeEnum(OfferStatus),
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

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const db = forAgency(auth.session);

  try {
    const offer = await db.jobOffer.findUniqueOrThrow({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            sector: true,
            city: true,
            logoUrl: true,
          },
        },
        applications: {
          orderBy: { updatedAt: "desc" },
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                currentTitle: true,
                skills: true,
                availableFrom: true,
                cvPublicId: true,
              },
            },
            statusHistory: {
              orderBy: { changedAt: "desc" },
              take: 3,
            },
          },
        },
      },
    });

    return NextResponse.json(offer);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Offre d'emploi introuvable" },
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

  const parsed = updateOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const db = forAgency(auth.session);

  try {
    // Vérifier que l'entreprise ciblée appartient au cabinet
    const company = await db.company.findUnique({
      where: { id: data.companyId },
      select: { id: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "L'entreprise cliente spécifiée est introuvable." },
        { status: 404 }
      );
    }

    const updated = await db.jobOffer.update({
      where: { id },
      data: {
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

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de l'offre" },
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

  const schema = z.object({
    status: z.nativeEnum(OfferStatus),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Statut invalide" },
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
      { error: "Erreur lors de la mise à jour du statut" },
      { status: 500 }
    );
  }
}
