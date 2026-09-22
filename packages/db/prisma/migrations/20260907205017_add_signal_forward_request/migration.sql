-- CreateTable
CREATE TABLE "signal_forward_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_run_id" TEXT NOT NULL,
    "destination_agent" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "destination_run_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_dispatch',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_forward_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signal_forward_requests_destination_run_id_key" ON "signal_forward_requests"("destination_run_id");

-- CreateIndex
CREATE INDEX "signal_forward_requests_tenant_id_workspace_id_source_run_i_idx" ON "signal_forward_requests"("tenant_id", "workspace_id", "source_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "signal_forward_requests_tenant_id_workspace_id_destination__key" ON "signal_forward_requests"("tenant_id", "workspace_id", "destination_agent", "idempotency_key");

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_destination_run_id_fkey" FOREIGN KEY ("destination_run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
