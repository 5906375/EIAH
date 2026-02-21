-- PR D: add explicit run mode to support DRY_RUN vs LIVE execution

CREATE TYPE "RunMode" AS ENUM ('LIVE', 'DRY_RUN');

ALTER TABLE "runs"
ADD COLUMN "run_mode" "RunMode" NOT NULL DEFAULT 'LIVE';

CREATE INDEX "runs_run_mode_idx" ON "runs"("run_mode");
