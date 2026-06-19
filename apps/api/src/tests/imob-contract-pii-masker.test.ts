import test from "node:test";
import assert from "node:assert/strict";

import { maskContractPii, hasPiiResidue } from "../services/imob/intake/imobContractPiiMasker";
import {
  SYNTHETIC_PII_TEXT,
  SYNTHETIC_PII_EXPECTED_MASKED,
  LEASE_CONTRACT_GINA_101_SANITIZED_TEXT,
} from "./fixtures/imob/lease-contract-gina-101.fixture";

test("T-PII-1: CPF formatado é mascarado", () => {
  const { maskedText, detectedTypes } = maskContractPii("CPF: 123.456.789-09");
  assert.ok(!maskedText.includes("123.456.789-09"), "CPF formatado não deve aparecer no texto mascarado");
  assert.ok(maskedText.includes(SYNTHETIC_PII_EXPECTED_MASKED.cpf), "Deve conter placeholder de CPF");
  assert.ok(detectedTypes.includes("cpf"), "Deve detectar tipo cpf");
});

test("T-PII-2: CPF sem formatação é mascarado", () => {
  const { maskedText } = maskContractPii("Documento: 12345678909");
  assert.ok(!maskedText.includes("12345678909"), "CPF sem formatação não deve aparecer");
});

test("T-PII-3: e-mail é mascarado", () => {
  const { maskedText, detectedTypes } = maskContractPii("Contato: joao.ficticio@exemplo.com.br");
  assert.ok(!maskedText.includes("joao.ficticio@exemplo.com.br"), "E-mail não deve aparecer");
  assert.ok(maskedText.includes(SYNTHETIC_PII_EXPECTED_MASKED.email), "Deve conter placeholder de e-mail");
  assert.ok(detectedTypes.includes("email"), "Deve detectar tipo email");
});

test("T-PII-4: telefone BR com DDD é mascarado", () => {
  const { maskedText, detectedTypes } = maskContractPii("Telefone: (47) 99999-0000");
  assert.ok(!maskedText.includes("99999-0000"), "Telefone não deve aparecer");
  assert.ok(maskedText.includes(SYNTHETIC_PII_EXPECTED_MASKED.phone), "Deve conter placeholder de telefone");
  assert.ok(detectedTypes.includes("phone_br"), "Deve detectar tipo phone_br");
});

test("T-PII-5: telefone BR com código internacional é mascarado", () => {
  const { maskedText, detectedTypes } = maskContractPii("Fone: +55 47 98888-1111");
  assert.ok(!maskedText.includes("98888-1111"), "Telefone internacional não deve aparecer");
  assert.ok(detectedTypes.includes("phone_br_intl"), "Deve detectar tipo phone_br_intl");
});

test("T-PII-6: RG com label é mascarado", () => {
  const { maskedText, detectedTypes } = maskContractPii("RG: 12.345.678-9");
  assert.ok(!maskedText.includes("12.345.678-9"), "RG não deve aparecer");
  assert.ok(detectedTypes.includes("rg_labeled"), "Deve detectar tipo rg_labeled");
});

test("T-PII-7: CNH com label é mascarada", () => {
  const { maskedText, detectedTypes } = maskContractPii("CNH: 12345678901");
  assert.ok(!maskedText.includes("12345678901"), "CNH não deve aparecer");
  assert.ok(detectedTypes.includes("cnh_labeled"), "Deve detectar tipo cnh_labeled");
});

test("T-PII-8: texto com múltiplos tipos de PII é completamente mascarado", () => {
  const { maskedText } = maskContractPii(SYNTHETIC_PII_TEXT);
  assert.ok(!maskedText.includes("123.456.789-09"), "CPF não deve aparecer");
  assert.ok(!maskedText.includes("joao.ficticio@exemplo.com.br"), "E-mail não deve aparecer");
  assert.ok(!maskedText.includes("99999-0000"), "Telefone não deve aparecer");
  assert.ok(!maskedText.includes("98888-1111"), "Telefone internacional não deve aparecer");
});

test("T-PII-9: fixture sanitizada não contém PII residual", () => {
  // A fixture já é sanitizada — não deve ter PII real.
  // hasPiiResidue é uma verificação de segurança conservadora.
  const hasResidue = hasPiiResidue(LEASE_CONTRACT_GINA_101_SANITIZED_TEXT);
  assert.ok(!hasResidue, "Fixture sanitizada não deve conter PII detectável");
});

test("T-PII-10: texto sem PII retorna texto inalterado e detectedTypes vazio", () => {
  const input = "Contrato de locação residencial sem dados pessoais.";
  const { maskedText, detectedTypes } = maskContractPii(input);
  assert.equal(maskedText, input, "Texto sem PII não deve ser alterado");
  assert.equal(detectedTypes.length, 0, "Sem PII detectada, array deve ser vazio");
});

test("T-PII-11: valores monetários de aluguel não são mascarados", () => {
  const input = "Aluguel: R$ 1.800,00\nCondomínio: R$ 200,00";
  const { maskedText } = maskContractPii(input);
  assert.ok(maskedText.includes("1.800,00"), "Valor monetário não deve ser mascarado");
  assert.ok(maskedText.includes("200,00"), "Valor de condomínio não deve ser mascarado");
});

test("T-PII-12: maskContractPii é idempotente — aplicar duas vezes não altera resultado", () => {
  const { maskedText: once } = maskContractPii(SYNTHETIC_PII_TEXT);
  const { maskedText: twice } = maskContractPii(once);
  assert.equal(once, twice, "Masking deve ser idempotente");
});
