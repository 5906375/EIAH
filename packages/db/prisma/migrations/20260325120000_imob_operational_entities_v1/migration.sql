CREATE TABLE IF NOT EXISTS "imob_owners" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "person_type" TEXT NOT NULL DEFAULT 'person',
  "status" TEXT NOT NULL DEFAULT 'pending_data',
  "pending_items" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_owners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_owners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_owners_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "imob_properties" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "owner_id" TEXT,
  "property_type" TEXT,
  "goal" TEXT,
  "address" TEXT,
  "city" TEXT,
  "neighborhood" TEXT,
  "bedrooms" INTEGER,
  "bathrooms" INTEGER,
  "area_m2" INTEGER,
  "garage_spots" INTEGER,
  "asking_price_cents" INTEGER,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_data',
  "pending_items" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_properties_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_properties_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "imob_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "imob_leads" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "goal" TEXT,
  "target_city" TEXT,
  "target_neighborhood" TEXT,
  "budget_max_cents" INTEGER,
  "stage" TEXT NOT NULL DEFAULT 'incomplete',
  "temperature" TEXT NOT NULL DEFAULT 'incomplete',
  "pending_items" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "imob_cases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "thread_id" TEXT,
  "flow" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "owner_responsible" TEXT,
  "next_step" TEXT,
  "blockers" JSONB,
  "pending_items" JSONB,
  "owner_id" TEXT,
  "property_id" TEXT,
  "lead_id" TEXT,
  "external_deal_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_cases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_cases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "imob_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "imob_cases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "imob_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "imob_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "imob_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "imob_case_events" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT,
  "type" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_ref" TEXT,
  "summary" TEXT NOT NULL,
  "evidence_ref" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imob_case_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "imob_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "imob_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "imob_case_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_case_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "imob_case_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "imob_owners_tenant_workspace_created_at_idx" ON "imob_owners"("tenant_id", "workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_owners_tenant_workspace_status_idx" ON "imob_owners"("tenant_id", "workspace_id", "status");
CREATE INDEX IF NOT EXISTS "imob_properties_tenant_workspace_created_at_idx" ON "imob_properties"("tenant_id", "workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_properties_tenant_workspace_status_idx" ON "imob_properties"("tenant_id", "workspace_id", "status");
CREATE INDEX IF NOT EXISTS "imob_properties_owner_id_idx" ON "imob_properties"("owner_id");
CREATE INDEX IF NOT EXISTS "imob_leads_tenant_workspace_created_at_idx" ON "imob_leads"("tenant_id", "workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_leads_tenant_workspace_stage_idx" ON "imob_leads"("tenant_id", "workspace_id", "stage");
CREATE INDEX IF NOT EXISTS "imob_leads_tenant_workspace_temperature_idx" ON "imob_leads"("tenant_id", "workspace_id", "temperature");
CREATE INDEX IF NOT EXISTS "imob_cases_tenant_workspace_created_at_idx" ON "imob_cases"("tenant_id", "workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_cases_tenant_workspace_flow_status_idx" ON "imob_cases"("tenant_id", "workspace_id", "flow", "status");
CREATE INDEX IF NOT EXISTS "imob_cases_tenant_workspace_stage_idx" ON "imob_cases"("tenant_id", "workspace_id", "stage");
CREATE INDEX IF NOT EXISTS "imob_cases_thread_id_idx" ON "imob_cases"("thread_id");
CREATE INDEX IF NOT EXISTS "imob_cases_owner_id_idx" ON "imob_cases"("owner_id");
CREATE INDEX IF NOT EXISTS "imob_cases_property_id_idx" ON "imob_cases"("property_id");
CREATE INDEX IF NOT EXISTS "imob_cases_lead_id_idx" ON "imob_cases"("lead_id");
CREATE INDEX IF NOT EXISTS "imob_case_events_case_id_created_at_idx" ON "imob_case_events"("case_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_case_events_tenant_workspace_created_at_idx" ON "imob_case_events"("tenant_id", "workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "imob_case_events_run_id_idx" ON "imob_case_events"("run_id");
