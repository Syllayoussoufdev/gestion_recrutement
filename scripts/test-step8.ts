import assert from "node:assert/strict";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import {
  gradeMcqSingle,
  gradeMcqMulti,
  computeAttemptScore,
} from "../lib/scoring";
import { POST as createAssessmentPost } from "../app/api/admin/assessments/route";
import { POST as linkAssessmentPost } from "../app/api/admin/offres/[id]/assessment/route";
import { POST as sendTestPost } from "../app/api/admin/applications/[id]/send-test/route";
import { GET as getPublicTest } from "../app/api/public/test/[token]/route";
import { POST as startPublicTest } from "../app/api/public/test/[token]/start/route";
import { POST as submitPublicTest } from "../app/api/public/test/[token]/submit/route";
import { PATCH as gradeAttemptPatch } from "../app/api/admin/attempts/[id]/grade/route";
import { GET as getEvaluatedGet } from "../app/api/admin/offres/[id]/evalues/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { QuestionType, ScoreSuggestion, ApplicationStatus, AttemptStatus } from "@prisma/client";

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
  console.log("=== Tests Étape 8 : Questionnaires d'Évaluation & Scoring Déterministe (R3) ===");

  await prisma.rateLimit.deleteMany({});

  // 1. Tests unitaires du moteur de scoring déterministe (R3 / PRD V2 §4.2)
  {
    // Test MCQ Single
    const singleQ = {
      id: "q1",
      type: QuestionType.MCQ_SINGLE,
      prompt: "Quel mot-clé déclare une constante en JS ?",
      points: 2,
      options: [
        { id: "o1", text: "var", isCorrect: false },
        { id: "o2", text: "const", isCorrect: true },
      ],
    };
    assert.equal(gradeMcqSingle(singleQ, "o2"), 2);
    assert.equal(gradeMcqSingle(singleQ, "o1"), 0);
    assert.equal(gradeMcqSingle(singleQ, null), 0);

    // Test MCQ Multi : (bonnes - mauvaises) / total_bonnes * points (plancher 0)
    const multiQ = {
      id: "q2",
      type: QuestionType.MCQ_MULTI,
      prompt: "Quels sont des hooks React ?",
      points: 4,
      options: [
        { id: "m1", text: "useState", isCorrect: true },
        { id: "m2", text: "useEffect", isCorrect: true },
        { id: "m3", text: "useComponent", isCorrect: false },
      ],
    };
    // 2 bonnes cochées, 0 fausse -> 2/2 * 4 = 4
    assert.equal(gradeMcqMulti(multiQ, ["m1", "m2"]), 4);
    // 1 bonne cochée, 0 fausse -> 1/2 * 4 = 2
    assert.equal(gradeMcqMulti(multiQ, ["m1"]), 2);
    // 1 bonne, 1 fausse -> (1-1)/2 * 4 = 0
    assert.equal(gradeMcqMulti(multiQ, ["m1", "m3"]), 0);
    // 1 fausse seule -> (0-1)/2 = -0.5 -> plancher à 0
    assert.equal(gradeMcqMulti(multiQ, ["m3"]), 0);

    // Test computeAttemptScore complet avec seuils
    const textQ = {
      id: "q3",
      type: QuestionType.LONG_TEXT,
      prompt: "Expliquez l'idempotence d'une API REST.",
      points: 4,
      skillTag: "Architecture",
      rubric: "4 pts si définition exacte et exemples PUT/DELETE.",
    };

    const scoringIncomplete = computeAttemptScore({
      questions: [singleQ, multiQ, textQ],
      answers: [
        { questionId: "q1", answer: "o2" }, // 2 pts
        { questionId: "q2", answer: ["m1", "m2"] }, // 4 pts
        { questionId: "q3", answer: "Une requête idempotente..." }, // texte non encore noté
      ],
      passPercent: 70,
      reviewPercent: 50,
    });

    assert.equal(scoringIncomplete.autoPoints, 6);
    assert.equal(scoringIncomplete.maxPoints, 10);
    assert.equal(scoringIncomplete.isComplete, false, "Tant que la question texte n'est pas notée, isComplete doit être false");

    // Simulation de notation manuelle du texte (3 pts sur 4)
    const scoringComplete = computeAttemptScore({
      questions: [singleQ, multiQ, textQ],
      answers: [
        { questionId: "q1", answer: "o2" }, // 2 pts
        { questionId: "q2", answer: ["m1", "m2"] }, // 4 pts
        { questionId: "q3", answer: "...", manualPoints: 3 }, // 3 pts
      ],
      passPercent: 70,
      reviewPercent: 50,
    });

    // Total : 2 + 4 + 3 = 9 sur 10 -> 90%
    assert.equal(scoringComplete.totalPoints, 9);
    assert.equal(scoringComplete.percent, 90);
    assert.equal(scoringComplete.isComplete, true);
    assert.equal(scoringComplete.suggestion, ScoreSuggestion.RECOMMEND_VALIDATE);

    console.log("✔ [1/8] Moteur de scoring déterministe (R3) validé unitairement");
  }

  const stratosConsultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const demoConsultantCookie = await getAuthCookie("consultant@cabinet-demo.test");

  const stratosOffer = await prisma.jobOffer.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });
  const stratosCandidate = await prisma.candidate.findFirstOrThrow({
    where: { agency: { slug: "stratos-conseil" } },
  });

  let createdAssessmentId = "";
  let createdAttemptId = "";
  let rawTokenSecret = "";
  let applicationId = "";

  // Assurer une candidature propre pour le test
  let app = await prisma.application.findUnique({
    where: {
      candidateId_jobOfferId: {
        candidateId: stratosCandidate.id,
        jobOfferId: stratosOffer.id,
      },
    },
  });

  if (!app) {
    app = await prisma.application.create({
      data: {
        agencyId: stratosOffer.agencyId,
        candidateId: stratosCandidate.id,
        jobOfferId: stratosOffer.id,
        status: ApplicationStatus.CONTACTED,
      },
    });
  }
  applicationId = app.id;

  // 2. Création d'un questionnaire d'évaluation (POST /api/admin/assessments)
  {
    const req = new Request(`${APP_ORIGIN}/api/admin/assessments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({
        title: "Test Technique Dev Senior (Automated Test)",
        description: "Évaluation technique d'intégration continue et TypeScript",
        durationMinutes: 45,
        passPercent: 70,
        reviewPercent: 50,
        questions: [
          {
            order: 0,
            type: QuestionType.MCQ_SINGLE,
            prompt: "Quel est le typage strict de null en TypeScript sous strictNullChecks ?",
            points: 2,
            skillTag: "TypeScript",
            options: [
              { id: "opt-1", text: "null", isCorrect: true },
              { id: "opt-2", text: "undefined", isCorrect: false },
              { id: "opt-3", text: "any", isCorrect: false },
            ],
          },
          {
            order: 1,
            type: QuestionType.SHORT_TEXT,
            prompt: "Citez les 3 phases principales du cycle de vie d'un composant React.",
            points: 3,
            skillTag: "React",
            rubric: "1 pt par phase : Montage (Mounting), Mise à jour (Updating), Démontage (Unmounting).",
          },
        ],
      }),
    });

    const res = await createAssessmentPost(req);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.equal(data.title, "Test Technique Dev Senior (Automated Test)");
    assert.equal(data.questions.length, 2);
    createdAssessmentId = data.id;

    console.log("✔ [2/8] Création de questionnaire d'évaluation avec QCM et question ouverte validée");
  }

  // 3. Association du questionnaire à l'offre (POST /api/admin/offres/[id]/assessment)
  {
    const context = { params: Promise.resolve({ id: stratosOffer.id }) };
    const req = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/assessment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({ assessmentId: createdAssessmentId }),
    });

    const res = await linkAssessmentPost(req, context);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.assessmentId, createdAssessmentId);

    console.log("✔ [3/8] Association du questionnaire à l'offre d'emploi validée");
  }

  // 4. Envoi du test au candidat (POST /api/admin/applications/[id]/send-test)
  {
    const context = { params: Promise.resolve({ id: applicationId }) };
    const req = new Request(`${APP_ORIGIN}/api/admin/applications/${applicationId}/send-test`, {
      method: "POST",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });

    const res = await sendTestPost(req, context);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.attemptId);
    assert.ok(data.rawToken);
    assert.ok(data.testUrl.startsWith("/test/"));

    createdAttemptId = data.attemptId;
    rawTokenSecret = data.rawToken;

    // Vérifier que la candidature est passée à ASSESSMENT_SENT
    const updatedApp = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    assert.equal(updatedApp.status, ApplicationStatus.ASSESSMENT_SENT);

    console.log("✔ [4/8] Génération du jeton secret (R6), tentative créée et statut ASSESSMENT_SENT validé");
  }

  // 5. Portail public candidat : Consultation sécurisée sans fuite de 'isCorrect' (GET /api/public/test/[token])
  {
    const context = { params: Promise.resolve({ token: rawTokenSecret }) };
    const req = new Request(`${APP_ORIGIN}/api/public/test/${rawTokenSecret}`, {
      method: "GET",
    });

    const res = await getPublicTest(req, context);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.attemptId, createdAttemptId);
    assert.equal(data.questions.length, 2);

    // ANTI-FRAUDE : S'assurer que le champ 'isCorrect' n'est JAMAIS envoyé au client
    const firstQOptions = data.questions[0].options;
    assert.ok(Array.isArray(firstQOptions));
    for (const opt of firstQOptions) {
      assert.equal(
        opt.isCorrect,
        undefined,
        "SÉCURITÉ : Le champ isCorrect ne doit jamais être exposé côté candidat"
      );
    }

    console.log("✔ [5/8] Portail candidat public : validation du jeton et anti-fraude sans fuite de réponses vérifiés");
  }

  // 6. Démarrage et soumission du test par le candidat (POST start & submit)
  {
    const context = { params: Promise.resolve({ token: rawTokenSecret }) };

    // Démarrage avec consentement (PRD V2 §4.3)
    const startReq = new Request(`${APP_ORIGIN}/api/public/test/${rawTokenSecret}/start`, {
      method: "POST",
    });
    const startRes = await startPublicTest(startReq, context);
    assert.equal(startRes.status, 200);

    // Récupérer l'id de la question QCM et de la question texte
    const testInfo = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: createdAttemptId },
      include: { assessment: { include: { questions: true } } },
    });
    const qcmQuestion = testInfo.assessment.questions.find((q) => q.type === QuestionType.MCQ_SINGLE)!;
    const textQuestion = testInfo.assessment.questions.find((q) => q.type === QuestionType.SHORT_TEXT)!;

    // Soumission des réponses (QCM bonne réponse 'opt-1', texte rédigé)
    const submitReq = new Request(`${APP_ORIGIN}/api/public/test/${rawTokenSecret}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: [
          { questionId: qcmQuestion.id, answer: "opt-1" }, // Réponse correcte (+2 pts)
          { questionId: textQuestion.id, answer: "Montage, mise à jour, démontage." }, // En attente correction
        ],
      }),
    });

    const submitRes = await submitPublicTest(submitReq, context);
    assert.equal(submitRes.status, 200);

    // Vérifier passage automatique de l'application à ASSESSMENT_DONE
    const postSubmitApp = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
    });
    assert.equal(postSubmitApp.status, ApplicationStatus.ASSESSMENT_DONE);

    console.log("✔ [6/8] Soumission candidat, auto-notation QCM et passage automatique à ASSESSMENT_DONE validés");
  }

  // 7. Notation manuelle par le consultant (PATCH /api/admin/attempts/[id]/grade)
  {
    const testInfo = await prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: createdAttemptId },
      include: { assessment: { include: { questions: true } } },
    });
    const textQuestion = testInfo.assessment.questions.find((q) => q.type === QuestionType.SHORT_TEXT)!;

    const context = { params: Promise.resolve({ id: createdAttemptId }) };
    const gradeReq = new Request(`${APP_ORIGIN}/api/admin/attempts/${createdAttemptId}/grade`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
      body: JSON.stringify({
        grades: [
          {
            questionId: textQuestion.id,
            manualPoints: 3, // Note maximale accordée
            comment: "Excellente réponse concise et exacte.",
          },
        ],
      }),
    });

    const gradeRes = await gradeAttemptPatch(gradeReq, context);
    assert.equal(gradeRes.status, 200);
    const gradeData = await gradeRes.json();

    // 2 pts QCM + 3 pts Texte = 5 pts sur 5 -> 100%
    assert.equal(gradeData.scoring.totalPoints, 5);
    assert.equal(gradeData.scoring.percent, 100);
    assert.equal(gradeData.scoring.isComplete, true);
    assert.equal(gradeData.scoring.suggestion, ScoreSuggestion.RECOMMEND_VALIDATE);

    // Vérifier audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "ASSESSMENT_GRADED",
        targetId: createdAttemptId,
      },
    });
    assert.ok(audit, "Un AuditLog ASSESSMENT_GRADED doit être enregistré");

    console.log("✔ [7/8] Notation manuelle consultant, recalcul déterministe (100%) & AuditLog validés");
  }

  // 8. Écran Candidats évalués (GET /api/admin/offres/[id]/evalues) & Isolation R1
  {
    // Consultation par le consultant Stratos
    const context = { params: Promise.resolve({ id: stratosOffer.id }) };
    const req = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/evalues`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: stratosConsultantCookie,
      },
    });

    const res = await getEvaluatedGet(req, context);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.evaluatedCandidates.length >= 1);
    const candidateEval = data.evaluatedCandidates[0];
    assert.equal(candidateEval.attempt.percent, 100);
    assert.equal(candidateEval.attempt.suggestion, ScoreSuggestion.RECOMMEND_VALIDATE);
    assert.ok(candidateEval.skillsCoverage);

    // Rejet cross-cabinet : Cabinet Démo ne peut pas voir les candidats évalués de Stratos
    const crossReq = new Request(`${APP_ORIGIN}/api/admin/offres/${stratosOffer.id}/evalues`, {
      method: "GET",
      headers: {
        Origin: APP_ORIGIN,
        cookie: demoConsultantCookie,
      },
    });
    const crossRes = await getEvaluatedGet(crossReq, context);
    assert.equal(crossRes.status, 404, "Isolation R1 : cross-cabinet retourne 404");

    // Nettoyage de l'évaluation créée pour le test
    await prisma.assessmentAttempt.deleteMany({
      where: { assessmentId: createdAssessmentId },
    });
    await prisma.jobOffer.update({
      where: { id: stratosOffer.id },
      data: { assessmentId: null },
    });
    await prisma.assessment.delete({
      where: { id: createdAssessmentId },
    });

    console.log("✔ [8/8] Tableau de bord 'Candidats évalués' et barrière d'isolation cross-cabinet vérifiés");
  }

  console.log("\n=======================================================");
  console.log("🎉 TOUS LES TESTS DE L'ÉTAPE 8 SONT AU VERT (8/8) !");
  console.log("=======================================================\n");
}

runTests()
  .catch((err) => {
    console.error("❌ Échec test étape 8 :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
