-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('success', 'error', 'blocked');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_quotas" (
    "projectId" TEXT NOT NULL,
    "softLimitCents" INTEGER NOT NULL,
    "hardLimitCents" INTEGER NOT NULL,
    "monthUsageCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_quotas_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "pricing" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "perRunCents" INTEGER NOT NULL DEFAULT 0,
    "perMBcents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_tx" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_tx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "runs_projectId_agent_createdAt_idx" ON "runs"("projectId", "agent", "createdAt");

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE INDEX "runs_costCents_idx" ON "runs"("costCents");

-- CreateIndex
CREATE INDEX "pricing_agent_active_idx" ON "pricing"("agent", "active");

-- CreateIndex
CREATE INDEX "payment_tx_projectId_createdAt_idx" ON "payment_tx"("projectId", "createdAt");
