import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImobPropertyOptions,
  buildRentalLeaseConfirmationText,
  buildRentalLeaseRequest,
  isRentalLeaseForm,
  parseBrDate,
  parseBrlToCents,
} from "./rentalLeaseForm";

const VALID_CPF_MASKED = "529.982.247-25";

test("rental lease form is recognized only by its entity", () => {
  assert.equal(isRentalLeaseForm({ entity: "locacao" }), true);
  assert.equal(isRentalLeaseForm({ entity: "locatario" }), false);
  assert.equal(isRentalLeaseForm(null), false);
});

test("parses Brazilian money and dates", () => {
  assert.equal(parseBrlToCents("1.200,00"), 120000);
  assert.equal(parseBrlToCents("R$ 850,5"), 85050);
  assert.equal(parseBrlToCents("1200"), 120000);
  assert.equal(parseBrlToCents(""), null);
  assert.ok(Number.isNaN(parseBrlToCents("mil reais")));
  assert.equal(parseBrDate("01/03/2025"), "2025-03-01");
  assert.equal(parseBrDate(""), null);
  assert.equal(parseBrDate("31/02/2025"), "");
  assert.equal(parseBrDate("2025-03-01"), "");
});

test("builds the structured request with digits-only document and phone", () => {
  const result = buildRentalLeaseRequest({
    propertyId: "property-1",
    tenantName: " Pessoa A ",
    tenantDocument: VALID_CPF_MASKED,
    tenantPhone: "(47) 99999-0000",
    tenantEmail: "",
    agreementType: "escrito",
    startDate: "01/03/2025",
    endDate: "28/02/2026",
    rent: "1.200,00",
    dueDay: "10",
    adjustmentIndex: "IGPM",
    adjustmentMonth: "3",
    guaranteeType: "caucao",
    guaranteeAmount: "2.400,00",
    iptu: "inquilino",
    condominio: "inquilino",
    condominioAmount: "350,00",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    propertyId: "property-1",
    tenantName: "Pessoa A",
    tenantDocument: "52998224725",
    tenantPhone: "47999990000",
    tenantEmail: null,
    agreementType: "escrito",
    startDate: "2025-03-01",
    endDate: "2026-02-28",
    rentCents: 120000,
    dueDay: 10,
    adjustmentIndex: "IGPM",
    adjustmentMonth: 3,
    guaranteeType: "caucao",
    guaranteeAmountCents: 240000,
    iptu: "inquilino",
    condominio: "inquilino",
    condominioAmountCents: 35000,
  });
});

test("only property and tenant name are required; blanks stay null (nothing inferred)", () => {
  const result = buildRentalLeaseRequest({ propertyId: "property-1", tenantName: "Pessoa B" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.rentCents, null);
  assert.equal(result.request.startDate, null);
  assert.equal(result.request.agreementType, "desconhecido");
  assert.equal(result.request.guaranteeType, "desconhecido");
  assert.equal(result.request.iptu, "desconhecido");
});

test("reports field errors in Portuguese and never submits invalid data", () => {
  const result = buildRentalLeaseRequest({
    propertyId: "",
    tenantName: "",
    tenantDocument: "529.982.247-00",
    tenantPhone: "123",
    tenantEmail: "x@",
    startDate: "01/03/2026",
    endDate: "01/03/2025",
    rent: "abc",
    dueDay: "40",
    adjustmentMonth: "13",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "adjustmentMonth", "dueDay", "endDate", "propertyId", "rent", "tenantDocument", "tenantEmail", "tenantName", "tenantPhone",
  ]);
  assert.match(result.errors.tenantDocument, /CPF inválido/);
});

test("confirmation text shows only the masked document and readable pending items", () => {
  const text = buildRentalLeaseConfirmationText({
    propertyLabel: "Kitnet 01",
    tenantName: "Pessoa A",
    tenantDocumentMasked: "***.***.***-25",
    pendingItems: ["vincular_contrato_pdf"],
  });
  assert.equal(text, "Locação cadastrada: Kitnet 01 — inquilino Pessoa A (***.***.***-25). Pendências: anexar o PDF do contrato.");
  assert.doesNotMatch(text, /52998224725/);
});

test("property options skip archived items and use the unit label without personal data", () => {
  const options = buildImobPropertyOptions([
    { id: "p2", status: "ready", propertyType: "sala_comercial", address: "Rua B, 2", city: "Itapema", metadata: { externalPropertyRef: "Sala 01" } },
    { id: "p1", status: "ready", propertyType: "kitnet", address: "Rua A, 1", city: null, metadata: null },
    { id: "p3", status: "archived", propertyType: "casa", address: "Rua C", city: null, metadata: null },
  ]);
  assert.deepEqual(options, [
    { value: "p1", label: "Kitnet — Rua A, 1" },
    { value: "p2", label: "Sala 01 — Rua B, 2 · Itapema" },
  ]);
});

test("condominium amount is optional and refused when condominium does not exist", () => {
  const blank = buildRentalLeaseRequest({ propertyId: "p", tenantName: "A", condominio: "dispensado" });
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.request.condominioAmountCents, null);
  const conflict = buildRentalLeaseRequest({ propertyId: "p", tenantName: "A", condominio: "nao_existe", condominioAmount: "100,00" });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.match(conflict.errors.condominioAmount, /Não existe/);
  const invalid = buildRentalLeaseRequest({ propertyId: "p", tenantName: "A", condominioAmount: "trezentos" });
  assert.equal(invalid.ok, false);
});
