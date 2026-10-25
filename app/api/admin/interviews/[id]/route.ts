import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus, InterviewStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateInterviewSchema = z.object({
  status: z.nativeEnum(InterviewStatus),
  resultNote: z.string().trim().optional(),
  cancelReason: z.string().trim().optional(),
});

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: interviewId } = await params;
  const db = forAgency(auth.session);

  try {
    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true },
            },
            jobOffer: {
              select: { id: true, title: true, company: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Entretien introuvable." }, { status: 404 });
    }

    return NextResponse.json({ interview });
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

  const { id: interviewId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = updateInterviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { status, resultNote, cancelReason } = parsed.data;

  if (status === InterviewStatus.CANCELLED && (!cancelReason || cancelReason.trim().length === 0)) {
    return NextResponse.json({ error: "Un motif d'annulation est requis." }, { status: 400 });
  }

  const db = forAgency(auth.session);

  try {
    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          select: { id: true, status: true, candidateId: true },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Entretien introuvable." }, { status: 404 });
    }

    const updated = await db.interview.update({
      where: { id: interviewId },
      data: {
        status,
        resultNote: resultNote || null,
        cancelReason: cancelReason || null,
      },
    });

    // Progression du statut de candidature sur conclusion
    if (status === InterviewStatus.COMPLETED) {
      if (
        interview.application.status === ApplicationStatus.INTERVIEW_SCHEDULED ||
        interview.application.status === ApplicationStatus.RH_INTERVIEW
      ) {
        await db.application.update({
          where: { id: interview.applicationId },
          data: { status: ApplicationStatus.CLIENT_INTERVIEW },
        });

        await db.applicationHistory.create({
          data: {
            agencyId: auth.session.agencyId!,
            applicationId: interview.applicationId,
            fromStatus: interview.application.status,
            toStatus: ApplicationStatus.CLIENT_INTERVIEW,
            changedByUserId: auth.session.userId,
            note: resultNote ? `Entretien tenu : ${resultNote}` : "Entretien tenu avec succès.",
          },
        });
      }
    } else if (status === InterviewStatus.NO_SHOW_CANDIDATE || status === InterviewStatus.NO_SHOW_CLIENT) {
      const label = status === InterviewStatus.NO_SHOW_CANDIDATE ? "Absence du candidat" : "Absence du client";
      await db.applicationHistory.create({
        data: {
          agencyId: auth.session.agencyId!,
          applicationId: interview.applicationId,
          fromStatus: interview.application.status,
          toStatus: interview.application.status,
          changedByUserId: auth.session.userId,
          note: `Incident d'entretien : ${label}. Note : ${resultNote || "Sans précision"}`,
        },
      });
    }

    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "INTERVIEW_STATUS_UPDATE",
        targetType: "Interview",
        targetId: interview.id,
        metadata: {
          status,
          resultNote,
          cancelReason,
        },
      },
    });

    return NextResponse.json({ interview: updated });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
