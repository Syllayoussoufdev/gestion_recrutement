# PRD — Plateforme Recrutement Stratos Conseil
Version 1.0 · Oct 2026

---

## 1. Vision & objectifs

Stratos Conseil est une agence de recrutement qui gère manuellement ses pipelines de placement via tableurs et emails. L'objectif est de centraliser l'ensemble du cycle de recrutement dans une **plateforme web privée multi-rôles** : du sourcing candidat à la clôture de mission.

**Objectifs V1 :**
- Centraliser les fiches candidats, entreprises et offres dans une base unique
- Offrir un pipeline Kanban visuel pour suivre chaque candidature
- Donner aux clients un portail de suivi en temps réel de leurs recrutements
- Donner aux candidats un espace sécurisé pour suivre leur placement et uploader leurs documents
- Produire des KPIs et rapports de performance pour les consultants

**Non-objectifs V1 :**
- Jobboard public (les offres ne sont pas indexées)
- Intégration ATS tiers (LinkedIn Recruiter, Indeed)
- Paiement en ligne
- Application mobile native

---

## 2. Utilisateurs & rôles

### 2.1 Consultant Stratos — `ROLE_ADMIN`
Employé de Stratos Conseil. Accès complet à toutes les données. Peut créer, modifier, archiver n'importe quelle entité. Gère les invitations vers les clients et les candidats.

### 2.2 Client / Entreprise — `ROLE_CLIENT`
Responsable RH ou manager d'une entreprise cliente de Stratos. Accès limité à **ses propres offres** et aux **candidats que Stratos lui a présentés**. Peut laisser un feedback sur chaque candidat présenté.

### 2.3 Candidat — `ROLE_CANDIDAT`
Profil en cours de placement. Accès à **ses propres candidatures** uniquement. Peut uploader des documents et envoyer des messages au consultant en charge.

---

## 3. Fonctionnalités par rôle

### 3.1 Consultant Stratos

#### Gestion des entreprises clientes
- Liste paginée avec recherche full-text (nom, secteur, ville)
- Fiche entreprise : nom légal, secteur d'activité, SIRET, adresse, site web, logo (Cloudinary)
- Contacts multiples par entreprise (nom, poste, email, téléphone, contact principal)
- Archivage logique (soft delete, non suppression)
- Historique des offres liées

#### Gestion des offres d'emploi
- Liste filtrée par entreprise, statut, date de création
- Fiche offre : titre, description longue (markdown), compétences requises (tags), type de contrat (CDI/CDD/Freelance/Stage), localisation, salaire (fourchette optionnelle), statut `OPEN` / `CLOSED` / `DRAFT`
- Lier une offre à une entreprise cliente
- Voir les candidats assignés à cette offre avec leur statut dans le pipeline

#### Gestion des candidats
- Liste filtrée par compétences, disponibilité, statut global
- Fiche candidat : prénom, nom, email, téléphone, titre de poste actuel, compétences (tags), disponibilité (date), source (LinkedIn / Réseau / Candidature spontanée / Autre), CV PDF (upload Cloudinary), photo optionnelle
- Édition inline des compétences
- Historique complet : toutes les candidatures passées et en cours

#### Pipeline Kanban
Étapes dans l'ordre :
1. `IDENTIFIED` — Identifié
2. `CONTACTED` — Contacté
3. `RH_INTERVIEW` — Entretien RH
4. `PRESENTED` — Présenté au client
5. `CLIENT_INTERVIEW` — Entretien client
6. `OFFER` — Proposition faite
7. `PLACED` — Placé ✓
8. `REJECTED` — Refusé ✗

- Vue Kanban par offre : colonnes = étapes, cartes = candidats assignés
- Drag & drop d'une colonne à l'autre → update `ApplicationStatus` en base
- Chaque déplacement crée automatiquement une note d'historique horodatée
- Indicateur de blocage si candidat en `CLIENT_INTERVIEW` depuis > 7 jours sans mouvement

#### Matching & assignment
- Depuis une fiche offre : recherche de candidats par compétences correspondantes
- Assignation manuelle : crée un enregistrement `Application` (candidat ↔ offre, statut initial = `IDENTIFIED`)
- Un candidat peut être assigné à plusieurs offres simultanément

#### Notes & historique
- Notes libres par candidat (texte + date + auteur consultant)
- Historique automatique des changements de statut (qui / quand / de quoi à quoi)
- Notes visibles uniquement par les consultants

#### Invitations
- Invitation client : génère un token 24h, envoi email (Resend) avec lien `/invite/[token]` → création compte `ROLE_CLIENT` lié à l'entreprise
- Invitation candidat : même mécanique → création compte `ROLE_CANDIDAT` lié à la fiche candidat

#### Dashboard global
- Nombre d'offres ouvertes / closes
- Nombre de candidats actifs / placés ce mois / refusés ce mois
- Taux de conversion par étape (funnel)
- Top entreprises par volume de recrutement
- Activité récente (dernières notes, derniers mouvements pipeline)

---

### 3.2 Client / Entreprise

- Vue de ses offres actives (titre, nombre de candidats par étape)
- Liste des candidats présentés (statut = `PRESENTED` minimum) : nom, prénom, titre, statut actuel dans le pipeline, CV partagé si le consultant l'a coché
- Feedback par candidat : champ texte libre, visible uniquement par le consultant
- Tableau de bord simplifié : offres en cours, candidats à évaluer, dernières mises à jour
- Ne voit pas les notes internes des consultants
- Ne peut pas modifier ses offres ni inviter d'autres utilisateurs

---

### 3.3 Candidat

- Liste de ses candidatures en cours avec statut visible simplifié :
  - "En cours d'étude" (= `IDENTIFIED` à `RH_INTERVIEW`)
  - "Présenté à un client" (= `PRESENTED` à `CLIENT_INTERVIEW`)
  - "Proposition reçue" (= `OFFER`)
  - "Mission conclue" (= `PLACED`)
  - "Non retenu" (= `REJECTED`)
- Upload/mise à jour de son CV et documents complémentaires (Cloudinary, max 10 MB par fichier)
- Messagerie simple avec le consultant assigné (thread par candidature)
- Ne voit pas les autres candidats ni les entreprises

---

## 4. Modèles de données Prisma

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─── ENUMS ───────────────────────────────────────────────

enum Role {
  ADMIN
  CLIENT
  CANDIDAT
}

enum OfferStatus {
  DRAFT
  OPEN
  CLOSED
}

enum ApplicationStatus {
  IDENTIFIED
  CONTACTED
  RH_INTERVIEW
  PRESENTED
  CLIENT_INTERVIEW
  OFFER
  PLACED
  REJECTED
}

enum ContractType {
  CDI
  CDD
  FREELANCE
  STAGE
  ALTERNANCE
}

enum CandidateSource {
  LINKEDIN
  NETWORK
  SPONTANEOUS
  JOB_BOARD
  OTHER
}

// ─── USER ────────────────────────────────────────────────

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  passwordHash   String
  role           Role
  firstName      String
  lastName       String
  phone          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // Relations
  companyId      String?
  company        Company?  @relation(fields: [companyId], references: [id])
  candidateId    String?   @unique
  candidate      Candidate? @relation(fields: [candidateId], references: [id])
  notesAuthored  Note[]
  messagesSent   Message[] @relation("MessageSender")
  invitations    Invitation[] @relation("InvitedBy")

  @@index([email])
  @@index([role])
}

// ─── COMPANY ─────────────────────────────────────────────

model Company {
  id          String    @id @default(cuid())
  name        String
  sector      String?
  siret       String?   @unique
  address     String?
  city        String?
  website     String?
  logoUrl     String?   // Cloudinary URL
  archived    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  contacts    CompanyContact[]
  offers      JobOffer[]
  users       User[]
}

model CompanyContact {
  id          String    @id @default(cuid())
  companyId   String
  company     Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  firstName   String
  lastName    String
  position    String?
  email       String?
  phone       String?
  isPrimary   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

// ─── JOB OFFER ───────────────────────────────────────────

model JobOffer {
  id              String        @id @default(cuid())
  companyId       String
  company         Company       @relation(fields: [companyId], references: [id])
  title           String
  description     String        // Markdown
  skills          String[]      // Tags libres
  contractType    ContractType
  location        String?
  salaryMin       Int?
  salaryMax       Int?
  status          OfferStatus   @default(DRAFT)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relations
  applications    Application[]

  @@index([companyId])
  @@index([status])
}

// ─── CANDIDATE ───────────────────────────────────────────

model Candidate {
  id              String          @id @default(cuid())
  firstName       String
  lastName        String
  email           String          @unique
  phone           String?
  currentTitle    String?
  skills          String[]        // Tags libres
  availableFrom   DateTime?
  source          CandidateSource @default(OTHER)
  cvUrl           String?         // Cloudinary URL
  photoUrl        String?         // Cloudinary URL
  archived        Boolean         @default(false)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  user            User?
  applications    Application[]
  notes           Note[]
  documents       Document[]
  messages        Message[]
}

// ─── APPLICATION (pivot Candidat ↔ Offre) ────────────────

model Application {
  id              String            @id @default(cuid())
  candidateId     String
  candidate       Candidate         @relation(fields: [candidateId], references: [id])
  jobOfferId      String
  jobOffer        JobOffer          @relation(fields: [jobOfferId], references: [id])
  status          ApplicationStatus @default(IDENTIFIED)
  cvSharedClient  Boolean           @default(false) // CV visible par le client ?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  // Relations
  statusHistory   ApplicationHistory[]
  messages        Message[]

  @@unique([candidateId, jobOfferId])
  @@index([status])
  @@index([jobOfferId])
}

model ApplicationHistory {
  id              String            @id @default(cuid())
  applicationId   String
  application     Application       @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  fromStatus      ApplicationStatus?
  toStatus        ApplicationStatus
  changedAt       DateTime          @default(now())
  changedByUserId String?
  note            String?

  @@index([applicationId])
}

// ─── NOTE ────────────────────────────────────────────────

model Note {
  id            String    @id @default(cuid())
  candidateId   String
  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  authorId      String
  author        User      @relation(fields: [authorId], references: [id])
  content       String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([candidateId])
}

// ─── DOCUMENT ────────────────────────────────────────────

model Document {
  id            String    @id @default(cuid())
  candidateId   String
  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  label         String    // "CV", "Lettre de motivation", "Diplôme", etc.
  url           String    // Cloudinary URL
  publicId      String    // Cloudinary public_id pour suppression
  mimeType      String
  sizeBytes     Int
  uploadedAt    DateTime  @default(now())

  @@index([candidateId])
}

// ─── MESSAGE ─────────────────────────────────────────────

model Message {
  id              String      @id @default(cuid())
  applicationId   String
  application     Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  candidateId     String
  candidate       Candidate   @relation(fields: [candidateId], references: [id])
  senderId        String
  sender          User        @relation("MessageSender", fields: [senderId], references: [id])
  content         String
  readAt          DateTime?
  createdAt       DateTime    @default(now())

  @@index([applicationId])
  @@index([candidateId])
}

// ─── INVITATION ──────────────────────────────────────────

model Invitation {
  id            String    @id @default(cuid())
  email         String
  role          Role
  token         String    @unique @default(cuid())
  expiresAt     DateTime
  usedAt        DateTime?
  invitedById   String
  invitedBy     User      @relation("InvitedBy", fields: [invitedById], references: [id])

  // Optionnel : lier à l'entité cible
  companyId     String?
  candidateId   String?

  createdAt     DateTime  @default(now())

  @@index([token])
  @@index([email])
}
```

---

## 5. Routes & pages

### Pages publiques
| Route | Description |
|-------|-------------|
| `/login` | Page de connexion commune aux 3 rôles. Redirect post-login selon `role` |
| `/invite/[token]` | Acceptation d'invitation — création mot de passe |

### Admin (Consultant)
| Route | Description |
|-------|-------------|
| `/admin` | Dashboard global KPIs |
| `/admin/entreprises` | Liste des entreprises |
| `/admin/entreprises/new` | Création entreprise |
| `/admin/entreprises/[id]` | Fiche entreprise |
| `/admin/entreprises/[id]/edit` | Édition entreprise |
| `/admin/offres` | Liste des offres |
| `/admin/offres/new` | Création offre |
| `/admin/offres/[id]` | Fiche offre + pipeline Kanban |
| `/admin/offres/[id]/edit` | Édition offre |
| `/admin/candidats` | Liste des candidats |
| `/admin/candidats/new` | Création candidat |
| `/admin/candidats/[id]` | Fiche candidat + historique |
| `/admin/candidats/[id]/edit` | Édition candidat |
| `/admin/invitations` | Gestion des invitations en cours |

### Client (Entreprise)
| Route | Description |
|-------|-------------|
| `/client` | Dashboard entreprise |
| `/client/offres` | Mes offres actives |
| `/client/offres/[id]` | Candidats présentés pour cette offre |

### Candidat
| Route | Description |
|-------|-------------|
| `/candidat` | Mes candidatures en cours |
| `/candidat/candidatures/[id]` | Détail candidature + messagerie |
| `/candidat/documents` | Upload/gestion de mes documents |
| `/candidat/profil` | Édition de mon profil |

### API Routes
| Route | Rôle requis | Description |
|-------|-------------|-------------|
| `POST /api/auth/login` | Public | Authentification |
| `POST /api/auth/logout` | Authentifié | Déconnexion |
| `POST /api/auth/accept-invite` | Public | Acceptation invitation |
| `GET/POST /api/admin/entreprises` | ADMIN | CRUD entreprises |
| `GET/PUT/DELETE /api/admin/entreprises/[id]` | ADMIN | |
| `GET/POST /api/admin/offres` | ADMIN | CRUD offres |
| `GET/PUT/DELETE /api/admin/offres/[id]` | ADMIN | |
| `POST /api/admin/offres/[id]/applications` | ADMIN | Assigner candidat |
| `PATCH /api/admin/applications/[id]/status` | ADMIN | Déplacer pipeline |
| `GET/POST /api/admin/candidats` | ADMIN | CRUD candidats |
| `GET/PUT/DELETE /api/admin/candidats/[id]` | ADMIN | |
| `POST /api/admin/candidats/[id]/notes` | ADMIN | Ajouter note |
| `POST /api/admin/invitations` | ADMIN | Créer invitation |
| `POST /api/admin/cloudinary/signature` | ADMIN | Signature upload |
| `GET /api/client/offres` | CLIENT | Mes offres |
| `POST /api/client/applications/[id]/feedback` | CLIENT | Feedback candidat |
| `GET /api/candidat/applications` | CANDIDAT | Mes candidatures |
| `POST /api/candidat/documents` | CANDIDAT | Upload document |
| `GET/POST /api/candidat/messages/[applicationId]` | CANDIDAT | Messagerie |

---

## 6. Auth & sécurité

### Session
- À la connexion : `jose` signe un JWT avec `{ userId, role, email }`, `HS256`, expiry 7 jours
- JWT stocké dans cookie HttpOnly, Secure, SameSite=Strict, path=/
- Pas de refresh token V1 (reconnexion après 7 jours)

### Middleware Next.js
```
/admin/* → vérifie role === ADMIN
/client/* → vérifie role === CLIENT
/candidat/* → vérifie role === CANDIDAT
/api/admin/* → vérifie role === ADMIN
/api/client/* → vérifie role === CLIENT
/api/candidat/* → vérifie role === CANDIDAT
```
Toute route non autorisée → redirect `/login?next=[url]`

### Mots de passe
- Hash bcryptjs, cost factor 12
- Jamais stockés ou loggés en clair

### Invitations
- Token = `cuid()`, stocké hashé en base
- Expiry 24h
- Utilisable une seule fois (`usedAt` renseigné après usage)
- Email envoyé via Resend avec template HTML

### Protection des données
- Un client ne peut accéder qu'aux entités liées à son `companyId`
- Un candidat ne peut accéder qu'à ses propres entités (`candidateId`)
- Validation Zod sur toutes les routes API — pas de confiance aux données entrantes
- Cloudinary : upload signé côté serveur (API secret jamais exposé)

---

## 7. Contraintes & décisions techniques

### Slugs réservés (à ne jamais utiliser comme ID dynamique)
`api`, `admin`, `client`, `candidat`, `login`, `logout`, `invite`, `_next`, `favicon.ico`, `robots.txt`

### Stack figée V1
| Outil | Version | Usage |
|-------|---------|-------|
| Next.js | 15.x | App Router, Server Actions |
| React | 19.x | |
| TypeScript | 5.x | strict mode |
| Prisma | 6.x | ORM |
| PostgreSQL | Neon serverless | DB |
| Tailwind CSS | 4.x | Styles |
| shadcn/ui | latest | Composants admin uniquement |
| jose | 5.x | JWT |
| bcryptjs | 2.4.x | Hash passwords |
| zod | 3.x | Validation |
| Cloudinary | SDK v2 | Upload fichiers |
| Resend | 4.x | Emails |
| Vercel | Hobby→Pro | Déploiement |

### Règles de migration
- Migrations Prisma **additives uniquement** en développement
- Branche Neon `dev` pour développement, `main` pour production
- Jamais `prisma db push` en production — toujours `prisma migrate deploy`

### Secrets
- Jamais en dur dans le code
- `.env.local` pour le développement (dans `.gitignore`)
- Vercel Environment Variables pour la production
- `.env.example` documenter toutes les variables requises

---

## 8. Métriques de succès V1

| Métrique | Cible V1 |
|---------|---------|
| Tous les rôles peuvent se connecter | ✓ |
| Consultant peut gérer le cycle complet d'un recrutement | ✓ |
| Client voit en temps réel l'avancement de ses candidats | ✓ |
| Candidat peut suivre sa candidature et uploader ses docs | ✓ |
| Pipeline Kanban fonctionnel avec historique | ✓ |
| Invitations par email fonctionnelles | ✓ |
| Dashboard consultant avec KPIs réels | ✓ |
| Zéro secret en clair dans le code | ✓ |
| Déploiement Vercel opérationnel | ✓ |
| Temps de chargement page < 2s (LCP) | ✓ |
