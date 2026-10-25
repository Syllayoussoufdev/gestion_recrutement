import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ConsentStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

const updateItemSchema = z.object({
  summary: z.string().trim().nullable().optional(),
  showTestResult: z.boolean().optional(),
  showSubscores: z.boolean().optional(),
  cvShared: z.boolean().optional(),
  consentStatus: z.nativeEnum(ConsentStatus).optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: shortlistId, itemId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const item = await db.shortlistItem.findUnique({
      where: { id: itemId },
      include: {
        shortlist: {
          select: { id: true, status: true },
        },
      },
    });

    if (!item || item.shortlistId !== shortlistId) {
      return NextResponse.json({ error: "Élément de shortlist introuvable." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.summary !== undefined) updateData.summary = parsed.data.summary;
    if (parsed.data.showTestResult !== undefined) updateData.showTestResult = parsed.data.showTestResult;
    if (parsed.data.showSubscores !== undefined) updateData.showSubscores = parsed.data.showSubscores;
    if (parsed.data.cvShared !== undefined) updateData.cvShared = parsed.data.cvShared;

    if (parsed.data.consentStatus !== undefined) {
      updateData.consentStatus = parsed.data.consentStatus;
      if (parsed.data.consentStatus === ConsentStatus.GRANTED) {
        updateData.consentAt = new Date();
      } else {
        updateData.consentAt = null;
      }
    }

    const updated = await db.shortlistItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json({ item: updated });
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

  const { id: shortlistId, itemId } = await params;
  const db = forAgency(auth.session);

  try {
    const item = await db.shortlistItem.findUnique({
      where: { id: itemId },
      include: {
        shortlist: {
          select: { id: true, status: true },
        },
      },
    });

    if (!item || item.shortlistId !== shortlistId) {
      return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });
    }

    if (item.shortlist.status === "SENT") {
      return NextResponse.json(
        { error: "Impossible de modifier une shortlist déjà transmise au client." },
        { status: 400 }
      );
    }

    await db.shortlistItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
