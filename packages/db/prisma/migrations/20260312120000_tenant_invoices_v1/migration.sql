-- Tenant invoices (monthly snapshot)

CREATE TABLE IF NOT EXISTS "tenant_invoices" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "plan_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "base_price_cents" INTEGER NOT NULL,
  "included_runs" INTEGER NOT NULL,
  "included_users" INTEGER NOT NULL,
  "runs_count" INTEGER NOT NULL DEFAULT 0,
  "users_count" INTEGER NOT NULL DEFAULT 0,
  "run_overage" INTEGER NOT NULL DEFAULT 0,
  "user_overage" INTEGER NOT NULL DEFAULT 0,
  "run_overage_cents" INTEGER NOT NULL DEFAULT 0,
  "user_overage_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_invoice_period_unique"
  ON "tenant_invoices"("tenant_id", "period_start", "period_end");

CREATE INDEX IF NOT EXISTS "tenant_invoices_tenant_period_idx"
  ON "tenant_invoices"("tenant_id", "period_start", "period_end");
