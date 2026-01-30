-- AlterTable
ALTER TABLE "guardrail_ledger" ADD COLUMN     "critical_hash" TEXT,
ADD COLUMN     "is_system_fault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tx_id" TEXT;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "tx_id" TEXT;
