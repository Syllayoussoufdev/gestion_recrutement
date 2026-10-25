import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId) {
    return NextResponse.json({ error: "Non rattaché à une entreprise." }, { status: 403 });
  }

  const db = forAgency(session);

  try {
    const interviews = await db.interview.findMany({
      where: {
        application: {
          jobOffer: { companyId: session.companyId },
        },
      },
      orderBy: { startsAt: "asc" },
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
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    const proposals = await db.interviewProposal.findMany({
      where: {
        application: {
          jobOffer: { companyId: session.companyId },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        slots: {
          orderBy: { startsAt: "asc" },
        },
        application: {
          include: {
            candidate: {
              select: { id: true, firstName: true, lastName: true },
            },
            jobOffer: {
              select: { id: true, title: true },
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
