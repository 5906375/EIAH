/*
  Warnings:

  - You are about to drop the column `idempotency_key` on the `guardrail_ledger` table. All the data in the column will be lost.
  - You are about to drop the column `is_system_fault` on the `guardrail_ledger` table. All the data in the column will be lost.
  - You are about to drop the column `usage_count` on the `guardrail_ledger` table. All the data in the column will be lost.
  - Made the column `critical_hash` on table `guardrail_ledger` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "guardrail_ledger_action_type_timestamp_idx";

-- DropIndex
DROP INDEX "guardrail_ledger_tenant_id_action_type_idempotency_key_key";

-- Backup existing guardrail_ledger rows before dropping columns
CREATE TABLE "guardrail_ledger_backup_20260119125244" AS
SELECT * FROM "guardrail_ledger";

-- Backfill critical_hash for existing rows before enforcing NOT NULL
UPDATE "guardrail_ledger"
SET "critical_hash" = md5(
  coalesce("tx_id", '') || ':' ||
  coalesce("action_type", '') || ':' ||
  coalesce("tenant_id", '') || ':' ||
  coalesce("timestamp"::text, '')
)
WHERE "critical_hash" IS NULL;

-- AlterTable
ALTER TABLE "guardrail_ledger" DROP COLUMN "idempotency_key",
DROP COLUMN "is_system_fault",
DROP COLUMN "usage_count",
ADD COLUMN     "payload_hash" TEXT,
ADD COLUMN     "risk_score" DOUBLE PRECISION,
ADD COLUMN     "run_id" TEXT,
ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signature_key_id" TEXT,
ADD COLUMN     "signed_at" TIMESTAMP(3),
ADD COLUMN     "trust_score" DOUBLE PRECISION,
ALTER COLUMN "critical_hash" SET NOT NULL;

-- CreateIndex
CREATE INDEX "guardrail_ledger_tenant_id_tx_id_idx" ON "guardrail_ledger"("tenant_id", "tx_id");

-- CreateIndex
CREATE INDEX "guardrail_ledger_tenant_id_critical_hash_idx" ON "guardrail_ledger"("tenant_id", "critical_hash");

-- AddForeignKey
ALTER TABLE "guardrail_ledger" ADD CONSTRAINT "guardrail_ledger_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
