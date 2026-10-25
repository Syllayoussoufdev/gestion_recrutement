import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as listGet, POST as createPost } from "../app/api/admin/candidats/route";
import {
  GET as detailGet,
  PUT as updatePut,
  PATCH as archivePatch,
} from "../app/api/admin/candidats/[id]/route";
import { POST as addNotePost } from "../app/api/admin/candidats/[id]/notes/route";
import { POST as addDocumentPost } from "../app/api/admin/candidats/[id]/documents/route";
import { DELETE as deleteDocumentDelete } from "../app/api/admin/documents/[id]/route";
import { GET as getDocumentUrl } from "../app/api/documents/[id]/url/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { CandidateSource } from "@prisma/client";

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
  console.log("=== Tests Étape 6' : CRUD Candidats & Documents Privés Cloudinary (R4) ===");

  await prisma.rateLimit.deleteMany({});

  const stratosConsultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const demoConsultantCookie = await getAuthCookie("consultant@cabinet-demo.test");
  const clientCookie = await getAuthCookie("client@techcorp.test");

  const testEmail = "aminata.step6.test@stratos.ci";

  // Nettoyage préalable au cas où
  await prisma.candidate.deleteMany({
    where: { email: testEmail },
  });

  let createdCandidateId = "";
  let createdDocumentId = "";

  // 1. Création candidat avec CV privé Cloudinary (POST /api/admin/candidats)
  {
    const createReq = new Request(`${APP_ORIGIN}/api/admin/candidats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({
        firstName: "Aminata",
        lastName: "Traoré",
        email: testEmail,
        phone: "+225 07 11 22 33 44",
        currentTitle: "Lead DevOps & Cloud Architect",
        skills: ["Kubernetes", "AWS", "Terraform", "CI/CD", "Docker"],
        availableFrom: new Date(Date.now() + 15 * 86400000).toISOString(),
        source: CandidateSource.LINKEDIN,
        cvPublicId: "stratos/stratos-conseil/cvs/test_cv_aminata_2026",
        cvResourceType: "raw",
        cvDeliveryType: "authenticated",
        cvMimeType: "application/pdf",
        cvSizeBytes: 1420500,
      }),
    });

    const createRes = await createPost(createReq);
    assert.equal(createRes.status, 201, "La création candidat doit retourner 201");
    const candidateData = await createRes.json();
    assert.ok(candidateData.id);
    assert.equal(candidateData.email, testEmail);
    assert.equal(candidateData.cvDeliveryType, "authenticated");
    createdCandidateId = candidateData.id;

    // Vérifier en base que le CV a aussi créé une entrée Document
    const cvDoc = await prisma.document.findFirst({
      where: { candidateId: createdCandidateId },
    });
    assert.ok(cvDoc, "Un enregistrement Document doit être créé pour le CV principal");
    assert.equal(cvDoc.publicId, "stratos/stratos-conseil/cvs/test_cv_aminata_2026");

    console.log("✔ [1/8] Création candidat avec métadonnées CV privé Cloudinary réussie");
  }

  // 2. Unicité de l'email au sein du cabinet (409)
  {
    const duplicateReq = new Request(`${APP_ORIGIN}/api/admin/candidats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({
        firstName: "Autre",
        lastName: "Personne",
        email: testEmail,
        source: CandidateSource.OTHER,
      }),
    });

    const dupRes = await createPost(duplicateReq);
    assert.equal(dupRes.status, 409, "Un email dupliqué dans le même cabinet doit retourner 409");
    console.log("✔ [2/8] Unicité email par cabinet respectée (409)");
  }

  // 3. Recherche et filtrage (GET /api/admin/candidats)
  {
    const searchReq = new Request(
      `${APP_ORIGIN}/api/admin/candidats?search=Aminata&skills=Kubernetes`,
      {
        method: "GET",
        headers: {
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
      }
    );

    const searchRes = await listGet(searchReq);
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(searchData.items.length >= 1);
    assert.equal(searchData.items[0].email, testEmail);
    console.log("✔ [3/8] Liste candidats avec recherche textuelle & filtre compétences validée");
  }

  // 4. Consultation détail (GET /api/admin/candidats/[id])
  {
    const context = { params: Promise.resolve({ id: createdCandidateId }) };
    const detailReq = new Request(`${APP_ORIGIN}/api/admin/candidats/${createdCandidateId}`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });

    const detailRes = await detailGet(detailReq, context);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.id, createdCandidateId);
    assert.ok(Array.isArray(detailData.documents));
    assert.ok(Array.isArray(detailData.notes));
    console.log("✔ [4/8] Consultation profil complet candidat validée");
  }

  // 5. Ajout d'une note interne (POST /api/admin/candidats/[id]/notes)
  {
    const context = { params: Promise.resolve({ id: createdCandidateId }) };
    const noteReq = new Request(
      `${APP_ORIGIN}/api/admin/candidats/${createdCandidateId}/notes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({
          content: "Excellente maîtrise technique de Kubernetes et Terraform.",
          tag: "INTERNAL",
        }),
      }
    );

    const noteRes = await addNotePost(noteReq, context);
    assert.equal(noteRes.status, 201);
    const noteData = await noteRes.json();
    assert.equal(noteData.candidateId, createdCandidateId);
    assert.equal(noteData.tag, "INTERNAL");
    console.log("✔ [5/8] Ajout d'une note interne de suivi validé");
  }

  // 6. Ajout d'un document annexe (POST /api/admin/candidats/[id]/documents)
  {
    const context = { params: Promise.resolve({ id: createdCandidateId }) };
    const docReq = new Request(
      `${APP_ORIGIN}/api/admin/candidats/${createdCandidateId}/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: APP_ORIGIN,
          cookie: stratosConsultantCookie,
        },
        body: JSON.stringify({
          label: "Certification CKA (Kubernetes Administrator)",
          publicId: "stratos/stratos-conseil/documents/certif_cka_2026",
          resourceType: "raw",
          deliveryType: "authenticated",
          mimeType: "application/pdf",
          sizeBytes: 850000,
        }),
      }
    );

    const docRes = await addDocumentPost(docReq, context);
    assert.equal(docRes.status, 201);
    const docData = await docRes.json();
    assert.ok(docData.id);
    assert.equal(docData.label, "Certification CKA (Kubernetes Administrator)");
    createdDocumentId = docData.id;
    console.log("✔ [6/8] Ajout d'un document annexe privé validé");
  }

  // 7. URL signée temporaire (10 min) & Journal d'audit (GET /api/documents/[id]/url)
  {
    // a. Consultation autorisée par le consultant du cabinet
    const context = { params: Promise.resolve({ id: createdDocumentId }) };
    const urlReq = new Request(`${APP_ORIGIN}/api/documents/${createdDocumentId}/url`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });

    const urlRes = await getDocumentUrl(urlReq, context);
    assert.equal(urlRes.status, 200, "Le consultant doit pouvoir générer l'URL signée");
    const urlData = await urlRes.json();
    assert.ok(urlData.url, "L'URL signée doit être présente");
    assert.ok(urlData.url.includes("api.cloudinary.com"), "L'URL doit pointer vers Cloudinary");
    assert.ok(urlData.url.includes("signature="), "L'URL doit contenir la signature Cloudinary");
    assert.ok(urlData.url.includes("expires_at="), "L'URL doit contenir une expiration");
    assert.ok(urlData.expiresAt, "La date d'expiration ISO doit être fournie");

    // Vérifier l'enregistrement de l'AuditLog DOCUMENT_VIEW (R4 / PRD V2 §10.6)
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "DOCUMENT_VIEW",
        targetId: createdDocumentId,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit, "Un AuditLog DOCUMENT_VIEW doit être créé");

    // b. Rejet cross-cabinet : Cabinet Démo ne peut pas accéder au document Stratos (404)
    const crossReq = new Request(`${APP_ORIGIN}/api/documents/${createdDocumentId}/url`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: demoConsultantCookie,
      },
    });
    const crossRes = await getDocumentUrl(crossReq, context);
    assert.equal(crossRes.status, 404, "Isolation R1 : cross-cabinet retourne 404");

    // c. Rejet client non autorisé : Client TechCorp sans CV partagé (404)
    const unauthClientReq = new Request(`${APP_ORIGIN}/api/documents/${createdDocumentId}/url`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: clientCookie,
      },
    });
    const unauthClientRes = await getDocumentUrl(unauthClientReq, context);
    assert.equal(unauthClientRes.status, 404, "Client sans partage de CV retourne 404");

    console.log("✔ [7/8] Résolution URL signée privée, contrôle d'accès strict (R4) & AuditLog vérifiés");
  }

  // 8. Suppression document & Archivage candidat
  {
    // Suppression document
    const docContext = { params: Promise.resolve({ id: createdDocumentId }) };
    const deleteDocReq = new Request(`${APP_ORIGIN}/api/admin/documents/${createdDocumentId}`, {
      method: "DELETE",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });
    const deleteRes = await deleteDocumentDelete(deleteDocReq, docContext);
    assert.equal(deleteRes.status, 200);

    // Vérifier audit log de suppression
    const delAudit = await prisma.auditLog.findFirst({
      where: {
        action: "DOCUMENT_DELETE",
        targetId: createdDocumentId,
      },
    });
    assert.ok(delAudit, "AuditLog DOCUMENT_DELETE créé");

    // Archivage candidat (PATCH)
    const candContext = { params: Promise.resolve({ id: createdCandidateId }) };
    const patchReq = new Request(`${APP_ORIGIN}/api/admin/candidats/${createdCandidateId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({ archived: true }),
    });
    const patchRes = await archivePatch(patchReq, candContext);
    assert.equal(patchRes.status, 200);
    const patchedData = await patchRes.json();
    assert.equal(patchedData.archived, true);

    // Nettoyage final
    await prisma.candidate.delete({
      where: { id: createdCandidateId },
    });

    console.log("✔ [8/8] Suppression document, audit de suppression & archivage candidat validés");
  }

  console.log("\n=======================================================");
  console.log("🎉 TOUS LES TESTS DE L'ÉTAPE 6' SONT AU VERT (8/8) !");
  console.log("=======================================================\n");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec test étape 6' :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
