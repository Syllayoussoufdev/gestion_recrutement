import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const db = forAgency(auth.session);

  try {
    const interviews = await db.interview.findMany({
      orderBy: { startsAt: "desc" },
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
              },
            },
            jobOffer: {
              select: {
                id: true,
                title: true,
                company: {
                  select: { id: true, name: true, logoUrl: true },
                },
              },
            },
          },
        },
      },
    });

    const proposals = await db.interviewProposal.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        slots: {
          orderBy: { startsAt: "asc" },
        },
        proposedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        application: {
          include: {
            candidate: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            jobOffer: {
              select: {
                id: true,
                title: true,
                company: { select: { id: true, name: true } },
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
    console.error("Erreur lecture entretiens:", error);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
