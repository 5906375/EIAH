import assert from "node:assert/strict";
import test from "node:test";

import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import {
  RENTAL_CONTRACT_SUBMIT_TARGET,
  buildRentalContractConfirmationText,
  buildRentalContractForm,
  buildRentalContractRequest,
  describeRentalContractError,
  isRentalContractForm,
  rentalContractPrefillToValues,
} from "./rentalContractForm";

const prefill = {
  propertyId: "p1",
  leaseCaseId: "c1",
  landlordName: "Proprietária A",
  landlordDocument: "52998224725",
  tenantName: "Inquilino B",
  tenantDocument: null,
  propertyAddress: "Rua Exemplo, 100, Cidade X",
  purpose: "residencial" as const,
  registryNumber: null,
  startDate: "2025-03-01",
  durationMonths: 12,
  rentCents: 120000,
  dueDay: 10,
  adjustmentIndex: "IGP-M",
  adjustmentMonth: 3,
  guaranteeType: "caucao",
  guaranteeAmountCents: 240000,
  guarantorName: null,
  iptu: "inquilino",
  condominio: "nao_existe",
  condominioAmountCents: null,
  forumCity: "Cidade X",
  gaps: [],
};

test("contrato de locação aparece em Locações e em Negócios, como formulário", () => {
  const rentals = IMOB_ACTION_MENUS.find((menu) => menu.id === "rentals")!;
  const deals = IMOB_ACTION_MENUS.find((menu) => menu.id === "deals")!;
  assert.ok(rentals.items.some((item) => item.kind === "local" && item.form === "contract_rental"));
  assert.ok(deals.items.some((item) => item.kind === "local" && item.form === "contract_rental"));
  assert.equal(deals.items.some((item) => item.kind === "prompt" && /contrato/i.test(item.label)), false);
});

test("formulário começa pelo imóvel da locação e grava direto", () => {
  const form = buildRentalContractForm();
  assert.equal(form.submitTarget, RENTAL_CONTRACT_SUBMIT_TARGET);
  assert.ok(isRentalContractForm(form));
  assert.equal(form.fields[0].name, "propertyId");
  assert.equal(form.fields[0].optionsSource, "imob_properties");
});

test("cadastro preenche o formulário e o que falta fica vazio", () => {
  const values = rentalContractPrefillToValues(prefill);
  assert.equal(values.landlordName, "Proprietária A");
  assert.equal(values.tenantDocument, "");
  assert.equal(values.startDate, "01/03/2025");
  assert.equal(values.rentValue, "1.200,00");
  assert.equal(values.guaranteeAmount, "2.400,00");
  assert.equal(values.adjustmentIndex, "IGP-M");
  assert.equal(values.durationMonths, "12");
});

test("pedido completo vira request; faltas e CPF inválido viram erro por campo", () => {
  const values = { propertyId: "p1", ...rentalContractPrefillToValues(prefill) };
  const missing = buildRentalContractRequest(values);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.deepEqual(Object.keys(missing.errors), ["tenantDocument"]);

  const invalid = buildRentalContractRequest({ ...values, tenantDocument: "123.456.789-88" });
  assert.equal(invalid.ok, false);

  const built = buildRentalContractRequest({ ...values, tenantDocument: "111.444.777-35" });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.request.tenantDocument, "11144477735");
  assert.equal(built.request.startDate, "2025-03-01");
  assert.equal(built.request.rentCents, 120000);
  assert.equal(built.request.adjustmentIndex, "IGP-M");
  assert.equal(built.request.adjustmentMonth, 3);
});

test("sem reajuste e fiador", () => {
  const values = { propertyId: "p1", ...rentalContractPrefillToValues(prefill), tenantDocument: "11144477735" };
  const noAdjustment = buildRentalContractRequest({ ...values, adjustmentIndex: "sem_reajuste" });
  assert.equal(noAdjustment.ok && noAdjustment.request.adjustmentIndex, null);
  const guarantor = buildRentalContractRequest({ ...values, guaranteeType: "fiador", guarantorName: "" });
  assert.equal(guarantor.ok, false);
  if (!guarantor.ok) assert.ok(guarantor.errors.guarantorName);
});

test("confirmação não traz dados pessoais; erros em português", () => {
  const text = buildRentalContractConfirmationText({ propertyLabel: "Kitnet 01", fileName: "minuta-locacao.pdf", writtenBack: ["CPF/CNPJ do locatário na locação"] });
  assert.match(text, /Minuta de contrato de locação gerada e anexada à locação de Kitnet 01/);
  assert.doesNotMatch(text, /\d{11}/);
  assert.match(describeRentalContractError(404, "RENTAL_LEASE_NOT_FOUND"), /não tem locação ativa/);
});
