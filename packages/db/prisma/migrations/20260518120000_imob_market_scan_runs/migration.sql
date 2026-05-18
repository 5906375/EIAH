CREATE TABLE IF NOT EXISTS "imob_market_scan_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "case_id" TEXT,
  "query" JSONB NOT NULL,
  "region" TEXT,
  "operation" TEXT,
  "property_type" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "access_mode" TEXT,
  "source_ids" JSONB NOT NULL,
  "terms_mode" TEXT,
  "query_hash" TEXT NOT NULL,
  "evidence_bundle_id" TEXT,
  "result_snapshot" JSONB,
  "recommendation_id" TEXT,
  "opportunity_id" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_market_scan_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_market_scan_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_market_scan_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_market_scan_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "imob_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "imob_market_scan_runs_tenant_workspace_requested_at_idx" ON "imob_market_scan_runs"("tenant_id", "workspace_id", "requested_at");
CREATE INDEX IF NOT EXISTS "imob_market_scan_runs_tenant_workspace_status_idx" ON "imob_market_scan_runs"("tenant_id", "workspace_id", "status");
CREATE INDEX IF NOT EXISTS "imob_market_scan_runs_case_id_idx" ON "imob_market_scan_runs"("case_id");
CREATE INDEX IF NOT EXISTS "imob_market_scan_runs_query_hash_idx" ON "imob_market_scan_runs"("query_hash");
