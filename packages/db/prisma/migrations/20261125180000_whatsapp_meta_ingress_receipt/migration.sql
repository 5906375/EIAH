-- REVIEW ONLY (8.9.2): not authorization to apply to a real database.
-- No domain foreign keys, payload, phone, content, signature or credentials.
CREATE TABLE "WhatsappMetaIngressReceipt" (
    "tenantId" VARCHAR(160) NOT NULL,
    "workspaceId" VARCHAR(160) NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "eventKey" CHAR(64) NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WhatsappMetaIngressReceipt_pkey" PRIMARY KEY ("tenantId", "workspaceId", "eventKey"),
    CONSTRAINT "WhatsappMetaIngressReceipt_scope_check" CHECK ("scope" = 'whatsapp:inbound:read_only'),
    CONSTRAINT "WhatsappMetaIngressReceipt_hash_check" CHECK ("eventKey" ~ '^[a-f0-9]{64}$' AND "digest" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "WhatsappMetaIngressReceipt_expiry_check" CHECK ("expiresAt" > "receivedAt")
);
CREATE INDEX "WhatsappMetaIngressReceipt_expiresAt_idx" ON "WhatsappMetaIngressReceipt"("expiresAt");
