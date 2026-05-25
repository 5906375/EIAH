import test from "node:test";
import assert from "node:assert/strict";

import { validateImobInput } from "../services/imob/validation/imobValidationEngine";
import { IMOB_VALIDATION_ENGINE_CONTRACT_ID } from "../services/imob/validation/imobValidationContract";

test("IMOB validation engine exposes the expected contract id", () => {
  assert.equal(IMOB_VALIDATION_ENGINE_CONTRACT_ID, "imob.validation.engine.v1");
});

test("IMOB validation engine preserves raw input and normalizes owner name", () => {
  const result = validateImobInput({
    rawInput: "   proprietario joao da silva   ",
    scope: "owner.create",
  });

  assert.equal(result.rawInput, "   proprietario joao da silva   ");
  assert.equal(result.normalized.text, "proprietario joao da silva");
  assert.equal(result.normalized.name, "Joao da Silva");
});

test("IMOB validation engine validates a CPF and masks it", () => {
  const result = validateImobInput({
    rawInput: "documento do proprietário João 529.982.247-25",
    scope: "owner.create",
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalized.document?.type, "cpf");
  assert.equal(result.normalized.document?.isFormatValid, true);
  assert.equal(result.normalized.document?.maskedValue, "529.982.247-25");
});

test("IMOB validation engine rejects invalid CPF format", () => {
  const result = validateImobInput({
    rawInput: "documento do proprietário João 12345678901",
    scope: "owner.create",
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers[0]?.reasonCode, "INVALID_DOCUMENT_FORMAT");
  assert.match(result.pendingFields[0]?.prompt ?? "", /cpf|cnpj válido/i);
});

test("IMOB validation engine validates a CNPJ and masks it", () => {
  const result = validateImobInput({
    rawInput: "cnpj da empresa 45.723.174/0001-10",
    scope: "owner.create",
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalized.document?.type, "cnpj");
  assert.equal(result.normalized.document?.isFormatValid, true);
  assert.equal(result.normalized.document?.maskedValue, "45.723.174/0001-10");
});

test("IMOB validation engine normalizes Brazilian phone format", () => {
  const result = validateImobInput({
    rawInput: "telefone do proprietário 47996635092",
    scope: "owner.create",
  });

  assert.equal(result.normalized.phone, "(47) 99663-5092");
  assert.ok(result.warnings.some((item) => item.reasonCode === "PHONE_FORMAT_NORMALIZED"));
});

test("IMOB validation engine flags suspicious email", () => {
  const result = validateImobInput({
    rawInput: "e-mail do lead joao@empresa",
    scope: "lead.qualify",
  });

  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((item) => item.reasonCode === "EMAIL_FORMAT_SUSPECT"));
  assert.ok(result.blockers.some((item) => item.reasonCode === "INVALID_EMAIL_FORMAT"));
});

test("IMOB validation engine structures address and detects incompleteness", () => {
  const result = validateImobInput({
    rawInput: "Rua Barao do Rio Branco, Centro",
    scope: "property.create",
  });

  assert.equal(result.normalized.address?.street, "Rua Barao do Rio Branco");
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.reasonCode === "ADDRESS_INCOMPLETE"));
});

test("IMOB validation engine structures a complete property address", () => {
  const result = validateImobInput({
    rawInput: "Rua Barao do Rio Branco, 100, Centro, Itajai",
    scope: "property.create",
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalized.address?.street, "Rua Barao do Rio Branco");
  assert.equal(result.normalized.address?.number, "100");
  assert.equal(result.normalized.address?.city, "Itajai");
});
