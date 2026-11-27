import assert from "node:assert/strict";
import test from "node:test";

import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import { withInlineDocumentFields } from "./documentAttachForm";
import {
  SALE_CONTRACT_SUBMIT_TARGET,
  buildSaleContractConfirmationText,
  buildSaleContractForm,
  buildSaleContractRequest,
  isSaleContractForm,
  saleContractPrefillToValues,
} from "./saleContractForm";

const prefill = {
  propertyId: "p1",
  saleCaseId: null,
  sellerName: "Vendedora A",
  sellerDocument: "52998224725",
  buyerName: null,
  buyerDocument: null,
  propertyAddress: "Rua Venda, 50, Cidade Y",
  registryNumber: null,
  priceCents: 50000000,
  downPaymentCents: null,
  paymentMethod: null,
  balanceTerms: null,
  deedDeadlineDays: null,
  possession: null,
  commissionPercent: null,
  forumCity: "Cidade Y",
  gaps: [],
};

test("Contrato de venda está em Negócios, como formulário", () => {
  const deals = IMOB_ACTION_MENUS.find((menu) => menu.id === "deals")!;
  assert.ok(deals.items.some((item) => item.kind === "local" && item.form === "contract_sale" && item.label === "Contrato de venda"));
});

test("formulário começa pelo imóvel e ganha documentos no fim", () => {
  const form = withInlineDocumentFields(buildSaleContractForm());
  assert.equal(form.submitTarget, SALE_CONTRACT_SUBMIT_TARGET);
  assert.ok(isSaleContractForm(form));
  assert.equal(form.fields[0].optionsSource, "imob_properties");
  assert.equal(form.fields.at(-1)?.type, "file");
});

test("cadastro preenche vendedor, imóvel e preço; comprador fica para completar", () => {
  const values = saleContractPrefillToValues(prefill);
  assert.equal(values.sellerName, "Vendedora A");
  assert.equal(values.priceValue, "500.000,00");
  assert.equal(values.buyerName, "");
});

test("validação e montagem do pedido", () => {
  const values = { propertyId: "p1", ...saleContractPrefillToValues(prefill) };
  const missing = buildSaleContractRequest(values);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    for (const key of ["buyerName", "buyerDocument", "paymentMethod", "possession", "deedDeadlineDays"]) assert.ok(missing.errors[key], key);
  }
  const complete = {
    ...values,
    buyerName: "Comprador B",
    buyerDocument: "111.444.777-35",
    downPayment: "50.000,00",
    paymentMethod: "financiamento",
    deedDeadlineDays: "60",
    possession: "escritura",
    commissionPercent: "6",
  };
  const built = buildSaleContractRequest(complete);
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.request.priceCents, 50000000);
    assert.equal(built.request.downPaymentCents, 5000000);
    assert.equal(built.request.buyerDocument, "11144477735");
    assert.equal(built.request.commissionPercent, 6);
  }
  const tooHigh = buildSaleContractRequest({ ...complete, downPayment: "600.000,00" });
  assert.equal(tooHigh.ok, false);
  if (!tooHigh.ok) assert.match(tooHigh.errors.downPayment, /maior que o preço/);
});

test("confirmação sem dados pessoais", () => {
  const text = buildSaleContractConfirmationText({ propertyLabel: "Casa 1", fileName: "minuta-compra-venda.pdf", writtenBack: [] });
  assert.match(text, /Minuta de compra e venda gerada e anexada ao imóvel Casa 1/);
  assert.doesNotMatch(text, /\d{11}/);
});
