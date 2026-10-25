import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { InterviewStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Un motif d'annulation explicite est requis (au moins 3 caractères)"),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId) {
    return NextResponse.json({ error: "Non rattaché à une entreprise." }, { status: 403 });
  }

  const { id: interviewId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(session);

  try {
    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            jobOffer: { select: { companyId: true, title: true } },
          },
        },
      },
    });

    if (!interview || interview.application.jobOffer.companyId !== session.companyId) {
      return NextResponse.json({ error: "Entretien introuvable." }, { status: 404 });
    }

    if (interview.status !== InterviewStatus.SCHEDULED) {
      return NextResponse.json(
        { error: "Seul un entretien planifié peut être annulé." },
        { status: 400 }
      );
    }

    const updated = await db.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.CANCELLED,
        cancelReason: parsed.data.reason,
      },
    });

    await db.applicationHistory.create({
      data: {
        agencyId: session.agencyId!,
        applicationId: interview.applicationId,
        fromStatus: interview.application.status,
        toStatus: interview.application.status,
        changedByUserId: session.userId,
        note: `Entretien annulé par l'entreprise cliente : ${parsed.data.reason}`,
      },
    });

    await db.auditLog.create({
      data: {
        agencyId: session.agencyId!,
        actorUserId: session.userId,
        action: "CLIENT_INTERVIEW_CANCEL",
        targetType: "Interview",
        targetId: interview.id,
        metadata: { reason: parsed.data.reason },
      },
    });

    return NextResponse.json({ interview: updated });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
