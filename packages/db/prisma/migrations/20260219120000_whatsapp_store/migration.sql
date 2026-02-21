CREATE TABLE IF NOT EXISTS "whatsapp_opt_in" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "phone_e164" TEXT NOT NULL,
  "opted_in" BOOLEAN NOT NULL DEFAULT true,
  "source" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "whatsapp_opt_in_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_whatsapp_opt_in_lookup"
  ON "whatsapp_opt_in" ("tenant_id", "workspace_id", "phone_e164", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "whatsapp_message_log" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "phone_e164" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "context_json" JSONB,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "provider_payload_json" JSONB,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_message_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_message_log_message_id_key"
  ON "whatsapp_message_log" ("message_id");

CREATE INDEX IF NOT EXISTS "idx_whatsapp_message_lookup"
  ON "whatsapp_message_log" ("tenant_id", "workspace_id", "phone_e164", "sent_at" DESC);

