import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as listGet, POST as createPost } from "../app/api/admin/entreprises/route";
import {
  GET as detailGet,
  PUT as updatePut,
  PATCH as archivePatch,
} from "../app/api/admin/entreprises/[id]/route";
import { POST as signaturePost } from "../app/api/admin/cloudinary/signature/route";
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
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie);
  const match = setCookie.match(/stratos_session=[^;]+/);
  assert.ok(match);
  return match[0];
}

async function runTests() {
  console.log("=== Tests Étape 4 : CRUD Entreprises & Isolation Multi-Cabinets ===");

  await prisma.rateLimit.deleteMany({});

  const stratosCookie = await getAuthCookie("consultant@stratosconseil.test");
  const demoCookie = await getAuthCookie("consultant@cabinet-demo.test");

  // 1. Signature Cloudinary
  {
    const sigReq = new Request(`${APP_ORIGIN}/api/admin/cloudinary/signature`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
    });
    const sigRes = await signaturePost(sigReq);
    assert.equal(sigRes.status, 200);
    const sigJson = await sigRes.json();
    assert.ok(sigJson.signature, "Signature doit être présente");
    assert.ok(sigJson.timestamp, "Timestamp doit être présent");
    assert.ok(sigJson.apiKey, "API Key doit être présente");
    assert.ok(sigJson.cloudName, "Cloud Name doit être présent");
    assert.ok(sigJson.folder.includes("stratos-conseil"), "Le dossier doit cibler le cabinet");
    console.log("✔ [1/6] Signature Cloudinary générée côté serveur avec dossier borné");
  }

  // 2. Création entreprise + contacts via POST
  let createdCompanyId = "";
  const testSiret = "99988877766655";
  {
    const createReq = new Request(`${APP_ORIGIN}/api/admin/entreprises`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        name: "Acme CI Corporation",
        sector: "Industrie & Logistique",
        siret: testSiret,
        city: "Abidjan",
        address: "Zone Industrielle de Yopougon",
        website: "https://acme-ci.test",
        contacts: [
          {
            firstName: "Koffi",
            lastName: "Yao",
            position: "Directeur d'Usine",
            email: "koffi.yao@acme-ci.test",
            phone: "+22505050505",
            isPrimary: true,
          },
        ],
      }),
    });

    const createRes = await createPost(createReq);
    assert.equal(createRes.status, 201, "Création entreprise doit retourner 201");
    const json = await createRes.json();
    assert.equal(json.name, "Acme CI Corporation");
    assert.equal(json.contacts.length, 1);
    assert.equal(json.contacts[0].email, "koffi.yao@acme-ci.test");
    createdCompanyId = json.id;
    console.log("✔ [2/6] POST /api/admin/entreprises : entreprise et contact principal créés");

    // Tentative de doublon SIRET dans le même cabinet -> 409 attendu
    const duplicateReq = new Request(`${APP_ORIGIN}/api/admin/entreprises`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        name: "Acme Clone",
        siret: testSiret,
      }),
    });
    const dupRes = await createPost(duplicateReq);
    assert.equal(dupRes.status, 409, "Doublon SIRET au sein du cabinet doit retourner 409");
    console.log("✔ [3/6] Contrainte d'unicité SIRET par cabinet vérifiée (409 sur doublon)");
  }

  // 3. Liste paginée et recherche
  {
    const listReq = new Request(`${APP_ORIGIN}/api/admin/entreprises?search=Acme`, {
      headers: { cookie: stratosCookie },
    });
    const listRes = await listGet(listReq);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.length >= 1);
    assert.equal(listJson.data[0].id, createdCompanyId);
    console.log("✔ [4/6] GET /api/admin/entreprises : recherche et liste paginée validées");
  }

  // 4. Détail et Mise à jour PUT
  {
    const params = Promise.resolve({ id: createdCompanyId });

    const detailReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      headers: { cookie: stratosCookie },
    });
    const detailRes = await detailGet(detailReq, { params });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.name, "Acme CI Corporation");
    assert.equal(detailJson.contacts.length, 1);

    const updateReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({
        name: "Acme CI Global Group",
        sector: "Industrie & Logistique",
        siret: testSiret,
        city: "San Pedro",
        contacts: [
          {
            firstName: "Koffi",
            lastName: "Yao",
            position: "Directeur Général",
            email: "koffi.yao@acme-ci.test",
            phone: "+22505050505",
            isPrimary: true,
          },
          {
            firstName: "Fatou",
            lastName: "Touré",
            position: "Responsable Recrutement",
            email: "fatou.toure@acme-ci.test",
            phone: "+22507070707",
            isPrimary: false,
          },
        ],
      }),
    });
    const updateRes = await updatePut(updateReq, { params });
    assert.equal(updateRes.status, 200);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.name, "Acme CI Global Group");
    assert.equal(updateJson.city, "San Pedro");
    assert.equal(updateJson.contacts.length, 2);

    // Archivage via PATCH
    const patchReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosCookie,
      },
      body: JSON.stringify({ archived: true }),
    });
    const patchRes = await archivePatch(patchReq, { params });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.company.archived, true);

    console.log("✔ [5/6] GET/PUT/PATCH /api/admin/entreprises/[id] : consultation, édition et archivage OK");
  }

  // 5. Isolation stricte inter-cabinets (R1)
  {
    const params = Promise.resolve({ id: createdCompanyId });

    // Consultant du Cabinet Démo essaie d'accéder à l'entreprise créée dans Stratos Conseil -> 404
    const crossGetReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      headers: { cookie: demoCookie },
    });
    const crossGetRes = await detailGet(crossGetReq, { params });
    assert.equal(crossGetRes.status, 404, "Accès croisé GET doit répondre 404 (R1)");

    const crossPutReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: demoCookie,
      },
      body: JSON.stringify({
        name: "Piratage Inter-Cabinet",
      }),
    });
    const crossPutRes = await updatePut(crossPutReq, { params });
    assert.equal(crossPutRes.status, 404, "Accès croisé PUT doit répondre 404 (R1)");

    const crossPatchReq = new Request(`${APP_ORIGIN}/api/admin/entreprises/${createdCompanyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: demoCookie,
      },
      body: JSON.stringify({ archived: false }),
    });
    const crossPatchRes = await archivePatch(crossPatchReq, { params });
    assert.equal(crossPatchRes.status, 404, "Accès croisé PATCH doit répondre 404 (R1)");

    console.log("✔ [6/6] Isolation inter-cabinets : 404 systématique sur GET, PUT et PATCH d'un autre cabinet");
  }

  // Nettoyage de l'entreprise de test
  await prisma.companyContact.deleteMany({ where: { companyId: createdCompanyId } });
  await prisma.company.deleteMany({ where: { id: createdCompanyId } });
  await prisma.rateLimit.deleteMany({});

  console.log("=== Tous les tests de l'Étape 4 sont VERTS ===");
}

runTests()
  .catch((err) => {
    console.error("Échec des tests Étape 4 :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
