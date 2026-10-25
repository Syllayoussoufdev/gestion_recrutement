# ROADMAP v2 — Plateforme de recrutement multi-cabinets

Version 2.0 · Octobre 2026 · Complète `STRATOS_ROADMAP.md` (v1.0). **En cas de conflit, la v2 gagne.** Le produit est décrit dans `STRATOS_PRD_V2.md`.

## 0. Règles permanentes : ajouts à celles de la v1

Les règles 1 à 12 de la v1 restent valables (sauf la 11, voir R5). S'y ajoutent :

- **R1. Isolation entre cabinets.** Aucune requête sur un modèle « cabinet » en dehors de la couche d'accès qui injecte `agencyId`. Une ressource d'un autre cabinet répond 404.
- **R2. Pas de décision automatique.** Le système ne passe jamais un candidat en `REJECTED` et n'envoie jamais de refus de lui-même. Les suggestions sont des suggestions.
- **R3. Pas d'IA de notation** en V2 : barème et notation manuelle uniquement.
- **R4. Documents privés.** Aucun CV ni document servi par une adresse publique ; liens signés courts.
- **R5. Authentification maison conservée** (jose + cookie), avec `SameSite=Lax` et `tokenVersion`. Pas de NextAuth.
- **R6. Jetons.** 32 octets aléatoires, seule l'empreinte est stockée. Jamais `cuid()` pour un secret.
- **R7. Données de test uniquement.** Aucune donnée réelle de candidat dans la base de développement. Aucune donnée réelle avant la porte G3 (section 6).
- **R8. Migrations additives**, sur la branche Neon de développement. Décrire la migration, **attendre ma validation**, puis l'appliquer. Aucune migration automatique en production.
- **R9. Versions.** Vérifier les versions maintenues (`npm info`) avant d'installer ; pas de `@latest`. Dire laquelle des versions de Next.js et de Prisma est recommandée et attendre ma décision avant de figer.
- **R10. Chaque étape finit par un rapport** : fichiers modifiés, dépendances (nom, version, raison), migrations, commandes et résultats, tests réalisés et **non réalisés**, risques, points à valider. Puis **arrêt**.
- **R11. Échec de connexion à la base** (P1000, 28P01, branche introuvable) : ne modifier aucun fichier `.env*`, le signaler et attendre.

Préambule commun des prompts : « Lis STRATOS_PRD.md, STRATOS_PRD_V2.md (sections indiquées) et STRATOS_ROADMAP_V2.md (règles permanentes). Inspecte le code existant avant d'agir. Une étape à la fois, puis rapport et arrêt. »

## 1. Ce qui change dans les étapes v1

| Étape v1 | Changement |
|---|---|
| 0 Init | Versions à vérifier et à faire valider (R9), pas de « figées » |
| 1 Modèles et seed | **Remplacée** par l'étape 1' |
| 2 Authentification | **Remplacée** par l'étape 2' |
| 3 Layouts | Le nom et le logo du cabinet viennent de `Agency` ; rôles mis à jour |
| 4 à 8 CRUD, Kanban, notes, invitations | Toutes les requêtes passent par la couche d'accès (R1). Les statuts du Kanban suivent le PRD v2, section 3. Invitations : jetons de la règle R6, rôle et cabinet portés par l'invitation |
| 6 Candidats et CV | **Remplacée** par l'étape 6' (documents privés) |
| 9 et 10 Portails | Mis à jour par les étapes S2 et E3 (shortlists, consentements, tests, rendez-vous) |
| 11 à 13 KPIs, recherche, export | Limités au cabinet. Les exports sont enregistrés dans le journal d'audit |
| 14 QA | Ajouter la matrice d'isolation (étape T1) et la matrice de chaque nouvelle phase |
| 15 et 16 Déploiement | Inchangés, plus le choix du mécanisme de rappels (étape S4) |

**Nouvelle étape T1** (isolation) à placer **après l'étape 8** de la v1.

---

## 2. Étapes révisées

### Étape 1' — Modèles, cabinets et seed

```
Préambule commun. Étape 1' : remplace l'étape 1 de la v1. Lis STRATOS_PRD_V2.md sections 2 et 3.
1) Reprends les modèles de la v1 et ajoute : le modèle Agency, agencyId obligatoire (index compris) sur tous les modèles « cabinet »
   listés section 2.2, les unicités par cabinet (Candidate agencyId+email, Company agencyId+siret), les rôles PLATFORM_ADMIN,
   AGENCY_ADMIN, CONSULTANT, CLIENT, CANDIDAT, les 13 valeurs de ApplicationStatus, User.tokenVersion.
2) Invitation : stocke tokenHash (pas le jeton), expiresAt, usedAt. Candidate.cvUrl et Document.url ne doivent plus être des adresses
   publiques : prévois publicId, resourceType, deliveryType (voir PRD section 10).
3) Décris la migration et attends ma validation avant de l'appliquer (branche de développement uniquement).
4) Seed avec DEUX cabinets : « Stratos Conseil » et « Cabinet Démo », chacun avec un administrateur, un consultant, une entreprise,
   un client, un candidat, une offre ; plus un utilisateur PLATFORM_ADMIN. Mots de passe de développement hachés (bcryptjs, coût 12),
   jamais affichés dans les rapports. Données fictives uniquement.
5) Vérifie avec prisma studio, tsc --noEmit, commit conventionnel. Rapport, puis arrêt.
```

### Étape 2' — Authentification et couche d'accès aux données

```
Préambule commun. Étape 2' : remplace l'étape 2 de la v1. Lis STRATOS_PRD_V2.md sections 2.3, 2.4 et 10.
1) Connexion commune ; JWT (jose) avec userId, role, agencyId, tokenVersion ; cookie HttpOnly, Secure, SameSite=Lax.
   À chaque requête protégée, vérifie que tokenVersion correspond à la base.
2) Middleware par rôle : /platform (PLATFORM_ADMIN), /admin (AGENCY_ADMIN et CONSULTANT), /client, /candidat, et les /api/* correspondantes.
3) Crée la couche d'accès unique aux données (extension Prisma ou fonction forAgency(session)) qui injecte agencyId, refuse toute
   requête non bornée sur un modèle « cabinet », et renvoie 404 pour une ressource d'un autre cabinet. Documente son usage.
4) Limitation de débit persistante sur la connexion (propose une solution compatible serverless ; si elle exige un nouveau service,
   demande ma validation avant de l'installer). Message d'erreur de connexion générique.
5) Vérification de l'en-tête Origin sur les requêtes qui modifient des données.
6) Tests : connexion de chaque rôle, accès interdit, tokenVersion invalidé, requête sans portée refusée. Rapport, puis arrêt.
```

### Étape 6' — Candidats et documents privés

```
Préambule commun. Étape 6' : remplace l'étape 6 de la v1. Lis STRATOS_PRD_V2.md section 10 (points 1 et 7).
1) CRUD candidats (via la couche d'accès, R1). Envoi des documents en mode AUTHENTIFIÉ (Cloudinary), signature générée côté serveur
   par une route protégée, vérification du type MIME sur le contenu, taille maximale 10 Mo, noms nettoyés.
2) N'enregistre que publicId, resourceType, deliveryType, mimeType, taille. Aucune adresse publique.
3) Route /api/documents/[id]/url : contrôle l'autorisation (même cabinet, et pour un client : seulement si cvShared), journalise
   l'ouverture (AuditLog), renvoie un lien signé qui expire en 10 minutes.
4) Suppression d'un document : supprime la ligne ET le fichier chez Cloudinary.
5) Tests : lien expiré, accès d'un autre cabinet (404), client sans autorisation, fichier trop lourd. Rapport, puis arrêt.
```

### Étape T1 — Tests d'isolation entre cabinets (après l'étape 8)

```
Préambule commun. Étape T1 : tests d'isolation. Lis STRATOS_PRD_V2.md section 2.4.
Écris une suite automatisée (commande npm run test:isolation) qui, avec les deux cabinets du seed, se connecte en tant que consultant,
client et candidat du cabinet A et tente d'accéder à TOUTES les routes de pages et d'API en visant des identifiants du cabinet B
(lecture, modification, suppression, téléchargement de documents, notes, invitations, export). Attendu : 404 partout, aucune donnée du
cabinet B dans les réponses. Teste aussi une requête construite sans agencyId et un jeton d'un autre cabinet.
Liste dans le rapport chaque route testée et le résultat réel. Corrige les failles trouvées. Rapport, puis arrêt.
```

---

## 3. Phase 5 — Évaluations (V1.5)

### Étape E1 — Modèles et moteur de notation
```
Préambule commun. Lis STRATOS_PRD_V2.md section 4. Étape E1.
Ajoute les modèles Assessment, Question, AssessmentAttempt, AttemptAnswer (agencyId partout) et JobOffer.assessmentId.
Décris la migration et attends ma validation. Écris le moteur de notation en fonctions pures (QCM simple, QCM multiple, texte
« à noter », pourcentage, sous-scores par skillTag, suggestion selon passPercent et reviewPercent) avec des tests unitaires qui couvrent
tous les cas limites (aucune réponse, plafond à zéro, notation incomplète). Aucun appel à un modèle d'IA. Rapport, puis arrêt.
```

### Étape E2 — Constructeur d'évaluations (consultant)
```
Préambule commun. Lis STRATOS_PRD_V2.md sections 4.1 et 9. Étape E2.
Pages /admin/evaluations, /new, /[id] : titre, consignes, durée, seuils, tentatives, mélange ; questions des 4 types avec options
et bonnes réponses, points, skillTag, consigne de notation ; réordonner (boutons accessibles au clavier), dupliquer, activer/désactiver.
Validations Zod (au moins une bonne réponse, points supérieurs à 0). Aperçu « comme un candidat ». Association à une offre
(/admin/offres/[id]/evaluation). Une évaluation déjà passée par un candidat n'est plus modifiable : crée une nouvelle version.
Respect de la couche d'accès (R1). Rapport avec captures, puis arrêt.
```

### Étape E3 — Passage du test par le candidat
```
Préambule commun. Lis STRATOS_PRD_V2.md section 4.3 et 10. Étape E3.
Route publique /test/[token] : jeton de 32 octets (empreinte seule en base), expiration, tentatives limitées, limitation de débit.
Écran d'information et de consentement horodaté ; minuteur géré par le serveur ; sauvegarde automatique toutes les 10 à 15 secondes ;
reprise après coupure ; remise automatique à l'expiration ; mobile d'abord, léger, accessible au clavier et aux lecteurs d'écran.
Aucune surveillance (ni caméra ni suivi du navigateur). Ordre des questions et options mélangé si activé.
E-mail d'envoi du test (Resend) et rappel. Passage automatique à ASSESSMENT_SENT puis ASSESSMENT_DONE, avec historique.
Tests : jeton expiré, déjà utilisé, coupure de connexion, remise à l'expiration. Rapport, puis arrêt.
```

### Étape E4 — Notation manuelle et suggestions
```
Préambule commun. Lis STRATOS_PRD_V2.md section 4.2. Étape E4.
Écran de notation des questions texte (réponse, consigne, points, commentaire). Calcul du total, du pourcentage, des sous-scores par
compétence et de la suggestion. Tant que des questions texte ne sont pas notées : résultat « incomplet ». Journalise la notation.
Notification au consultant à la remise d'un test. Réouverture d'une tentative par un consultant (motif, journal d'audit).
Rapport, puis arrêt.
```

### Étape E5 — Validation et tri
```
Préambule commun. Lis STRATOS_PRD_V2.md section 5. Étape E5.
Écran /admin/offres/[id]/evalues : tableau avec pourcentage, sous-scores, état de la notation, compétences requises couvertes
(calcul explicable), disponibilité, statut, suggestion ; tri et filtres combinables ; actions en lot (valider, à revoir, entretien RH,
refuser avec motif obligatoire choisi dans une liste). Le classement par pourcentage n'est jamais le seul critère affiché.
Règle : PRESENTED exige VALIDATED, sauf dérogation avec motif. Le système n'effectue aucun refus. Historique complet. Rapport, puis arrêt.
```

### Étape E6 — QA des évaluations
```
Préambule commun. Étape E6. Exécute et documente une matrice de tests : création et association d'une évaluation, passage complet
sur mobile, coupure de connexion, expiration, jeton réutilisé, notation manuelle, calculs vérifiés à la main sur 3 exemples,
validation en lot, refus avec motif, tentative d'accès croisé entre cabinets (relance npm run test:isolation), accessibilité clavier.
Résultats réels : réussi, échoué, non testé. Corrige les échecs. Rapport, puis arrêt.
```

**Porte G2 :** démonstration à Stratos avec des données **fictives** avant d'utiliser de vraies données.

---

## 4. Phase 6 — Shortlist et rendez-vous (V2)

### Étape S1 — Shortlist et consentement du candidat
```
Préambule commun. Lis STRATOS_PRD_V2.md section 6. Étape S1.
Modèles Shortlist et ShortlistItem (agencyId, migration décrite puis validée). Constructeur côté consultant : sélection de candidats
VALIDATED, résumé, options (résultat du test, sous-scores, CV). Demande de consentement au candidat (portail et e-mail) ; sans
consentement GRANTED, un candidat ne peut pas être envoyé. Envoi de la shortlist = notification au client. Anonymisation avant
intérêt selon le réglage du cabinet : aucune coordonnée visible du client. Passage à PRESENTED à l'envoi. Rapport, puis arrêt.
```

### Étape S2 — Portail client : dossiers et décisions
```
Préambule commun. Étape S2. Pages /client/offres/[id]/shortlist et /client/dossiers/[id] : résumé, compétences, résultat du test
si autorisé, CV par lien signé si autorisé. Trois actions : « Je souhaite rencontrer », « Pas pour ce poste » (motif en liste),
« J'ai besoin d'informations » (message). Les commentaires du client ne sont visibles que des consultants. Le client ne voit que
ses offres et ses dossiers (relance le test d'isolation). Notification au consultant à chaque décision. Rapport, puis arrêt.
```

### Étape S3 — Créneaux et choix par le candidat
```
Préambule commun. Lis STRATOS_PRD_V2.md section 7. Étape S3.
Modèles InterviewProposal, InterviewSlot, Interview (migration décrite puis validée). Le client (ou le consultant pour lui) propose
1 à 5 créneaux ; le candidat en choisit un depuis son portail ou /rdv/[token] (jeton haché, expiration, limitation de débit).
Tout est stocké en UTC ; affichage dans le fuseau du cabinet (défaut Africa/Abidjan). Refus des chevauchements pour un même candidat.
Passage à INTERVIEW_REQUESTED puis INTERVIEW_SCHEDULED avec historique. Tests : créneau déjà pris, jeton expiré, fuseaux. Rapport, puis arrêt.
```

### Étape S4 — Confirmations, rappels, reports, résultats
```
Préambule commun. Étape S4.
E-mails de confirmation avec fichier calendrier (.ics, identifiant stable). Report et annulation par n'importe quelle partie avec motif.
Rappels 24 h et 2 h avant : vérifie d'abord les limites des tâches planifiées du plan Vercel choisi, propose le mécanisme le plus
simple et attends ma validation si un nouveau service est nécessaire. NotificationLog pour chaque envoi (un échec n'efface aucune donnée).
Enregistrement du résultat par le consultant : tenu, absence du candidat, absence du client ; passage à CLIENT_INTERVIEW sur confirmation.
Rapport, puis arrêt.
```

### Étape S5 — Agenda et indicateurs
```
Préambule commun. Lis STRATOS_PRD_V2.md section 13. Étape S5.
Page /admin/rendez-vous (liste et vue calendrier, filtres, absences) ; journal des notifications consultable ; indicateurs du cabinet :
délai médian offre → première shortlist, taux de tests terminés, délai médian de passage, taux de présence aux entretiens,
placements. Chiffres calculés à partir de la base, aucun chiffre factice. Rapport, puis arrêt.
```

### Étape S6 — QA shortlist, rendez-vous et sécurité
```
Préambule commun. Étape S6. Matrice : consentement refusé, anonymisation (aucune coordonnée visible), lien de CV expiré, décision client,
créneaux concurrents, fuseaux, rappel envoyé une seule fois, annulation, absence, jetons falsifiés ou rejoués, accès croisé entre cabinets
(relance npm run test:isolation), limitation de débit. Résultats réels : réussi, échoué, non testé. Corrige. Rapport, puis arrêt.
```

---

## 5. Phase 7 — Produit multi-cabinets (V3)

### Étape P1 — Administration de la plateforme et réglages du cabinet
```
Préambule commun. Lis STRATOS_PRD_V2.md sections 2 et 9. Étape P1.
Espace /platform (PLATFORM_ADMIN) : créer un cabinet, inviter son administrateur par e-mail (jeton haché), suspendre ou réactiver.
Un cabinet suspendu ne peut plus se connecter. Aucune lecture des données candidats par ce rôle.
Page /admin/parametres : fuseau, nom d'expéditeur, palette prévalidée, logo, affichage du score au candidat, anonymisation,
durée de conservation, modèles de messages. Rapport, puis arrêt.
```

### Étape P2 — Utilisateurs, permissions et journal d'audit
```
Préambule commun. Étape P2. Gestion des utilisateurs du cabinet par l'AGENCY_ADMIN (invitation, changement de rôle, désactivation avec
incrémentation de tokenVersion). Matrice de permissions AGENCY_ADMIN et CONSULTANT appliquée côté serveur et testée.
Page /admin/journal : événements d'audit filtrables (ouverture de CV, exports, changements de rôle, réouverture de test, suppressions).
Rapport, puis arrêt.
```

### Étape P3 — Droits des personnes et conservation
```
Préambule commun. Lis STRATOS_PRD_V2.md section 11. Étape P3.
Outils d'administration : export des données d'un candidat, anonymisation, suppression complète (y compris les fichiers chez
Cloudinary), journalisés. Tâche de conservation : propose les candidats et réponses de tests qui dépassent la durée du cabinet ;
l'effacement exige une confirmation d'un administrateur. Pages d'information (notice candidat, politique de confidentialité) sous forme de
modèles à compléter et à faire relire par un juriste ; n'invente aucune information légale. Rapport, puis arrêt.
```

### Étape P4 — Démonstration et instrumentation du pilote
```
Préambule commun. Lis STRATOS_PRD_V2.md section 13. Étape P4.
Cabinet « Démonstration » rempli de données fictives crédibles (offres, tests, shortlists, rendez-vous) avec un script de remise à zéro
réservé au développement. Événements d'instrumentation sans contenu sensible. Tableau de bord des indicateurs du pilote.
Aucune donnée réelle. Rapport, puis arrêt.
```

### Étape P5 — Production et préparation du pilote
```
Préambule commun. Étape P5 : reprends les étapes 15 et 16 de la v1 en les adaptant : variables de production distinctes, branche Neon
de production, migrations appliquées de façon contrôlée, première création du compte PLATFORM_ADMIN par un script unique, plan de
sauvegarde logique (l'historique de restauration gratuit de Neon est court), CSP, journaux, test de fumée, README sans aucun secret.
Rapport, puis arrêt.
```

---

## 6. Portes de passage

| Porte | Condition |
|---|---|
| **G1** (après T1) | Tests d'isolation tous verts. Aucune donnée réelle avant cette porte |
| **G2** (après E5) | Démonstration à Stratos avec des données fictives ; retours consignés |
| **G3** (avant tout pilote avec données réelles) | Avis d'un juriste sur le traitement des données (section 11 du PRD), accord de traitement des données signé, accord de propriété avec Stratos, durées de conservation arrêtées |
| **G4** (avant de présenter à d'autres cabinets) | Au moins 5 entretiens menés (guide `STRATOS_ENTRETIENS_RECRUTEURS.md`) et un pilote Stratos mesuré |

## 7. Ordre global

0 → 1' → 2' → 3 → 4 → 5 → 6' → 7 → 8 → **T1** → E1 → E2 → E3 → E4 → E5 → E6 → S1 → S2 → S3 → S4 → S5 → S6 → P1 → P2 → P3 → P4 → P5 (les étapes 9 à 14 de la v1 se glissent avant E1 si le portail client et le tableau de bord sont nécessaires plus tôt). Les durées ne sont pas estimées ici : à chiffrer après la porte G1.
