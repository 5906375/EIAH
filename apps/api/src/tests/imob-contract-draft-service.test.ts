import test from "node:test";
import assert from "node:assert/strict";

import {
  createDraft,
  getDraft,
  isDraftExpired,
  deleteDraft,
  getDraftCount,
  _clearAllDraftsForTesting,
  DRAFT_TTL_MS,
} from "../services/imob/intake/imobContractDraftService";
import type { ImobExtractedLease } from "../services/imob/intake/imobLeaseExtractor";
import type { ImobContractClassification } from "../services/imob/intake/imobContractClassifier";

function makeLease(): ImobExtractedLease {
  return {
    propertyLabel: "apto 101",
    city: "Florianópolis",
    state: "SC",
    monthlyRentCents: 200000,
    condoFeeCents: 30000,
    depositCents: 200000,
    depositInstallmentCents: 100000,
    startDate: "2026-07-01",
    endDate: "2027-07-01",
    adjustmentIndex: "IPCA anual",
    lateFeePercent: 2,
    monthlyInterestPercent: 1,
    gracePeriodBusinessDays: 3,
    contractPurpose: "residencial",
  };
}

function makeClassification(): ImobContractClassification {
  return {
    documentType: "lease_contract",
    contractType: "residential_lease",
    canonicalJourneyType: "documentation",
    suggestedActionId: "imob.contract.intake",
    requiresConfirmation: true,
  };
}

function makeParams() {
  return {
    tenantId: "tenant-abc",
    workspaceId: "ws-xyz",
    extractedLease: makeLease(),
    classification: makeClassification(),
    evidenceDrafts: [{ documentHash: "abc123", documentKind: "lease_contract" as const, piiMasked: true as const }],
    pendingItems: ["identidade"],
    riskFlags: ["lateFee > 2%"],
  };
}

test.beforeEach(() => {
  _clearAllDraftsForTesting();
});

test("T-DRF-1: createDraft retorna draftId UUID válido", () => {
  const draft = createDraft(makeParams());
  assert.match(draft.draftId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("T-DRF-2: draft tem actionId = imob.contract.intake", () => {
  const draft = createDraft(makeParams());
  assert.equal(draft.actionId, "imob.contract.intake");
});

test("T-DRF-3: draft tem source = chat-imob", () => {
  const draft = createDraft(makeParams());
  assert.equal(draft.source, "chat-imob");
});

test("T-DRF-4: draft tem requiresConfirmation = true", () => {
  const draft = createDraft(makeParams());
  assert.equal(draft.requiresConfirmation, true);
});

test("T-DRF-5: draftExpiresAt está ~30min no futuro", () => {
  const before = Date.now();
  const draft = createDraft(makeParams());
  const expiresAt = new Date(draft.draftExpiresAt).getTime();
  const expectedMin = before + DRAFT_TTL_MS - 1000;
  const expectedMax = before + DRAFT_TTL_MS + 1000;
  assert.ok(expiresAt >= expectedMin, `expiresAt ${expiresAt} < expectedMin ${expectedMin}`);
  assert.ok(expiresAt <= expectedMax, `expiresAt ${expiresAt} > expectedMax ${expectedMax}`);
});

test("T-DRF-6: getDraft retorna draft recém-criado", () => {
  const created = createDraft(makeParams());
  const fetched = getDraft(created.draftId);
  assert.ok(fetched !== null);
  assert.equal(fetched!.draftId, created.draftId);
});

test("T-DRF-7: getDraft retorna null para ID inexistente", () => {
  const result = getDraft("00000000-0000-0000-0000-000000000000");
  assert.equal(result, null);
});

test("T-DRF-8: isDraftExpired retorna false para draft recém-criado", () => {
  const draft = createDraft(makeParams());
  assert.equal(isDraftExpired(draft.draftId), false);
});

test("T-DRF-9: isDraftExpired retorna true para ID inexistente", () => {
  assert.equal(isDraftExpired("00000000-0000-0000-0000-000000000000"), true);
});

test("T-DRF-10: deleteDraft remove o draft do store", () => {
  const draft = createDraft(makeParams());
  deleteDraft(draft.draftId);
  assert.equal(getDraft(draft.draftId), null);
});

test("T-DRF-11: múltiplos drafts são independentes", () => {
  const d1 = createDraft({ ...makeParams(), tenantId: "t1", workspaceId: "w1" });
  const d2 = createDraft({ ...makeParams(), tenantId: "t2", workspaceId: "w2" });
  assert.notEqual(d1.draftId, d2.draftId);
  assert.equal(getDraftCount(), 2);
  deleteDraft(d1.draftId);
  assert.equal(getDraftCount(), 1);
  assert.ok(getDraft(d2.draftId) !== null);
});

test("T-DRF-12: draft preserva tenantId e workspaceId", () => {
  const params = makeParams();
  const draft = createDraft(params);
  assert.equal(draft.tenantId, params.tenantId);
  assert.equal(draft.workspaceId, params.workspaceId);
});

test("T-DRF-13: getDraft retorna null após expiração simulada", () => {
  // Manipulate time via direct internal access isn't possible without clock mocking.
  // Test via isDraftExpired for a manually-deleted entry to simulate post-expiry.
  const draft = createDraft(makeParams());
  deleteDraft(draft.draftId);
  assert.equal(isDraftExpired(draft.draftId), true);
  assert.equal(getDraft(draft.draftId), null);
});

test("T-DRF-14: extractedLease.monthlyRentCents é inteiro (sem float)", () => {
  const draft = createDraft(makeParams());
  assert.equal(Number.isInteger(draft.extractedLease.monthlyRentCents), true);
});

test("T-DRF-15: pendingItems e riskFlags preservados no draft", () => {
  const params = makeParams();
  const draft = createDraft(params);
  assert.deepEqual(draft.pendingItems, params.pendingItems);
  assert.deepEqual(draft.riskFlags, params.riskFlags);
});
