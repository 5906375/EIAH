import test from "node:test";
import assert from "node:assert/strict";

import { classifyImobContract } from "../services/imob/intake/imobContractClassifier";
import type { ImobExtractedLease } from "../services/imob/intake/imobLeaseExtractor";
import {
  LEASE_CONTRACT_GINA_101_SANITIZED_TEXT,
} from "./fixtures/imob/lease-contract-gina-101.fixture";

function baseLease(overrides: Partial<ImobExtractedLease> = {}): ImobExtractedLease {
  return {
    propertyLabel: "apartamento 101",
    city: "Balneário Camboriú",
    state: "SC",
    monthlyRentCents: 180000,
    condoFeeCents: 20000,
    depositCents: 180000,
    depositInstallmentCents: 90000,
    startDate: "2026-06-08",
    endDate: "2027-06-08",
    adjustmentIndex: "IGP-M anual",
    lateFeePercent: 10,
    monthlyInterestPercent: 1,
    gracePeriodBusinessDays: 6,
    contractPurpose: "residencial",
    ...overrides,
  };
}

test("T-CLS-1: contrato residencial classificado como lease_contract + residential_lease", () => {
  const result = classifyImobContract(baseLease(), LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  assert.equal(result.documentType, "lease_contract");
  assert.equal(result.contractType, "residential_lease");
});

test("T-CLS-2: requiresConfirmation sempre true", () => {
  const result = classifyImobContract(baseLease(), LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  assert.equal(result.requiresConfirmation, true);
});

test("T-CLS-3: suggestedActionId é imob.contract.intake", () => {
  const result = classifyImobContract(baseLease(), LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  assert.equal(result.suggestedActionId, "imob.contract.intake");
});

test("T-CLS-4: canonicalJourneyType é documentation (enum existente)", () => {
  const result = classifyImobContract(baseLease(), LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  assert.equal(result.canonicalJourneyType, "documentation");
});

test("T-CLS-5: contrato com finalidade comercial → commercial_lease", () => {
  const text = "Contrato de locação comercial. Uso comercial exclusivo. Aluguel: R$ 5.000,00";
  const result = classifyImobContract(baseLease({ contractPurpose: "comercial" }), text);
  assert.equal(result.contractType, "commercial_lease");
});

test("T-CLS-6: contrato por temporada → seasonal_lease", () => {
  const text = "Locação por temporada de verão. Aluguel: R$ 3.000,00";
  const result = classifyImobContract(baseLease({ contractPurpose: null }), text);
  assert.equal(result.contractType, "seasonal_lease");
});

test("T-CLS-7: texto sem indicadores → documentType=unknown", () => {
  const text = "Documento genérico sem identificação de vínculo imobiliário";
  const result = classifyImobContract(baseLease({ monthlyRentCents: null, contractPurpose: null }), text);
  assert.equal(result.documentType, "unknown");
});

test("T-CLS-8: texto com aluguel mas sem finalidade → documentType=lease_contract, contractType=unknown", () => {
  const text = "Aluguel: R$ 1.000,00. Sem mais detalhes.";
  const result = classifyImobContract(baseLease({ contractPurpose: null }), text);
  assert.equal(result.documentType, "lease_contract");
  assert.equal(result.contractType, "unknown");
});
