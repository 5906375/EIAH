import test from "node:test";
import assert from "node:assert/strict";

import {
  planCaseShadowExecutions,
  planLeadShadowExecutions,
  recordImobShadowExecutions,
} from "../services/imob/imobShadowRuntime";

test("lead shadow runtime plans scoring and commercial memory for relevant lead change", () => {
  const executions = planLeadShadowExecutions({
    leadId: "lead-1",
    before: { budgetMaxCents: null, metadata: {} },
    after: { budgetMaxCents: 200000, metadata: { discoverySignals: { urgency: "high" } } },
    trigger: "lead.updated",
    generatedAt: "2026-05-03T10:00:00.000Z",
  });

  assert.equal(executions.length, 2);
  assert.equal(executions[0]?.capabilityId, "lead.scoring");
  assert.equal(executions[1]?.capabilityId, "relationship.commercial_memory");
  assert.equal(executions[0]?.generatedAt, "2026-05-03T10:00:00.000Z");
});

test("case shadow runtime plans recurring capabilities for relevant case change", () => {
  const executions = planCaseShadowExecutions({
    caseId: "case-1",
    before: { pendingItems: [] },
    after: { flow: "lead.qualify", pendingItems: ["ownerDocument"], nextStep: "qualificar lead" },
    trigger: "case.updated",
  });

  assert.equal(executions.length, 3);
  assert.equal(executions.some((item) => item.capabilityId === "reengagement.continuous"), true);
  assert.equal(executions.some((item) => item.capabilityId === "inventory.active_watch"), true);
});

test("shadow runtime persists only non-duplicate signatures", async () => {
  const memoryEvents: any[] = [];
  const prisma = {
    memoryEvent: {
      findMany: async () => memoryEvents,
      create: async ({ data }: any) => {
        memoryEvents.push(data);
        return { id: `event-${memoryEvents.length}`, ...data };
      },
    },
  };

  const executions = planLeadShadowExecutions({
    leadId: "lead-1",
    after: { budgetMaxCents: 200000, metadata: {} },
    trigger: "lead.updated",
  });

  const first = await recordImobShadowExecutions({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    executions,
  });
  const second = await recordImobShadowExecutions({
    prisma: prisma as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    executions,
  });

  assert.equal(first.persisted.length, 2);
  assert.equal(second.persisted.length, 0);
  assert.equal(second.skipped.length, 2);
  assert.equal(memoryEvents.length, 2);
});
