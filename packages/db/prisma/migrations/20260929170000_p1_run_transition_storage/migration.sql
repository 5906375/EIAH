-- Additive storage only. No backfill, producer wiring, queue dispatch or source attestation.
-- Existing runs intentionally have no sequence-0 event and remain ineligible.
CREATE UNIQUE INDEX "runs_id_tenant_id_workspace_id_key"
  ON "runs"("id", "tenant_id", "workspace_id");

CREATE TABLE "run_state_transitions" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "previous_status" "RunStatus",
  "previous_finished_at" TIMESTAMP(3),
  "status" "RunStatus" NOT NULL,
  "finished_at" TIMESTAMP(3),
  "declared_at" TIMESTAMP(3) NOT NULL,
  "producer_id" TEXT NOT NULL,
  "operation_ref" TEXT NOT NULL,
  "command_digest" TEXT NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "run_state_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "run_state_transitions_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "run_state_transitions_version_check" CHECK ("schema_version" = 'p1-run-transition.v1'),
  CONSTRAINT "run_state_transitions_state_check" CHECK (
    ("status" IN ('success', 'error', 'blocked') AND "finished_at" IS NOT NULL)
    OR ("status" IN ('pending', 'running', 'awaiting_approval') AND "finished_at" IS NULL)
  ),
  CONSTRAINT "run_state_transitions_initial_check" CHECK (
    ("sequence" = 0 AND "previous_status" IS NULL AND "previous_finished_at" IS NULL)
    OR ("sequence" > 0 AND "previous_status" IS NOT NULL)
  ),
  CONSTRAINT "run_state_transitions_scope_fkey" FOREIGN KEY ("run_id", "tenant_id", "workspace_id")
    REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "run_state_transitions_run_id_sequence_key" ON "run_state_transitions"("run_id", "sequence");
CREATE UNIQUE INDEX "run_state_transitions_command_id_key" ON "run_state_transitions"("command_id");
CREATE UNIQUE INDEX "run_state_transitions_scope_command_key"
  ON "run_state_transitions"("run_id", "tenant_id", "workspace_id", "command_id");
CREATE INDEX "run_state_transitions_scope_recorded_idx"
  ON "run_state_transitions"("tenant_id", "workspace_id", "recorded_at");

CREATE TABLE "run_publish_outbox" (
  "id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "payload_ref" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  CONSTRAINT "run_publish_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "run_publish_outbox_destination_check" CHECK ("destination" = 'runQueue'),
  CONSTRAINT "run_publish_outbox_state_check" CHECK ("state" IN ('pending', 'published')),
  CONSTRAINT "run_publish_outbox_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "run_publish_outbox_scope_fkey" FOREIGN KEY ("run_id", "tenant_id", "workspace_id", "command_id")
    REFERENCES "run_state_transitions"("run_id", "tenant_id", "workspace_id", "command_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "run_publish_outbox_command_id_key" ON "run_publish_outbox"("command_id");
CREATE UNIQUE INDEX "run_publish_outbox_scope_command_key"
  ON "run_publish_outbox"("run_id", "tenant_id", "workspace_id", "command_id");
CREATE INDEX "run_publish_outbox_state_created_at_idx" ON "run_publish_outbox"("state", "created_at");
