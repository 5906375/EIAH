import test from "node:test";
import assert from "node:assert/strict";

import { extractLeaseContractFromText } from "../services/imob/intake/imobLeaseExtractor";
import {
  LEASE_CONTRACT_GINA_101_SANITIZED_TEXT,
  LEASE_CONTRACT_GINA_101_EXPECTED,
} from "./fixtures/imob/lease-contract-gina-101.fixture";

// Helper: extract from fixture
function extractFromFixture() {
  return extractLeaseContractFromText(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
}

// ─── Valores monetários ───────────────────────────────────────────────────────

test("T-EXT-1: aluguel extraído como 180000 centavos (R$ 1.800,00)", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.monthlyRentCents, LEASE_CONTRACT_GINA_101_EXPECTED.monthlyRentCents);
});

test("T-EXT-2: condomínio extraído como 20000 centavos (R$ 200,00)", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.condoFeeCents, LEASE_CONTRACT_GINA_101_EXPECTED.condoFeeCents);
});

test("T-EXT-3: caução total extraída como 180000 centavos (R$ 1.800,00)", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.depositCents, LEASE_CONTRACT_GINA_101_EXPECTED.depositCents);
});

test("T-EXT-4: parcela de caução extraída como 90000 centavos (R$ 900,00)", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.depositInstallmentCents, LEASE_CONTRACT_GINA_101_EXPECTED.depositInstallmentCents);
});

test("T-EXT-5: nenhum valor monetário usa float — todos são inteiros em centavos", () => {
  const result = extractFromFixture();
  const { monthlyRentCents, condoFeeCents, depositCents, depositInstallmentCents } = result.lease;
  for (const value of [monthlyRentCents, condoFeeCents, depositCents, depositInstallmentCents]) {
    if (value !== null) {
      assert.equal(value, Math.floor(value), `Valor ${value} deve ser inteiro (centavos)`);
    }
  }
});

// ─── Datas ────────────────────────────────────────────────────────────────────

test("T-EXT-6: data de início extraída como ISO 2026-06-08", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.startDate, LEASE_CONTRACT_GINA_101_EXPECTED.startDate);
});

test("T-EXT-7: data de término extraída como ISO 2027-06-08", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.endDate, LEASE_CONTRACT_GINA_101_EXPECTED.endDate);
});

// ─── Penalidades e reajuste ───────────────────────────────────────────────────

test("T-EXT-8: multa por atraso extraída como 10%", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.lateFeePercent, LEASE_CONTRACT_GINA_101_EXPECTED.lateFeePercent);
});

test("T-EXT-9: juros de mora extraídos como 1%", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.monthlyInterestPercent, LEASE_CONTRACT_GINA_101_EXPECTED.monthlyInterestPercent);
});

test("T-EXT-10: tolerância extraída como 6 dias úteis", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.gracePeriodBusinessDays, LEASE_CONTRACT_GINA_101_EXPECTED.gracePeriodBusinessDays);
});

test("T-EXT-11: índice de reajuste extraído contém IGP-M", () => {
  const result = extractFromFixture();
  assert.ok(result.lease.adjustmentIndex !== null, "Índice de reajuste deve ser extraído");
  assert.ok(
    result.lease.adjustmentIndex!.toLowerCase().includes("igp-m") ||
    result.lease.adjustmentIndex!.toLowerCase().includes("igpm"),
    "Índice deve referenciar IGP-M"
  );
});

// ─── Localização e imóvel ─────────────────────────────────────────────────────

test("T-EXT-12: cidade extraída como Balneário Camboriú", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.city, LEASE_CONTRACT_GINA_101_EXPECTED.city);
});

test("T-EXT-13: estado extraído como SC", () => {
  const result = extractFromFixture();
  assert.equal(result.lease.state, LEASE_CONTRACT_GINA_101_EXPECTED.state);
});

test("T-EXT-14: label do imóvel extraído (contém 'apartamento 101')", () => {
  const result = extractFromFixture();
  assert.ok(result.lease.propertyLabel !== null, "Label do imóvel deve ser extraído");
  assert.ok(
    result.lease.propertyLabel!.toLowerCase().includes("apartamento"),
    "Label deve identificar apartamento"
  );
});

test("T-EXT-15: finalidade extraída como residencial", () => {
  const result = extractFromFixture();
  assert.ok(
    result.lease.contractPurpose?.toLowerCase().includes("residencial"),
    "Finalidade deve ser residencial"
  );
});

// ─── Risk flags ───────────────────────────────────────────────────────────────

test("T-EXT-16: multa de 10% gera riskFlag de revisão", () => {
  const result = extractFromFixture();
  const hasLateFeFlag = result.riskFlags.some((f) => f.includes("Multa"));
  assert.ok(hasLateFeFlag, "Multa acima do threshold deve gerar riskFlag");
});

test("T-EXT-17: tolerância de 6 dias gera riskFlag acima do padrão", () => {
  const result = extractFromFixture();
  const hasTolFlag = result.riskFlags.some((f) => f.toLowerCase().includes("toler"));
  assert.ok(hasTolFlag, "Tolerância acima de 5 dias deve gerar riskFlag");
});

test("T-EXT-18: IGP-M gera riskFlag de validação", () => {
  const result = extractFromFixture();
  const hasIgpmFlag = result.riskFlags.some((f) => f.toUpperCase().includes("IGP-M"));
  assert.ok(hasIgpmFlag, "Reajuste por IGP-M deve gerar riskFlag");
});

// ─── Pending items ────────────────────────────────────────────────────────────

test("T-EXT-19: fixture sem documentação de identidade gera pendingItem", () => {
  const result = extractFromFixture();
  const hasIdPending = result.pendingItems.some((p) => p.toLowerCase().includes("identidade"));
  assert.ok(hasIdPending, "Ausência de documento de identidade deve gerar pendingItem");
});

test("T-EXT-20: fixture sem laudo de vistoria gera pendingItem", () => {
  const result = extractFromFixture();
  const hasVisitoriaFlag = result.pendingItems.some((p) => p.toLowerCase().includes("vistoria"));
  assert.ok(hasVisitoriaFlag, "Ausência de laudo de vistoria deve gerar pendingItem");
});

// ─── Casos edge ───────────────────────────────────────────────────────────────

test("T-EXT-21: extrator retorna ok=true para fixture com dados mínimos", () => {
  const result = extractFromFixture();
  assert.equal(result.ok, true, "Fixture com aluguel e cidade deve retornar ok=true");
});

test("T-EXT-22: texto mínimo sem aluguel retorna ok=false", () => {
  const result = extractLeaseContractFromText("Contrato sem valores monetários.");
  assert.equal(result.ok, false, "Texto sem aluguel deve retornar ok=false");
});

test("T-EXT-23: parserVersion é sempre '1.0'", () => {
  const result = extractFromFixture();
  assert.equal(result.parserVersion, "1.0");
});

test("T-EXT-24: texto sem penalidades retorna lateFeePercent=null e sem riskFlag de multa", () => {
  const text = "Aluguel: R$ 1.500,00\nCidade: São Paulo/SP\nPrazo: 01/01/2026 a 01/01/2027";
  const result = extractLeaseContractFromText(text);
  assert.equal(result.lease.lateFeePercent, null, "Sem multa no texto, deve retornar null");
  const hasLateFlag = result.riskFlags.some((f) => f.includes("Multa"));
  assert.ok(!hasLateFlag, "Sem multa extraída, não deve gerar riskFlag de multa");
});

test("T-EXT-25: valores sem ponto de milhar são convertidos corretamente (R$ 900,00 → 90000)", () => {
  const text = "Aluguel: R$ 900,00\nCidade: Florianópolis/SC";
  const result = extractLeaseContractFromText(text);
  assert.equal(result.lease.monthlyRentCents, 90000, "R$ 900,00 deve ser 90000 centavos");
});
