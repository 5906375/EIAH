ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archive_ref" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "runs_archive_ref_key"
ON "runs"("archive_ref");

CREATE INDEX IF NOT EXISTS "runs_archived_at_idx"
ON "runs"("archived_at");

CREATE TABLE IF NOT EXISTS "run_archives" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "archive_ref" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "run_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "run_archives_run_id_key"
ON "run_archives"("run_id");

CREATE UNIQUE INDEX IF NOT EXISTS "run_archives_archive_ref_key"
ON "run_archives"("archive_ref");

CREATE INDEX IF NOT EXISTS "run_archives_tenant_workspace_archived_at_idx"
ON "run_archives"("tenant_id", "workspace_id", "archived_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_archives_run_id_fkey'
  ) THEN
    ALTER TABLE "run_archives"
    ADD CONSTRAINT "run_archives_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_archives_tenant_id_fkey'
  ) THEN
    ALTER TABLE "run_archives"
    ADD CONSTRAINT "run_archives_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'run_archives_workspace_id_fkey'
  ) THEN
    ALTER TABLE "run_archives"
    ADD CONSTRAINT "run_archives_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
