-- DLT compliance gate: ensure SCL ledger exists and can store signature metadata.

-- Create base SCL ledger table if it doesn't exist yet.
CREATE TABLE IF NOT EXISTS "scl_ledger" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "run_id" TEXT NOT NULL,
  "critical_hash" TEXT NOT NULL,
  "tx_id" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scl_ledger_pkey" PRIMARY KEY ("id")
);

-- Add signature/custody metadata (idempotent).
ALTER TABLE "scl_ledger"
  ADD COLUMN IF NOT EXISTS "signature" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_alg" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_key_id" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_nonce" TEXT,
  ADD COLUMN IF NOT EXISTS "tenant_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3);

-- Constraints / indexes (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scl_ledger_tx_id_key'
  ) THEN
    ALTER TABLE "scl_ledger" ADD CONSTRAINT "scl_ledger_tx_id_key" UNIQUE ("tx_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scl_ledger_tenant_id_fkey'
  ) THEN
    ALTER TABLE "scl_ledger"
      ADD CONSTRAINT "scl_ledger_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scl_ledger_workspace_id_fkey'
  ) THEN
    ALTER TABLE "scl_ledger"
      ADD CONSTRAINT "scl_ledger_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "scl_ledger_tenant_id_created_at_idx" ON "scl_ledger" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "scl_ledger_run_id_idx" ON "scl_ledger" ("run_id");
CREATE INDEX IF NOT EXISTS "scl_ledger_tenant_id_signed_at_idx" ON "scl_ledger" ("tenant_id", "signed_at");
