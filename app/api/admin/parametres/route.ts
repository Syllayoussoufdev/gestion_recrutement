import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toTenantErrorResponse } from "@/lib/tenant";

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).optional(),
  senderName: z.string().trim().min(2).optional(),
  contactEmail: z.string().trim().email().optional(),
  timezone: z.string().trim().min(2).optional(),
  retentionMonths: z.number().int().min(1).max(120).optional(),
  testRetentionMonths: z.number().int().min(1).max(60).optional(),
  anonymizeUntilInterest: z.boolean().optional(),
  showScoreToCandidate: z.boolean().optional(),
  brandKey: z.enum(["blue", "emerald", "indigo", "slate"]).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { agencyId } = auth.session;
  if (!agencyId) {
    return NextResponse.json({ error: "Cabinet introuvable." }, { status: 404 });
  }

  try {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        id: true,
        name: true,
        slug: true,
        senderName: true,
        contactEmail: true,
        timezone: true,
        retentionMonths: true,
        testRetentionMonths: true,
        anonymizeUntilInterest: true,
        showScoreToCandidate: true,
        brandKey: true,
        status: true,
        createdAt: true,
      },
    });

    if (!agency) {
      return NextResponse.json({ error: "Cabinet introuvable." }, { status: 404 });
    }

    return NextResponse.json({ agency });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { agencyId, userId } = auth.session;
  if (!agencyId) {
    return NextResponse.json({ error: "Cabinet introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  try {
    const updated = await prisma.agency.update({
      where: { id: agencyId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        slug: true,
        senderName: true,
        contactEmail: true,
        timezone: true,
        retentionMonths: true,
        testRetentionMonths: true,
        anonymizeUntilInterest: true,
        showScoreToCandidate: true,
        brandKey: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        agencyId,
        actorUserId: userId,
        action: "AGENCY_SETTINGS_UPDATE",
        targetType: "Agency",
        targetId: agencyId,
        ipAddress,
        metadata: parsed.data as Prisma.InputJsonObject,
      },
    });

    return NextResponse.json({
      success: true,
      agency: updated,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
