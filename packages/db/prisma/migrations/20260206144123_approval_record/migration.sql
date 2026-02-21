-- CreateEnum
CREATE TYPE "approval_decision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "approval_records" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "decision" "approval_decision" NOT NULL,
    "reason" TEXT,
    "policy_id" TEXT,
    "policy_version" TEXT NOT NULL,
    "required_min_trust" DOUBLE PRECISION,
    "approver_trust" DOUBLE PRECISION NOT NULL,
    "intent_hash" TEXT NOT NULL,
    "plan_hash" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "payload_hash" TEXT NOT NULL,
    "scl_signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_records_run_id_attempt_key" ON "approval_records"("run_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_records_run_id_idempotency_key_key" ON "approval_records"("run_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "approval_records_tenant_id_run_id_idx" ON "approval_records"("tenant_id", "run_id");

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
