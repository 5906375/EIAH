-- PR E: explicit billing fields on runs (additive, nullable, backward compatible)
ALTER TABLE "runs"
ADD COLUMN "estimated_cost_cents" INTEGER,
ADD COLUMN "final_cost_cents" INTEGER,
ADD COLUMN "charged" BOOLEAN,
ADD COLUMN "charge_reason" TEXT,
ADD COLUMN "charge_attempted_at" TIMESTAMP(3);
