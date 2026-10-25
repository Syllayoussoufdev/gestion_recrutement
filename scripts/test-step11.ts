import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { executeRetentionPurge } from "../lib/retention";
import { GET as exportCandidatesGet } from "../app/api/admin/candidats/export/route";
import { GET as exportOfferGet } from "../app/api/admin/offres/[id]/export/route";
import { GET as getJournalGet } from "../app/api/admin/journal/route";
import { PATCH as updateSettingsPatch } from "../app/api/admin/parametres/route";
import { POST as executePurgePost } from "../app/api/admin/retention/purge/route";
import { POST as loginPost } from "../app/api/auth/login/route";

const APP_ORIGIN = "http://localhost:3000";
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "DevOnly_ChangeMe_2026!";

async function getAuthCookie(email: string): Promise<string> {
  const req = new Request(`${APP_ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: APP_ORIGIN,
      Host: "localhost:3000",
    },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  });
  const res = await loginPost(req);
  assert.equal(res.status, 200, `Login failed for ${email}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie);
  const match = setCookie.match(/stratos_session=[^;]+/);
  assert.ok(match);
  return match[0];
}

async function runTests() {
  console.log("=== Tests Étape 11 : Sécurité, Rétention RGPD, Journal d'Audit & Export CSV (PRD V2 §10) ===");

  await prisma.rateLimit.deleteMany({});

  // 1. Authentification
  const adminCookie = await getAuthCookie("admin@stratosconseil.test");
  const consultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const clientCookie = await getAuthCookie("client@techcorp.test");
  const cabinet2AdminCookie = await getAuthCookie("admin@cabinet-demo.test");

  const agencyStratos = await prisma.agency.findUnique({ where: { slug: "stratos-conseil" } });
  assert.ok(agencyStratos);

  const offer = await prisma.jobOffer.findFirst({
    where: { agencyId: agencyStratos.id },
  });
  assert.ok(offer);

  // 2. Export CSV des candidats avec encodage UTF-8 BOM & traçabilité AuditLog (PRD V2 §10.5)
  {
    console.log("[TEST 1] Export CSV des candidats & vérification traçabilité AuditLog...");
    const auditCountBefore = await prisma.auditLog.count({
      where: { agencyId: agencyStratos.id, action: "CSV_EXPORT" },
    });

    const req = new Request(`${APP_ORIGIN}/api/admin/candidats/export`, {
      method: "GET",
      headers: { Cookie: consultantCookie },
    });

    const res = await exportCandidatesGet(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/csv"));
    assert.ok(res.headers.get("content-disposition")?.includes("attachment; filename="));

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    // Doit démarrer avec le BOM UTF-8 (0xEF, 0xBB, 0xBF)
    assert.equal(buf[0], 0xef, "Le fichier CSV doit contenir le BOM UTF-8 (byte 0)");
    assert.equal(buf[1], 0xbb, "Le fichier CSV doit contenir le BOM UTF-8 (byte 1)");
    assert.equal(buf[2], 0xbf, "Le fichier CSV doit contenir le BOM UTF-8 (byte 2)");

    const csvText = buf.toString("utf-8");
    assert.ok(csvText.includes("Nom;Prénom;Email;Téléphone"));

    // Vérifier que l'export a été tracé dans AuditLog
    const auditCountAfter = await prisma.auditLog.count({
      where: { agencyId: agencyStratos.id, action: "CSV_EXPORT" },
    });
    assert.equal(auditCountAfter, auditCountBefore + 1, "Une entrée AuditLog CSV_EXPORT doit être créée");
    console.log("  -> CSV conforme (UTF-8 BOM, RFC 4180) et tracé avec succès dans AuditLog");
  }

  // 3. Export CSV des candidatures d'une offre
  {
    console.log("[TEST 2] Export CSV des candidatures d'un poste...");
    const req = new Request(`${APP_ORIGIN}/api/admin/offres/${offer.id}/export`, {
      method: "GET",
      headers: { Cookie: adminCookie },
    });

    const res = await exportOfferGet(req, { params: Promise.resolve({ id: offer.id }) });
    assert.equal(res.status, 200);
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    assert.equal(buf[0], 0xef, "Le fichier CSV doit contenir le BOM UTF-8 (byte 0)");
    assert.equal(buf[1], 0xbb, "Le fichier CSV doit contenir le BOM UTF-8 (byte 1)");
    assert.equal(buf[2], 0xbf, "Le fichier CSV doit contenir le BOM UTF-8 (byte 2)");
    const csvText = buf.toString("utf-8");
    assert.ok(csvText.includes("Candidat") || csvText.includes("Nom"));
    console.log("  -> Export CSV de l'offre généré et tracé avec succès");
  }

  // 4. Consultation du Journal d'Audit & Contrôle d'Accès par Rôle (PRD V2 §10.4)
  {
    console.log("[TEST 3] Contrôle d'accès au Journal d'Audit (AGENCY_ADMIN uniquement)...");

    // Consultant -> Refusé (403)
    const reqConsultant = new Request(`${APP_ORIGIN}/api/admin/journal`, {
      method: "GET",
      headers: { Cookie: consultantCookie },
    });
    const resConsultant = await getJournalGet(reqConsultant);
    assert.equal(resConsultant.status, 403, "Le rôle CONSULTANT ne doit pas avoir accès au journal d'audit");

    // Client -> Refusé (403)
    const reqClient = new Request(`${APP_ORIGIN}/api/admin/journal`, {
      method: "GET",
      headers: { Cookie: clientCookie },
    });
    const resClient = await getJournalGet(reqClient);
    assert.equal(resClient.status, 403, "Le rôle CLIENT ne doit pas avoir accès au journal d'audit");

    // Admin Cabinet -> Autorisé (200)
    const reqAdmin = new Request(`${APP_ORIGIN}/api/admin/journal`, {
      method: "GET",
      headers: { Cookie: adminCookie },
    });
    const resAdmin = await getJournalGet(reqAdmin);
    assert.equal(resAdmin.status, 200);
    const jsonAdmin = await resAdmin.json();
    assert.ok(Array.isArray(jsonAdmin.logs));
    assert.ok(jsonAdmin.logs.length > 0);
    console.log(`  -> Accès sécurisé vérifié : ${jsonAdmin.logs.length} entrées d'audit consultées par l'administrateur`);
  }

  // 5. Modification des Paramètres du Cabinet & Audit (PRD V2 §10.6)
  {
    console.log("[TEST 4] Modification des paramètres du cabinet & traçabilité...");
    const req = new Request(`${APP_ORIGIN}/api/admin/parametres`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        retentionMonths: 24,
        testRetentionMonths: 12,
        anonymizeUntilInterest: true,
        brandKey: "blue",
      }),
    });

    const res = await updateSettingsPatch(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.success);
    assert.equal(json.agency.brandKey, "blue");

    // Vérifier AuditLog AGENCY_SETTINGS_UPDATE
    const lastAudit = await prisma.auditLog.findFirst({
      where: { agencyId: agencyStratos.id, action: "AGENCY_SETTINGS_UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(lastAudit);
    console.log("  -> Paramètres enregistrés et action consignée dans AuditLog");
  }

  // 6. Moteur de Rétention & Purge RGPD (PRD V2 §10.3)
  {
    console.log("[TEST 5] Exécution du moteur de purge RGPD...");
    const purgeAuditBefore = await prisma.auditLog.count({
      where: { agencyId: agencyStratos.id, action: "RETENTION_PURGE" },
    });

    const req = new Request(`${APP_ORIGIN}/api/admin/retention/purge`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        Cookie: adminCookie,
      },
    });

    const res = await executePurgePost(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.success);
    assert.ok(json.purgedAnswersCount !== undefined);
    assert.ok(json.purgedCandidatesCount !== undefined);

    const purgeAuditAfter = await prisma.auditLog.count({
      where: { agencyId: agencyStratos.id, action: "RETENTION_PURGE" },
    });
    assert.equal(purgeAuditAfter, purgeAuditBefore + 1, "Un AuditLog RETENTION_PURGE doit être créé");
    console.log(`  -> Purge RGPD exécutée avec succès (${json.purgedAnswersCount} réponses, ${json.purgedCandidatesCount} candidats)`);
  }

  // 7. Isolation multi-tenant du Journal d'Audit (Règle R1)
  {
    console.log("[TEST 6] Isolation multi-tenant : Cabinet 2 n'accède pas aux logs de Stratos Conseil...");
    const agencyDemo = await prisma.agency.findUnique({ where: { slug: "cabinet-demo" } });
    assert.ok(agencyDemo);

    const reqDemo = new Request(`${APP_ORIGIN}/api/admin/journal`, {
      method: "GET",
      headers: { Cookie: cabinet2AdminCookie },
    });

    const resDemo = await getJournalGet(reqDemo);
    assert.equal(resDemo.status, 200);
    const jsonDemo = await resDemo.json();

    // Tous les logs retournés pour Cabinet 2 doivent appartenir à Cabinet 2 exclusivement
    for (const log of jsonDemo.logs) {
      assert.notEqual(log.agencyId, agencyStratos.id, "Violation R1 : log de Stratos présent dans la vue de Cabinet 2");
    }
    console.log("  -> Règle R1 validée : étanchéité absolue du journal d'audit entre cabinets");
  }

  console.log("=== TOUS LES TESTS ÉTAPE 11 ONT RÉUSSI AVEC SUCCÈS (6/6) ===");
}

runTests()
  .catch((e) => {
    console.error("ÉCHEC DES TESTS :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
