import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { generateExcelReport } from "@/lib/export-excel";
import { generatePdfReport } from "@/lib/export-pdf";

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
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "csv").toLowerCase();

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

    const dateStr = new Date().toISOString().split("T")[0];
    const agencyName = auth.session.agencyName || "Cabinet de Recrutement";
    const reportTitle = `Pipeline — ${jobOffer.title}`;
    const subtitle = `Entreprise : ${jobOffer.company.name} • ${jobOffer.applications.length} candidatures`;

    // 1. Export EXCEL (.xlsx)
    if (format === "excel" || format === "xlsx") {
      const excelBuffer = await generateExcelReport({
        title: reportTitle,
        subtitle,
        agencyName,
        sheetName: "Candidatures",
        columns: [
          { header: "Nom", key: "lastName", width: 18 },
          { header: "Prénom", key: "firstName", width: 18 },
          { header: "Email", key: "email", width: 28 },
          { header: "Téléphone", key: "phone", width: 18 },
          { header: "Titre actuel", key: "currentTitle", width: 24 },
          { header: "Étape Pipeline", key: "status", width: 20 },
          { header: "Score Test (%)", key: "score", width: 16 },
          { header: "Avis Client", key: "clientDecision", width: 18 },
          { header: "Commentaire Client", key: "clientReason", width: 30 },
          { header: "Date Candidature", key: "createdAt", width: 16 },
        ],
        rows: jobOffer.applications.map((app) => {
          const c = app.candidate;
          const attempt = app.assessmentAttempts[0];
          const shortlist = app.shortlistItems[0];
          return {
            lastName: c.lastName,
            firstName: c.firstName,
            email: c.email,
            phone: c.phone || "Non renseigné",
            currentTitle: c.currentTitle || "-",
            status: app.status,
            score: attempt?.percent !== undefined && attempt.percent !== null ? `${attempt.percent}%` : "Non noté",
            clientDecision: shortlist?.clientDecision || "En attente",
            clientReason: shortlist?.clientReason || "-",
            createdAt: new Date(app.createdAt).toLocaleDateString("fr-FR"),
          };
        }),
        summaryCards: [
          { label: "Total Candidatures", value: jobOffer.applications.length },
          { label: "Entreprise", value: jobOffer.company.name },
          { label: "Statut Poste", value: jobOffer.status },
        ],
      });

      await db.auditLog.create({
        data: {
          agencyId: auth.session.agencyId!,
          actorUserId: auth.session.userId,
          action: "EXCEL_EXPORT",
          targetType: "JobOffer",
          targetId: jobOffer.id,
          ipAddress,
          metadata: {
            jobOfferTitle: jobOffer.title,
            exportedCount: jobOffer.applications.length,
            format: "XLSX",
          },
        },
      });

      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="pipeline-${jobOffer.id}-${dateStr}.xlsx"`,
        },
      });
    }

    // 2. Export PDF (.pdf)
    if (format === "pdf") {
      const pdfBuffer = generatePdfReport({
        title: `Rapport Mission : ${jobOffer.title}`,
        subtitle,
        agencyName,
        columns: [
          { header: "Candidat", key: "candidateName" },
          { header: "Email / Tel", key: "contact" },
          { header: "Étape Pipeline", key: "status" },
          { header: "Score Test", key: "score" },
          { header: "Avis Client", key: "clientDecision" },
          { header: "Date", key: "createdAt" },
        ],
        rows: jobOffer.applications.map((app) => {
          const c = app.candidate;
          const attempt = app.assessmentAttempts[0];
          const shortlist = app.shortlistItems[0];
          return {
            candidateName: `${c.lastName} ${c.firstName}`,
            contact: `${c.email} / ${c.phone || "-"}`,
            status: app.status,
            score: attempt?.percent !== undefined && attempt.percent !== null ? `${attempt.percent}%` : "N/D",
            clientDecision: shortlist?.clientDecision || "En attente",
            createdAt: new Date(app.createdAt).toLocaleDateString("fr-FR"),
          };
        }),
        summaryCards: [
          { label: "Candidatures", value: jobOffer.applications.length },
          { label: "Poste", value: jobOffer.title.substring(0, 24) },
          { label: "Client Partenaire", value: jobOffer.company.name },
        ],
      });

      await db.auditLog.create({
        data: {
          agencyId: auth.session.agencyId!,
          actorUserId: auth.session.userId,
          action: "PDF_EXPORT",
          targetType: "JobOffer",
          targetId: jobOffer.id,
          ipAddress,
          metadata: {
            jobOfferTitle: jobOffer.title,
            exportedCount: jobOffer.applications.length,
            format: "PDF",
          },
        },
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="pipeline-${jobOffer.id}-${dateStr}.pdf"`,
        },
      });
    }

    // 3. Export CSV (par défaut)
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
        targetId: jobOffer.id,
        ipAddress,
        metadata: {
          jobOfferTitle: jobOffer.title,
          exportedCount: jobOffer.applications.length,
          format: "CSV",
        },
      },
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pipeline-${jobOffer.id}-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur export offre:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
