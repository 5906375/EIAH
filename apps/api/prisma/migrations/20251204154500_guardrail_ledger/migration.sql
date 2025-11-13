CREATE TABLE "guardrail_ledger" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guardrail_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardrail_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guardrail_ledger_tenant_id_action_type_idempotency_key_key"
  ON "guardrail_ledger"("tenant_id", "action_type", "idempotency_key");

CREATE INDEX "guardrail_ledger_action_type_timestamp_idx"
  ON "guardrail_ledger"("action_type", "timestamp");
