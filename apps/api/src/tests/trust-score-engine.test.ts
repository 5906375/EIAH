import assert from "node:assert/strict";
import test from "node:test";
import { buildTrustScoreWhereUnique } from "../services/trustScoreEngineKeys";

test("buildTrustScoreWhereUnique uses the Prisma compound key name from schema", () => {
  assert.deepEqual(
    buildTrustScoreWhereUnique("tenant-A", "workspace-A", "guardian"),
    {
      unique_trustscore_agent: {
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        agentId: "guardian",
      },
    }
  );
});
