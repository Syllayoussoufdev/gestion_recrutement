import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { CandidateSource } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const candidateUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis"),
  lastName: z.string().trim().min(1, "Le nom est requis"),
  email: z.string().trim().email("Email invalide"),
  phone: z.string().trim().optional().nullable(),
  currentTitle: z.string().trim().optional().nullable(),
  skills: z.array(z.string().trim()).default([]),
  availableFrom: z.string().datetime().optional().nullable(),
  source: z.nativeEnum(CandidateSource).default(CandidateSource.OTHER),
  cvPublicId: z.string().optional().nullable(),
  cvResourceType: z.string().default("raw").optional(),
  cvDeliveryType: z.string().default("authenticated").optional(),
  cvMimeType: z.string().optional().nullable(),
  cvSizeBytes: z.number().int().nonnegative().optional().nullable(),
});

const patchSchema = z.object({
  archived: z.boolean(),
});

export async function GET(request: Request, context: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const db = forAgency(auth.session);

  try {
    const candidate = await db.candidate.findUnique({
      where: { id },
      include: {
        applications: {
          include: {
            jobOffer: {
              select: {
                id: true,
                title: true,
                status: true,
                company: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        notes: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    }

    return NextResponse.json(candidate);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture candidat:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = candidateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);
  const data = parsed.data;

  try {
    // Vérifier l'existence et l'isolation tenant
    const existing = await db.candidate.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    }

    // Vérifier l'unicité de l'email si modifié
    if (data.email !== existing.email) {
      const emailConflict = await db.candidate.findFirst({
        where: { email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (emailConflict) {
        return NextResponse.json(
          { error: "Un autre candidat possède déjà cet email dans votre cabinet." },
          { status: 409 }
        );
      }
    }

    const updated = await db.candidate.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        currentTitle: data.currentTitle || null,
        skills: data.skills,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        source: data.source,
        cvPublicId: data.cvPublicId ?? existing.cvPublicId,
        cvResourceType: data.cvResourceType ?? existing.cvResourceType,
        cvDeliveryType: data.cvDeliveryType ?? existing.cvDeliveryType,
        cvMimeType: data.cvMimeType ?? existing.cvMimeType,
        cvSizeBytes: data.cvSizeBytes ?? existing.cvSizeBytes,
        lastActivityAt: new Date(),
      },
    });

    // Si nouveau CV fourni, ajouter au journal des documents
    if (data.cvPublicId && data.cvPublicId !== existing.cvPublicId) {
      await db.document.create({
        data: {
          agencyId: auth.session.agencyId!,
          candidateId: id,
          label: "Nouveau CV",
          publicId: data.cvPublicId,
          resourceType: data.cvResourceType || "raw",
          deliveryType: "authenticated",
          mimeType: data.cvMimeType || "application/pdf",
          sizeBytes: data.cvSizeBytes || 0,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur mise à jour candidat:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const existing = await db.candidate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
    }

    const updated = await db.candidate.update({
      where: { id },
      data: { archived: parsed.data.archived },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur archivage candidat:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
