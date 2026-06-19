import "./support/testInfraEnv.js";
import test from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";

import {
  createDraft,
  getDraft,
  consumeDraft,
  restoreDraft,
  isDraftExpired,
  deleteDraft,
  expireDraft,
  getDraftCount,
  getConfiguredDraftStoreMode,
  closeDraftStoreResources,
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

const previousDraftStore = process.env.DRAFT_STORE;
const previousNodeEnv = process.env.NODE_ENV;

test.beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DRAFT_STORE = "memory";
  await closeDraftStoreResources();
  await _clearAllDraftsForTesting();
});

test.after(async () => {
  if (typeof previousDraftStore === "string") {
    process.env.DRAFT_STORE = previousDraftStore;
  } else {
    delete process.env.DRAFT_STORE;
  }
  if (typeof previousNodeEnv === "string") {
    process.env.NODE_ENV = previousNodeEnv;
  }
  await closeDraftStoreResources();
});

test("T-DRF-1: createDraft retorna draftId UUID válido", async () => {
  const draft = await createDraft(makeParams());
  assert.match(draft.draftId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("T-DRF-2: draft tem actionId = imob.contract.intake", async () => {
  const draft = await createDraft(makeParams());
  assert.equal(draft.actionId, "imob.contract.intake");
});

test("T-DRF-3: draft tem source = chat-imob", async () => {
  const draft = await createDraft(makeParams());
  assert.equal(draft.source, "chat-imob");
});

test("T-DRF-4: draft tem requiresConfirmation = true", async () => {
  const draft = await createDraft(makeParams());
  assert.equal(draft.requiresConfirmation, true);
});

test("T-DRF-5: draftExpiresAt está ~30min no futuro", async () => {
  const before = Date.now();
  const draft = await createDraft(makeParams());
  const expiresAt = new Date(draft.draftExpiresAt).getTime();
  assert.ok(expiresAt >= before + DRAFT_TTL_MS - 1000);
  assert.ok(expiresAt <= before + DRAFT_TTL_MS + 1000);
});

test("T-DRF-6: getDraft retorna draft recém-criado", async () => {
  const created = await createDraft(makeParams());
  const fetched = await getDraft(created.draftId);
  assert.ok(fetched !== null);
  assert.equal(fetched!.draftId, created.draftId);
});

test("T-DRF-7: getDraft retorna null para ID inexistente", async () => {
  const result = await getDraft("00000000-0000-0000-0000-000000000000");
  assert.equal(result, null);
});

test("T-DRF-8: isDraftExpired retorna false para draft recém-criado", async () => {
  const draft = await createDraft(makeParams());
  assert.equal(await isDraftExpired(draft.draftId), false);
});

test("T-DRF-9: isDraftExpired retorna true para ID inexistente", async () => {
  assert.equal(await isDraftExpired("00000000-0000-0000-0000-000000000000"), true);
});

test("T-DRF-10: deleteDraft remove o draft do store", async () => {
  const draft = await createDraft(makeParams());
  await deleteDraft(draft.draftId);
  assert.equal(await getDraft(draft.draftId), null);
});

test("T-DRF-11: múltiplos drafts são independentes", async () => {
  const d1 = await createDraft({ ...makeParams(), tenantId: "t1", workspaceId: "w1" });
  const d2 = await createDraft({ ...makeParams(), tenantId: "t2", workspaceId: "w2" });
  assert.notEqual(d1.draftId, d2.draftId);
  assert.equal(await getDraftCount(), 2);
  await deleteDraft(d1.draftId);
  assert.equal(await getDraftCount(), 1);
  assert.ok((await getDraft(d2.draftId)) !== null);
});

test("T-DRF-12: draft preserva tenantId e workspaceId", async () => {
  const params = makeParams();
  const draft = await createDraft(params);
  assert.equal(draft.tenantId, params.tenantId);
  assert.equal(draft.workspaceId, params.workspaceId);
});

test("T-DRF-13: expireDraft invalida o draft", async () => {
  const draft = await createDraft(makeParams());
  await expireDraft(draft.draftId, 0);
  assert.equal(await isDraftExpired(draft.draftId), true);
  assert.equal(await getDraft(draft.draftId), null);
});

test("T-DRF-14: extractedLease.monthlyRentCents é inteiro (sem float)", async () => {
  const draft = await createDraft(makeParams());
  assert.equal(Number.isInteger(draft.extractedLease.monthlyRentCents), true);
});

test("T-DRF-15: pendingItems e riskFlags preservados no draft", async () => {
  const params = makeParams();
  const draft = await createDraft(params);
  assert.deepEqual(draft.pendingItems, params.pendingItems);
  assert.deepEqual(draft.riskFlags, params.riskFlags);
});

test("T-DRF-16: consumeDraft remove o draft e re-confirm falha", async () => {
  const draft = await createDraft(makeParams());
  const consumed = await consumeDraft(draft.draftId, { tenantId: draft.tenantId, workspaceId: draft.workspaceId });
  assert.equal(consumed.status, "consumed");
  assert.equal((consumed as any).draft.draftId, draft.draftId);
  assert.equal(await getDraft(draft.draftId), null);
  assert.equal((await consumeDraft(draft.draftId, { tenantId: draft.tenantId, workspaceId: draft.workspaceId })).status, "missing");
});

test("T-DRF-17: consumeDraft falha fechado em cross-workspace sem remover o draft", async () => {
  const draft = await createDraft(makeParams());
  const consumed = await consumeDraft(draft.draftId, { tenantId: draft.tenantId, workspaceId: "ws-other" });
  assert.equal(consumed.status, "scope_mismatch");
  assert.ok(await getDraft(draft.draftId));
});

test("T-DRF-18: restoreDraft reinsere o mesmo draft após consume", async () => {
  const draft = await createDraft(makeParams());
  const consumed = await consumeDraft(draft.draftId, { tenantId: draft.tenantId, workspaceId: draft.workspaceId });
  assert.equal(consumed.status, "consumed");
  await restoreDraft(draft);
  const restored = await getDraft(draft.draftId);
  assert.ok(restored);
  assert.equal(restored!.draftId, draft.draftId);
});

test("T-DRF-19: fallback default em test usa memory quando DRAFT_STORE não está definido", async () => {
  delete process.env.DRAFT_STORE;
  await closeDraftStoreResources();
  assert.equal(getConfiguredDraftStoreMode(), "memory");
  const draft = await createDraft(makeParams());
  assert.ok(draft.draftId);
});

test("T-DRF-20: RedisDraftStore persiste draft após reinicialização do recurso", async (t) => {
  process.env.DRAFT_STORE = "redis";
  await closeDraftStoreResources();

  const redisUrl = process.env.DRAFT_STORE_REDIS_URL ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
  const probe = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
  try {
    await probe.connect();
    await probe.ping();
  } catch {
    t.skip("Redis não disponível para validar draft store durável");
    return;
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
    probe.disconnect();
  }

  const created = await createDraft(makeParams());
  await closeDraftStoreResources();
  const reopened = await getDraft(created.draftId);
  assert.ok(reopened);
  assert.equal(reopened!.draftId, created.draftId);
  await deleteDraft(created.draftId);
});
