-- AlterTable
ALTER TABLE "run_execution_locks"
ADD COLUMN     "holder_id" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill holders for existing rows
UPDATE "run_execution_locks" SET "holder_id" = 'unknown' WHERE "holder_id" IS NULL;
