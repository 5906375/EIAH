-- Sprint 2: Economy Base (P1-201..P1-203)
-- PaymentIntent + webhook idempotency storage (raw SQL model used by API).

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT,
  "request_id" TEXT NOT NULL,
  "external_id" TEXT,
  "settlement_receipt" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_intents_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_intents_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_tenant_request_unique"
  ON "payment_intents"("tenant_id", "request_id");

CREATE INDEX IF NOT EXISTS "payment_intents_tenant_workspace_status_idx"
  ON "payment_intents"("tenant_id", "workspace_id", "status");

CREATE INDEX IF NOT EXISTS "payment_intents_provider_status_idx"
  ON "payment_intents"("provider", "status");

CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "payment_intent_id" TEXT,
  "tenant_id" TEXT,
  "workspace_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "signature_hash" TEXT,
  "payload_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_payment_intent_fkey"
    FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_events_provider_event_unique"
  ON "billing_webhook_events"("provider", "event_id");

CREATE INDEX IF NOT EXISTS "billing_webhook_events_tenant_created_idx"
  ON "billing_webhook_events"("tenant_id", "created_at");

