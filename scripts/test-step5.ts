import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as listGet, POST as createPost } from "../app/api/admin/offres/route";
import {
  GET as detailGet,
  PUT as updatePut,
  PATCH as statusPatch,
} from "../app/api/admin/offres/[id]/route";
import { PATCH as dedicatedStatusPatch } from "../app/api/admin/offres/[id]/status/route";
import { POST as assignPost } from "../app/api/admin/offres/[id]/applications/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { ContractType, OfferStatus } from "@prisma/client";

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
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie);
  const match = setCookie.match(/stratos_session=[^;]+/);
  assert.ok(match);
  return match[0];
}

async function runTests() {
  console.log("=== Tests Étape 5 : CRUD Offres d'emploi & Isolation Multi-Cabinets ===");

  await prisma.rateLimit.deleteMany({});

  const stratosCookie = await getAuthCookie("consultant@stratosconseil.test");
  const demoCookie = await getAuthCookie("consultant@cabinet-demo.test");

  // Récupérer entreprise et candidat existants dans Stratos
  const stratosCompany = await prisma.company.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });
  const stratosCandidate = await prisma.candidate.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });

  // Récupérer entreprise et offre existantes dans Cabinet Démo
  const demoCompany = await prisma.company.findFirstOrThrow({
    where: { agency: { slug: "cabinet-demo" } },
  });
  const demoOffer = await prisma.jobOffer.findFirstOrThrow({
    where: { agency: { slug: "cabinet-demo" } },
  });

  let createdOfferId = "";

  // 1. Création offre avec Zod validation (POST)
  {
    // Test validation salaire min > max -> 400
    const invalidSalaryReq = new Request(`${APP_ORIGIN}/api/admin/offres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        companyId: stratosCompany.id,
        title: "Dev Invalide",
        description: "Description test valide",
        contractType: ContractType.CDI,
        salaryMin: 50000,
        salaryMax: 40000,
      }),
    });
    const invalidRes = await createPost(invalidSalaryReq);
    assert.equal(invalidRes.status, 400, "salaryMin > salaryMax doit retourner 400");
    console.log("✔ [1/7] Validation Zod : cohérence salaire minimum <= maximum vérifiée");

    // Création offre valide
    const createReq = new Request(`${APP_ORIGIN}/api/admin/offres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        companyId: stratosCompany.id,
        title: "Product Manager Senior (Test Étape 5)",
        description: "## Mission\nPiloter la roadmap produit et coordonner les équipes tech.",
        skills: ["Product Management", "Scrum", "UX", "Data Analytics"],
        contractType: ContractType.CDI,
        location: "Abidjan (Plateau)",
        salaryMin: 45000,
        salaryMax: 60000,
        status: OfferStatus.OPEN,
      }),
    });
    const createRes = await createPost(createReq);
    assert.equal(createRes.status, 201);
    const createJson = await createRes.json();
    assert.equal(createJson.title, "Product Manager Senior (Test Étape 5)");
    assert.equal(createJson.skills.length, 4);
    createdOfferId = createJson.id;
    console.log("✔ [2/7] POST /api/admin/offres : offre créée avec succès");
  }

  // 2. Liste paginée et filtres
  {
    const listReq = new Request(
      `${APP_ORIGIN}/api/admin/offres?search=Product&companyId=${stratosCompany.id}&status=OPEN`,
      {
        headers: { cookie: stratosCookie },
      }
    );
    const listRes = await listGet(listReq);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.length >= 1);
    assert.equal(listJson.data[0].id, createdOfferId);
    console.log("✔ [3/7] GET /api/admin/offres : filtres combinables (recherche, statut, entreprise) validés");
  }

  // 3. Fiche offre (GET), Édition (PUT) et Changement de statut (PATCH)
  {
    const params = Promise.resolve({ id: createdOfferId });

    const detailReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}`, {
      headers: { cookie: stratosCookie },
    });
    const detailRes = await detailGet(detailReq, { params });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.title, "Product Manager Senior (Test Étape 5)");
    assert.equal(detailJson.company.id, stratosCompany.id);

    // Mise à jour (PUT)
    const updateReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        companyId: stratosCompany.id,
        title: "Lead Product Manager (Édité)",
        description: "## Nouvelle description\nMission mise à jour.",
        skills: ["Product Strategy", "Figma", "Growth"],
        contractType: ContractType.CDI,
        location: "Abidjan / Remote partiel",
        salaryMin: 55000,
        salaryMax: 70000,
        status: OfferStatus.OPEN,
      }),
    });
    const updateRes = await updatePut(updateReq, { params });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.title, "Lead Product Manager (Édité)");
    assert.equal(updateJson.skills.length, 3);

    // Changement de statut dédié (PATCH)
    const statusReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({ status: OfferStatus.CLOSED }),
    });
    const statusRes = await dedicatedStatusPatch(statusReq, { params });
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.status, OfferStatus.CLOSED);

    console.log("✔ [4/7] GET/PUT/PATCH /api/admin/offres/[id] : consultation, édition et mise à jour de statut validées");
  }

  // 4. Assigner un candidat (POST /api/admin/offres/[id]/applications)
  {
    const params = Promise.resolve({ id: createdOfferId });

    // Créer un nouveau candidat pour tester l'assignation propre
    const newCandidate = await prisma.candidate.create({
      data: {
        agencyId: stratosCompany.agencyId,
        firstName: "Sophie",
        lastName: "Kouamé",
        email: "sophie.kouame.test@example.com",
        currentTitle: "Product Specialist",
        skills: ["Product", "Agile"],
      },
    });

    const assignReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({ candidateId: newCandidate.id }),
    });
    const assignRes = await assignPost(assignReq, { params });
    assert.equal(assignRes.status, 201);
    const assignJson = await assignRes.json();
    assert.equal(assignJson.candidateId, newCandidate.id);
    assert.equal(assignJson.status, "IDENTIFIED");
    console.log("✔ [5/7] POST /api/admin/offres/[id]/applications : assignation candidat (statut initial IDENTIFIED) validée");

    // Doublon d'assignation -> 409
    const dupAssignReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({ candidateId: newCandidate.id }),
    });
    const dupAssignRes = await assignPost(dupAssignReq, { params });
    assert.equal(dupAssignRes.status, 409, "Doublon d'assignation doit retourner 409");
    console.log("✔ [6/7] Prévention des doublons d'assignation (409) validée");

    // Nettoyer l'application et le candidat de test
    await prisma.applicationHistory.deleteMany({ where: { applicationId: assignJson.id } });
    await prisma.application.deleteMany({ where: { id: assignJson.id } });
    await prisma.candidate.deleteMany({ where: { id: newCandidate.id } });
  }

  // 5. Isolation stricte inter-cabinets (R1)
  {
    // Stratos consultant essaie de créer une offre liée à l'entreprise du Cabinet Démo -> 404
    const crossCreateReq = new Request(`${APP_ORIGIN}/api/admin/offres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        companyId: demoCompany.id,
        title: "Offre Illégitime",
        description: "Tentative cross-tenant",
        contractType: ContractType.CDI,
      }),
    });
    const crossCreateRes = await createPost(crossCreateReq);
    assert.equal(crossCreateRes.status, 404, "Création d'offre avec entreprise d'un autre cabinet doit retourner 404");

    // Consultant du Cabinet Démo tente d'accéder à l'offre créée dans Stratos -> 404
    const params = Promise.resolve({ id: createdOfferId });
    const crossDetailReq = new Request(`${APP_ORIGIN}/api/admin/offres/${createdOfferId}`, {
      headers: { cookie: demoCookie },
    });
    const crossDetailRes = await detailGet(crossDetailReq, { params });
    assert.equal(crossDetailRes.status, 404, "Accès croisé à une offre doit retourner 404 (R1)");

    console.log("✔ [7/7] Isolation inter-cabinets : 404 systématique sur offres et entreprises d'un autre cabinet");
  }

  // Nettoyage de l'offre de test
  await prisma.jobOffer.deleteMany({ where: { id: createdOfferId } });
  await prisma.rateLimit.deleteMany({});

  console.log("=== Tous les tests de l'Étape 5 sont VERTS ===");
}

runTests()
  .catch((err) => {
    console.error("Échec des tests Étape 5 :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
