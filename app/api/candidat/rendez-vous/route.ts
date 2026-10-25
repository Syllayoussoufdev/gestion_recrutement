import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["CANDIDAT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.candidateId || !session.agencyId) {
    return NextResponse.json({ error: "Compte candidat non rattaché." }, { status: 403 });
  }

  const db = forAgency(session);

  try {
    const interviews = await db.interview.findMany({
      where: {
        application: { candidateId: session.candidateId },
      },
      orderBy: { startsAt: "asc" },
      include: {
        application: {
          include: {
            jobOffer: {
              select: {
                id: true,
                title: true,
                contractType: true,
                company: { select: { name: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });

    const proposals = await db.interviewProposal.findMany({
      where: {
        application: { candidateId: session.candidateId },
      },
      orderBy: { createdAt: "desc" },
      include: {
        slots: { orderBy: { startsAt: "asc" } },
        application: {
          include: {
            jobOffer: {
              select: {
                id: true,
                title: true,
                company: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      interviews,
      proposals,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
