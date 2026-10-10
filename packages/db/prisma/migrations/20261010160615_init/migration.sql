-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLAYER', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('TRAINING', 'PRIZE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'AWAITING_FUNDING', 'ACTIVE', 'CLOSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RuleId" AS ENUM ('DOUBLE_DIP', 'WRONG_POCKET', 'GHOST_ORDER');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('ACTIVE', 'WON', 'LOST', 'EXPIRED', 'MODEL_ERROR', 'ABORTED');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CONFIRMED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "RegressionMode" AS ENUM ('ACTION_REPLAY', 'AGENT_RERUN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "wallet" TEXT,
    "displayName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "nonce" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "blurb" TEXT NOT NULL DEFAULT '',
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL DEFAULT 'medium',
    "instructions" TEXT NOT NULL,
    "guards" JSONB NOT NULL,
    "seedOptions" JSONB NOT NULL DEFAULT '{}',
    "engineVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "isTraining" BOOLEAN NOT NULL DEFAULT false,
    "parentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "CampaignKind" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "organizerId" UUID,
    "agentVersionId" UUID NOT NULL,
    "configHash" TEXT,
    "maxMessages" INTEGER NOT NULL DEFAULT 10,
    "maxToolCalls" INTEGER NOT NULL DEFAULT 20,
    "maxDurationSec" INTEGER NOT NULL DEFAULT 300,
    "runBudgetMicros" INTEGER NOT NULL DEFAULT 250000,
    "totalBudgetMicros" BIGINT NOT NULL DEFAULT 50000000,
    "spentMicros" BIGINT NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "submissionsCloseAt" TIMESTAMP(3),
    "payoutDeadlineAt" TIMESTAMP(3),
    "cluster" TEXT,
    "programId" TEXT,
    "onchainAddress" TEXT,
    "vaultAddress" TEXT,
    "verifierPubkey" TEXT,
    "fundTxSignature" TEXT,
    "fundedLamports" BIGINT,
    "refundTxSignature" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "rule" "RuleId" NOT NULL,
    "ruleIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "rewardLamports" BIGINT NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "agentVersionId" UUID NOT NULL,
    "userId" UUID,
    "guestKey" TEXT,
    "wallet" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'ACTIVE',
    "seedState" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "conversation" JSONB NOT NULL DEFAULT '[]',
    "nextEventSeq" INTEGER NOT NULL DEFAULT 1,
    "opSeq" INTEGER NOT NULL DEFAULT 0,
    "playerMessages" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "busy" BOOLEAN NOT NULL DEFAULT false,
    "endReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" BIGSERIAL NOT NULL,
    "runId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientMsgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "rule" "RuleId" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'PENDING',
    "decisiveSeq" INTEGER,
    "paidMinor" INTEGER,
    "refundedMinor" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "proof" JSONB,
    "proofHash" TEXT,
    "otherViolations" JSONB NOT NULL DEFAULT '[]',
    "winnerWallet" TEXT,
    "rejectionReason" TEXT,
    "addedToRegression" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardSlot" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "winnerFindingId" UUID,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "RewardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "ruleIndex" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "txSignature" TEXT,
    "claimAddress" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRun" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "targetAgentVersionId" UUID NOT NULL,
    "mode" "RegressionMode" NOT NULL,
    "repeats" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "results" JSONB,
    "summary" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RegressionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wallet_key" ON "User"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_slug_key" ON "AgentVersion"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_configHash_key" ON "AgentVersion"("configHash");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_onchainAddress_key" ON "Campaign"("onchainAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_campaignId_rule_key" ON "Mission"("campaignId", "rule");

-- CreateIndex
CREATE INDEX "Run_campaignId_status_idx" ON "Run"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Run_userId_idx" ON "Run"("userId");

-- CreateIndex
CREATE INDEX "Run_guestKey_idx" ON "Run"("guestKey");

-- CreateIndex
CREATE UNIQUE INDEX "RunEvent_runId_seq_key" ON "RunEvent"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RunEvent_runId_clientMsgId_key" ON "RunEvent"("runId", "clientMsgId");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_runId_key" ON "Finding"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardSlot_missionId_key" ON "RewardSlot"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardSlot_winnerFindingId_key" ON "RewardSlot"("winnerFindingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_findingId_key" ON "Payout"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_code_key" ON "Achievement"("userId", "code");

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_agentVersionId_fkey" FOREIGN KEY ("agentVersionId") REFERENCES "AgentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardSlot" ADD CONSTRAINT "RewardSlot_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardSlot" ADD CONSTRAINT "RewardSlot_winnerFindingId_fkey" FOREIGN KEY ("winnerFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRun" ADD CONSTRAINT "RegressionRun_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRun" ADD CONSTRAINT "RegressionRun_targetAgentVersionId_fkey" FOREIGN KEY ("targetAgentVersionId") REFERENCES "AgentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active attempt per wallet (and per guest session) at a time.
CREATE UNIQUE INDEX "Run_one_active_per_wallet" ON "Run" ("wallet") WHERE "status" = 'ACTIVE' AND "wallet" IS NOT NULL;
CREATE UNIQUE INDEX "Run_one_active_per_guest" ON "Run" ("guestKey") WHERE "status" = 'ACTIVE' AND "guestKey" IS NOT NULL;
