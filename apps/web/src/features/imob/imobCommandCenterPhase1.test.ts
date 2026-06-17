import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCase } from "@/lib/api";
import {
  buildImobChatRoute,
  buildImobCaseList,
} from "./imobCommandCenterHelper";

function makeCase(overrides: Partial<ImobCase>): ImobCase {
  return {
    id: "case-phase1",
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

// Scenario 1: buildImobChatRoute encodes actionId, reasonCode, status in URL
test("buildImobChatRoute with actionId/reasonCode/status produces correct query params", () => {
  const url = buildImobChatRoute({
    caseId: "case-123",
    threadId: "thread-456",
    actionId: "owner.register",
    reasonCode: "missing_owner",
    status: "pending_data",
    autoprompt: "cadastrar proprietário deste caso",
  });
  const parsed = new URL(url, "http://localhost");
  assert.equal(parsed.searchParams.get("caseId"), "case-123");
  assert.equal(parsed.searchParams.get("threadId"), "thread-456");
  assert.equal(parsed.searchParams.get("actionId"), "owner.register");
  assert.equal(parsed.searchParams.get("reasonCode"), "missing_owner");
  assert.equal(parsed.searchParams.get("status"), "pending_data");
  assert.equal(parsed.searchParams.get("autoprompt"), "cadastrar proprietário deste caso");
});

// Scenario 2: buildImobChatRoute without actionId omits that param
test("buildImobChatRoute without actionId does not include actionId in URL", () => {
  const url = buildImobChatRoute({
    caseId: "case-789",
    autoprompt: "consultar caso",
  });
  const parsed = new URL(url, "http://localhost");
  assert.equal(parsed.searchParams.get("caseId"), "case-789");
  assert.equal(parsed.searchParams.get("autoprompt"), "consultar caso");
  assert.equal(parsed.searchParams.get("actionId"), null);
  assert.equal(parsed.searchParams.get("reasonCode"), null);
  assert.equal(parsed.searchParams.get("status"), null);
});

// Scenario 3: buildImobCaseList maps recommendedActions from canonical
test("buildImobCaseList maps recommendedActions from canonical", () => {
  const item = makeCase({
    canonical: {
      recommendedActions: [
        { id: "owner.register", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário deste caso", reasonCode: "missing_owner" },
      ],
      reasonCodes: ["missing_owner"],
    },
  });
  const rows = buildImobCaseList([item], "all", "all");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recommendedActions.length, 1);
  assert.equal(rows[0].recommendedActions[0].id, "owner.register");
  assert.equal(rows[0].reasonCodes[0], "missing_owner");
});

// Scenario 4: buildImobCaseList maps pendingItemsList and blockersList
test("buildImobCaseList maps pendingItemsList and blockersList from ImobCase", () => {
  const item = makeCase({
    pendingItems: ["Documento do proprietário", "Matrícula do imóvel"],
    blockers: ["Aguardando resposta do cartório"],
    status: "blocked",
  });
  const rows = buildImobCaseList([item], "all", "all");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].pendingItemsList, ["Documento do proprietário", "Matrícula do imóvel"]);
  assert.deepEqual(rows[0].blockersList, ["Aguardando resposta do cartório"]);
});

// Scenario 5: buildImobCaseList with null canonical returns empty arrays for new fields
test("buildImobCaseList with null canonical returns empty arrays for new fields", () => {
  const item = makeCase({ canonical: null });
  const rows = buildImobCaseList([item], "all", "all");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].recommendedActions, []);
  assert.deepEqual(rows[0].reasonCodes, []);
  assert.deepEqual(rows[0].pendingItemsList, []);
  assert.deepEqual(rows[0].blockersList, []);
});
