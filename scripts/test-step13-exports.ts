import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { GET as exportCandidatesGet } from "../app/api/admin/candidats/export/route";
import { GET as exportOfferGet } from "../app/api/admin/offres/[id]/export/route";
import { GET as exportPilotReportGet } from "../app/api/admin/rapports/pilote/export/route";
import { signSessionJwt, SESSION_COOKIE_NAME } from "../lib/jwt";

const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
const prisma = new PrismaClient();

async function runTests() {
  console.log("=== Tests : Export Multi-Formats Excel (.xlsx) & PDF (.pdf) ===");

  // 1. Récupération des utilisateurs Stratos et Démo
  const [stratosAgency, demoAgency] = await Promise.all([
    prisma.agency.findUnique({ where: { slug: "stratos-conseil" } }),
    prisma.agency.findUnique({ where: { slug: "cabinet-demo" } }),
  ]);

  assert.ok(stratosAgency);
  assert.ok(demoAgency);

  const [stratosAdmin, demoAdmin] = await Promise.all([
    prisma.user.findFirst({ where: { agencyId: stratosAgency.id, role: "AGENCY_ADMIN" } }),
    prisma.user.findFirst({ where: { agencyId: demoAgency.id, role: "AGENCY_ADMIN" } }),
  ]);

  assert.ok(stratosAdmin);
  assert.ok(demoAdmin);

  const stratosJwt = await signSessionJwt({
    userId: stratosAdmin.id,
    agencyId: stratosAgency.id,
    role: "AGENCY_ADMIN",
    email: stratosAdmin.email,
    tokenVersion: stratosAdmin.tokenVersion,
  });
  const stratosCookie = `${SESSION_COOKIE_NAME}=${stratosJwt.token}`;

  const stratosOffer = await prisma.jobOffer.findFirst({
    where: { agencyId: stratosAgency.id },
  });
  assert.ok(stratosOffer);

  // 2. Export Candidats en EXCEL (.xlsx)
  {
    console.log("[TEST 1] Export Vivier Candidats en format Excel (.xlsx)...");
    const req = new Request(`${APP_ORIGIN}/api/admin/candidats/export?format=excel`, {
      headers: { Cookie: stratosCookie },
    });
    const res = await exportCandidatesGet(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("spreadsheetml.sheet"));
    assert.ok(res.headers.get("content-disposition")?.includes(".xlsx"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 1000, "Le fichier Excel ne doit pas être vide");
    // Magic bytes ZIP/XLSX: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
    assert.equal(buf[2], 0x03);
    assert.equal(buf[3], 0x04);
    console.log(`  -> Fichier Excel valide généré (${buf.length} octets)`);
  }

  // 3. Export Candidats en PDF (.pdf)
  {
    console.log("[TEST 2] Export Vivier Candidats en format PDF (.pdf)...");
    const req = new Request(`${APP_ORIGIN}/api/admin/candidats/export?format=pdf`, {
      headers: { Cookie: stratosCookie },
    });
    const res = await exportCandidatesGet(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/pdf"));
    assert.ok(res.headers.get("content-disposition")?.includes(".pdf"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 500, "Le fichier PDF ne doit pas être vide");
    // Magic bytes PDF: %PDF (0x25, 0x50, 0x44, 0x46)
    assert.equal(buf[0], 0x25);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x44);
    assert.equal(buf[3], 0x46);
    console.log(`  -> Fichier PDF valide généré (${buf.length} octets)`);
  }

  // 4. Export Pipeline Offre en EXCEL et PDF
  {
    console.log("[TEST 3] Export Pipeline de l'offre en Excel (.xlsx) et PDF (.pdf)...");
    
    // Excel
    const reqExcel = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/export?format=excel`, {
      headers: { Cookie: stratosCookie },
    });
    const resExcel = await exportOfferGet(reqExcel, { params: Promise.resolve({ id: stratosOffer.id }) });
    assert.equal(resExcel.status, 200);
    const excelBuf = Buffer.from(await resExcel.arrayBuffer());
    assert.equal(excelBuf[0], 0x50); // PK zip header

    // PDF
    const reqPdf = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/export?format=pdf`, {
      headers: { Cookie: stratosCookie },
    });
    const resPdf = await exportOfferGet(reqPdf, { params: Promise.resolve({ id: stratosOffer.id }) });
    assert.equal(resPdf.status, 200);
    const pdfBuf = Buffer.from(await resPdf.arrayBuffer());
    assert.equal(pdfBuf[0], 0x25); // %PDF header
    console.log(`  -> Pipeline exporté avec succès en Excel (${excelBuf.length} o) et PDF (${pdfBuf.length} o)`);
  }

  // 5. Export Rapport Exécutif Pilote (PRD V2 §13) en EXCEL et PDF
  {
    console.log("[TEST 4] Export Rapport Exécutif Pilote en Excel et PDF...");

    const reqExcel = new Request(`${APP_ORIGIN}/api/admin/rapports/pilote/export?format=excel`, {
      headers: { Cookie: stratosCookie },
    });
    const resExcel = await exportPilotReportGet(reqExcel);
    assert.equal(resExcel.status, 200);
    const excelBuf = Buffer.from(await resExcel.arrayBuffer());
    assert.equal(excelBuf[0], 0x50);

    const reqPdf = new Request(`${APP_ORIGIN}/api/admin/rapports/pilote/export?format=pdf`, {
      headers: { Cookie: stratosCookie },
    });
    const resPdf = await exportPilotReportGet(reqPdf);
    assert.equal(resPdf.status, 200);
    const pdfBuf = Buffer.from(await resPdf.arrayBuffer());
    assert.equal(pdfBuf[0], 0x25);
    console.log(`  -> Rapport exécutif pilote généré avec succès en Excel (${excelBuf.length} o) et PDF (${pdfBuf.length} o)`);
  }

  // 6. Traçabilité des exports dans AuditLog
  {
    console.log("[TEST 5] Vérification de la traçabilité des exports Excel & PDF dans AuditLog...");
    const [excelAuditCount, pdfAuditCount] = await Promise.all([
      prisma.auditLog.count({ where: { agencyId: stratosAgency.id, action: "EXCEL_EXPORT" } }),
      prisma.auditLog.count({ where: { agencyId: stratosAgency.id, action: "PDF_EXPORT" } }),
    ]);

    assert.ok(excelAuditCount >= 3, "Au moins 3 exports Excel doivent être tracés");
    assert.ok(pdfAuditCount >= 3, "Au moins 3 exports PDF doivent être tracés");
    console.log(`  -> Traçabilité AuditLog validée : ${excelAuditCount} logs EXCEL_EXPORT, ${pdfAuditCount} logs PDF_EXPORT`);
  }

  console.log("=== TOUS LES TESTS D'EXPORT EXCEL & PDF ONT RÉUSSI (5/5) ===");
}

runTests()
  .catch((e) => {
    console.error("ÉCHEC DES TESTS D'EXPORT :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
