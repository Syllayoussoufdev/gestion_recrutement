import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: jobOfferId } = await params;
  const db = forAgency(auth.session);
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  try {
    const jobOffer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      include: {
        company: { select: { name: true } },
        applications: {
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
            assessmentAttempts: {
              where: { status: "GRADED" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { percent: true },
            },
            shortlistItems: {
              take: 1,
              select: { clientDecision: true, clientReason: true },
            },
          },
        },
      },
    });

    if (!jobOffer) {
      return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
    }

    const headers = [
      "Nom",
      "Prénom",
      "Email",
      "Téléphone",
      "Titre actuel",
      "Étape pipeline",
      "Score test (%)",
      "Avis client",
      "Motif client",
      "Date de candidature",
    ];

    const rows = jobOffer.applications.map((app) => {
      const c = app.candidate;
      const attempt = app.assessmentAttempts[0];
      const shortlist = app.shortlistItems[0];

      return [
        escapeCsvField(c.lastName),
        escapeCsvField(c.firstName),
        escapeCsvField(c.email),
        escapeCsvField(c.phone || ""),
        escapeCsvField(c.currentTitle || ""),
        escapeCsvField(app.status),
        escapeCsvField(attempt?.percent !== undefined && attempt.percent !== null ? `${attempt.percent}%` : "Non noté"),
        escapeCsvField(shortlist?.clientDecision || "En attente"),
        escapeCsvField(shortlist?.clientReason || ""),
        escapeCsvField(new Date(app.createdAt).toLocaleDateString("fr-FR")),
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    // Traçabilité AuditLog
    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "CSV_EXPORT",
        targetType: "JobOffer",
        targetId: jobOfferId,
        ipAddress,
        metadata: {
          exportedCount: jobOffer.applications.length,
          jobOfferTitle: jobOffer.title,
        },
      },
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const safeTitle = jobOffer.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="candidatures-${safeTitle}-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
