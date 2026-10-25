import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as pipelineGet } from "../app/api/admin/offres/[id]/pipeline/route";
import { POST as assignPost } from "../app/api/admin/offres/[id]/applications/route";
import { PATCH as statusPatch } from "../app/api/admin/applications/[id]/status/route";
import { GET as historyGet } from "../app/api/admin/applications/[id]/history/route";
import { DELETE as deleteAppDelete } from "../app/api/admin/applications/[id]/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { ApplicationStatus } from "@prisma/client";

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
  assert.equal(res.status, 200, `Login échoué pour ${email}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie);
  const match = setCookie.match(/stratos_session=[^;]+/);
  assert.ok(match);
  return match[0];
}

async function runTests() {
  console.log("=== Tests Étape 7 : Pipeline de Recrutement Kanban & Règle R2 (Non-rejet auto) ===");

  await prisma.rateLimit.deleteMany({});

  const stratosConsultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const demoConsultantCookie = await getAuthCookie("consultant@cabinet-demo.test");

  // Récupérer l'offre Stratos et un candidat Stratos
  const stratosOffer = await prisma.jobOffer.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });
  const stratosCandidate = await prisma.candidate.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });

  // Nettoyer toute assignation préalable entre ce candidat et cette offre
  await prisma.application.deleteMany({
    where: {
      candidateId: stratosCandidate.id,
      jobOfferId: stratosOffer.id,
    },
  });

  let createdApplicationId = "";

  // 1. Consultation du pipeline Kanban de l'offre (GET /api/admin/offres/[id]/pipeline)
  {
    const context = { params: Promise.resolve({ id: stratosOffer.id }) };
    const req = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/pipeline`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });

    const res = await pipelineGet(req, context);
    assert.equal(res.status, 200, "Le consultant Stratos doit pouvoir charger le pipeline de son offre");
    const data = await res.json();
    assert.equal(data.id, stratosOffer.id);
    assert.ok(Array.isArray(data.applications));

    console.log("✔ [1/7] Lecture du pipeline d'offre avec candidatures et historique validée");
  }

  // 2. Isolation Cross-Cabinet sur le pipeline (R1 -> 404)
  {
    const context = { params: Promise.resolve({ id: stratosOffer.id }) };
    const crossReq = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/pipeline`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: demoConsultantCookie,
      },
    });

    const crossRes = await pipelineGet(crossReq, context);
    assert.equal(crossRes.status, 404, "Isolation R1 : Cabinet Démo accédant à l'offre Stratos doit recevoir 404");
    console.log("✔ [2/7] Isolation multi-cabinet vérifiée sur le pipeline (404)");
  }

  // 3. Assignation d'un candidat à l'offre (POST /api/admin/offres/[id]/applications)
  {
    const context = { params: Promise.resolve({ id: stratosOffer.id }) };
    const assignReq = new Request(
      `${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/applications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({ candidateId: stratosCandidate.id }),
      }
    );

    const assignRes = await assignPost(assignReq, context);
    assert.equal(assignRes.status, 201);
    const assignData = await assignRes.json();
    assert.ok(assignData.id);
    assert.equal(assignData.status, ApplicationStatus.IDENTIFIED);
    createdApplicationId = assignData.id;

    console.log("✔ [3/7] Assignation initiale en étape IDENTIFIED avec premier historique validée");
  }

  // 4. Progression dans le Pipeline Kanban (PATCH /api/admin/applications/[id]/status)
  {
    const context = { params: Promise.resolve({ id: createdApplicationId }) };

    // a. Passage à CONTACTED
    const patch1 = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({
          toStatus: ApplicationStatus.CONTACTED,
          note: "Premier contact téléphonique réussi. Candidat intéressé.",
        }),
      }
    );
    const res1 = await statusPatch(patch1, context);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.application.status, ApplicationStatus.CONTACTED);

    // b. Passage à PRESENTED (doit activer cvSharedClient)
    const patch2 = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({
          toStatus: ApplicationStatus.PRESENTED,
          note: "Candidat retenu pour la présentation client.",
        }),
      }
    );
    const res2 = await statusPatch(patch2, context);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.application.status, ApplicationStatus.PRESENTED);
    assert.equal(data2.application.cvSharedClient, true, "cvSharedClient doit être activé au passage à PRESENTED");

    console.log("✔ [4/7] Transitions d'étapes (CONTACTED -> PRESENTED) et partage CV validés");
  }

  // 5. Décision humaine explicite de rejet (Règle R2)
  {
    const context = { params: Promise.resolve({ id: createdApplicationId }) };
    const rejectReq = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({
          toStatus: ApplicationStatus.REJECTED,
          reason: "Prétentions salariales non alignées",
          note: "Le candidat demande 70k€, budget maximum client fixé à 55k€.",
        }),
      }
    );

    const rejectRes = await statusPatch(rejectReq, context);
    assert.equal(rejectRes.status, 200);
    const rejectData = await rejectRes.json();
    assert.equal(rejectData.application.status, ApplicationStatus.REJECTED);
    assert.equal(rejectData.application.rejectionReason, "Prétentions salariales non alignées");
    assert.equal(rejectData.history.reason, "Prétentions salariales non alignées");

    console.log("✔ [5/7] Règle R2 vérifiée : Rejet explicite avec motif enregistré dans Application & History");
  }

  // 6. Audit Trail et Consultation d'historique (GET /api/admin/applications/[id]/history)
  {
    const context = { params: Promise.resolve({ id: createdApplicationId }) };
    const histReq = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}/history`,
      {
        method: "GET",
        headers: {
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
      }
    );

    const histRes = await historyGet(histReq, context);
    assert.equal(histRes.status, 200);
    const historyList = await histRes.json();
    assert.ok(Array.isArray(historyList));
    // Doit contenir au moins 4 entrées : IDENTIFIED, CONTACTED, PRESENTED, REJECTED
    assert.ok(historyList.length >= 4, `Attendu au moins 4 transitions, reçu ${historyList.length}`);
    assert.equal(historyList[0].toStatus, ApplicationStatus.REJECTED);
    assert.ok(historyList[0].changedByUser, "L'utilisateur auteur du changement doit être renseigné");

    console.log("✔ [6/7] Journal complet des transitions d'étapes (ApplicationHistory) validé");
  }

  // 7. Isolation cross-tenant & retrait de candidature (DELETE)
  {
    const context = { params: Promise.resolve({ id: createdApplicationId }) };

    // a. Tentative de suppression cross-cabinet -> 404
    const crossDeleteReq = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}`,
      {
        method: "DELETE",
        headers: {
          Origin: APP_ORIGIN,
          cookie: demoConsultantCookie,
        },
      }
    );
    const crossDeleteRes = await deleteAppDelete(crossDeleteReq, context);
    assert.equal(crossDeleteRes.status, 404, "Tentative de suppression cross-cabinet doit retourner 404");

    // b. Suppression légitime par le cabinet propriétaire
    const legitimateDeleteReq = new Request(
      `${APP_ORIGIN}/api/admin/applications/${createdApplicationId}`,
      {
        method: "DELETE",
        headers: {
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
      }
    );
    const legitimateDeleteRes = await deleteAppDelete(legitimateDeleteReq, context);
    assert.equal(legitimateDeleteRes.status, 200);

    // Vérifier suppression effective en base
    const checkDeleted = await prisma.application.findUnique({
      where: { id: createdApplicationId },
    });
    assert.equal(checkDeleted, null, "La candidature doit être purgée de la base");

    console.log("✔ [7/7] Retrait de candidature & barrière d'isolation cross-cabinet vérifiés");
  }

  console.log("\n=======================================================");
  console.log("🎉 TOUS LES TESTS DE L'ÉTAPE 7 SONT AU VERT (7/7) !");
  console.log("=======================================================\n");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec test étape 7 :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
