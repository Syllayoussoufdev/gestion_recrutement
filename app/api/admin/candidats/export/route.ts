import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { generateExcelReport } from "@/lib/export-excel";
import { generatePdfReport } from "@/lib/export-pdf";

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

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "csv").toLowerCase();
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

    const dateStr = new Date().toISOString().split("T")[0];
    const agencyName = auth.session.agencyName || "Cabinet de Recrutement";

    // 1. Export EXCEL (.xlsx)
    if (format === "excel" || format === "xlsx") {
      const excelBuffer = await generateExcelReport({
        title: "Vivier des Candidats Qualifiés",
        subtitle: `${candidates.length} profils enregistrés`,
        agencyName,
        sheetName: "Candidats",
        columns: [
          { header: "Nom", key: "lastName", width: 18 },
          { header: "Prénom", key: "firstName", width: 18 },
          { header: "Email", key: "email", width: 28 },
          { header: "Téléphone", key: "phone", width: 18 },
          { header: "Poste actuel", key: "currentTitle", width: 26 },
          { header: "Compétences clés", key: "skills", width: 34 },
          { header: "Source", key: "source", width: 16 },
          { header: "Statut", key: "status", width: 14 },
          { header: "Date d'inscription", key: "createdAt", width: 16 },
        ],
        rows: candidates.map((c) => ({
          lastName: c.lastName,
          firstName: c.firstName,
          email: c.email,
          phone: c.phone || "Non renseigné",
          currentTitle: c.currentTitle || "Non spécifié",
          skills: c.skills.join(", ") || "-",
          source: c.source,
          status: c.archived ? "Archivé" : "Actif",
          createdAt: new Date(c.createdAt).toLocaleDateString("fr-FR"),
        })),
        summaryCards: [
          { label: "Total Candidats", value: candidates.length },
          { label: "Profils Actifs", value: candidates.filter((c) => !c.archived).length },
          { label: "Profils Archivés", value: candidates.filter((c) => c.archived).length },
        ],
      });

      // Traçabilité AuditLog obligatoire
      await db.auditLog.create({
        data: {
          agencyId: auth.session.agencyId!,
          actorUserId: auth.session.userId,
          action: "EXCEL_EXPORT",
          targetType: "Candidate",
          ipAddress,
          metadata: {
            exportedCount: candidates.length,
            format: "XLSX",
          },
        },
      });

      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="candidats-${dateStr}.xlsx"`,
        },
      });
    }

    // 2. Export PDF (.pdf)
    if (format === "pdf") {
      const pdfBuffer = generatePdfReport({
        title: "Vivier des Candidats Qualifiés",
        subtitle: `${candidates.length} profils dans la base`,
        agencyName,
        columns: [
          { header: "Nom", key: "lastName" },
          { header: "Prénom", key: "firstName" },
          { header: "Email", key: "email" },
          { header: "Téléphone", key: "phone" },
          { header: "Poste actuel", key: "currentTitle" },
          { header: "Compétences", key: "skills" },
          { header: "Date", key: "createdAt" },
        ],
        rows: candidates.map((c) => ({
          lastName: c.lastName,
          firstName: c.firstName,
          email: c.email,
          phone: c.phone || "-",
          currentTitle: c.currentTitle || "-",
          skills: c.skills.join(", ") || "-",
          createdAt: new Date(c.createdAt).toLocaleDateString("fr-FR"),
        })),
        summaryCards: [
          { label: "Total Vivier", value: candidates.length },
          { label: "Actifs", value: candidates.filter((c) => !c.archived).length },
        ],
      });

      // Traçabilité AuditLog obligatoire
      await db.auditLog.create({
        data: {
          agencyId: auth.session.agencyId!,
          actorUserId: auth.session.userId,
          action: "PDF_EXPORT",
          targetType: "Candidate",
          ipAddress,
          metadata: {
            exportedCount: candidates.length,
            format: "PDF",
          },
        },
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="candidats-${dateStr}.pdf"`,
        },
      });
    }

    // 3. Export CSV (par défaut)
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
          format: "CSV",
        },
      },
    });

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
    console.error("Erreur export candidats:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
