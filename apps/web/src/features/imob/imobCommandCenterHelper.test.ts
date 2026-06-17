import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ImobCase } from "@/lib/api";
import {
  buildImobCasePriority,
  buildImobCaseFallbackActions,
} from "./imobCommandCenterHelper";

function makeCase(overrides: Partial<ImobCase>): ImobCase {
  return {
    id: "case-test",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    threadId: "thread-1",
    flow: "property.create",
    stage: "collecting",
    status: "pending_data",
    ownerResponsible: null,
    nextStep: null,
    blockers: [],
    pendingItems: [],
    ownerId: null,
    propertyId: null,
    leadId: null,
    externalDealId: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canonical: null,
    owner: null,
    property: null,
    lead: null,
    _count: { events: 0 },
    ...overrides,
  };
}

test("buildImobCasePriority returns alta when there are blocked actions", () => {
  const result = buildImobCasePriority(
    makeCase({ canonical: { blockedActions: ["missing signature"], missingContext: [], recommendedActions: [] } }),
  );
  assert.equal(result.label, "alta");
  assert.ok(result.score >= 5);
});

test("buildImobCasePriority returns média when there are missing context items", () => {
  const result = buildImobCasePriority(
    makeCase({ canonical: { blockedActions: [], missingContext: ["owner document"], recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }] } }),
  );
  assert.equal(result.label, "média");
});

test("buildImobCasePriority returns normal for a clean recent case", () => {
  const result = buildImobCasePriority(
    makeCase({
      updatedAt: new Date().toISOString(),
      canonical: {
        blockedActions: [],
        missingContext: [],
        recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }],
      },
    }),
  );
  assert.equal(result.label, "normal");
});

test("buildImobCasePriority returns score 0 for completely empty case updated now", () => {
  const result = buildImobCasePriority(
    makeCase({
      updatedAt: new Date().toISOString(),
      canonical: {
        blockedActions: [],
        missingContext: [],
        recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }],
      },
    }),
  );
  assert.equal(result.score, 0);
});

test("buildImobCaseFallbackActions includes owner.register for owner.create flow", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "owner.create" }));
  assert.ok(actions.some((a) => a.id === "owner.register"));
});

test("buildImobCaseFallbackActions includes property.create for property.create flow", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "property.create" }));
  assert.ok(actions.some((a) => a.id === "property.create"));
});

test("buildImobCaseFallbackActions always includes case.consult as fallback", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "commission.settle" }));
  assert.ok(actions.some((a) => a.id === "case.consult"));
});

test("buildImobCaseFallbackActions caps output at 4 actions", () => {
  const actions = buildImobCaseFallbackActions(
    makeCase({
      flow: "owner.create",
      pendingItems: ["imóvel pendente", "document needed", "lead em aberto"],
    }),
  );
  assert.ok(actions.length <= 4);
});

test("buildImobCaseFallbackActions does not produce duplicate ids", () => {
  const actions = buildImobCaseFallbackActions(
    makeCase({ flow: "case.consult", pendingItems: [] }),
  );
  const ids = actions.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
});

// Non-regression: dashboard.tsx must not define buildCasePriority or buildCaseFallbackActions
test("dashboard.tsx does not define buildCasePriority or buildCaseFallbackActions", () => {
  const dashboardPath = path.resolve(
    import.meta.dirname ?? __dirname,
    "../../pages/app/imob/dashboard.tsx",
  );
  const source = fs.readFileSync(dashboardPath, "utf8");
  assert.ok(
    !source.includes("function buildCasePriority("),
    "dashboard.tsx must not define buildCasePriority — move to domain layer",
  );
  assert.ok(
    !source.includes("function buildCaseFallbackActions("),
    "dashboard.tsx must not define buildCaseFallbackActions — move to domain layer",
  );
});
