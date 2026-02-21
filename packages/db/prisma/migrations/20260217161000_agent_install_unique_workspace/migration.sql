-- PR A: enforce idempotent install key per tenant/workspace/agent
-- Keep the best candidate when duplicates exist before adding constraint:
-- prefer ACTIVE, then most recently updated/created.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, workspace_id, agent_id
      ORDER BY
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        updated_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM agent_installs
)
DELETE FROM agent_installs ai
USING ranked r
WHERE ai.id = r.id
  AND r.rn > 1;

ALTER TABLE "agent_installs"
ADD CONSTRAINT "unique_agent_install_workspace"
UNIQUE ("tenant_id", "workspace_id", "agent_id");
