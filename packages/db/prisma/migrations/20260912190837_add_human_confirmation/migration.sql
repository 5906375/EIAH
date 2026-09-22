-- AlterTable
ALTER TABLE "signal_forward_requests" ADD COLUMN     "active_human_confirmation_id" TEXT,
ADD COLUMN     "concluded_human_confirmation_id" TEXT;

-- CreateTable
CREATE TABLE "human_confirmations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "signal_forward_request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_human_completion',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "suggested_prompt" TEXT NOT NULL,
    "suggested_prompt_rule_version" TEXT NOT NULL,
    "human_confirmation_contract_version" TEXT NOT NULL,
    "draft_final_prompt" TEXT,
    "draft_objective" TEXT,
    "draft_audience" TEXT,
    "draft_channels" JSONB,
    "draft_budget" TEXT,
    "draft_tone_profile" TEXT,
    "draft_tone_notes" TEXT,
    "draft_launch_date" TEXT,
    "draft_deadline" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_user_id" TEXT,
    "confirmed_payload_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "human_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "human_confirmations_tenant_id_workspace_id_signal_forward_r_idx" ON "human_confirmations"("tenant_id", "workspace_id", "signal_forward_request_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signal_forward_requests_id_tenant_id_workspace_id_key" ON "signal_forward_requests"("id", "tenant_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_confirmations" ADD CONSTRAINT "human_confirmations_signal_forward_request_id_tenant_id_wo_fkey" FOREIGN KEY ("signal_forward_request_id", "tenant_id", "workspace_id") REFERENCES "signal_forward_requests"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

