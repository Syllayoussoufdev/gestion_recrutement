import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(auth.session);

  try {
    const offer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      include: {
        company: {
          select: { id: true, name: true, logoUrl: true, city: true },
        },
        applications: {
          orderBy: { updatedAt: "desc" },
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
                cvPublicId: true,
                availableFrom: true,
                lastActivityAt: true,
              },
            },
            statusHistory: {
              orderBy: { changedAt: "desc" },
              take: 5,
            },
            _count: {
              select: {
                statusHistory: true,
                messages: true,
              },
            },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json(
        { error: "Offre d'emploi introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json(offer);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture pipeline offre:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
