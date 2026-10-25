import { randomUUID } from "node:crypto";
import {
  PrismaClient,
  ApplicationStatus,
  ConsentStatus,
  ClientDecision,
  QuestionType,
  ContractType,
  CandidateSource,
  InterviewMode,
  InterviewStatus,
  AttemptStatus,
} from "@prisma/client";
import { hashToken } from "../lib/tokens";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Seed Démonstration & Données Pilote (PRD V2 §13 & Roadmap P4) ===");

  // 1. Récupération du Cabinet Démo
  const demoAgency = await prisma.agency.findUnique({
    where: { slug: "cabinet-demo" },
  });

  if (!demoAgency) {
    throw new Error("Cabinet Démo introuvable en base. Lancez le seed initial.");
  }

  console.log(`[1] Configuration pour l'agence : ${demoAgency.name} (${demoAgency.id})`);

  // 2. Entreprise cliente partenaire
  let company = await prisma.company.findFirst({
    where: { agencyId: demoAgency.id, name: "FinAgro International" },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        agencyId: demoAgency.id,
        name: "FinAgro International",
        sector: "Agro-Industrie & FinTech Agricole",
        website: "https://finagro-demo.ci",
        city: "Abidjan",
      },
    });
    console.log(`  -> Entreprise créée : ${company.name}`);
  }

  // 3. Missions de recrutement
  let offer1 = await prisma.jobOffer.findFirst({
    where: { agencyId: demoAgency.id, title: "Chef de Projet Transformation Digitale" },
  });

  if (!offer1) {
    offer1 = await prisma.jobOffer.create({
      data: {
        agencyId: demoAgency.id,
        companyId: company.id,
        title: "Chef de Projet Transformation Digitale",
        description: "Pilotage des projets de digitalisation des processus de financement agricole et des portails partenaires.",
        skills: ["Agile", "Scrum", "Next.js", "Architecture SI"],
        contractType: ContractType.CDI,
        location: "Abidjan - Plateau",
        salaryMin: 1800000,
        salaryMax: 2500000,
        status: "OPEN",
      },
    });
    console.log(`  -> Offre créée : ${offer1.title}`);
  }

  let offer2 = await prisma.jobOffer.findFirst({
    where: { agencyId: demoAgency.id, title: "Actuaire & Analyste Risques" },
  });

  if (!offer2) {
    offer2 = await prisma.jobOffer.create({
      data: {
        agencyId: demoAgency.id,
        companyId: company.id,
        title: "Actuaire & Analyste Risques",
        description: "Modélisation des risques climatiques et financiers pour les polices d'assurance récoltes.",
        skills: ["Python", "Statistiques", "Modélisation", "SQL"],
        contractType: ContractType.CDI,
        location: "Abidjan - Cocody",
        salaryMin: 1500000,
        salaryMax: 2200000,
        status: "OPEN",
      },
    });
    console.log(`  -> Offre créée : ${offer2.title}`);
  }

  // 4. Test d'évaluation technique
  let assessment = await prisma.assessment.findFirst({
    where: { agencyId: demoAgency.id, title: "Évaluation Méthodes Agiles & Architecture SI" },
  });

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        agencyId: demoAgency.id,
        title: "Évaluation Méthodes Agiles & Architecture SI",
        description: "Test de compétences techniques et méthodologiques pour Chef de Projet Digital.",
        durationMinutes: 30,
        isActive: true,
      },
    });

    await prisma.jobQuestion.createMany({
      data: [
        {
          agencyId: demoAgency.id,
          assessmentId: assessment.id,
          order: 1,
          type: QuestionType.MCQ_SINGLE,
          prompt: "Dans le framework Scrum, qui est responsable de la priorisation du Product Backlog ?",
          points: 5,
          options: [
            { text: "Le Scrum Master", isCorrect: false },
            { text: "Le Product Owner", isCorrect: true },
            { text: "L'équipe de développement", isCorrect: false },
            { text: "Le Directeur de Projet", isCorrect: false },
          ],
        },
        {
          agencyId: demoAgency.id,
          assessmentId: assessment.id,
          order: 2,
          type: QuestionType.MCQ_MULTI,
          prompt: "Quels sont les piliers essentiels de l'architecture Microservices ?",
          points: 5,
          options: [
            { text: "Découplage lâche et autonomie des déploiements", isCorrect: true },
            { text: "Base de données unique partagée par tous les services", isCorrect: false },
            { text: "Communication via APIs REST ou messagerie asynchrone", isCorrect: true },
            { text: "Monolithe fortement typé", isCorrect: false },
          ],
        },
        {
          agencyId: demoAgency.id,
          assessmentId: assessment.id,
          order: 3,
          type: QuestionType.SHORT_TEXT,
          prompt: "Décrivez en quelques lignes votre méthode pour gérer un arbitrage conflictuel entre le métier et l'équipe technique.",
          points: 10,
          rubric: "Évaluer l'écoute active, la quantification de l'impact métier, la faisabilité technique et la décision collective formalisée.",
        },
      ],
    });

    // Lier à l'offre
    await prisma.jobOffer.update({
      where: { id: offer1.id },
      data: { assessmentId: assessment.id },
    });
    console.log(`  -> Test d'évaluation créé et lié à l'offre (${assessment.title})`);
  }

  // 5. Candidats fictifs
  const candidatesData = [
    {
      firstName: "Aya",
      lastName: "Koffi",
      email: "aya.koffi@candidat.test",
      phone: "+225 07 01 02 03 04",
      currentTitle: "Lead Developer & Scrum Master",
      skills: ["Scrum", "Next.js", "Architecture SI", "Agile"],
    },
    {
      firstName: "Marc",
      lastName: "Touré",
      email: "marc.toure@candidat.test",
      phone: "+225 05 11 22 33 44",
      currentTitle: "Consultant Senior SI",
      skills: ["PMP", "Scrum", "Microservices", "Transformation Digitale"],
    },
    {
      firstName: "Fatou",
      lastName: "Diallo",
      email: "fatou.diallo@candidat.test",
      phone: "+225 01 99 88 77 66",
      currentTitle: "Analyste Actuariat & Données",
      skills: ["Python", "Statistiques", "Modélisation des risques", "SQL"],
    },
  ];

  const createdCandidates = [];
  for (const c of candidatesData) {
    let candidate = await prisma.candidate.findFirst({
      where: { agencyId: demoAgency.id, email: c.email },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          agencyId: demoAgency.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          currentTitle: c.currentTitle,
          skills: c.skills,
          source: CandidateSource.LINKEDIN,
        },
      });
    }
    createdCandidates.push(candidate);
  }
  console.log(`  -> ${createdCandidates.length} candidats synchronisés dans le vivier Cabinet Démo`);

  // 6. Candidatures & Passages de tests
  // Candidat 1 : Marc Touré -> Test complété avec succès (Note : 18/20 = 90%)
  const marcCandidate = createdCandidates[1];
  let marcApp = await prisma.application.findFirst({
    where: { agencyId: demoAgency.id, candidateId: marcCandidate.id, jobOfferId: offer1.id },
  });

  if (!marcApp) {
    marcApp = await prisma.application.create({
      data: {
        agencyId: demoAgency.id,
        candidateId: marcCandidate.id,
        jobOfferId: offer1.id,
        status: ApplicationStatus.ASSESSMENT_DONE,
      },
    });
  }

  let attempt = await prisma.assessmentAttempt.findFirst({
    where: { agencyId: demoAgency.id, applicationId: marcApp.id },
  });

  if (!attempt) {
    const now = new Date();
    const started = new Date(now.getTime() - 25 * 60000);
    const token = "demo-attempt-marc-" + Date.now();

    attempt = await prisma.assessmentAttempt.create({
      data: {
        agencyId: demoAgency.id,
        applicationId: marcApp.id,
        candidateId: marcCandidate.id,
        assessmentId: assessment.id,
        tokenHash: hashToken(token),
        status: AttemptStatus.GRADED,
        maxPoints: 20,
        autoPoints: 10,
        manualPoints: 8,
        percent: 90,
        startedAt: started,
        submittedAt: now,
        gradedAt: now,
        expiresAt: new Date(now.getTime() + 7 * 86400000),
      },
    });
    console.log(`  -> Candidature et test noté pour Marc Touré (Score : 90%)`);
  }

  // Candidat 2 : Aya Koffi -> Présentée en Shortlist, acceptée par le client
  const ayaCandidate = createdCandidates[0];
  let ayaApp = await prisma.application.findFirst({
    where: { agencyId: demoAgency.id, candidateId: ayaCandidate.id, jobOfferId: offer1.id },
  });

  if (!ayaApp) {
    ayaApp = await prisma.application.create({
      data: {
        agencyId: demoAgency.id,
        candidateId: ayaCandidate.id,
        jobOfferId: offer1.id,
        status: ApplicationStatus.PRESENTED,
      },
    });
  }

  // 7. Shortlist pour l'offre Chef de Projet
  let shortlist = await prisma.shortlist.findFirst({
    where: { agencyId: demoAgency.id, jobOfferId: offer1.id },
  });

  if (!shortlist) {
    const adminUser = await prisma.user.findFirst({
      where: { agencyId: demoAgency.id, role: "AGENCY_ADMIN" },
    });

    shortlist = await prisma.shortlist.create({
      data: {
        agencyId: demoAgency.id,
        jobOfferId: offer1.id,
        title: "Shortlist #1 — Profils Clés Transformation Digitale",
        status: "SENT",
        sentAt: new Date(Date.now() - 2 * 86400000),
        createdById: adminUser?.id || "system",
        items: {
          create: [
            {
              agencyId: demoAgency.id,
              applicationId: ayaApp.id,
              summary: "Profil senior expert Scrum & Web moderne.",
              consentStatus: ConsentStatus.GRANTED,
              consentAt: new Date(Date.now() - 3 * 86400000),
              clientDecision: ClientDecision.INTERESTED,
              clientReason: "Excellente adéquation technique et managériale. Entretien souhaité rapidement.",
            },
            {
              agencyId: demoAgency.id,
              applicationId: marcApp.id,
              summary: "Profil solide en pilotage de grands projets SI.",
              consentStatus: ConsentStatus.GRANTED,
              consentAt: new Date(Date.now() - 3 * 86400000),
            },
          ],
        },
      },
    });
    console.log(`  -> Shortlist envoyée avec 2 profils qualifiés et consentements accordés`);
  }

  // 8. Entretien tenu pour Aya Koffi
  let interview = await prisma.interview.findFirst({
    where: { agencyId: demoAgency.id, applicationId: ayaApp.id },
  });

  if (!interview) {
    const startsAt = new Date(Date.now() - 24 * 3600000);
    const endsAt = new Date(startsAt.getTime() + 45 * 60000);

    interview = await prisma.interview.create({
      data: {
        agencyId: demoAgency.id,
        applicationId: ayaApp.id,
        startsAt,
        endsAt,
        timezone: "Africa/Abidjan",
        mode: InterviewMode.VISIO,
        locationOrLink: "https://meet.google.com/xyz-demo-recrutement",
        status: InterviewStatus.COMPLETED,
        resultNote: "Très bonne impression lors de l'échange. Profil retenu pour l'offre finale.",
        icsUid: randomUUID(),
      },
    });
    console.log(`  -> Entretien terminé enregistré pour Aya Koffi`);
  }

  // 9. Candidat 3 : Fatou Diallo sur l'offre Actuariat (Statut PLACED)
  const fatouCandidate = createdCandidates[2];
  let fatouApp = await prisma.application.findFirst({
    where: { agencyId: demoAgency.id, candidateId: fatouCandidate.id, jobOfferId: offer2.id },
  });

  if (!fatouApp) {
    fatouApp = await prisma.application.create({
      data: {
        agencyId: demoAgency.id,
        candidateId: fatouCandidate.id,
        jobOfferId: offer2.id,
        status: ApplicationStatus.PLACED,
      },
    });
    console.log(`  -> Placement finalisé pour Fatou Diallo sur l'offre Actuariat`);
  }

  console.log("=== SEED PILOTE TERMINÉ AVEC SUCCÈS ===");
}

main()
  .catch((e) => {
    console.error("Erreur lors du seed pilote:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
