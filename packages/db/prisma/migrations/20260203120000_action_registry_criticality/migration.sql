-- Add criticality tracking fields to action_registry
ALTER TABLE "action_registry"
ADD COLUMN "criticality" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "criticality_source" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "side_effects" BOOLEAN,
ADD COLUMN "data_sensitivity" TEXT;
