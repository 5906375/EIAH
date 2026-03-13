DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RunApprovalStatus') THEN
    CREATE TYPE "RunApprovalStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "approval_status" "RunApprovalStatus" NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "approved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
