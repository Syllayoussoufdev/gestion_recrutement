import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const db = forAgency(auth.session);
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  try {
    const candidates = await db.candidate.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        currentTitle: true,
        skills: true,
        source: true,
        createdAt: true,
        archived: true,
      },
    });

    const headers = [
      "ID",
      "Nom",
      "Prénom",
      "Email",
      "Téléphone",
      "Poste actuel",
      "Compétences",
      "Source",
      "Archivé",
      "Date d'inscription",
    ];

    const rows = candidates.map((c) => [
      escapeCsvField(c.id),
      escapeCsvField(c.lastName),
      escapeCsvField(c.firstName),
      escapeCsvField(c.email),
      escapeCsvField(c.phone || ""),
      escapeCsvField(c.currentTitle || ""),
      escapeCsvField(c.skills.join(", ")),
      escapeCsvField(c.source),
      escapeCsvField(c.archived ? "Oui" : "Non"),
      escapeCsvField(new Date(c.createdAt).toLocaleDateString("fr-FR")),
    ]);

    // UTF-8 BOM (\uFEFF) pour compatibilité Excel
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    // Traçabilité AuditLog obligatoire (PRD V2 §10.5)
    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "CSV_EXPORT",
        targetType: "Candidate",
        ipAddress,
        metadata: {
          exportedCount: candidates.length,
          type: "ALL_CANDIDATES",
        },
      },
    });

    const dateStr = new Date().toISOString().split("T")[0];
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="candidats-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur export CSV candidats:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
