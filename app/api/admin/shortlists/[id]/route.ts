import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateShortlistSchema = z.object({
  title: z.string().trim().min(2, "Le titre doit comporter au moins 2 caractères").optional(),
  message: z.string().trim().nullable().optional(),
});

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: shortlistId } = await params;
  const db = forAgency(auth.session);

  try {
    const shortlist = await db.shortlist.findUnique({
      where: { id: shortlistId },
      include: {
        jobOffer: {
          select: {
            id: true,
            title: true,
            status: true,
            company: {
              select: { id: true, name: true, logoUrl: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            application: {
              include: {
                candidate: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    currentTitle: true,
                    skills: true,
                    documents: {
                      select: {
                        id: true,
                        label: true,
                        sizeBytes: true,
                      },
                    },
                  },
                },
                assessmentAttempts: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                    autoPoints: true,
                    manualPoints: true,
                    maxPoints: true,
                    percent: true,
                    gradedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!shortlist) {
      return NextResponse.json({ error: "Shortlist introuvable." }, { status: 404 });
    }

    return NextResponse.json({ shortlist });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
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

  const parsed = updateShortlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const existing = await db.shortlist.findUnique({
      where: { id: shortlistId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shortlist introuvable." }, { status: 404 });
    }

    const updated = await db.shortlist.update({
      where: { id: shortlistId },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.message !== undefined ? { message: parsed.data.message } : {}),
      },
    });

    return NextResponse.json({ shortlist: updated });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: shortlistId } = await params;
  const db = forAgency(auth.session);

  try {
    const existing = await db.shortlist.findUnique({
      where: { id: shortlistId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shortlist introuvable." }, { status: 404 });
    }

    if (existing.status === "SENT") {
      return NextResponse.json(
        { error: "Impossible de supprimer une shortlist déjà transmise au client." },
        { status: 400 }
      );
    }

    await db.shortlist.delete({
      where: { id: shortlistId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
