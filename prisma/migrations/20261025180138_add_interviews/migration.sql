-- CreateEnum
CREATE TYPE "InterviewProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('VISIO', 'PHONE', 'ONSITE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW_CANDIDATE', 'NO_SHOW_CLIENT');

-- CreateTable
CREATE TABLE "InterviewProposal" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "proposedByRole" "Role" NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "InterviewProposalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "message" TEXT,
    "mode" "InterviewMode" NOT NULL DEFAULT 'VISIO',
    "locationOrLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isChosen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "proposalId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Abidjan',
    "mode" "InterviewMode" NOT NULL DEFAULT 'VISIO',
    "locationOrLink" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelReason" TEXT,
    "icsUid" TEXT NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "resultNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewProposal_tokenHash_key" ON "InterviewProposal"("tokenHash");

-- CreateIndex
CREATE INDEX "InterviewProposal_agencyId_idx" ON "InterviewProposal"("agencyId");

-- CreateIndex
CREATE INDEX "InterviewProposal_applicationId_idx" ON "InterviewProposal"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewProposal_tokenHash_idx" ON "InterviewProposal"("tokenHash");

-- CreateIndex
CREATE INDEX "InterviewProposal_status_idx" ON "InterviewProposal"("status");

-- CreateIndex
CREATE INDEX "InterviewSlot_agencyId_idx" ON "InterviewSlot"("agencyId");

-- CreateIndex
CREATE INDEX "InterviewSlot_proposalId_idx" ON "InterviewSlot"("proposalId");

-- CreateIndex
CREATE INDEX "InterviewSlot_startsAt_idx" ON "InterviewSlot"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_proposalId_key" ON "Interview"("proposalId");

-- CreateIndex
CREATE INDEX "Interview_agencyId_idx" ON "Interview"("agencyId");

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_status_idx" ON "Interview"("status");

-- CreateIndex
CREATE INDEX "Interview_startsAt_idx" ON "Interview"("startsAt");

-- AddForeignKey
ALTER TABLE "InterviewProposal" ADD CONSTRAINT "InterviewProposal_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewProposal" ADD CONSTRAINT "InterviewProposal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewProposal" ADD CONSTRAINT "InterviewProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "InterviewProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "InterviewProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
