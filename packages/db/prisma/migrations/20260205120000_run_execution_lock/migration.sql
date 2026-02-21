-- CreateTable
CREATE TABLE "run_execution_locks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_execution_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_execution_locks_tenant_id_workspace_id_idx" ON "run_execution_locks"("tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_run_execution_lock" ON "run_execution_locks"("tenant_id", "workspace_id", "run_id");
