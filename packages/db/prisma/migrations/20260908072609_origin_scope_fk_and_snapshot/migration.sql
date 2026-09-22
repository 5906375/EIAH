-- DropForeignKey
ALTER TABLE "signal_forward_requests" DROP CONSTRAINT "signal_forward_requests_destination_run_id_fkey";

-- DropForeignKey
ALTER TABLE "signal_forward_requests" DROP CONSTRAINT "signal_forward_requests_source_run_id_fkey";

-- DropIndex
DROP INDEX "signal_forward_requests_destination_run_id_key";

-- AlterTable
ALTER TABLE "signal_forward_requests" ADD COLUMN     "origin_snapshot" JSONB NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "runs_id_tenant_id_workspace_id_key" ON "runs"("id", "tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "signal_forward_requests_destination_run_id_tenant_id_worksp_key" ON "signal_forward_requests"("destination_run_id", "tenant_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_source_run_id_tenant_id_workspace__fkey" FOREIGN KEY ("source_run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_forward_requests" ADD CONSTRAINT "signal_forward_requests_destination_run_id_tenant_id_works_fkey" FOREIGN KEY ("destination_run_id", "tenant_id", "workspace_id") REFERENCES "runs"("id", "tenant_id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

