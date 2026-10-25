import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { generateExcelReport } from "@/lib/export-excel";
import { generatePdfReport } from "@/lib/export-pdf";
import { ApplicationStatus, InterviewStatus } from "@prisma/client";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "excel").toLowerCase();

  const db = forAgency(auth.session);
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  try {
    const [
      companiesCount,
      activeOffersCount,
      candidatesCount,
      placedCount,
      applicationsByStatus,
      totalAttempts,
      completedAttempts,
      attemptsWithTiming,
      shortlistsWithTiming,
      completedInterviews,
      noShowInterviews,
      totalInterviews,
      jobOffers,
    ] = await Promise.all([
      db.company.count({ where: { archived: false } }),
      db.jobOffer.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { archived: false } }),
      db.application.count({ where: { status: ApplicationStatus.PLACED } }),
      db.application.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      db.assessmentAttempt.count(),
      db.assessmentAttempt.count({ where: { submittedAt: { not: null } } }),
      db.assessmentAttempt.findMany({
        where: { startedAt: { not: null }, submittedAt: { not: null } },
        select: { startedAt: true, submittedAt: true },
      }),
      db.shortlist.findMany({
        where: { sentAt: { not: null } },
        select: { sentAt: true, jobOffer: { select: { createdAt: true } } },
      }),
      db.interview.count({ where: { status: InterviewStatus.COMPLETED } }),
      db.interview.count({
        where: {
          status: { in: [InterviewStatus.NO_SHOW_CANDIDATE, InterviewStatus.NO_SHOW_CLIENT] },
        },
      }),
      db.interview.count(),
      db.jobOffer.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          company: { select: { name: true } },
          _count: { select: { applications: true } },
        },
      }),
    ]);

    // Métriques calculées (PRD V2 §13)
    const testCompletionRate = totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0;

    let medianTestMinutes = 0;
    if (attemptsWithTiming.length > 0) {
      const durations = attemptsWithTiming
        .map((a) => (a.submittedAt!.getTime() - a.startedAt!.getTime()) / 60000)
        .sort((a, b) => a - b);
      const mid = Math.floor(durations.length / 2);
      medianTestMinutes = Math.max(1, Math.round(durations.length % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2));
    }

    let medianOfferToShortlistDays = 0;
    if (shortlistsWithTiming.length > 0) {
      const days = shortlistsWithTiming
        .map((s) => (s.sentAt!.getTime() - s.jobOffer.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        .sort((a, b) => a - b);
      const mid = Math.floor(days.length / 2);
      medianOfferToShortlistDays = Math.max(1, Math.round(days.length % 2 !== 0 ? days[mid] : (days[mid - 1] + days[mid]) / 2));
    }

    const interviewAttendanceRate = totalInterviews > 0
      ? Math.round((completedInterviews / Math.max(1, completedInterviews + noShowInterviews)) * 100)
      : 100;

    const dateStr = new Date().toISOString().split("T")[0];
    const agencyName = auth.session.agencyName || "Cabinet de Recrutement";
    const reportTitle = "Rapport Exécutif de Performance du Pilote";
    const subtitle = "Indicateurs d'efficacité, qualification & conversion (PRD V2 §13)";

    const rowsData = jobOffers.map((j) => ({
      title: j.title,
      company: j.company.name,
      contractType: j.contractType,
      location: j.location || "Non spécifié",
      applicationsCount: j._count.applications,
      status: j.status === "OPEN" ? "Ouvert" : j.status,
      createdAt: new Date(j.createdAt).toLocaleDateString("fr-FR"),
    }));

    const summaryCards = [
      { label: "Missions Ouvertes", value: activeOffersCount },
      { label: "Vivier Candidats", value: candidatesCount },
      { label: "Complétion Tests", value: `${testCompletionRate}%` },
      { label: "Durée Test", value: `${medianTestMinutes} min` },
      { label: "Délai Shortlist", value: medianOfferToShortlistDays > 0 ? `${medianOfferToShortlistDays} j` : "N/D" },
      { label: "Présence Entretiens", value: `${interviewAttendanceRate}%` },
      { label: "Placements Finaux", value: placedCount },
    ];

    // 1. Export EXCEL (.xlsx)
    if (format === "excel" || format === "xlsx") {
      const excelBuffer = await generateExcelReport({
        title: reportTitle,
        subtitle,
        agencyName,
        sheetName: "Indicateurs Pilote",
        columns: [
          { header: "Intitulé du Poste", key: "title", width: 32 },
          { header: "Entreprise Cliente", key: "company", width: 24 },
          { header: "Type Contrat", key: "contractType", width: 14 },
          { header: "Localisation", key: "location", width: 20 },
          { header: "Candidatures", key: "applicationsCount", width: 16 },
          { header: "Statut", key: "status", width: 14 },
          { header: "Date Publication", key: "createdAt", width: 18 },
        ],
        rows: rowsData,
        summaryCards,
      });

      await db.auditLog.create({
        data: {
          agencyId: auth.session.agencyId!,
          actorUserId: auth.session.userId,
          action: "EXCEL_EXPORT",
          targetType: "PilotReport",
          ipAddress,
          metadata: {
            type: "PILOT_PERFORMANCE_METRICS",
            offersCount: jobOffers.length,
            format: "XLSX",
          },
        },
      });

      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="rapport-pilote-${dateStr}.xlsx"`,
        },
      });
    }

    // 2. Export PDF (.pdf)
    const pdfBuffer = generatePdfReport({
      title: reportTitle,
      subtitle,
      agencyName,
      columns: [
        { header: "Poste", key: "title" },
        { header: "Client", key: "company" },
        { header: "Contrat", key: "contractType" },
        { header: "Lieu", key: "location" },
        { header: "Candidatures", key: "applicationsCount" },
        { header: "Statut", key: "status" },
      ],
      rows: rowsData,
      summaryCards: summaryCards.slice(0, 5), // top 5 summary cards on PDF
    });

    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "PDF_EXPORT",
        targetType: "PilotReport",
        ipAddress,
        metadata: {
          type: "PILOT_PERFORMANCE_METRICS",
          offersCount: jobOffers.length,
          format: "PDF",
        },
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-pilote-${dateStr}.pdf"`,
      },
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur export rapport pilote:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
