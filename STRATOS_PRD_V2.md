# PRD v2 — Plateforme de recrutement : multi-cabinets, évaluations, shortlist et rendez-vous

Version 2.0 · Octobre 2026 · Complète `STRATOS_PRD.md` (v1.0).

> **Pour l'agent de code.** Ce document **étend** le PRD v1. En cas de conflit, **la v2 gagne**. Les sections de la v1 non mentionnées ici restent valables. Inspecte le code réel avant d'agir ; ne suppose aucun nom de champ ni de fichier.
> **Hypothèse de départ :** la plateforme sert d'abord Stratos Conseil, puis devient un produit proposé à d'autres cabinets de recrutement. Le nom commercial du produit n'est pas fixé : utiliser « la plateforme ».

---

## 1. Vision et objectifs

**Parcours cible :** sourcing → le candidat passe une évaluation → la plateforme note et classe → un consultant valide → une shortlist est soumise à l'entreprise → l'entreprise propose des créneaux → le candidat en choisit un → l'entretien a lieu.

**Objectifs V2 :**
1. Stratos utilise le parcours complet sur de vraies offres.
2. La plateforme est **multi-cabinets** dès le départ : Stratos est le cabinet n°1.
3. Un cabinet pilote (autre que Stratos) peut être créé et isolé en moins d'une heure.

**Indicateurs de succès du pilote** (mesurés par la plateforme, voir section 13) : délai entre l'ouverture d'une offre et la première shortlist · taux de tests terminés · taux de présence aux entretiens · temps passé par un consultant pour produire une shortlist · satisfaction des consultants.

**Non-objectifs V2 :** notation par IA ou modèle de langage · rejet automatique de candidats · jobboard public · intégration à des ATS tiers · paiement en ligne · surveillance du candidat (caméra, suivi du navigateur) · visioconférence intégrée (un lien externe est saisi) · application mobile native · épreuves de programmation en ligne.

## 2. Multi-cabinets (tenancy)

### 2.1 Principe
Un **cabinet** (`Agency`) est un client de la plateforme. Toutes les données métier appartiennent à un cabinet et ne sont **jamais** visibles par un autre.

### 2.2 Modèle
- `Agency` : `id`, `name`, `slug` (unique, voir slugs réservés), `status` (`PILOT` · `ACTIVE` · `SUSPENDED`), `timezone` (défaut `Africa/Abidjan`), `logoUrl?`, `brandKey` (palette prévalidée, pas de couleur libre), `senderName`, `contactEmail`, `showScoreToCandidate` (défaut `false`), `anonymizeUntilInterest` (défaut `true`), `retentionMonths` (défaut proposé : 24), `createdAt`.
- `agencyId` **obligatoire** sur : `User` (sauf le rôle `PLATFORM_ADMIN`), `Company`, `JobOffer`, `Candidate`, `Application`, `Note`, `Document`, `Message`, `Invitation`, et sur tous les nouveaux modèles de ce PRD. Les modèles reliés à un parent le portent aussi (dénormalisé) pour pouvoir être filtrés et indexés directement.
- Unicités **par cabinet** : `Candidate (agencyId, email)`, `Company (agencyId, siret)`. L'e-mail d'un `User` reste **unique globalement** (un identifiant = un cabinet). Un consultant qui travaille pour deux cabinets : hors périmètre.

### 2.3 Rôles
| Rôle | Portée | Résumé |
|---|---|---|
| `PLATFORM_ADMIN` | Plateforme | Crée et suspend les cabinets, invite le premier administrateur d'un cabinet. **Ne lit pas les données candidats** (accès de support : hors périmètre V2) |
| `AGENCY_ADMIN` | Un cabinet | Tout dans son cabinet : utilisateurs, réglages, modèles de messages, rétention |
| `CONSULTANT` | Un cabinet | Candidats, offres, évaluations, shortlists, rendez-vous. Ne gère pas les utilisateurs ni les réglages |
| `CLIENT` | Une entreprise | Comme en v1, plus shortlists et rendez-vous de **ses** offres |
| `CANDIDAT` | Ses données | Comme en v1, plus évaluations, consentements et rendez-vous |

L'ancien rôle `ADMIN` de la v1 devient `CONSULTANT` (ou `AGENCY_ADMIN` pour le premier compte d'un cabinet).

### 2.4 Application de l'isolation
- Toute lecture ou écriture d'un modèle « cabinet » passe par une **couche d'accès unique** (extension du client Prisma ou fonction `forAgency(session)`) qui **injecte** `agencyId` et **refuse** toute requête sans portée.
- Une ressource d'un autre cabinet répond **404** (pas 403), pour ne pas révéler son existence.
- Le JWT contient `userId`, `role`, `agencyId`, `tokenVersion`.
- **Suite de tests d'isolation obligatoire** : deux cabinets amorcés par le seed, chaque route testée en croisé (voir ROADMAP V2, étape T1).
- Piste de défense en profondeur (à évaluer en V3) : sécurité au niveau des lignes de PostgreSQL.

## 3. Pipeline de recrutement V2

Nouvelles valeurs de l'enum `ApplicationStatus` (**ajouts uniquement**) et ordre des colonnes :

1. `IDENTIFIED` Identifié
2. `CONTACTED` Contacté
3. `ASSESSMENT_SENT` Test envoyé *(nouveau)*
4. `ASSESSMENT_DONE` Test passé *(nouveau)*
5. `VALIDATED` Validé par le consultant *(nouveau)*
6. `RH_INTERVIEW` Entretien RH
7. `PRESENTED` Présenté au client
8. `INTERVIEW_REQUESTED` Entretien demandé *(nouveau)*
9. `INTERVIEW_SCHEDULED` Entretien planifié *(nouveau)*
10. `CLIENT_INTERVIEW` Entretien client (tenu)
11. `OFFER` Proposition faite
12. `PLACED` Placé
13. `REJECTED` Refusé

**Règles :**
- `PRESENTED` n'est possible qu'à partir de `VALIDATED`, sauf **dérogation du consultant avec motif** (enregistrée dans l'historique).
- **Le système ne passe jamais un candidat en `REJECTED`.** Seul un consultant le fait, avec un motif choisi dans une liste.
- Les passages automatiques autorisés sont informatifs : `ASSESSMENT_SENT` à l'envoi du test, `ASSESSMENT_DONE` à la remise du test, `INTERVIEW_SCHEDULED` à la confirmation d'un créneau.
- Chaque changement crée une ligne d'historique (qui, quand, de quoi à quoi, motif).

**Statuts affichés au candidat :** « En cours d'étude » (`IDENTIFIED`, `CONTACTED`, `ASSESSMENT_DONE`, `VALIDATED`, `RH_INTERVIEW`) · « Test à passer » (`ASSESSMENT_SENT`) · « Présenté à un client » (`PRESENTED`) · « Entretien à planifier » (`INTERVIEW_REQUESTED`) · « Entretien planifié » (`INTERVIEW_SCHEDULED`) · « Entretien passé » (`CLIENT_INTERVIEW`) · « Proposition reçue » (`OFFER`) · « Mission conclue » (`PLACED`) · « Non retenu » (`REJECTED`).

## 4. Évaluations (tests)

### 4.1 Modèles (tous avec `agencyId`)
- `Assessment` : titre, description, consignes, durée en minutes (optionnelle), `passPercent` (seuil de validation suggérée), `reviewPercent` (seuil « à revoir »), tentatives maximales (défaut 1), `shuffleQuestions`, `shuffleOptions`, `isActive`, version.
- `Question` : `assessmentId`, ordre, type (`MCQ_SINGLE`, `MCQ_MULTI`, `SHORT_TEXT`, `LONG_TEXT`), énoncé (texte restreint, pas de HTML), `options` (JSON : identifiant, libellé, `isCorrect`), `points`, `skillTag`, `rubric` (consigne de notation manuelle), `required`.
- `JobOffer.assessmentId?` : une évaluation peut servir plusieurs offres.
- `AssessmentAttempt` : `assessmentId`, `applicationId`, `candidateId`, `tokenHash`, `expiresAt`, `status` (`SENT`, `STARTED`, `SUBMITTED`, `EXPIRED`, `GRADED`), `startedAt`, `submittedAt`, `consentAt`, `autoPoints`, `manualPoints?`, `maxPoints`, `percent?`, `suggestion?` (`RECOMMEND_VALIDATE`, `TO_REVIEW`, `BELOW_THRESHOLD`), `gradedById?`, `gradedAt?`, `attemptNumber`.
- `AttemptAnswer` : `attemptId`, `questionId`, `answer` (JSON), `autoPoints?`, `manualPoints?`, `comment?`.

### 4.2 Notation : déterministe et explicable
- `MCQ_SINGLE` : tous les points si bonne réponse.
- `MCQ_MULTI` : (bonnes réponses cochées − mauvaises cochées) ÷ nombre de bonnes réponses, plancher à 0, multiplié par les points.
- Questions texte : **notation manuelle** par un consultant, guidée par la consigne de notation. Tant qu'elles ne sont pas notées, le résultat est marqué **« incomplet »** et n'est pas classé comme final.
- Le pourcentage est calculé sur les points maximaux. **Sous-scores par `skillTag`.**
- **Suggestion :** pourcentage ≥ `passPercent` → `RECOMMEND_VALIDATE` ; entre `reviewPercent` et `passPercent` → `TO_REVIEW` ; en dessous → `BELOW_THRESHOLD`. **Une suggestion n'est jamais une décision.**
- Les fonctions de notation sont des **fonctions pures testées unitairement**.
- Aucune notation par modèle d'IA en V2.

### 4.3 Passage du test par le candidat (`/test/[token]`)
- Accès par lien e-mail **sans compte**. Jeton de 32 octets aléatoires, **seule l'empreinte est stockée**, expiration (défaut 7 jours), limité au nombre de tentatives autorisé.
- **Écran d'information et de consentement** avant de commencer : finalité du test, qui verra les résultats, durée de conservation, contact du cabinet. Le consentement est horodaté.
- **Minuteur géré par le serveur** (`startedAt` + durée) : remise automatique à l'expiration. Reprise possible après une coupure de connexion ; **sauvegarde automatique** des réponses toutes les 10 à 15 secondes.
- **Mobile d'abord**, légère (connexions lentes), accessible au clavier et aux lecteurs d'écran.
- **Pas de surveillance** (ni caméra, ni détection de changement d'onglet). Mesures proportionnées : ordre des questions et des options mélangé, lien à usage limité, durée limitée. Le cabinet est informé que le test est **indicatif** et se combine à un entretien.
- Le candidat voit « Test terminé, merci ». Son score ne lui est montré que si `showScoreToCandidate` est activé.
- Un consultant peut **rouvrir** une tentative (action enregistrée).

## 5. Validation et tri

Écran « Candidats évalués » par offre :
- Colonnes : nom, pourcentage et sous-scores, état de la notation (complet/incomplet), compétences requises couvertes (« 4 sur 6 », calcul explicable), disponibilité, statut, suggestion.
- Tri et filtres combinables. **Le classement par pourcentage n'est jamais le seul critère affiché.**
- Actions en lot : valider, garder à revoir, passer en entretien RH, refuser (motif obligatoire).
- Motifs de refus : liste fermée (par exemple compétences insuffisantes pour le poste, indisponibilité, retrait du candidat, autre avec texte). Les notes restent factuelles : le candidat peut en demander l'accès.

## 6. Shortlist et soumission à l'entreprise

### 6.1 Modèles
- `Shortlist` : `jobOfferId`, `createdById`, message d'accompagnement, `status` (`DRAFT`, `SENT`), `sentAt`.
- `ShortlistItem` : `shortlistId`, `applicationId`, résumé rédigé par le consultant, `showTestResult`, `showSubscores`, `cvShared`, `consentStatus` (`PENDING`, `GRANTED`, `DECLINED`), `consentAt?`, `clientDecision?` (`INTERESTED`, `NOT_FOR_THIS_ROLE`, `NEEDS_INFO`), `clientReason?`, `clientDecidedAt?`.
- Le champ `cvSharedClient` de la v1 est remplacé par `ShortlistItem.cvShared` (conserver l'ancien champ, non utilisé).

### 6.2 Règles
- **Consentement du candidat obligatoire** avant l'envoi : le consultant demande l'accord par le portail ou par e-mail (entreprise nommée ou secteur seulement). Sans accord (`GRANTED`), le candidat **ne peut pas** être inclus.
- **Anonymisation avant intérêt** (`anonymizeUntilInterest`, activée par défaut) : le client voit prénom et initiale, parcours, compétences, résultat si autorisé. **Aucune coordonnée.** Les échanges et rendez-vous passent par la plateforme (limite le contournement du cabinet).
- Le CV est ouvert par **lien signé et temporaire** (section 10).
- Le client répond par trois actions : « Je souhaite rencontrer », « Pas pour ce poste » (motif en liste), « J'ai besoin d'informations » (message au consultant). Ses commentaires restent visibles des seuls consultants.

## 7. Rendez-vous

### 7.1 Modèles
- `InterviewProposal` : `applicationId`, proposé par (`CLIENT` ou `CONSULTANT` pour le compte du client), `status` (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED`), `expiresAt`, `tokenHash`.
- `InterviewSlot` : `proposalId`, `startsAt` et `endsAt` en UTC.
- `Interview` : `applicationId`, `startsAt`, `endsAt`, `timezone`, `mode` (`VISIO`, `PHONE`, `ONSITE`), `locationOrLink`, `status` (`SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW_CANDIDATE`, `NO_SHOW_CLIENT`), `cancelReason?`, `icsUid`, `reminderSentAt?`.

### 7.2 Règles
- Le client (ou le consultant pour lui) propose **1 à 5 créneaux** ; le candidat en choisit un par le portail ou par `/rdv/[token]`.
- **Fuseaux :** tout est stocké en UTC ; l'affichage suit le fuseau du cabinet (défaut `Africa/Abidjan`), et celui du candidat si indiqué.
- **Conflits :** un candidat ne peut pas avoir deux entretiens qui se chevauchent ; un créneau déjà pris est refusé proprement.
- À la confirmation : e-mails au candidat, au client et au consultant, avec un **fichier calendrier (.ics)**.
- **Rappels** par e-mail (24 h avant et 2 h avant). La fréquence des tâches planifiées dépend du plan d'hébergement : **vérifier les limites avant de choisir** le mécanisme.
- **Report ou annulation** par n'importe quelle partie, avec motif ; le consultant est notifié.
- Après la date, le consultant (ou le client) enregistre le résultat : tenu, absence du candidat, absence du client. Le statut passe à `CLIENT_INTERVIEW` sur confirmation.
- Le lien de visioconférence est saisi à la main. L'intégration d'un agenda externe est hors périmètre V2.

## 8. Notifications

- Envoi par Resend, nom d'expéditeur propre au cabinet. Événements : test envoyé, rappel du test, test reçu, demande de consentement, shortlist envoyée, intérêt du client, créneaux proposés, confirmation, rappels, report, annulation.
- **`NotificationLog`** : type, destinataire, statut, identifiant du prestataire, erreur. Un échec d'e-mail **ne perd jamais de donnée** et reste visible dans l'administration.
- Textes modifiables par le cabinet (valeurs par défaut en français, sobres).
- WhatsApp ou SMS : hors périmètre V2 (coût et prestataires à étudier).

## 9. Pages et routes ajoutées

| Route | Accès | Description |
|---|---|---|
| `/platform` et sous-pages | `PLATFORM_ADMIN` | Cabinets : création, suspension, invitation de l'administrateur |
| `/admin/evaluations`, `/new`, `/[id]` | Consultant | Constructeur d'évaluations et de questions, aperçu |
| `/admin/offres/[id]/evaluation` | Consultant | Associer une évaluation à l'offre |
| `/admin/offres/[id]/evalues` | Consultant | Candidats évalués : classement, validation en lot |
| `/admin/offres/[id]/shortlists` | Consultant | Créer et envoyer une shortlist |
| `/admin/rendez-vous` | Consultant | Agenda, résultats, absences |
| `/admin/parametres` | Administrateur du cabinet | Fuseau, expéditeur, rétention, affichage des scores, modèles de messages |
| `/admin/journal` | Administrateur du cabinet | Journal d'audit |
| `/test/[token]` | Public (jeton) | Passage du test |
| `/rdv/[token]` | Public (jeton) | Choix d'un créneau |
| `/client/offres/[id]/shortlist`, `/client/dossiers/[id]`, `/client/rendez-vous` | Client | Shortlist, dossier, décision, créneaux |
| `/candidat/evaluations`, `/candidat/consentements`, `/candidat/rendez-vous` | Candidat | Tests, accords, entretiens |

**Slugs réservés (ajouts) :** `platform`, `test`, `rdv`.
Les API suivent la même convention : `/api/admin/*`, `/api/client/*`, `/api/candidat/*`, `/api/platform/*`, et des routes publiques à jeton limitées en débit.

## 10. Sécurité et confidentialité (corrections de la v1 et ajouts)

1. **Documents privés.** Les CV et pièces jointes ne sont **jamais** servis par une adresse publique. Envoi en mode **authentifié** (Cloudinary), enregistrement de l'identifiant et du type de livraison seulement, et **lien signé court (5 à 15 minutes)** généré à la demande après contrôle d'autorisation. Cela remplace `cvUrl` et `Document.url` publics de la v1.
2. **Jetons.** 32 octets aléatoires (base64url), **empreinte seule en base**, expiration, usage unique pour les invitations. `cuid()` ne convient pas pour un secret.
3. **Session.** Cookie `HttpOnly`, `Secure`, **`SameSite=Lax`** (le mode `Strict` déconnecte l'utilisateur quand il arrive depuis un lien d'e-mail). `tokenVersion` sur `User` pour **invalider** les sessions (changement de mot de passe, déconnexion partout). Durée à fixer (proposition : 7 jours pour le consultant, 24 heures pour le client et le candidat).
4. **Limitation de débit** sur la connexion et sur toutes les routes publiques à jeton, avec un stockage persistant compatible avec l'hébergement serverless.
5. **CSRF.** Vérifier l'en-tête `Origin` sur les requêtes qui modifient des données.
6. **Journal d'audit** (`AuditLog`) : ouverture d'un CV, exports, changements de rôle, ouverture d'une tentative de test, suppression.
7. **Fichiers téléversés :** type MIME vérifié sur le contenu, taille maximale, noms nettoyés.
8. Validation Zod partout ; secrets hors du code ; ces règles de la v1 restent en vigueur.

## 11. Conformité et données personnelles

*Ce paragraphe n'est pas un avis juridique : à faire valider par un juriste avant tout pilote avec des données réelles.*

- **Rôles juridiques :** le cabinet décide des finalités (responsable du traitement) ; la plateforme les traite pour lui (sous-traitant). Un **accord de traitement des données** est à prévoir entre la plateforme et chaque cabinet.
- **Décision humaine :** la plateforme recommande, un humain décide (sections 3 et 4). Le candidat est informé du fonctionnement du test et des critères généraux. Le RGPD et les règles contre la discrimination s'appliquent quel que soit le calendrier du règlement européen sur l'IA.
- **IA :** la notation de la V2 est à barème, sans modèle d'IA. Toute fonction future d'IA (analyse de CV, notation de textes par un modèle) passe par une **revue juridique préalable** : le recrutement est classé à haut risque, avec des obligations qui s'appliquent à partir du 2 décembre 2027 (calendrier vérifié en octobre 2026).
- **Droit des personnes :** accès, export, rectification, suppression ou anonymisation d'un candidat (outils d'administration en V3).
- **Conservation :** durées par défaut proposées : fiche candidat 24 mois après la dernière activité, réponses détaillées aux tests 12 mois ; **à faire valider** et à rendre configurables par cabinet.
- **Hébergement :** lister les sous-traitants (base de données, hébergeur, stockage de fichiers, envoi d'e-mails) et leur localisation. Les formalités auprès de l'autorité ivoirienne de protection des données (ARTCI) et les règles de transfert hors du pays sont **à vérifier avec un juriste**.
- **Équité des tests :** chaque question doit être en rapport avec le poste. Statistiques par question (taux de réussite) prévues pour repérer les questions défaillantes (V3).

## 12. Propriété intellectuelle et modèle commercial (hypothèses)

- **Propriété :** si le produit est développé dans le cadre de Stratos, **un accord écrit** doit préciser qui détient le code et si le développeur peut le proposer à d'autres cabinets (licence, partage de revenus). **À régler avant de présenter la plateforme à d'autres cabinets.**
- **Prix à tester** (aucune validation à ce jour) : par consultant et par mois, ou par offre active, ou frais d'installation plus abonnement. Pilotes gratuits ou à prix réduit avec durée et indicateurs convenus.
- **Concurrent principal :** l'assemblage « tableur + messagerie + outil de formulaires + outil de rendez-vous ». La valeur est de tout réunir : test, shortlist et rendez-vous au même endroit.

## 13. Mesure du pilote

Événements enregistrés (sans contenu sensible) : offre ouverte, test envoyé, démarré, remis, validation, shortlist envoyée, intérêt du client, créneaux proposés, entretien planifié, entretien tenu, absence. Tableau de bord par cabinet : délai médian offre → première shortlist, taux de tests terminés, délai médian de passage du test, taux de présence aux entretiens, nombre de placements.

## 14. Hors périmètre V2 (backlog)

Notation assistée par IA · synchronisation Google ou Outlook · génération automatique de liens de visioconférence · WhatsApp et SMS · banque de questions partagée entre cabinets · épreuves de programmation · domaine personnalisé par cabinet · facturation en ligne · accès de support avec usurpation d'identité · sécurité au niveau des lignes · application mobile.

## 15. Journal des changements v1 → v2

| Sujet | v1 | v2 |
|---|---|---|
| Cabinets | Un seul | Multi-cabinets, `agencyId` partout, isolation testée |
| Rôles | ADMIN, CLIENT, CANDIDAT | PLATFORM_ADMIN, AGENCY_ADMIN, CONSULTANT, CLIENT, CANDIDAT |
| Pipeline | 8 étapes | 13 étapes avec test et rendez-vous, règles de validation humaine |
| Évaluations | Aucune | Tests à barème, notation manuelle des textes, suggestions non décisionnelles |
| Shortlist | Simple partage de CV | Dossier structuré, consentement du candidat, anonymisation avant intérêt |
| Rendez-vous | Aucun | Créneaux, confirmation, fichier calendrier, rappels, absences |
| Documents | Adresses Cloudinary publiques | Livraison privée, liens signés |
| Jetons | `cuid()`, clair en base | Aléatoires, empreinte seule |
| Cookie | `SameSite=Strict` | `SameSite=Lax`, `tokenVersion` |
| Versions | Next.js 15, Prisma 6 « figées » | À vérifier avant de figer (le portfolio de Sylla est en Next.js 16 et Prisma 7) |

## 16. Décisions à confirmer

1. Anonymisation avant intérêt activée par défaut : oui ou non.
2. Durées de conservation (24 et 12 mois) à valider avec un juriste.
3. Le candidat voit-il son score ? (proposition : non par défaut, réglable.)
4. Mécanisme des rappels (selon les limites du plan d'hébergement).
5. Nom du produit.
6. Accord de propriété avec Stratos.
7. Versions : rester en Next.js 15 et Prisma 6, ou aligner sur Next.js 16 et Prisma 7.
