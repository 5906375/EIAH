// Integration test: text → PII masking → extraction → classification → draft
// Tests the full pipeline without HTTP layer or worker.
// No PII in this file — uses only sanitized fixtures.

process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";

import { maskContractPii } from "../services/imob/intake/imobContractPiiMasker";
import { extractLeaseContractFromText } from "../services/imob/intake/imobLeaseExtractor";
import { classifyImobContract } from "../services/imob/intake/imobContractClassifier";
import {
  createDraft,
  getDraft,
  isDraftExpired,
  _clearAllDraftsForTesting,
} from "../services/imob/intake/imobContractDraftService";
import {
  LEASE_CONTRACT_GINA_101_SANITIZED_TEXT,
  LEASE_CONTRACT_GINA_101_EXPECTED,
  SYNTHETIC_PII_TEXT,
} from "./fixtures/imob/lease-contract-gina-101.fixture";

test.beforeEach(() => {
  return _clearAllDraftsForTesting();
});

// -------------------------------------------------------------------
// Pipeline: sanitized fixture (no PII)
// -------------------------------------------------------------------

test("T-PIPE-1: pipeline completo → draftId válido para contrato Gina 101", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "tenant-test",
    workspaceId: "ws-test",
    extractedLease: extraction.lease,
    classification,
    evidenceDrafts: [{ documentHash: "deadbeef", documentKind: "lease_contract", piiMasked: true }],
    pendingItems: extraction.pendingItems,
    riskFlags: extraction.riskFlags,
  });

  assert.match(draft.draftId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("T-PIPE-2: pipeline preserva monthlyRentCents = 180000", () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  assert.equal(extraction.lease.monthlyRentCents, LEASE_CONTRACT_GINA_101_EXPECTED.monthlyRentCents);
});

test("T-PIPE-3: pipeline preserva city = Balneário Camboriú", () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  assert.equal(extraction.lease.city, LEASE_CONTRACT_GINA_101_EXPECTED.city);
});

test("T-PIPE-4: pipeline classifica como residential_lease", () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  assert.equal(classification.contractType, "residential_lease");
  assert.equal(classification.documentType, "lease_contract");
});

test("T-PIPE-5: draft gerado tem actionId = imob.contract.intake", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: extraction.pendingItems, riskFlags: extraction.riskFlags,
  });
  assert.equal(draft.actionId, "imob.contract.intake");
});

test("T-PIPE-6: draft recuperável por getDraft após criação", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: extraction.pendingItems, riskFlags: extraction.riskFlags,
  });
  const fetched = await getDraft(draft.draftId);
  assert.ok(fetched !== null);
  assert.equal(fetched!.draftId, draft.draftId);
});

test("T-PIPE-7: draft não expirado imediatamente após criação", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: extraction.pendingItems, riskFlags: extraction.riskFlags,
  });
  assert.equal(await isDraftExpired(draft.draftId), false);
});

// -------------------------------------------------------------------
// Pipeline: PII in text is masked BEFORE extraction/draft
// -------------------------------------------------------------------

test("T-PIPE-8: PII em texto sintético é mascarado antes do draft", async () => {
  const { maskedText, detectedTypes } = maskContractPii(SYNTHETIC_PII_TEXT);

  // PII detectada
  assert.ok(detectedTypes.includes("cpf"), "CPF deve ser detectado");
  assert.ok(detectedTypes.includes("email"), "email deve ser detectado");

  // Sem resíduo de CPF real no texto mascarado
  assert.ok(!/123\.456\.789-09/.test(maskedText), "CPF real não deve aparecer no maskedText");
  assert.ok(!/joao\.ficticio@exemplo/.test(maskedText), "email real não deve aparecer no maskedText");

  // Draft criado com texto já mascarado
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: [], riskFlags: [],
  });

  // draft.extractedLease não contém PII
  const leaseStr = JSON.stringify(draft.extractedLease);
  assert.ok(!/123\.456\.789-09/.test(leaseStr), "extractedLease não deve conter CPF real");
  assert.ok(!/joao\.ficticio@exemplo/.test(leaseStr), "extractedLease não deve conter email real");
});

test("T-PIPE-9: masking idempotente — re-mascarar texto já mascarado não altera resultado", () => {
  const { maskedText: firstPass } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const { maskedText: secondPass } = maskContractPii(firstPass);
  assert.equal(firstPass, secondPass);
});

test("T-PIPE-10: valores monetários são inteiros (sem float) no draft", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: [], riskFlags: [],
  });

  const { monthlyRentCents, condoFeeCents, depositCents } = draft.extractedLease;
  if (monthlyRentCents !== null) assert.equal(Number.isInteger(monthlyRentCents), true);
  if (condoFeeCents !== null) assert.equal(Number.isInteger(condoFeeCents), true);
  if (depositCents !== null) assert.equal(Number.isInteger(depositCents), true);
});

test("T-PIPE-11: riskFlags detectados para contrato Gina 101 (lateFee=10%, grace=6 dias)", () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  // lateFee 10% > 2% e gracePeriod 6 > 5 devem gerar riskFlags
  assert.ok(extraction.riskFlags.length > 0, "deve ter pelo menos um riskFlag");
});

test("T-PIPE-12: requiresConfirmation = true em todas as etapas do pipeline", async () => {
  const { maskedText } = maskContractPii(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);
  const draft = await createDraft({
    tenantId: "t1", workspaceId: "w1",
    extractedLease: extraction.lease, classification,
    evidenceDrafts: [], pendingItems: [], riskFlags: [],
  });
  assert.equal(classification.requiresConfirmation, true);
  assert.equal(draft.requiresConfirmation, true);
});
