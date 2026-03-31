ALTER TABLE "runs"
  ADD COLUMN "case_id" TEXT,
  ADD COLUMN "thread_id" TEXT;

CREATE INDEX "runs_case_id_idx" ON "runs"("case_id");
CREATE INDEX "runs_thread_id_idx" ON "runs"("thread_id");
