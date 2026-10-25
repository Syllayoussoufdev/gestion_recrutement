# Plateforme de Recrutement Multi-Cabinets (Stratos Conseil)

Plateforme web privée multi-cabinets et multi-rôles permettant de centraliser le cycle complet de recrutement : sourcing, évaluations à barème, validation humaine, soumission de shortlists avec consentement candidat, prise de rendez-vous et suivi client.

## Stack technique (figée à l'Étape 0)

- **Framework** : Next.js `15.5.28` (App Router) + React `19.3.1`
- **Langage** : TypeScript `5.9.3` (mode `strict`)
- **Base de données & ORM** : PostgreSQL (Neon Serverless) + Prisma `6.19.3`
- **Styles & UI** : Tailwind CSS `4.3.3` + `shadcn/ui` (espace `/admin` et `/platform` uniquement)
- **Authentification** : `jose` `6.2.13` (JWT signé HS256 dans cookie `HttpOnly`, `Secure`, `SameSite=Lax` + `tokenVersion`) & `bcryptjs` `3.0.3`
- **Validation** : `zod` `3.25.76`
- **Stockage de documents** : Cloudinary `2.11.0` (mode privé `authenticated` + liens signés temporaires)
- **Emails transactionnels** : Resend `6.34.1`

## Démarrage rapide

1. **Installer les dépendances** :
   ```bash
   npm install
   ```

2. **Configurer les variables d'environnement** :
   Copier `.env.example` vers `.env.local` et renseigner les identifiants de la branche `dev` de Neon PostgreSQL ainsi que les clés Cloudinary et Resend.

3. **Vérifier le typage TypeScript** :
   ```bash
   npx tsc --noEmit
   ```

4. **Lancer le serveur de développement** :
   ```bash
   npm run dev
   ```
