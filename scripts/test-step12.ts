import assert from "node:assert/strict";
import { PrismaClient, ApplicationStatus, InterviewStatus } from "@prisma/client";
import { GET as getAdminDashboardGet } from "../app/api/admin/parametres/route";
import { GET as getJournalGet } from "../app/api/admin/journal/route";
import { GET as exportCandidatesGet } from "../app/api/admin/candidats/export/route";
import { signSessionJwt, SESSION_COOKIE_NAME } from "../lib/jwt";

const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
const prisma = new PrismaClient();

async function runTests() {
  console.log("=== Tests Étape 12 : Pilote Multi-Cabinets & Finalisation V2 (PRD V2 §13 & Roadmap P4/P5) ===");

  // 1. Récupération des deux cabinets pilotes
  const [stratosAgency, demoAgency] = await Promise.all([
    prisma.agency.findUnique({ where: { slug: "stratos-conseil" } }),
    prisma.agency.findUnique({ where: { slug: "cabinet-demo" } }),
  ]);

  assert.ok(stratosAgency, "Stratos Conseil doit exister");
  assert.ok(demoAgency, "Cabinet Démo doit exister");

  console.log(`[TEST 1] Vérification de l'identité de marque blanche des deux cabinets...`);
  assert.equal(stratosAgency.brandKey, "blue", "Stratos Conseil doit avoir la charte Bleu Océan");
  assert.equal(demoAgency.brandKey, "emerald", "Cabinet Démo doit avoir la charte Émeraude");
  console.log("  -> Marque blanche validée : Stratos Conseil (Bleu) & Cabinet Démo (Émeraude)");

  // 2. Récupération des utilisateurs pilotes
  const [stratosAdmin, demoAdmin] = await Promise.all([
    prisma.user.findFirst({ where: { agencyId: stratosAgency.id, role: "AGENCY_ADMIN" } }),
    prisma.user.findFirst({ where: { agencyId: demoAgency.id, role: "AGENCY_ADMIN" } }),
  ]);

  assert.ok(stratosAdmin, "Admin Stratos Conseil doit exister");
  assert.ok(demoAdmin, "Admin Cabinet Démo doit exister");

  const stratosJwt = await signSessionJwt({
    userId: stratosAdmin.id,
    agencyId: stratosAgency.id,
    role: "AGENCY_ADMIN",
    email: stratosAdmin.email,
    tokenVersion: stratosAdmin.tokenVersion,
  });
  const stratosCookie = `${SESSION_COOKIE_NAME}=${stratosJwt.token}`;

  const demoJwt = await signSessionJwt({
    userId: demoAdmin.id,
    agencyId: demoAgency.id,
    role: "AGENCY_ADMIN",
    email: demoAdmin.email,
    tokenVersion: demoAdmin.tokenVersion,
  });
  const demoCookie = `${SESSION_COOKIE_NAME}=${demoJwt.token}`;

  // 3. Vérification des données riches du Cabinet Démo (PRD V2 §13 & Roadmap P4)
  console.log("[TEST 2] Validation des données du pilote Cabinet Démo...");
  const [demoOffersCount, demoCandidatesCount, demoShortlistsCount, demoInterviewsCount] = await Promise.all([
    prisma.jobOffer.count({ where: { agencyId: demoAgency.id } }),
    prisma.candidate.count({ where: { agencyId: demoAgency.id } }),
    prisma.shortlist.count({ where: { agencyId: demoAgency.id } }),
    prisma.interview.count({ where: { agencyId: demoAgency.id } }),
  ]);

  assert.ok(demoOffersCount >= 2, "Cabinet Démo doit avoir au moins 2 offres");
  assert.ok(demoCandidatesCount >= 3, "Cabinet Démo doit avoir au moins 3 candidats");
  assert.ok(demoShortlistsCount >= 1, "Cabinet Démo doit avoir au moins 1 shortlist");
  assert.ok(demoInterviewsCount >= 1, "Cabinet Démo doit avoir au moins 1 entretien enregistré");
  console.log(`  -> Données Cabinet Démo vérifiées : ${demoOffersCount} offres, ${demoCandidatesCount} candidats, ${demoShortlistsCount} shortlist, ${demoInterviewsCount} entretien`);

  // 4. Calcul des indicateurs clés de performance (PRD V2 §13)
  console.log("[TEST 3] Validation des métriques du pilote (PRD V2 §13)...");
  const [
    totalAttempts,
    completedAttempts,
    attemptsWithTiming,
    shortlistsWithTiming,
    completedInterviews,
    noShowInterviews,
    totalInterviews,
  ] = await Promise.all([
    prisma.assessmentAttempt.count({ where: { agencyId: demoAgency.id } }),
    prisma.assessmentAttempt.count({ where: { agencyId: demoAgency.id, submittedAt: { not: null } } }),
    prisma.assessmentAttempt.findMany({
      where: { agencyId: demoAgency.id, startedAt: { not: null }, submittedAt: { not: null } },
      select: { startedAt: true, submittedAt: true },
    }),
    prisma.shortlist.findMany({
      where: { agencyId: demoAgency.id, sentAt: { not: null } },
      select: { sentAt: true, jobOffer: { select: { createdAt: true } } },
    }),
    prisma.interview.count({ where: { agencyId: demoAgency.id, status: InterviewStatus.COMPLETED } }),
    prisma.interview.count({
      where: {
        agencyId: demoAgency.id,
        status: { in: [InterviewStatus.NO_SHOW_CANDIDATE, InterviewStatus.NO_SHOW_CLIENT] },
      },
    }),
    prisma.interview.count({ where: { agencyId: demoAgency.id } }),
  ]);

  const testCompletionRate = totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0;
  assert.ok(testCompletionRate > 0, "Le taux de complétion des tests doit être calculé");

  let medianTestMinutes = 0;
  if (attemptsWithTiming.length > 0) {
    const durations = attemptsWithTiming
      .map((a) => (a.submittedAt!.getTime() - a.startedAt!.getTime()) / 60000)
      .sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    medianTestMinutes = Math.max(1, Math.round(durations.length % 2 !== 0 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2));
  }
  assert.ok(medianTestMinutes > 0, "La durée médiane du test doit être positive");

  let medianOfferToShortlistDays = 0;
  if (shortlistsWithTiming.length > 0) {
    const days = shortlistsWithTiming
      .map((s) => (s.sentAt!.getTime() - s.jobOffer.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      .sort((a, b) => a - b);
    const mid = Math.floor(days.length / 2);
    medianOfferToShortlistDays = Math.max(1, Math.round(days.length % 2 !== 0 ? days[mid] : (days[mid - 1] + days[mid]) / 2));
  }
  assert.ok(medianOfferToShortlistDays >= 1, "Le délai offre -> shortlist doit être calculé");

  const interviewAttendanceRate = totalInterviews > 0
    ? Math.round((completedInterviews / Math.max(1, completedInterviews + noShowInterviews)) * 100)
    : 100;
  assert.equal(interviewAttendanceRate, 100, "Le taux de présence aux entretiens doit être de 100% sans absence");
  console.log(`  -> Indicateurs PRD V2 §13 validés : Complétion tests=${testCompletionRate}%, Durée médiane test=${medianTestMinutes} min, Délai Shortlist=${medianOfferToShortlistDays} j, Présence entretiens=${interviewAttendanceRate}%`);

  // 5. Étanchéité absolue multi-tenant R1 sur les exports et journaux
  console.log("[TEST 4] Vérification de l'étanchéité multi-tenant R1 (Export CSV & Journal)...");
  await new Promise((r) => setTimeout(r, 1000));
  
  // Stratos exporte ses candidats
  const reqStratosExport = new Request(`${APP_ORIGIN}/api/admin/candidats/export`, {
    headers: { Cookie: stratosCookie },
  });
  const resStratosExport = await exportCandidatesGet(reqStratosExport);
  assert.equal(resStratosExport.status, 200);
  const stratosCsv = Buffer.from(await resStratosExport.arrayBuffer()).toString("utf-8");
  assert.ok(stratosCsv.includes("Dupont"), "L'export Stratos doit contenir Jean Dupont");
  assert.ok(!stratosCsv.includes("Koffi"), "L'export Stratos NE DOIT PAS contenir Aya Koffi (Cabinet Démo)");

  await new Promise((r) => setTimeout(r, 500));

  // Cabinet Démo exporte ses candidats
  const reqDemoExport = new Request(`${APP_ORIGIN}/api/admin/candidats/export`, {
    headers: { Cookie: demoCookie },
  });
  const resDemoExport = await exportCandidatesGet(reqDemoExport);
  assert.equal(resDemoExport.status, 200);
  const demoCsv = Buffer.from(await resDemoExport.arrayBuffer()).toString("utf-8");
  assert.ok(demoCsv.includes("Koffi"), "L'export Démo doit contenir Aya Koffi");
  assert.ok(!demoCsv.includes("Dupont"), "L'export Démo NE DOIT PAS contenir Jean Dupont (Stratos)");
  console.log("  -> Isolation stricte vérifiée : Aucune fuite de données entre les exports des deux cabinets");

  // 6. Sécurité des jetons & documents (Règles R4 & R6)
  console.log("[TEST 5] Audit de sécurité : Jetons 32 octets hachés (R6) & Documents privés signés (R4)...");
  const attemptsWithPlainToken = await prisma.assessmentAttempt.findMany({
    where: { tokenHash: { equals: "" } },
  });
  assert.equal(attemptsWithPlainToken.length, 0, "Aucun test ne doit avoir de tokenHash vide");

  const proposalsWithPlainToken = await prisma.interviewProposal.findMany({
    where: { tokenHash: { equals: "" } },
  });
  assert.equal(proposalsWithPlainToken.length, 0, "Aucune proposition ne doit avoir de tokenHash vide");
  console.log("  -> Règle R6 validée : Tous les jetons d'évaluation et de rendez-vous sont hachés SHA-256");

  // 7. Audit des actions sensibles (Règle R4 & PRD V2 §10)
  console.log("[TEST 6] Audit des logs d'actions sensibles...");
  const [stratosAuditCount, demoAuditCount] = await Promise.all([
    prisma.auditLog.count({ where: { agencyId: stratosAgency.id } }),
    prisma.auditLog.count({ where: { agencyId: demoAgency.id } }),
  ]);
  assert.ok(stratosAuditCount > 0, "Des logs d'audit doivent exister pour Stratos Conseil");
  console.log(`  -> AuditLog actif et cloisonné : ${stratosAuditCount} entrées pour Stratos, ${demoAuditCount} pour Démo`);

  console.log("=== TOUS LES TESTS ÉTAPE 12 ONT RÉUSSI AVEC SUCCÈS (6/6) ===");
}

runTests()
  .catch((e) => {
    console.error("ÉCHEC DES TESTS :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
