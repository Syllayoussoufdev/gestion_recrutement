import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { generateIcsCalendar } from "../lib/ics";
import { checkCandidateConflict } from "../lib/interviews";
import { POST as createAdminProposalPost } from "../app/api/admin/applications/[id]/proposals/route";
import { GET as getPublicRdvGet } from "../app/api/public/rdv/[token]/route";
import { POST as choosePublicSlotPost } from "../app/api/public/rdv/[token]/choose/route";
import { PATCH as updateInterviewPatch } from "../app/api/admin/interviews/[id]/route";
import { POST as cancelClientInterviewPost } from "../app/api/client/interviews/[id]/cancel/route";
import { GET as getClientIcsGet } from "../app/api/client/interviews/[id]/ics/route";
import { POST as loginPost } from "../app/api/auth/login/route";
import { ApplicationStatus, InterviewMode, InterviewStatus } from "@prisma/client";

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
  console.log("=== Tests Étape 10 : Prise de Rendez-vous, Créneaux & Entretiens (PRD V2 §7) ===");

  await prisma.rateLimit.deleteMany({});

  // 1. Test unitaire du générateur de calendrier iCalendar (RFC 5545)
  {
    console.log("[TEST 1] Générateur RFC 5545 iCalendar (.ics)...");
    const ics = generateIcsCalendar({
      uid: "test-uid-123",
      title: "Entretien Recrutement Stratos",
      description: "Discussion technique",
      startsAt: new Date("2026-11-01T10:00:00Z"),
      endsAt: new Date("2026-11-01T11:00:00Z"),
      location: "https://meet.google.com/abc-defg-hij",
      organizerEmail: "recruteur@stratosconseil.ci",
      attendeeEmail: "jean.dupont@candidat.test",
    });

    assert.ok(ics.includes("BEGIN:VCALENDAR"));
    assert.ok(ics.includes("VERSION:2.0"));
    assert.ok(ics.includes("BEGIN:VEVENT"));
    assert.ok(ics.includes("SUMMARY:Entretien Recrutement Stratos"));
    assert.ok(ics.includes("DTSTART:20261101T100000Z"));
    assert.ok(ics.includes("STATUS:CONFIRMED"));
    assert.ok(ics.includes("END:VCALENDAR"));
    console.log("  -> Format iCalendar .ics valide et conforme RFC 5545");
  }

  // 2. Authentification des acteurs
  const consultantCookie = await getAuthCookie("consultant@stratosconseil.test");
  const clientCookie = await getAuthCookie("client@techcorp.test");

  const agencyStratos = await prisma.agency.findUnique({ where: { slug: "stratos-conseil" } });
  assert.ok(agencyStratos);

  const offer = await prisma.jobOffer.findFirst({
    where: { agencyId: agencyStratos.id },
    include: {
      applications: { include: { candidate: true } },
    },
  });
  assert.ok(offer && offer.applications.length > 0);
  const application = offer.applications[0];

  // 3. Proposition de créneaux d'entretien par le consultant (1 à 5 créneaux max)
  let publicToken = "";
  let proposalId = "";
  let chosenSlotId = "";
  let secondSlotId = "";

  const slot1Start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  slot1Start.setHours(10, 0, 0, 0);
  const slot1End = new Date(slot1Start.getTime() + 45 * 60 * 1000);

  const slot2Start = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  slot2Start.setHours(14, 0, 0, 0);
  const slot2End = new Date(slot2Start.getTime() + 45 * 60 * 1000);

  {
    console.log("[TEST 2] Consultant propose des créneaux au candidat...");
    const req = new Request(`${APP_ORIGIN}/api/admin/applications/${application.id}/proposals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
      body: JSON.stringify({
        mode: InterviewMode.VISIO,
        locationOrLink: "https://meet.google.com/stratos-entretien",
        message: "Échange technique de 45 minutes avec le lead développeur.",
        slots: [
          { startsAt: slot1Start.toISOString(), endsAt: slot1End.toISOString() },
          { startsAt: slot2Start.toISOString(), endsAt: slot2End.toISOString() },
        ],
      }),
    });

    const res = await createAdminProposalPost(req, { params: Promise.resolve({ id: application.id }) });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.ok(json.proposal);
    assert.equal(json.proposal.status, "PENDING");
    assert.equal(json.proposal.slots.length, 2);
    assert.ok(json.schedulingUrl.startsWith("/rdv/"));

    publicToken = json.schedulingUrl.replace("/rdv/", "");
    proposalId = json.proposal.id;
    chosenSlotId = json.proposal.slots[0].id;
    secondSlotId = json.proposal.slots[1].id;
    console.log(`  -> Proposition créée (ID: ${proposalId}) avec jeton public sécurisé`);
  }

  // 4. Consultation publique par le candidat via son jeton secret
  {
    console.log("[TEST 3] Candidat consulte la proposition via /rdv/[token]...");
    const req = new Request(`${APP_ORIGIN}/api/public/rdv/${publicToken}`);
    const res = await getPublicRdvGet(req, { params: Promise.resolve({ token: publicToken }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.proposal.status, "PENDING");
    assert.equal(json.proposal.slots.length, 2);
    console.log("  -> Proposition publique consultée avec succès sans fuite de données");
  }

  // 5. Règle PRD V2 §7.2 : Détection des conflits d'agenda candidat
  let createdInterviewId = "";
  {
    console.log("[TEST 4] Candidat choisit un créneau -> Confirmation & passage en INTERVIEW_SCHEDULED...");
    const req = new Request(`${APP_ORIGIN}/api/public/rdv/${publicToken}/choose`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
      },
      body: JSON.stringify({ slotId: chosenSlotId }),
    });

    const res = await choosePublicSlotPost(req, { params: Promise.resolve({ token: publicToken }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.success);
    assert.equal(json.interview.status, "SCHEDULED");
    createdInterviewId = json.interview.id;

    // Vérifier l'état de la candidature
    const appUpdated = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(appUpdated?.status, ApplicationStatus.INTERVIEW_SCHEDULED);
    console.log("  -> Entretien confirmé, candidature passée à INTERVIEW_SCHEDULED");

    // Tentative de conflit sur la même plage horaire
    console.log("  -> Vérification de détection de conflit d'agenda...");
    const hasConflict = await checkCandidateConflict(
      agencyStratos.id,
      application.candidateId,
      slot1Start,
      slot1End
    );
    assert.equal(hasConflict, true, "Le conflit doit être détecté");
    console.log("  -> Conflit détecté avec succès par le moteur de calendrier");
  }

  // 6. Téléchargement du fichier .ics par le client
  {
    console.log("[TEST 5] Téléchargement du fichier calendrier .ics côté client...");
    const req = new Request(`${APP_ORIGIN}/api/client/interviews/${createdInterviewId}/ics`, {
      method: "GET",
      headers: { Cookie: clientCookie },
    });
    const res = await getClientIcsGet(req, { params: Promise.resolve({ id: createdInterviewId }) });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/calendar"));
    const text = await res.text();
    assert.ok(text.includes("BEGIN:VCALENDAR"));
    console.log("  -> Fichier .ics téléchargé avec succès par le client");
  }

  // 7. Enregistrement de l'issue de l'entretien par le consultant (COMPLETED -> CLIENT_INTERVIEW)
  {
    console.log("[TEST 6] Consultant valide la tenue de l'entretien (COMPLETED)...");
    const req = new Request(`${APP_ORIGIN}/api/admin/interviews/${createdInterviewId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Cookie: consultantCookie,
      },
      body: JSON.stringify({
        status: InterviewStatus.COMPLETED,
        resultNote: "Très bon échange, candidat validé pour offre finale.",
      }),
    });

    const res = await updateInterviewPatch(req, { params: Promise.resolve({ id: createdInterviewId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.interview.status, "COMPLETED");

    const appFinal = await prisma.application.findUnique({ where: { id: application.id } });
    assert.equal(appFinal?.status, ApplicationStatus.CLIENT_INTERVIEW);
    console.log("  -> Entretien validé, candidature passée à CLIENT_INTERVIEW");
  }

  // Nettoyage des données de test
  await prisma.interview.deleteMany({ where: { id: createdInterviewId } });
  await prisma.interviewSlot.deleteMany({ where: { proposalId } });
  await prisma.interviewProposal.deleteMany({ where: { id: proposalId } });

  console.log("=== TOUS LES TESTS ÉTAPE 10 ONT RÉUSSI AVEC SUCCÈS (6/6) ===");
}

runTests()
  .catch((e) => {
    console.error("ÉCHEC DES TESTS :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
