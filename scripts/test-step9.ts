import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { POST as createShortlistPost, GET as getOfferShortlistsGet } from "../app/api/admin/offres/[id]/shortlists/route";
import { GET as getShortlistDetailGet, DELETE as deleteShortlistDelete } from "../app/api/admin/shortlists/[id]/route";
import { PATCH as updateItemPatch } from "../app/api/admin/shortlists/[id]/items/[itemId]/route";
import { POST as sendShortlistPost } from "../app/api/admin/shortlists/[id]/send/route";
import { GET as getClientOffresGet } from "../app/api/client/offres/route";
import { GET as getClientShortlistsGet } from "../app/api/client/offres/[id]/shortlists/route";
import { POST as clientDecisionPost } from "../app/api/client/shortlists/items/[id]/decision/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { ConsentStatus, ApplicationStatus, ClientDecision } from "@prisma/client";

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
  console.log("=== Tests Étape 9 : Shortlists & Portail Entreprises Clientes (PRD V2 §6.2) ===");

  await prisma.rateLimit.deleteMany({});

  // 1. Authentification
  const consultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const clientCookie = await getAuthCookie("client@techcorp.test");
  const cabinet2Cookie = await getAuthCookie("admin@cabinet-demo.test");

  // Récupération d'une offre et d'une candidature Stratos
  const agencyStratos = await prisma.agency.findUnique({ where: { slug: "stratos-conseil" } });
  assert.ok(agencyStratos);

  const offer = await prisma.jobOffer.findFirst({
    where: { agencyId: agencyStratos.id },
    include: {
      applications: {
        include: { candidate: true },
      },
      company: true,
    },
  });
  assert.ok(offer, "Une offre Stratos doit exister");
  assert.ok(offer.applications.length > 0, "L'offre doit comporter au moins une candidature");

  const application = offer.applications[0];
  console.log(`[TEST] Utilisation offre "${offer.title}" (${offer.id}) et candidat "${application.candidate.firstName} ${application.candidate.lastName}"`);

  let createdShortlistId = "";
  let createdItemId = "";

  // 2. Création d'une Shortlist en DRAFT avec un candidat en consentement PENDING
  {
    console.log("[TEST 1] Création d'une shortlist DRAFT avec consentement PENDING...");
    const req = new Request(`${APP_ORIGIN}/api/admin/offres/${offer.id}/shortlists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
      body: JSON.stringify({
        title: "Shortlist Test Automatisé #1",
        message: "Sélection de profils pour validation client.",
        items: [
          {
            applicationId: application.id,
            summary: "Excellente maîtrise technique et bonne posture managériale.",
            showTestResult: true,
            showSubscores: true,
            cvShared: true,
            consentStatus: ConsentStatus.PENDING,
          },
        ],
      }),
    });

    const res = await createShortlistPost(req, { params: Promise.resolve({ id: offer.id }) });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.ok(json.shortlist);
    assert.equal(json.shortlist.status, "DRAFT");
    assert.equal(json.shortlist.items.length, 1);
    assert.equal(json.shortlist.items[0].consentStatus, "PENDING");

    createdShortlistId = json.shortlist.id;
    createdItemId = json.shortlist.items[0].id;
    console.log("  -> Shortlist créée en DRAFT avec succès (ID:", createdShortlistId, ")");
  }

  // 3. RÈGLE STRICTE PRD V2 §6.2 : Tentative d'envoi client avec consentement PENDING
  {
    console.log("[TEST 2] Règle PRD V2 §6.2 : Blocage de l'envoi si le consentement candidat n'est pas GRANTED...");
    const req = new Request(`${APP_ORIGIN}/api/admin/shortlists/${createdShortlistId}/send`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
    });

    const res = await sendShortlistPost(req, { params: Promise.resolve({ id: createdShortlistId }) });
    assert.equal(res.status, 400, "Doit renvoyer HTTP 400 si le consentement candidat manque");
    const json = await res.json();
    assert.ok(json.error.includes("GRANTED"), "Le message d'erreur doit mentionner le statut GRANTED obligatoire");
    console.log("  -> Blocage strict vérifié :", json.error);
  }

  // 4. Mise à jour du consentement vers GRANTED par le consultant
  {
    console.log("[TEST 3] Mise à jour du statut de consentement vers GRANTED...");
    const req = new Request(`${APP_ORIGIN}/api/admin/shortlists/${createdShortlistId}/items/${createdItemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
      body: JSON.stringify({
        consentStatus: ConsentStatus.GRANTED,
      }),
    });

    const res = await updateItemPatch(req, {
      params: Promise.resolve({ id: createdShortlistId, itemId: createdItemId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.item.consentStatus, "GRANTED");
    assert.ok(json.item.consentAt, "consentAt doit être horodaté");
    console.log("  -> Consentement candidat validé (GRANTED à", json.item.consentAt, ")");
  }

  // 5. Envoi autorisé de la Shortlist au client
  {
    console.log("[TEST 4] Transmission de la shortlist validée au client...");
    const req = new Request(`${APP_ORIGIN}/api/admin/shortlists/${createdShortlistId}/send`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
    });

    const res = await sendShortlistPost(req, { params: Promise.resolve({ id: createdShortlistId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.success);

    // Vérifier en base que la candidature est passée à PRESENTED
    const updatedApp = await prisma.application.findUnique({
      where: { id: application.id },
      include: { statusHistory: { orderBy: { changedAt: "desc" }, take: 1 } },
    });
    assert.ok(updatedApp);
    assert.equal(updatedApp.status, ApplicationStatus.PRESENTED);
    assert.equal(updatedApp.statusHistory[0].toStatus, ApplicationStatus.PRESENTED);
    console.log("  -> Shortlist envoyée (status=SENT), candidature mise à jour vers PRESENTED");
  }

  // 6. Portail Client : Consultation avec anonymisation dynamique (PRD V2 §6.2)
  {
    console.log("[TEST 5] Consultation côté portail client & vérification de l'anonymisation...");
    const req = new Request(`${APP_ORIGIN}/api/client/offres/${offer.id}/shortlists`, {
      method: "GET",
      headers: {
        Cookie: clientCookie,
      },
    });

    const res = await getClientShortlistsGet(req, { params: Promise.resolve({ id: offer.id }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.shortlists.length > 0);

    const targetSl = json.shortlists.find((s: { id: string }) => s.id === createdShortlistId);
    assert.ok(targetSl);
    const item = targetSl.items.find((i: { id: string }) => i.id === createdItemId);
    assert.ok(item);

    // Vérification de l'anonymisation
    assert.equal(item.isAnonymized, true, "Le profil doit être anonymisé avant confirmation d'intérêt");
    assert.equal(item.email, null, "L'email doit être masqué");
    assert.equal(item.phone, null, "Le téléphone doit être masqué");
    assert.ok(
      item.displayName.endsWith("."),
      `Le nom doit être masqué avec une initiale (ex: Aminata T.), reçu: "${item.displayName}"`
    );
    console.log(`  -> Anonymisation respectée : nom affiché "${item.displayName}", email et téléphone masqués`);
  }

  // 7. Prise de décision Client : NOT_FOR_THIS_ROLE sans motif (doit échouer)
  {
    console.log("[TEST 6] Règle qualité feedback : refus client rejeté si le motif est absent...");
    const req = new Request(`${APP_ORIGIN}/api/client/shortlists/items/${createdItemId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: clientCookie,
      },
      body: JSON.stringify({
        decision: ClientDecision.NOT_FOR_THIS_ROLE,
        reason: "", // vide
      }),
    });

    const res = await clientDecisionPost(req, { params: Promise.resolve({ id: createdItemId }) });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("motif"), "Doit exiger un motif");
    console.log("  -> Vérification réussie : motif obligatoire imposé");
  }

  // 8. Prise de décision Client : INTERESTED (débloque l'identité et passe en INTERVIEW_REQUESTED)
  {
    console.log("[TEST 7] Décision client INTERESTED -> Démasquage immédiat et demande d'entretien...");
    const req = new Request(`${APP_ORIGIN}/api/client/shortlists/items/${createdItemId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: clientCookie,
      },
      body: JSON.stringify({
        decision: ClientDecision.INTERESTED,
      }),
    });

    const res = await clientDecisionPost(req, { params: Promise.resolve({ id: createdItemId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.decision, "INTERESTED");
    assert.ok(json.item.candidate.email, "L'email doit être révélé");
    assert.ok(json.item.candidate.lastName.length > 1, "Le nom complet doit être révélé");

    // Vérifier l'état de la candidature
    const appAfter = await prisma.application.findUnique({
      where: { id: application.id },
    });
    assert.equal(appAfter?.status, ApplicationStatus.INTERVIEW_REQUESTED);

    // Vérifier que la route de consultation client ne masque plus
    const checkReq = new Request(`${APP_ORIGIN}/api/client/offres/${offer.id}/shortlists`, {
      method: "GET",
      headers: { Cookie: clientCookie },
    });
    const checkRes = await getClientShortlistsGet(checkReq, { params: Promise.resolve({ id: offer.id }) });
    const checkJson = await checkRes.json();
    const slAfter = checkJson.shortlists.find((s: { id: string }) => s.id === createdShortlistId);
    const itemAfter = slAfter.items.find((i: { id: string }) => i.id === createdItemId);
    assert.equal(itemAfter.isAnonymized, false);
    assert.ok(itemAfter.email);
    console.log(`  -> Identité débloquée avec succès : ${itemAfter.displayName} (${itemAfter.email}), étape = INTERVIEW_REQUESTED`);
  }

  // 9. Règle R1 : Isolation Multi-Tenant (Cross-Tenant 404)
  {
    console.log("[TEST 8] Règle R1 : Vérification d'isolation multi-tenant pour un autre cabinet...");
    const req = new Request(`${APP_ORIGIN}/api/admin/shortlists/${createdShortlistId}`, {
      method: "GET",
      headers: {
        Cookie: cabinet2Cookie, // Cabinet Démo
      },
    });

    const res = await getShortlistDetailGet(req, { params: Promise.resolve({ id: createdShortlistId }) });
    assert.equal(res.status, 404, "Une ressource d'un autre cabinet doit renvoyer 404");
    console.log("  -> Isolation R1 vérifiée : Cabinet 2 reçoit HTTP 404 sur les shortlists de Stratos Conseil");
  }

  // Nettoyage de la shortlist de test
  await prisma.shortlistItem.deleteMany({ where: { shortlistId: createdShortlistId } });
  await prisma.shortlist.delete({ where: { id: createdShortlistId } });

  console.log("=== TOUS LES TESTS ÉTAPE 9 ONT RÉUSSI AVEC SUCCÈS (8/8) ===");
}

runTests()
  .catch((e) => {
    console.error("ÉCHEC DES TESTS :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
