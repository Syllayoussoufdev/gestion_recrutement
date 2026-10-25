import {
  PrismaClient,
  AgencyStatus,
  Role,
  ContractType,
  OfferStatus,
  CandidateSource,
  ApplicationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

interface AgencySeedInput {
  slug: string;
  name: string;
  status: AgencyStatus;
  senderName: string;
  contactEmail: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  consultantEmail: string;
  consultantFirstName: string;
  consultantLastName: string;
  companyName: string;
  companySector: string;
  companySiret: string;
  companyCity: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmailAddr: string;
  clientEmail: string;
  offerTitle: string;
  offerLocation: string;
  offerSkills: string[];
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string;
  candidateTitle: string;
  candidateSkills: string[];
}

async function seedAgency(input: AgencySeedInput, passwordHash: string) {
  const agency = await prisma.agency.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      status: input.status,
      senderName: input.senderName,
      contactEmail: input.contactEmail,
    },
    create: {
      slug: input.slug,
      name: input.name,
      status: input.status,
      timezone: "Africa/Abidjan",
      brandKey: "slate",
      senderName: input.senderName,
      contactEmail: input.contactEmail,
      showScoreToCandidate: false,
      anonymizeUntilInterest: true,
      retentionMonths: 24,
      testRetentionMonths: 12,
    },
  });

  // 1. Administrateur du cabinet (AGENCY_ADMIN)
  const agencyAdmin = await prisma.user.upsert({
    where: { email: input.adminEmail },
    update: {
      agencyId: agency.id,
      role: Role.AGENCY_ADMIN,
      firstName: input.adminFirstName,
      lastName: input.adminLastName,
    },
    create: {
      agencyId: agency.id,
      email: input.adminEmail,
      passwordHash,
      role: Role.AGENCY_ADMIN,
      firstName: input.adminFirstName,
      lastName: input.adminLastName,
    },
  });

  // 2. Consultant du cabinet (CONSULTANT)
  const consultant = await prisma.user.upsert({
    where: { email: input.consultantEmail },
    update: {
      agencyId: agency.id,
      role: Role.CONSULTANT,
      firstName: input.consultantFirstName,
      lastName: input.consultantLastName,
    },
    create: {
      agencyId: agency.id,
      email: input.consultantEmail,
      passwordHash,
      role: Role.CONSULTANT,
      firstName: input.consultantFirstName,
      lastName: input.consultantLastName,
    },
  });

  // 3. Entreprise cliente (Company + CompanyContact)
  const company = await prisma.company.upsert({
    where: {
      agencyId_siret: {
        agencyId: agency.id,
        siret: input.companySiret,
      },
    },
    update: {
      name: input.companyName,
      sector: input.companySector,
      city: input.companyCity,
    },
    create: {
      agencyId: agency.id,
      name: input.companyName,
      sector: input.companySector,
      siret: input.companySiret,
      city: input.companyCity,
      address: `10 Avenue de la République, ${input.companyCity}`,
      website: `https://example.invalid/${input.slug}-client`,
    },
  });

  const existingContacts = await prisma.companyContact.count({
    where: { agencyId: agency.id, companyId: company.id },
  });

  if (existingContacts === 0) {
    await prisma.companyContact.create({
      data: {
        agencyId: agency.id,
        companyId: company.id,
        firstName: input.contactFirstName,
        lastName: input.contactLastName,
        position: "Directrice des Ressources Humaines",
        email: input.contactEmailAddr,
        phone: "+2250102030405",
        isPrimary: true,
      },
    });
  }

  // 4. Utilisateur Client lié à l'entreprise (CLIENT)
  await prisma.user.upsert({
    where: { email: input.clientEmail },
    update: {
      agencyId: agency.id,
      companyId: company.id,
      role: Role.CLIENT,
      firstName: input.contactFirstName,
      lastName: input.contactLastName,
    },
    create: {
      agencyId: agency.id,
      companyId: company.id,
      email: input.clientEmail,
      passwordHash,
      role: Role.CLIENT,
      firstName: input.contactFirstName,
      lastName: input.contactLastName,
    },
  });

  // 5. Candidat fictif + Utilisateur Candidat lié (CANDIDAT)
  const candidate = await prisma.candidate.upsert({
    where: {
      agencyId_email: {
        agencyId: agency.id,
        email: input.candidateEmail,
      },
    },
    update: {
      firstName: input.candidateFirstName,
      lastName: input.candidateLastName,
      currentTitle: input.candidateTitle,
      skills: input.candidateSkills,
    },
    create: {
      agencyId: agency.id,
      firstName: input.candidateFirstName,
      lastName: input.candidateLastName,
      email: input.candidateEmail,
      phone: "+2250708091011",
      currentTitle: input.candidateTitle,
      skills: input.candidateSkills,
      source: CandidateSource.LINKEDIN,
      cvPublicId: `stratos/${input.slug}/cv/fictitious_cv_sample`,
      cvResourceType: "raw",
      cvDeliveryType: "authenticated",
      cvMimeType: "application/pdf",
      cvSizeBytes: 245760,
    },
  });

  await prisma.user.upsert({
    where: { email: input.candidateEmail },
    update: {
      agencyId: agency.id,
      candidateId: candidate.id,
      role: Role.CANDIDAT,
      firstName: input.candidateFirstName,
      lastName: input.candidateLastName,
    },
    create: {
      agencyId: agency.id,
      candidateId: candidate.id,
      email: input.candidateEmail,
      passwordHash,
      role: Role.CANDIDAT,
      firstName: input.candidateFirstName,
      lastName: input.candidateLastName,
    },
  });

  // 6. Offre d'emploi OPEN + Candidature initiale (CONTACTED)
  let jobOffer = await prisma.jobOffer.findFirst({
    where: {
      agencyId: agency.id,
      companyId: company.id,
      title: input.offerTitle,
    },
  });

  if (!jobOffer) {
    jobOffer = await prisma.jobOffer.create({
      data: {
        agencyId: agency.id,
        companyId: company.id,
        title: input.offerTitle,
        description: `## Contexte du poste (Fictif)\n\nPoste rattaché à l'équipe technique de **${input.companyName}** (${input.offerLocation}).\n\n### Missions principales\n- Conception et développement d'applications web\n- Revue de code et tests automatisés`,
        skills: input.offerSkills,
        contractType: ContractType.CDI,
        location: input.offerLocation,
        salaryMin: 42000,
        salaryMax: 55000,
        status: OfferStatus.OPEN,
      },
    });
  }

  const application = await prisma.application.upsert({
    where: {
      candidateId_jobOfferId: {
        candidateId: candidate.id,
        jobOfferId: jobOffer.id,
      },
    },
    update: {
      status: ApplicationStatus.CONTACTED,
    },
    create: {
      agencyId: agency.id,
      candidateId: candidate.id,
      jobOfferId: jobOffer.id,
      status: ApplicationStatus.CONTACTED,
      cvSharedClient: false,
    },
  });

  const historyCount = await prisma.applicationHistory.count({
    where: { applicationId: application.id },
  });

  if (historyCount === 0) {
    await prisma.applicationHistory.createMany({
      data: [
        {
          agencyId: agency.id,
          applicationId: application.id,
          fromStatus: null,
          toStatus: ApplicationStatus.IDENTIFIED,
          changedByUserId: consultant.id,
          note: "Profil fictif identifié lors du sourcing initial",
        },
        {
          agencyId: agency.id,
          applicationId: application.id,
          fromStatus: ApplicationStatus.IDENTIFIED,
          toStatus: ApplicationStatus.CONTACTED,
          changedByUserId: consultant.id,
          note: "Premier échange téléphonique fictif réalisé",
        },
      ],
    });
  }

  const noteCount = await prisma.note.count({
    where: { candidateId: candidate.id, agencyId: agency.id },
  });

  if (noteCount === 0) {
    await prisma.note.create({
      data: {
        agencyId: agency.id,
        candidateId: candidate.id,
        authorId: consultant.id,
        content: "Note interne fictive : bonne adéquation technique sur les fondamentaux.",
        tag: "INTERNAL",
      },
    });
  }

  return { agency, agencyAdmin, consultant, company, jobOffer, candidate, application };
}

async function main() {
  const defaultDevPassword = process.env.SEED_DEV_PASSWORD ?? "DevOnly_ChangeMe_2026!";
  const passwordHash = await bcrypt.hash(defaultDevPassword, BCRYPT_COST);

  // Utilisateur PLATFORM_ADMIN (sans agencyId - portée plateforme uniquement)
  await prisma.user.upsert({
    where: { email: "platform.admin@plateforme-recrutement.test" },
    update: {
      role: Role.PLATFORM_ADMIN,
      agencyId: null,
      firstName: "Super",
      lastName: "Admin",
    },
    create: {
      agencyId: null,
      email: "platform.admin@plateforme-recrutement.test",
      passwordHash,
      role: Role.PLATFORM_ADMIN,
      firstName: "Super",
      lastName: "Admin",
    },
  });

  // Cabinet 1 : Stratos Conseil
  await seedAgency(
    {
      slug: "stratos-conseil",
      name: "Stratos Conseil",
      status: AgencyStatus.ACTIVE,
      senderName: "Stratos Conseil Recrutement",
      contactEmail: "contact@stratosconseil.test",
      adminEmail: "admin@stratosconseil.test",
      adminFirstName: "Awa",
      adminLastName: "Kouassi",
      consultantEmail: "consultant@stratosconseil.test",
      consultantFirstName: "Marc",
      consultantLastName: "Konan",
      companyName: "TechCorp Ivoire SA",
      companySector: "Technologies & Services Numériques",
      companySiret: "10000000000014",
      companyCity: "Abidjan",
      contactFirstName: "Claire",
      contactLastName: "Bamba",
      contactEmailAddr: "claire.bamba@techcorp.test",
      clientEmail: "client@techcorp.test",
      offerTitle: "Ingénieur Full-Stack TypeScript (Fictif)",
      offerLocation: "Abidjan (Hybride)",
      offerSkills: ["TypeScript", "React", "Next.js", "PostgreSQL"],
      candidateFirstName: "Jean",
      candidateLastName: "Dupont",
      candidateEmail: "jean.dupont@candidat.test",
      candidateTitle: "Développeur Full-Stack Senior",
      candidateSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
    },
    passwordHash
  );

  // Cabinet 2 : Cabinet Démo (pour tests d'isolation croisés T1)
  await seedAgency(
    {
      slug: "cabinet-demo",
      name: "Cabinet Démo",
      status: AgencyStatus.PILOT,
      senderName: "Cabinet Démo RH",
      contactEmail: "contact@cabinet-demo.test",
      adminEmail: "admin@cabinet-demo.test",
      adminFirstName: "Salimata",
      adminLastName: "Diallo",
      consultantEmail: "consultant@cabinet-demo.test",
      consultantFirstName: "Paul",
      consultantLastName: "Traoré",
      companyName: "FinAgro Industrie SAS",
      companySector: "Agro-industrie & Finance",
      companySiret: "20000000000028",
      companyCity: "Dakar",
      contactFirstName: "Nadia",
      contactLastName: "Ndiaye",
      contactEmailAddr: "nadia.ndiaye@finagro.test",
      clientEmail: "client@finagro.test",
      offerTitle: "Responsable Contrôle de Gestion (Fictif)",
      offerLocation: "Dakar",
      offerSkills: ["Contrôle de gestion", "Audit", "Excel", "Reporting"],
      candidateFirstName: "Aminata",
      candidateLastName: "Sow",
      candidateEmail: "aminata.sow@candidat.test",
      candidateTitle: "Contrôleuse de Gestion",
      candidateSkills: ["Contrôle de gestion", "Budget", "Excel", "IFRS"],
    },
    passwordHash
  );

  console.log("Seed terminé avec succès : 1 PLATFORM_ADMIN + 2 cabinets isolés (Stratos Conseil & Cabinet Démo).");
}

main()
  .catch((error) => {
    console.error("Erreur lors du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
