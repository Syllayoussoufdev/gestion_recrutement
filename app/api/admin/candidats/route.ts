import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { CandidateSource, Prisma } from "@prisma/client";

const candidateCreateSchema = z.object({
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

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const search = url.searchParams.get("search")?.trim();
  const skillsParam = url.searchParams.get("skills");
  const availableFromParam = url.searchParams.get("availableFrom");
  const sourceParam = url.searchParams.get("source");
  const archived = url.searchParams.get("archived") === "true";

  const db = forAgency(auth.session);

  const where: Prisma.CandidateWhereInput = {
    archived,
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { currentTitle: { contains: search, mode: "insensitive" } },
    ];
  }

  if (skillsParam) {
    const skillsList = skillsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillsList.length > 0) {
      where.skills = {
        hasSome: skillsList,
      };
    }
  }

  if (availableFromParam) {
    const parsedDate = new Date(availableFromParam);
    if (!isNaN(parsedDate.getTime())) {
      where.availableFrom = {
        lte: parsedDate,
      };
    }
  }

  if (sourceParam && Object.values(CandidateSource).includes(sourceParam as CandidateSource)) {
    where.source = sourceParam as CandidateSource;
  }

  try {
    const [items, total] = await Promise.all([
      db.candidate.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { applications: true, documents: true },
          },
        },
      }),
      db.candidate.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur liste candidats:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = candidateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);
  const data = parsed.data;

  try {
    // Vérifier l'unicité de l'email dans le cabinet
    const existing = await db.candidate.findFirst({
      where: { email: data.email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Un candidat avec cet email existe déjà dans votre cabinet." },
        { status: 409 }
      );
    }

    const candidate = await db.candidate.create({
      data: {
        agencyId: auth.session.agencyId!,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        currentTitle: data.currentTitle || null,
        skills: data.skills,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        source: data.source,
        cvPublicId: data.cvPublicId || null,
        cvResourceType: data.cvResourceType || "raw",
        cvDeliveryType: data.cvDeliveryType || "authenticated",
        cvMimeType: data.cvMimeType || null,
        cvSizeBytes: data.cvSizeBytes || null,
      },
    });

    // Si un CV a été uploadé, créer également une entrée dans Document pour traçabilité
    if (data.cvPublicId) {
      await db.document.create({
        data: {
          agencyId: auth.session.agencyId!,
          candidateId: candidate.id,
          label: "CV Principal",
          publicId: data.cvPublicId,
          resourceType: data.cvResourceType || "raw",
          deliveryType: "authenticated",
          mimeType: data.cvMimeType || "application/pdf",
          sizeBytes: data.cvSizeBytes || 0,
        },
      });
    }

    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur création candidat:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
