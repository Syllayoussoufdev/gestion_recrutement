# ROADMAP — Plateforme Recrutement Stratos Conseil
Version 1.0 · Oct 2026

---

## Règles permanentes de l'agent Antigravity

Ces règles s'appliquent à **chaque étape sans exception** :

1. **Inspecter avant d'agir** — lire les fichiers existants avant toute modification. Jamais de réécriture à l'aveugle.
2. **Une étape à la fois** — terminer et valider l'étape courante avant de passer à la suivante.
3. **Migrations additives uniquement** — ajouter des colonnes/tables, ne jamais supprimer ni renommer en production. Sur la branche dev Neon uniquement.
4. **Jamais de secrets en dur** — toutes les clés API, tokens et credentials via `process.env`. Le fichier `.env.local` est dans `.gitignore`.
5. **Vérifier les versions avant d'ajouter une dépendance** — `npm info [package] version` avant tout `npm install`. Pas de `@latest`.
6. **Commits conventionnels** — format : `type(scope): message`. Types : feat, fix, chore, refactor, test, docs.
7. **Zod sur toutes les routes API** — valider les inputs entrants sans exception. Retourner `400` avec message d'erreur structuré si invalide.
8. **Vérifier le typage TypeScript** — `tsc --noEmit` doit passer sans erreur avant chaque commit.
9. **shadcn/ui uniquement dans /admin** — aucun composant shadcn sur les portails `/client` et `/candidat`.
10. **Cloudinary : upload signé** — la signature est générée côté serveur via `/api/admin/cloudinary/signature`. Le `api_secret` Cloudinary n'est jamais exposé au client.
11. **Pas de NextAuth** — auth custom : jose JWT + cookie HttpOnly + middleware Next.js. Voir PRD §6.
12. **Tester chaque route API avec curl ou Postman** avant de passer à l'étape suivante. Documenter le résultat attendu dans les commentaires du code.

---

## Phase 0 — Setup & Auth

### Étape 0 — Init projet & configuration

**Objectif :** Partir d'une base saine — projet Next.js 15, Prisma connecté à Neon, toutes les dépendances installées, `.env.example` documenté.

**Ce qui est produit :**
- Projet Next.js 15 initialisé (`npx create-next-app@15 stratos-conseil --typescript --tailwind --app --no-src-dir`)
- Tailwind CSS 4 configuré
- Prisma installé et connecté à la branche `dev` de Neon
- Toutes les dépendances installées : `jose`, `bcryptjs`, `@types/bcryptjs`, `zod`, `cloudinary`, `resend`, `@prisma/client`
- shadcn/ui initialisé (`npx shadcn@latest init`)
- `.env.example` avec toutes les variables requises documentées
- `.env.local` créé localement (non commité)
- `README.md` avec instructions de démarrage

**Variables d'environnement requises (`.env.example`) :**
```
DATABASE_URL=          # URL de connexion Neon (pooled)
DIRECT_URL=            # URL directe Neon (pour les migrations)
JWT_SECRET=            # Chaîne aléatoire 64 caractères minimum
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=     # ex: noreply@stratosconseil.fr
NEXT_PUBLIC_APP_URL=   # ex: http://localhost:3000
```

---

**Prompt Antigravity — Étape 0 :**

```
Tu es Antigravity, agent de développement senior. Voici ta première tâche sur le projet Stratos Conseil.

CONTEXTE :
- Plateforme de gestion de recrutement pour une agence RH
- Stack : Next.js 15 (App Router), TypeScript strict, Tailwind CSS 4, Prisma 6, Neon PostgreSQL serverless
- Auth custom : jose JWT + cookie HttpOnly (pas de NextAuth)
- 3 rôles : ADMIN (consultant), CLIENT (entreprise), CANDIDAT

TÂCHE — Étape 0 : Initialisation du projet

1. Initialise un projet Next.js 15 avec TypeScript, Tailwind et App Router :
   npx create-next-app@15 stratos-conseil --typescript --tailwind --app --no-src-dir

2. Installe les dépendances :
   npm install prisma @prisma/client zod jose bcryptjs @types/bcryptjs cloudinary resend
   npm install --save-dev @types/node

3. Initialise Prisma :
   npx prisma init

4. Configure le datasource dans schema.prisma pour Neon (provider postgresql, avec directUrl)

5. Initialise shadcn/ui (pour l'admin uniquement) :
   npx shadcn@latest init

6. Crée le fichier .env.example avec toutes les variables documentées (DATABASE_URL, DIRECT_URL, JWT_SECRET, CLOUDINARY_*, RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL)

7. Crée .env.local à partir de .env.example avec tes vraies valeurs locales

8. Vérifie que `npx tsc --noEmit` passe sans erreur

9. Commit : chore(setup): init Next.js 15 + Prisma + shadcn + deps

RÈGLES :
- Vérifier la version de chaque package avant installation (npm info [pkg] version)
- .env.local dans .gitignore (vérifie qu'il y est)
- Ne pas toucher au schema.prisma au-delà du datasource pour cette étape
- Rapporter les versions installées dans le commit message
```

---

### Étape 1 — Modèles Prisma & seed

**Objectif :** Tous les modèles Prisma en base, migration dev appliquée, seed fonctionnel avec 3 utilisateurs de test.

**Ce qui est produit :**
- `schema.prisma` complet avec tous les modèles (User, Company, CompanyContact, JobOffer, Candidate, Application, ApplicationHistory, Note, Document, Message, Invitation) et tous les enums (Role, OfferStatus, ApplicationStatus, ContractType, CandidateSource)
- Migration dev créée et appliquée sur la branche Neon `dev`
- `prisma/seed.ts` avec :
  - 1 consultant admin : `admin@stratosconseil.fr` / `Admin1234!`
  - 1 entreprise cliente : TechCorp SA + 1 contact
  - 1 utilisateur client lié : `client@techcorp.fr` / `Client1234!`
  - 1 candidat : Jean Dupont + 1 utilisateur candidat lié : `jean.dupont@email.fr` / `Candidat1234!`
  - 1 offre OPEN liée à TechCorp
  - 1 application Jean Dupont → offre TechCorp en statut `CONTACTED`

---

**Prompt Antigravity — Étape 1 :**

```
Tu es Antigravity. Étape 1 du projet Stratos Conseil : modèles Prisma et seed.

CONTEXTE : Projet Next.js 15 initialisé à l'étape 0. Prisma connecté à Neon (branche dev).

TÂCHE — Étape 1 : Modèles Prisma complets + migration + seed

1. Remplace le contenu de schema.prisma par les modèles complets suivants.

ENUMS :
- Role : ADMIN, CLIENT, CANDIDAT
- OfferStatus : DRAFT, OPEN, CLOSED
- ApplicationStatus : IDENTIFIED, CONTACTED, RH_INTERVIEW, PRESENTED, CLIENT_INTERVIEW, OFFER, PLACED, REJECTED
- ContractType : CDI, CDD, FREELANCE, STAGE, ALTERNANCE
- CandidateSource : LINKEDIN, NETWORK, SPONTANEOUS, JOB_BOARD, OTHER

MODÈLES :
- User : id (cuid), email (unique), passwordHash, role (Role), firstName, lastName, phone?, companyId? (FK→Company), candidateId? (unique FK→Candidate), createdAt, updatedAt + relations notes, messagesSent, invitations
- Company : id, name, sector?, siret? (unique), address?, city?, website?, logoUrl?, archived (false), createdAt, updatedAt + relations contacts, offers, users
- CompanyContact : id, companyId (FK cascade), firstName, lastName, position?, email?, phone?, isPrimary (false), createdAt, updatedAt
- JobOffer : id, companyId (FK), title, description (text markdown), skills (String[]), contractType (ContractType), location?, salaryMin?, salaryMax?, status (OfferStatus DRAFT), createdAt, updatedAt + relation applications
- Candidate : id, firstName, lastName, email (unique), phone?, currentTitle?, skills (String[]), availableFrom?, source (CandidateSource OTHER), cvUrl?, photoUrl?, archived (false), createdAt, updatedAt + relations user, applications, notes, documents, messages
- Application : id, candidateId (FK), jobOfferId (FK), status (ApplicationStatus IDENTIFIED), cvSharedClient (false), createdAt, updatedAt + relations statusHistory, messages — @@unique([candidateId, jobOfferId])
- ApplicationHistory : id, applicationId (FK cascade), fromStatus?, toStatus, changedAt (now), changedByUserId?, note?
- Note : id, candidateId (FK cascade), authorId (FK→User), content, createdAt, updatedAt
- Document : id, candidateId (FK cascade), label, url, publicId, mimeType, sizeBytes, uploadedAt (now)
- Message : id, applicationId (FK cascade), candidateId (FK), senderId (FK→User sender), content, readAt?, createdAt
- Invitation : id, email, role (Role), token (unique cuid), expiresAt, usedAt?, invitedById (FK→User), companyId?, candidateId?, createdAt

Ajoute les @@index pertinents sur les clés étrangères fréquemment interrogées.

2. Crée la migration dev :
   npx prisma migrate dev --name init_full_schema

3. Crée prisma/seed.ts avec les données de test décrites. Hashe les mots de passe avec bcryptjs cost 12.

4. Configure le script seed dans package.json :
   "prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }

5. Lance le seed : npx prisma db seed

6. Vérifie avec prisma studio que les données sont présentes.

7. Commit : feat(db): prisma schema complet + migration init + seed dev

RÈGLES :
- Migration additive uniquement (c'est la première, donc OK)
- Ne jamais modifier DATABASE_URL ou DIRECT_URL
- Tsc --noEmit doit passer
```

---

### Étape 2 — Système d'authentification

**Objectif :** Login / logout fonctionnel pour les 3 rôles, middleware Next.js en place, redirection post-login selon le rôle.

**Ce qui est produit :**
- `app/login/page.tsx` — formulaire email/mot de passe
- `app/api/auth/login/route.ts` — valide credentials, crée JWT jose, set cookie HttpOnly
- `app/api/auth/logout/route.ts` — efface le cookie
- `middleware.ts` — protège `/admin/*`, `/client/*`, `/candidat/*`, `/api/admin/*`, `/api/client/*`, `/api/candidat/*`
- `lib/auth.ts` — helpers : `getSession()`, `requireRole()`, `hashPassword()`, `verifyPassword()`
- `app/invite/[token]/page.tsx` — formulaire de création de mot de passe sur invitation
- `app/api/auth/accept-invite/route.ts` — valide token, crée compte, expire le token

---

**Prompt Antigravity — Étape 2 :**

```
Tu es Antigravity. Étape 2 du projet Stratos Conseil : système d'authentification complet.

CONTEXTE :
- Next.js 15 App Router, TypeScript strict
- Prisma connecté, tous les modèles en base (User avec role enum Role: ADMIN/CLIENT/CANDIDAT)
- Auth custom : jose 5.x JWT + cookie HttpOnly, SANS NextAuth
- JWT_SECRET dans .env.local

TÂCHE — Étape 2 : Auth complète

1. Crée lib/auth.ts avec :
   - getSession(request) : lit le cookie "session", vérifie le JWT avec jose, retourne { userId, role, email } ou null
   - requireRole(request, role) : appelle getSession, lance une NextResponse 401/403 si pas le bon rôle
   - hashPassword(plain) : bcryptjs hash cost 12
   - verifyPassword(plain, hash) : bcryptjs compare
   - createSessionCookie(payload) : signe JWT HS256 expiry 7j avec jose, retourne la valeur du cookie
   - Constante SESSION_COOKIE_NAME = "stratos_session"

2. Crée app/api/auth/login/route.ts (POST) :
   - Body Zod : { email: z.string().email(), password: z.string().min(1) }
   - Cherche User par email en base
   - Vérifie le hash bcryptjs
   - Crée JWT, set cookie HttpOnly Secure SameSite=Strict maxAge=7j path=/
   - Retourne { role } pour que le client sache où rediriger
   - 401 si credentials invalides (message générique "Email ou mot de passe incorrect")

3. Crée app/api/auth/logout/route.ts (POST) :
   - Efface le cookie (maxAge=0)
   - Retourne 200

4. Crée middleware.ts à la racine :
   - Protège /admin/*, /client/*, /candidat/*, /api/admin/*, /api/client/*, /api/candidat/*
   - Lit le cookie session, vérifie JWT
   - Vérifie que le rôle correspond au préfixe de route
   - Redirect /login si non authentifié, 403 si mauvais rôle
   - Matcher : ["/(admin|client|candidat)(.*)", "/api/(admin|client|candidat)(.*)"]

5. Crée app/login/page.tsx :
   - Formulaire email + mot de passe
   - POST vers /api/auth/login
   - Redirect /admin, /client ou /candidat selon le role retourné
   - Affiche erreur si 401
   - Design sobre Tailwind (pas de shadcn — page commune aux 3 rôles)

6. Crée app/invite/[token]/page.tsx + app/api/auth/accept-invite/route.ts :
   - Vérifie que le token existe, n'est pas expiré, n'a pas été utilisé
   - Formulaire de création de mot de passe (min 8 chars, confirmation)
   - Crée le User en base, met usedAt sur l'invitation
   - Connecte directement (set cookie) et redirige vers le bon portail

7. Test manuel : connecte-toi avec les 3 comptes seed, vérifie les redirections et la protection des routes.

8. Commit : feat(auth): login/logout/invite + middleware rôles

RÈGLES :
- JWT_SECRET via process.env.JWT_SECRET uniquement — vérifier qu'il est défini au démarrage
- Cookie doit être HttpOnly, Secure (en prod), SameSite=Strict
- Validation Zod sur tous les corps de requête API
- tsc --noEmit doit passer
```

---

### Étape 3 — Layouts par rôle

**Objectif :** Structure visuelle en place pour les 3 espaces. L'admin a une sidebar shadcn complète. Les portails client et candidat ont un header simple sans shadcn.

**Ce qui est produit :**
- `app/admin/layout.tsx` — sidebar shadcn avec navigation complète
- `app/client/layout.tsx` — header simple Tailwind
- `app/candidat/layout.tsx` — header simple Tailwind
- Pages placeholder pour toutes les routes prévues (retournent `<h1>À implémenter</h1>`)
- Composants : `AdminSidebar`, `ClientHeader`, `CandidatHeader`

---

**Prompt Antigravity — Étape 3 :**

```
Tu es Antigravity. Étape 3 du projet Stratos Conseil : layouts par rôle.

CONTEXTE : Auth opérationnelle. 3 portails distincts : /admin (consultant), /client (entreprise), /candidat.

TÂCHE — Étape 3 : Layouts et structure de navigation

1. Layout admin (app/admin/layout.tsx) :
   - Sidebar fixe gauche avec shadcn (Sheet ou nav custom) — liens :
     Tableau de bord | Entreprises | Offres | Candidats | Invitations
   - En-tête : logo Stratos + prénom de l'utilisateur connecté + bouton déconnexion
   - Responsive : sidebar collapse sur mobile (hamburger)
   - Récupère la session serveur pour afficher le nom

2. Layout client (app/client/layout.tsx) :
   - Header simple : logo Stratos + "Portail Entreprise" + nom de l'entreprise + déconnexion
   - Navigation : Tableau de bord | Mes offres
   - Pas de shadcn — Tailwind CSS pur

3. Layout candidat (app/candidat/layout.tsx) :
   - Header simple : logo Stratos + "Mon espace" + prénom + déconnexion
   - Navigation : Mes candidatures | Mes documents | Mon profil
   - Pas de shadcn — Tailwind CSS pur

4. Crée toutes les pages placeholder pour chaque route planifiée (voir liste ci-dessous) — chaque page retourne simplement un h1 avec le nom de la page + un p "À implémenter — Étape X".

Pages admin à créer : /admin (dashboard), /admin/entreprises, /admin/entreprises/new, /admin/entreprises/[id], /admin/offres, /admin/offres/new, /admin/offres/[id], /admin/candidats, /admin/candidats/new, /admin/candidats/[id], /admin/invitations

Pages client : /client (dashboard), /client/offres, /client/offres/[id]

Pages candidat : /candidat (dashboard), /candidat/candidatures/[id], /candidat/documents, /candidat/profil

5. Commit : feat(layout): layouts admin/client/candidat + pages placeholder

RÈGLES :
- shadcn UNIQUEMENT dans les composants /admin — aucun import shadcn dans /client ou /candidat
- getSession() côté serveur dans les layouts pour afficher les infos utilisateur
- tsc --noEmit doit passer
```

---

## Phase 1 — Core Consultant

### Étape 4 — CRUD Entreprises

**Objectif :** Gestion complète des entreprises clientes — liste, fiche, création, édition, archivage.

**Ce qui est produit :**
- `/admin/entreprises` — DataTable shadcn paginée, recherche, filtre archivées
- `/admin/entreprises/new` — formulaire de création
- `/admin/entreprises/[id]` — fiche entreprise : infos, contacts, offres liées
- `/admin/entreprises/[id]/edit` — édition
- API routes : `GET/POST /api/admin/entreprises`, `GET/PUT/PATCH /api/admin/entreprises/[id]`
- Archivage logique (PATCH `archived: true`)
- Upload logo Cloudinary via signature serveur

---

**Prompt Antigravity — Étape 4 :**

```
Tu es Antigravity. Étape 4 du projet Stratos Conseil : CRUD Entreprises.

CONTEXTE :
- Layouts en place, auth opérationnelle
- Modèle Prisma : Company (id, name, sector, siret, address, city, website, logoUrl, archived) + CompanyContact
- Route admin protégée par middleware (ROLE_ADMIN requis)

TÂCHE — Étape 4 : CRUD complet des entreprises

1. API routes (toutes dans app/api/admin/entreprises/) :

GET /api/admin/entreprises : liste paginée (query params: page, limit=20, search, archived=false)
  - Retourne { data: Company[], total, page, pages }
  - search = full-text sur name, sector, city

POST /api/admin/entreprises : création
  - Zod schema : { name: string min 2, sector?, siret? (longueur 14), address?, city?, website? url? }
  - Retourne la company créée

GET /api/admin/entreprises/[id] : fiche complète avec contacts et offres liées (count)
PUT /api/admin/entreprises/[id] : mise à jour
PATCH /api/admin/entreprises/[id] : archivage { archived: boolean }

POST /api/admin/cloudinary/signature : génère une signature Cloudinary côté serveur
  - params : { folder: "stratos/logos", public_id? }
  - Retourne { signature, timestamp, api_key, cloud_name }

2. Pages admin :

/admin/entreprises :
  - DataTable shadcn avec colonnes : Logo | Nom | Secteur | Ville | Offres actives | Actions
  - Recherche live (debounce 300ms)
  - Toggle "Afficher les archivées"
  - Bouton "+ Nouvelle entreprise"
  - Actions par ligne : Voir | Éditer | Archiver

/admin/entreprises/new et /admin/entreprises/[id]/edit :
  - Form shadcn : nom*, secteur, SIRET, adresse, ville, site web
  - Upload logo : input file → signature API → upload direct Cloudinary → save URL
  - Section contacts : ajouter/supprimer des contacts inline (nom, poste, email, téléphone, contact principal)
  - Validation côté client (react-hook-form + zod resolver)
  - Toast succès/erreur

/admin/entreprises/[id] :
  - Header avec logo, nom, secteur, ville, site web
  - Liste des contacts avec leurs infos
  - Liste des offres liées avec statut et nombre de candidats
  - Bouton Éditer | Archiver

3. Commit : feat(admin): CRUD entreprises complet + upload logo Cloudinary

RÈGLES :
- Cloudinary API_SECRET jamais côté client — signature serveur uniquement
- Validation Zod sur toutes les routes API
- Pagination côté serveur
- Archivage logique (archived: true) — jamais de DELETE en base V1
- tsc --noEmit doit passer
```

---

### Étape 5 — CRUD Offres

**Objectif :** Gestion complète des offres d'emploi liées aux entreprises.

**Ce qui est produit :**
- `/admin/offres` — liste filtrée par entreprise, statut, date
- `/admin/offres/new` — formulaire avec editor markdown pour la description
- `/admin/offres/[id]` — fiche offre + liste des candidats assignés par étape
- API routes CRUD complètes

---

**Prompt Antigravity — Étape 5 :**

```
Tu es Antigravity. Étape 5 du projet Stratos Conseil : CRUD Offres.

CONTEXTE : CRUD Entreprises opérationnel. Modèle JobOffer lié à Company.

TÂCHE — Étape 5 : CRUD complet des offres

1. API routes (app/api/admin/offres/) :

GET /api/admin/offres : liste paginée
  - Filtres : companyId?, status? (DRAFT|OPEN|CLOSED), search sur title
  - Include : company.name, count applications par status

POST /api/admin/offres : création
  - Zod : { companyId: string, title: string min2, description: string, skills: string[], contractType: ContractType, location?, salaryMin?: number, salaryMax?: number, status: OfferStatus }

GET /api/admin/offres/[id] : fiche complète avec applications groupées par status
PUT /api/admin/offres/[id] : mise à jour
PATCH /api/admin/offres/[id]/status : { status: OfferStatus } uniquement

2. Pages admin :

/admin/offres :
  - DataTable : Titre | Entreprise | Contrat | Localisation | Statut (badge) | Candidats | Date | Actions
  - Filtres : sélecteur entreprise + sélecteur statut + recherche titre
  - Bouton "+ Nouvelle offre"

/admin/offres/new et edit :
  - Form : titre*, entreprise* (select avec recherche), type contrat*, localisation, salaire min/max
  - Description : textarea markdown (pas besoin d'éditeur riche, textarea simple)
  - Compétences : input tag (type + Enter pour ajouter, clic pour supprimer)
  - Statut : radio DRAFT / OPEN / CLOSED

/admin/offres/[id] :
  - Header : titre, badge statut, entreprise, localisation, contrat, salaire si renseigné
  - Description rendue en HTML depuis le markdown
  - Compétences requises : liste de tags
  - Section "Candidats assignés" : groupés par statut avec count, lien vers la fiche candidat
  - Bouton "Assigner un candidat" (modale de recherche)
  - Bouton Éditer | Changer statut

3. Commit : feat(admin): CRUD offres + fiche avec candidats assignés

RÈGLES :
- Validation Zod complète incluant la cohérence salaryMin ≤ salaryMax
- skills stocké comme String[] Prisma (array PostgreSQL)
- tsc --noEmit doit passer
```

---

### Étape 6 — CRUD Candidats + Upload CV

**Objectif :** Gestion complète des fiches candidats avec upload CV Cloudinary.

**Ce qui est produit :**
- `/admin/candidats` — liste avec filtres compétences, disponibilité, statut
- `/admin/candidats/new` et `/admin/candidats/[id]/edit` — formulaire complet
- `/admin/candidats/[id]` — fiche candidat avec historique des candidatures
- Upload CV PDF via Cloudinary signé

---

**Prompt Antigravity — Étape 6 :**

```
Tu es Antigravity. Étape 6 du projet Stratos Conseil : CRUD Candidats + upload CV.

CONTEXTE : CRUD Entreprises et Offres opérationnels. Modèle Candidate avec cvUrl (Cloudinary).

TÂCHE — Étape 6 : CRUD candidats complet

1. API routes (app/api/admin/candidats/) :

GET /api/admin/candidats : liste paginée
  - Filtres : skills[] (intersection), availableFrom?, archived=false, search sur nom/email
  - Retourne données de base + count applications en cours

POST /api/admin/candidats : création
  - Zod : { firstName, lastName, email (unique), phone?, currentTitle?, skills: string[], availableFrom?, source: CandidateSource, cvUrl? }

GET /api/admin/candidats/[id] : fiche complète avec applications + notes + documents
PUT /api/admin/candidats/[id] : mise à jour
PATCH /api/admin/candidats/[id] : archivage { archived: boolean }

2. Pages admin :

/admin/candidats :
  - DataTable : Nom | Titre | Compétences (tags 3 max + +N) | Disponibilité | Candidatures actives | Actions
  - Filtres : recherche nom/email, filtre compétences (multi-select), filtre disponibilité (≤ date)
  - Bouton "+ Nouveau candidat"

/admin/candidats/new et edit :
  - Form : prénom*, nom*, email*, téléphone, titre actuel, source (select)
  - Compétences : input tag
  - Disponibilité : date picker
  - Upload CV : input file (PDF uniquement, max 10MB) → signature Cloudinary → upload → save URL
  - Aperçu du CV uploadé si URL présente (lien externe)

/admin/candidats/[id] :
  - Header : nom, titre, compétences, disponibilité, source, CV (lien téléchargement)
  - Section "Candidatures en cours" : liste avec offre, entreprise, statut, date dernière mise à jour
  - Section "Notes" : liste chronologique + formulaire ajout note rapide
  - Section "Documents" : liste avec label, type, date upload, bouton voir
  - Bouton Éditer | Archiver | Assigner à une offre

3. Commit : feat(admin): CRUD candidats complet + upload CV Cloudinary

RÈGLES :
- Upload Cloudinary signé via /api/admin/cloudinary/signature (déjà créé étape 4)
- Folder Cloudinary : "stratos/cv/[candidateId]"
- Taille max 10 MB vérifiée côté client avant upload
- PDF uniquement pour le CV
- tsc --noEmit doit passer
```

---

### Étape 7 — Pipeline Kanban

**Objectif :** Vue Kanban par offre, drag & drop entre étapes, historique automatique des mouvements.

**Ce qui est produit :**
- `/admin/offres/[id]` enrichi avec vue Kanban complète
- Drag & drop (bibliothèque `@dnd-kit/core`)
- API `PATCH /api/admin/applications/[id]/status`
- Création automatique d'un `ApplicationHistory` à chaque mouvement
- Indicateur de blocage si candidat bloqué > 7 jours

---

**Prompt Antigravity — Étape 7 :**

```
Tu es Antigravity. Étape 7 du projet Stratos Conseil : Pipeline Kanban.

CONTEXTE :
- CRUD Entreprises, Offres, Candidats opérationnels
- Modèle Application (candidateId, jobOfferId, status: ApplicationStatus)
- Modèle ApplicationHistory (applicationId, fromStatus, toStatus, changedAt, changedByUserId, note)

TÂCHE — Étape 7 : Kanban pipeline sur la fiche offre

1. Installe @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities (vérifie les versions)

2. API route PATCH /api/admin/applications/[id]/status :
   - Zod : { status: ApplicationStatus, note?: string }
   - Met à jour Application.status
   - Crée un ApplicationHistory { fromStatus: ancienStatut, toStatus: nouveauStatut, changedByUserId, note? }
   - Retourne l'application mise à jour

3. API route POST /api/admin/offres/[id]/applications :
   - Assigne un candidat à l'offre
   - Zod : { candidateId: string }
   - Vérifie que l'application n'existe pas déjà (unique constraint)
   - Crée Application + ApplicationHistory initial { fromStatus: null, toStatus: IDENTIFIED }

4. Composant KanbanBoard (client component) :
   - 8 colonnes : IDENTIFIED, CONTACTED, RH_INTERVIEW, PRESENTED, CLIENT_INTERVIEW, OFFER, PLACED, REJECTED
   - Chaque carte : nom candidat, titre, badge compétences (3 max), date dernière mise à jour
   - Drag & drop avec @dnd-kit — onDragEnd appelle PATCH /api/admin/applications/[id]/status
   - Indicateur visuel orange sur les cartes bloquées > 7 jours dans la même colonne
   - Clic sur carte → sheet latérale avec fiche résumée du candidat

5. Intègre le KanbanBoard dans /admin/offres/[id] (remplace la liste candidats de l'étape 5)

6. Modal "Assigner un candidat" (depuis /admin/offres/[id]) :
   - Recherche candidats par nom/compétence
   - Filtre les candidats déjà assignés à cette offre
   - Clic → POST /api/admin/offres/[id]/applications

7. Commit : feat(admin): pipeline kanban + drag&drop + historique auto

RÈGLES :
- Optimistic UI sur le drag & drop (mise à jour locale immédiate, rollback si API échoue)
- ApplicationHistory créé côté serveur — jamais côté client
- tsc --noEmit doit passer
```

---

### Étape 8 — Notes, historique & invitations email

**Objectif :** Notes internes sur les candidats, historique complet des mouvements pipeline, invitations clients et candidats par email Resend.

**Ce qui est produit :**
- Interface notes sur fiche candidat
- Historique complet visible sur la fiche candidat
- `/admin/invitations` — page de gestion
- Emails Resend avec templates HTML

---

**Prompt Antigravity — Étape 8 :**

```
Tu es Antigravity. Étape 8 du projet Stratos Conseil : notes, historique et invitations email.

CONTEXTE : Kanban opérationnel. ApplicationHistory déjà créé automatiquement. Resend API key dans .env.

TÂCHE — Étape 8 : Notes + historique + invitations Resend

1. API route POST /api/admin/candidats/[id]/notes :
   - Zod : { content: string min 5 }
   - Crée Note liée au candidat avec authorId = consultant connecté
   - Retourne la note créée

2. Section Notes dans /admin/candidats/[id] :
   - Timeline chronologique inversée : date, auteur, contenu
   - Formulaire inline en bas : textarea + bouton "Ajouter une note"
   - Mise à jour optimiste

3. Section Historique pipeline dans /admin/candidats/[id] :
   - Récupère toutes les ApplicationHistory de toutes les applications du candidat
   - Affichage chronologique : date, offre concernée, fromStatus → toStatus, note éventuelle
   - Tri inverse (plus récent en haut)

4. Système d'invitations :

POST /api/admin/invitations :
  - Zod : { email: string.email, role: CLIENT|CANDIDAT, companyId?: string, candidateId?: string }
  - Vérifie que l'email n'est pas déjà un User en base
  - Crée Invitation avec token cuid, expiresAt = now + 24h
  - Envoie email via Resend avec template HTML :
    - Invitation CLIENT : "Stratos Conseil vous invite à accéder à votre portail de suivi des recrutements"
    - Invitation CANDIDAT : "Stratos Conseil vous invite à accéder à votre espace candidat"
    - Lien : NEXT_PUBLIC_APP_URL + /invite/[token]
  - Retourne { success: true }

GET /api/admin/invitations : liste des invitations (pending/expired/used)

5. Page /admin/invitations :
  - Table : Email | Rôle | Statut (pending/expiré/utilisé) | Date envoi | Expiration
  - Bouton "Nouvelle invitation" → modal avec form email + rôle + entité liée
  - Bouton "Renvoyer" pour les expirées (recrée une invitation)

6. Templates email Resend (HTML inline dans les routes) :
  - Design sobre : logo texte "Stratos Conseil", fond blanc, bouton CTA bleu, footer
  - Texte du lien selectionnable si bouton ne fonctionne pas

7. Commit : feat(admin): notes candidats + historique pipeline + invitations email Resend

RÈGLES :
- Les notes sont visibles UNIQUEMENT par les consultants (ROLE_ADMIN) — vérifier que l'API est protégée
- Token invitation hashé en base (SHA-256), comparaison à la validation
- Email "from" depuis RESEND_FROM_EMAIL env var
- tsc --noEmit doit passer
```

---

## Phase 2 — Portails Client & Candidat

### Étape 9 — Portail Client

**Ce qui est produit :**
- `/client` — dashboard : offres actives, candidats à évaluer, dernières mises à jour
- `/client/offres` — liste des offres de son entreprise
- `/client/offres/[id]` — candidats présentés avec statut, CV si partagé, formulaire feedback

---

**Prompt Antigravity — Étape 9 :**

```
Tu es Antigravity. Étape 9 du projet Stratos Conseil : Portail Client.

CONTEXTE :
- Utilisateur ROLE_CLIENT lié à une Company via user.companyId
- Peut voir : ses offres + candidats avec status >= PRESENTED + donner un feedback
- Ne voit PAS : les notes internes, les autres entreprises, les candidats non présentés

TÂCHE — Étape 9 : Portail Client complet

1. API routes (toutes dans /api/client/, protégées middleware ROLE_CLIENT) :

GET /api/client/offres :
  - Retourne les JobOffer liées au companyId de l'utilisateur connecté (status OPEN uniquement)
  - Include : count candidats par ApplicationStatus

GET /api/client/offres/[id] :
  - Vérifie que l'offre appartient bien à son entreprise (sinon 403)
  - Retourne l'offre + les Application avec status IN [PRESENTED, CLIENT_INTERVIEW, OFFER, PLACED, REJECTED]
  - Pour chaque application : candidat.firstName, lastName, currentTitle, skills, cvUrl (si cvSharedClient=true), status, updatedAt, feedbacks existants

POST /api/client/applications/[id]/feedback :
  - Zod : { content: string min 5 }
  - Crée une Note liée au candidat avec authorId = user client et un tag spécial "CLIENT_FEEDBACK"
  - Cette note est visible par le consultant dans la fiche candidat

2. Pages client (Tailwind pur, pas shadcn) :

/client (dashboard) :
  - Nombre d'offres actives
  - Nombre de candidats en attente d'évaluation (status PRESENTED sans feedback)
  - Liste des 5 dernières activités (mouvements de candidats)

/client/offres :
  - Liste des offres actives : titre, nombre candidats par grande étape (En cours / Présentés / Placés)

/client/offres/[id] :
  - Titre de l'offre, description
  - Cartes candidats (uniquement présentés et au-delà) : nom, titre, statut visible simplifié, bouton "Voir CV" si cvSharedClient, bouton "Laisser un commentaire"
  - Modale feedback : textarea + envoi

3. Commit : feat(client): portail client offres + candidats présentés + feedback

RÈGLES :
- Vérification stricte que chaque query client filtre sur user.companyId — jamais de données d'autres entreprises
- cvUrl exposé UNIQUEMENT si cvSharedClient === true sur l'Application
- Les feedbacks sont des Notes en base — le consultant les voit dans la fiche candidat avec le tag CLIENT_FEEDBACK
- Pas de shadcn dans /client
```

---

### Étape 10 — Portail Candidat

**Ce qui est produit :**
- `/candidat` — mes candidatures avec statut simplifié
- `/candidat/candidatures/[id]` — détail + messagerie
- `/candidat/documents` — upload/gestion documents
- `/candidat/profil` — édition profil

---

**Prompt Antigravity — Étape 10 :**

```
Tu es Antigravity. Étape 10 du projet Stratos Conseil : Portail Candidat.

CONTEXTE :
- Utilisateur ROLE_CANDIDAT lié à un Candidate via user.candidateId
- Voir ses candidatures, uploader des documents, messagerie avec consultant

TÂCHE — Étape 10 : Portail Candidat complet

1. API routes (/api/candidat/, protégées ROLE_CANDIDAT) :

GET /api/candidat/applications :
  - Retourne les Applications du candidat connecté (via user.candidateId)
  - Include : jobOffer.title, jobOffer.company.name, status, updatedAt
  - Statut traduit en label simplifié (voir PRD §3.3)

GET /api/candidat/applications/[id] :
  - Vérifie que l'application appartient au candidat connecté
  - Retourne application + messages du thread

GET/POST /api/candidat/messages/[applicationId] :
  - GET : liste des messages du thread, paginés, ordre chronologique
  - POST : Zod { content: string min 1 } → crée Message avec senderId = user.id
  - Notifie le consultant (optionnel V1 : log en console)

GET /api/candidat/documents :
  - Liste des documents du candidat connecté

POST /api/candidat/documents :
  - Zod : { label: string, url: string, publicId: string, mimeType: string, sizeBytes: number }
  - Crée Document en base

DELETE /api/candidat/documents/[id] :
  - Vérifie ownership, supprime en base + appelle Cloudinary destroy via API serveur

PUT /api/candidat/profil :
  - Zod : { firstName, lastName, phone?, currentTitle?, skills: string[], availableFrom? }
  - Met à jour Candidate + User (firstName, lastName)

2. Pages candidat (Tailwind pur) :

/candidat :
  - Liste des candidatures avec : titre offre, entreprise, statut simplifié (badge coloré), date dernier mouvement
  - Lien vers le détail de chaque candidature

/candidat/candidatures/[id] :
  - Titre offre + entreprise + statut simplifié
  - Thread de messagerie : bulles gauche/droite selon sender
  - Formulaire envoi message en bas
  - Polling toutes les 10s pour les nouveaux messages (fetch GET /api/candidat/messages/[id])

/candidat/documents :
  - Liste : label, type, taille, date upload, bouton voir (lien Cloudinary), bouton supprimer
  - Zone upload : input file + label + bouton (signature Cloudinary → upload → POST /api/candidat/documents)
  - Types acceptés : PDF, Word, image — max 10 MB

/candidat/profil :
  - Form : prénom, nom, téléphone, titre actuel, compétences (tags), disponibilité
  - Bouton enregistrer → PUT /api/candidat/profil

3. Commit : feat(candidat): portail candidat complet + messagerie + documents

RÈGLES :
- Vérification ownership stricte sur chaque route — le candidat ne voit que ses propres données
- Messages lus : marquer readAt quand le consultant consulte la messagerie (Phase 3)
- Pas de shadcn dans /candidat
- tsc --noEmit doit passer
```

---

### Étape 11 — Dashboard Consultant KPIs

**Ce qui est produit :**
- `/admin` (dashboard) avec métriques réelles
- Graphiques : funnel de conversion, activité mensuelle, top entreprises
- Composants de visualisation avec recharts ou chart.js

---

**Prompt Antigravity — Étape 11 :**

```
Tu es Antigravity. Étape 11 du projet Stratos Conseil : Dashboard Consultant KPIs.

CONTEXTE : Toutes les données en base. Remplace le placeholder /admin par un vrai dashboard.

TÂCHE — Étape 11 : Dashboard KPIs consultant

1. API route GET /api/admin/dashboard :
   Retourne en une seule requête :
   - offresOuvertes : count JobOffer status=OPEN
   - candidatsActifs : count Candidate archived=false avec au moins une application non-PLACED/REJECTED
   - placementsMois : count Application status=PLACED ce mois-ci
   - tauxConversion : { parEtape: { [status]: count } } sur les 90 derniers jours
   - topEntreprises : top 5 companies par count applications created ce mois
   - activiteRecente : 10 derniers ApplicationHistory avec candidat + offre + entreprise

2. Composants dashboard (/admin/page.tsx) :

   Tiles KPIs (4 grands chiffres) :
   - Offres ouvertes
   - Candidats actifs
   - Placements ce mois
   - Entretiens planifiés (status = CLIENT_INTERVIEW)

   Funnel de conversion (barre horizontale) :
   - Pour chaque ApplicationStatus : nombre d'applications dans cet état en ce moment
   - Visualisation : barres horizontales proportionnelles, libellés en français

   Activité récente (feed) :
   - Liste des 10 derniers mouvements : "[Candidat] est passé de [X] à [Y] pour [Offre] chez [Entreprise] — il y a Xh"

   Top entreprises (liste rangée) :
   - Nom | Offres actives | Candidats en cours | Placements ce mois

3. Pour les graphiques, utilise recharts (UMD depuis cdnjs) ou un SVG custom simple — pas de dépendance lourde.
   Si recharts : npm install recharts (vérifier version)

4. Commit : feat(admin): dashboard KPIs + funnel + activité récente

RÈGLES :
- Une seule API call pour le dashboard (pas de waterfall)
- Les calculs se font en SQL/Prisma, pas en JS après récupération
- tsc --noEmit doit passer
```

---

## Phase 3 — Polish

### Étape 12 — Recherche & filtres avancés

**Objectif :** Recherche cross-entités, filtres combinables, expérience utilisateur fluide.

**Prompt Antigravity — Étape 12 :**

```
Tu es Antigravity. Étape 12 : Recherche et filtres avancés.

TÂCHE :

1. Barre de recherche globale admin (/admin layout) :
   - Input dans la sidebar
   - API GET /api/admin/search?q=[query] : retourne { candidats: [], offres: [], entreprises: [] } (5 résultats max par catégorie, ordered by relevance)
   - Dropdown résultats avec liens vers les fiches

2. Amélioration filtres /admin/candidats :
   - Filtres combinables : compétences (multi-select tags), disponibilité ≤ date, source, archived
   - URL state : les filtres sont dans les query params (ex: ?skills=React,TypeScript&availableFrom=2026-11-01)
   - Count résultats mis à jour en temps réel

3. Amélioration filtres /admin/offres :
   - Filtres : entreprise (select), type contrat, localisation, statut
   - URL state

4. Amélioration filtres /admin/entreprises :
   - Filtre secteur, filtre ville, toggle archivées

5. Commit : feat(admin): recherche globale + filtres URL-state

RÈGLES :
- Filtres dans les query params (pas de state local) pour le partage de lien
- Recherche full-text via Prisma contains (mode: 'insensitive') ou ilike PostgreSQL
- Debounce 300ms sur les inputs de recherche
```

---

### Étape 13 — Export CSV

**Objectif :** Export CSV de la liste des candidats et rapport de recrutement par offre.

**Prompt Antigravity — Étape 13 :**

```
Tu es Antigravity. Étape 13 : Export CSV.

TÂCHE :

1. API GET /api/admin/candidats/export :
   - Mêmes filtres que la liste
   - Retourne un CSV : Prénom, Nom, Email, Téléphone, Titre, Compétences (séparées par ;), Disponibilité, Source, Candidatures actives (count)
   - Content-Type: text/csv, Content-Disposition: attachment; filename="candidats_[date].csv"

2. API GET /api/admin/offres/[id]/export :
   - Rapport recrutement pour une offre
   - CSV : Candidat | Email | Statut | Date entrée dans le pipeline | Durée dans statut actuel (jours) | CV partagé client

3. Bouton "Exporter CSV" dans :
   - /admin/candidats (avec filtres actifs appliqués à l'export)
   - /admin/offres/[id] (export de tous les candidats de cette offre)

4. Commit : feat(admin): export CSV candidats + rapport offre

RÈGLES :
- Encoder le CSV en UTF-8 avec BOM (pour Excel)
- Pas de bibliothèque externe — générer le CSV manuellement (string join)
- Vérifier que les champs avec virgules sont correctement quotés
```

---

### Étape 14 — QA complète

**Objectif :** Matrice de tests exhaustive couvrant tous les rôles et cas limites.

**Prompt Antigravity — Étape 14 :**

```
Tu es Antigravity. Étape 14 : QA complète avant production.

TÂCHE : Exécuter et valider la matrice de tests suivante. Pour chaque test échoué, corriger le bug avant de passer au suivant.

MATRICE DE TESTS :

AUTH :
□ Login consultant admin → redirect /admin
□ Login client → redirect /client
□ Login candidat → redirect /candidat
□ Login mauvais mot de passe → message d'erreur générique
□ Accès /admin sans cookie → redirect /login
□ Cookie client essaie d'accéder /admin → 403
□ Invitation email reçue → lien valide → création compte → redirect bon portail
□ Invitation expirée → message d'erreur

CRUD CONSULTANT :
□ Créer entreprise avec logo → logo visible dans la fiche
□ Archiver entreprise → n'apparaît plus dans la liste par défaut
□ Créer offre OPEN liée à entreprise → visible dans la liste
□ Créer candidat avec CV PDF → lien téléchargeable
□ Assigner candidat à offre → apparaît dans le Kanban en colonne IDENTIFIED
□ Drag & drop candidat IDENTIFIED → CONTACTED → ApplicationHistory créé
□ Drag & drop vers PRESENTED → cvSharedClient=false par défaut
□ Ajouter note → apparaît dans la fiche candidat, invisible côté client
□ Dashboard KPIs : chiffres cohérents avec les données en base

PORTAIL CLIENT :
□ Client connecté voit uniquement ses offres (pas celles d'autres entreprises)
□ Candidat non présenté → invisible pour le client
□ Candidat présenté (status PRESENTED) → visible pour le client
□ CV non partagé → lien CV invisible côté client
□ CV partagé (cvSharedClient=true) → lien visible côté client
□ Feedback client → visible dans la fiche candidat côté consultant avec tag CLIENT_FEEDBACK

PORTAIL CANDIDAT :
□ Candidat voit ses candidatures avec statut simplifié correct
□ Candidat ne voit pas les autres candidats
□ Upload document → visible dans /candidat/documents
□ Supprimer document → disparu de la liste ET de Cloudinary
□ Messagerie : envoi message candidat → visible côté consultant dans la fiche
□ Messagerie : réponse consultant → visible côté candidat

EDGE CASES :
□ Assigner le même candidat deux fois à la même offre → erreur 409 propre
□ Invitation déjà utilisée → message d'erreur
□ Upload fichier > 10 MB → erreur claire avant l'upload
□ SIRET en double → erreur de contrainte bien gérée (pas de 500)
□ salaryMin > salaryMax → erreur validation Zod

PERFORMANCE :
□ Liste candidats avec 50+ entrées → pagination fonctionne
□ Kanban avec 20+ candidats → pas de lag visible

Corriger tous les bugs trouvés. Commit : fix(qa): corrections suite à la matrice de tests complète
```

---

## Phase 4 — Production

### Étape 15 — Déploiement Vercel

**Prompt Antigravity — Étape 15 :**

```
Tu es Antigravity. Étape 15 : Déploiement en production sur Vercel.

TÂCHE :

1. Vérifier que toutes les variables d'environnement de .env.example sont configurées dans Vercel :
   - DATABASE_URL (URL pooled Neon branche main)
   - DIRECT_URL (URL directe Neon branche main)
   - JWT_SECRET (nouvelle valeur de production — différente de dev)
   - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
   - RESEND_API_KEY, RESEND_FROM_EMAIL
   - NEXT_PUBLIC_APP_URL (https://[domaine-production])

2. Appliquer la migration sur la branche main de Neon :
   npx prisma migrate deploy

3. Créer le premier compte consultant en production via le seed ou via une script one-shot :
   - Script scripts/create-admin.ts : crée User { email, passwordHash, role: ADMIN, firstName, lastName }
   - Exécuter une seule fois : npx ts-node scripts/create-admin.ts
   - Supprimer le script après usage ou le passer en ENV_ONLY

4. Push sur la branche main → déploiement automatique Vercel

5. Vérifier le build Vercel (0 erreurs TypeScript, 0 erreurs de lint)

6. Commit : chore(deploy): config production + migration main Neon

RÈGLES :
- JWT_SECRET de prod doit être une chaîne aléatoire différente de dev (openssl rand -base64 64)
- Ne jamais commiter les vraies valeurs d'env
- DATABASE_URL de prod = branche main Neon, jamais la branche dev
```

---

### Étape 16 — Smoke tests production & monitoring

**Prompt Antigravity — Étape 16 :**

```
Tu es Antigravity. Étape 16 : Smoke tests prod et monitoring.

TÂCHE :

1. Smoke tests sur l'URL de production (à exécuter manuellement) :
   □ https://[domaine]/ redirige vers /login
   □ Login avec compte admin prod → /admin charge correctement
   □ Créer une entreprise de test → visible dans la liste
   □ Créer un candidat de test → visible dans la liste
   □ Inviter un email de test (client) → email Resend bien reçu → lien fonctionne → compte créé → portail client accessible
   □ Portail client vide → affiche état vide propre (pas d'erreur)
   □ Upload CV → lien Cloudinary fonctionne
   □ Dashboard /admin → KPIs s'affichent (même si 0)

2. Monitoring basique :
   - Vérifier que les logs Vercel n'ont pas d'erreurs 500 au démarrage
   - Ajouter dans next.config.ts : headers Content-Security-Policy basiques
   - Vérifier que le domaine custom (si configuré) a le SSL vert

3. Documentation finale :
   - Mettre à jour README.md avec :
     - Stack utilisée avec versions
     - Variables d'environnement requises
     - Commandes utiles (dev, build, migration, seed)
     - Accès comptes de test (dev uniquement, ne pas inclure les creds prod)
     - Architecture des routes

4. Commit final : docs: README production + smoke tests validés

RÈGLES :
- Supprimer les données de test créées pendant les smoke tests (sauf si le client veut les garder)
- Ne jamais stocker les credentials de prod dans le README
```

---

## Récapitulatif des phases

| Phase | Étapes | Durée estimée | Livrable |
|-------|--------|---------------|---------|
| 0 — Setup & Auth | 0-3 | ~1 jour | Base technique solide, auth 3 rôles |
| 1 — Core Consultant | 4-8 | ~2 jours | CRUD complet + Kanban + notes + emails |
| 2 — Portails | 9-11 | ~1,5 jours | Portails client & candidat + dashboard |
| 3 — Polish | 12-14 | ~1 jour | Recherche, exports, QA |
| 4 — Production | 15-16 | ~0,5 jour | Déploiement Vercel opérationnel |
| **Total** | **17 étapes** | **~6 jours** | **Plateforme V1 complète** |
