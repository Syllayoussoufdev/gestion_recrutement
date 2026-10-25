import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: applicationId } = await params;
  const db = forAgency(auth.session);

  try {
    const attempt = await db.assessmentAttempt.findFirst({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        answers: true,
        gradedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Aucune tentative d'évaluation pour cette candidature" },
        { status: 404 }
      );
    }

    return NextResponse.json(attempt);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture évaluation candidature:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
