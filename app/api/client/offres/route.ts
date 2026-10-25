import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["CLIENT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  if (!session.companyId || !session.agencyId) {
    return NextResponse.json({ error: "Utilisateur non associé à une entreprise cliente." }, { status: 403 });
  }

  const db = forAgency(session);

  try {
    const jobOffers = await db.jobOffer.findMany({
      where: {
        companyId: session.companyId,
        status: { in: ["OPEN", "CLOSED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        contractType: true,
        location: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            applications: true,
            shortlists: {
              where: { status: "SENT" },
            },
          },
        },
        shortlists: {
          where: { status: "SENT" },
          select: {
            id: true,
            title: true,
            sentAt: true,
            _count: {
              select: { items: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ jobOffers });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
