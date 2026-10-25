import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { generateIcsCalendar } from "@/lib/ics";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
              select: { firstName: true, lastName: true, email: true },
            },
            jobOffer: {
              select: { title: true, company: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Entretien introuvable." }, { status: 404 });
    }

    const { application } = interview;
    const icsContent = generateIcsCalendar({
      uid: interview.icsUid,
      title: `Entretien de recrutement : ${application.jobOffer.title} - ${application.candidate.firstName} ${application.candidate.lastName}`,
      description: `Entretien pour le poste de ${application.jobOffer.title} chez ${application.jobOffer.company.name}.\nMode : ${interview.mode}\nLien/Lieu : ${interview.locationOrLink || "Non précisé"}`,
      location: interview.locationOrLink,
      startsAt: interview.startsAt,
      endsAt: interview.endsAt,
      organizerName: auth.session.agencyName || "Cabinet de Recrutement",
      organizerEmail: "recrutement@stratosconseil.ci",
      attendeeEmail: application.candidate.email,
      isCancelled: interview.status === "CANCELLED",
    });

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="entretien-${interview.id}.ics"`,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
