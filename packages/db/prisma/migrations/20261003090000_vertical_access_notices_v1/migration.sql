-- ADR-011 §2.4 (PR 2c-2): canal de cada mudança na auditoria e fila de avisos independente de canal.
-- O aviso guarda só o estado da liberação: nunca score, sinais de billing ou a observação do administrador.
ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "channel" TEXT;

CREATE TABLE IF NOT EXISTS "vertical_access_notices" (
  "id" TEXT NOT NULL,
  "approval_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "vertical" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vertical_access_notices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vertical_access_notices_scope_idx"
  ON "vertical_access_notices"("tenant_id", "workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "vertical_access_notice_reads" (
  "notice_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vertical_access_notice_reads_pkey" PRIMARY KEY ("notice_id", "user_id")
);
