CREATE TYPE "GovernedCaseLifecycle" AS ENUM (
  'DISCOVERY',
  'ASSESSING',
  'AWAITING_REVIEW',
  'READY',
  'BLOCKED',
  'CLOSED'
);

CREATE TABLE "governed_cases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "case_type" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "subject" JSONB NOT NULL,
  "domain_state" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "governed_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governed_cases_revision_positive_check"
    CHECK ("revision" > 0),
  CONSTRAINT "governed_cases_snapshot_hash_check"
    CHECK ("snapshot_hash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "governed_cases_schema_version_nonempty_check"
    CHECK (length("schema_version") > 0),
  CONSTRAINT "governed_cases_case_type_nonempty_check"
    CHECK (length("case_type") > 0),
  CONSTRAINT "governed_cases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "governed_cases_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "governed_cases_id_scope_key"
  ON "governed_cases"("id", "tenant_id", "workspace_id");

CREATE INDEX "governed_cases_scope_type_lifecycle_updated_idx"
  ON "governed_cases"(
    "tenant_id",
    "workspace_id",
    "case_type",
    "lifecycle",
    "updated_at"
  );

CREATE TABLE "governed_case_revisions" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "from_lifecycle" "GovernedCaseLifecycle",
  "to_lifecycle" "GovernedCaseLifecycle" NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_ref" TEXT,
  "transition_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "governed_case_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "governed_case_revisions_revision_positive_check"
    CHECK ("revision" > 0),
  CONSTRAINT "governed_case_revisions_snapshot_hash_check"
    CHECK ("snapshot_hash" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "governed_case_revisions_actor_type_nonempty_check"
    CHECK (length("actor_type") > 0),
  CONSTRAINT "governed_case_revisions_transition_code_nonempty_check"
    CHECK (length("transition_code") > 0),
  CONSTRAINT "governed_case_revisions_case_scope_fkey"
    FOREIGN KEY ("case_id", "tenant_id", "workspace_id")
    REFERENCES "governed_cases"("id", "tenant_id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "governed_case_revisions_case_revision_key"
  ON "governed_case_revisions"("case_id", "revision");

CREATE INDEX "governed_case_revisions_scope_case_created_idx"
  ON "governed_case_revisions"(
    "tenant_id",
    "workspace_id",
    "case_id",
    "created_at"
  );

CREATE OR REPLACE FUNCTION governed_case_revisions_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governed_case_revisions is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governed_case_revisions_append_only
BEFORE UPDATE OR DELETE ON "governed_case_revisions"
FOR EACH ROW EXECUTE FUNCTION governed_case_revisions_append_only();
