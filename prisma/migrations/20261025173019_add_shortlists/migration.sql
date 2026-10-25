-- CreateEnum
CREATE TYPE "ShortlistStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ClientDecision" AS ENUM ('INTERESTED', 'NOT_FOR_THIS_ROLE', 'NEEDS_INFO');

-- CreateTable
CREATE TABLE "Shortlist" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "jobOfferId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" "ShortlistStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistItem" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "shortlistId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "summary" TEXT,
    "showTestResult" BOOLEAN NOT NULL DEFAULT true,
    "showSubscores" BOOLEAN NOT NULL DEFAULT true,
    "cvShared" BOOLEAN NOT NULL DEFAULT true,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentAt" TIMESTAMP(3),
    "clientDecision" "ClientDecision",
    "clientReason" TEXT,
    "clientDecidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shortlist_agencyId_idx" ON "Shortlist"("agencyId");

-- CreateIndex
CREATE INDEX "Shortlist_jobOfferId_idx" ON "Shortlist"("jobOfferId");

-- CreateIndex
CREATE INDEX "Shortlist_status_idx" ON "Shortlist"("status");

-- CreateIndex
CREATE INDEX "ShortlistItem_agencyId_idx" ON "ShortlistItem"("agencyId");

-- CreateIndex
CREATE INDEX "ShortlistItem_shortlistId_idx" ON "ShortlistItem"("shortlistId");

-- CreateIndex
CREATE INDEX "ShortlistItem_applicationId_idx" ON "ShortlistItem"("applicationId");

-- CreateIndex
CREATE INDEX "ShortlistItem_consentStatus_idx" ON "ShortlistItem"("consentStatus");

-- CreateIndex
CREATE INDEX "ShortlistItem_clientDecision_idx" ON "ShortlistItem"("clientDecision");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistItem_shortlistId_applicationId_key" ON "ShortlistItem"("shortlistId", "applicationId");

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shortlist" ADD CONSTRAINT "Shortlist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_shortlistId_fkey" FOREIGN KEY ("shortlistId") REFERENCES "Shortlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
