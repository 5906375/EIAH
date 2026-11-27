import test from "node:test";
import assert from "node:assert/strict";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import { inlineDocumentSubjectFor, withInlineDocumentFields } from "./documentAttachForm";
import {
  activeLeaseToFormValues,
  buildRentalCloseConfirmationText,
  buildRentalCloseForm,
  buildRentalCloseRequest,
  buildRentalEditConfirmationText,
  buildRentalEditForm,
  buildRentalEditRequest,
  buildRentalHistoryLines,
  buildRentalHistoryText,
  describeRentalLifecycleError,
  isRentalCloseForm,
  isRentalEditForm,
  isRentalHistoryForm,
} from "./rentalLifecycleForms";
import { isRentalLeaseForm } from "./rentalLeaseForm";

const activeLease = {
  caseId: "case-1",
  pendingItems: ["vincular_contrato_pdf"],
  values: {
    propertyId: "property-1",
    tenantName: "Inquilino B",
    tenantDocument: "11144477735",
    tenantPhone: "47999990000",
    tenantEmail: null,
    agreementType: "escrito" as const,
    startDate: "2025-03-01",
    endDate: "2026-02-28",
    rentCents: 120000,
    dueDay: 10,
    adjustmentIndex: "igpm",
    adjustmentMonth: 3,
    guaranteeType: "caucao" as const,
    guaranteeAmountCents: 240000,
    iptu: "inquilino" as const,
    condominio: "nao_existe" as const,
    condominioAmountCents: null,
  },
};

test("Locações ganha Editar, Encerrar e Histórico como formulários", () => {
  const rentals = IMOB_ACTION_MENUS.find((menu) => menu.id === "rentals")!;
  const items = Object.fromEntries(rentals.items.map((item) => [item.label, item]));
  for (const label of ["Editar locação", "Encerrar locação", "Histórico de locações"]) {
    assert.equal(items[label]?.kind, "local", label);
  }
  assert.equal(isRentalEditForm(buildRentalEditForm()), true);
  assert.equal(isRentalLeaseForm(buildRentalEditForm()), false, "edição não cai no handler de cadastro");
  assert.equal(isRentalCloseForm(buildRentalCloseForm()), true);
  assert.equal(isRentalHistoryForm(buildRentalEditForm()), false);
});

test("edição: locação ativa preenche o formulário e salva com a validação do cadastro", () => {
  const values = activeLeaseToFormValues(activeLease);
  assert.equal(values.startDate, "01/03/2025");
  assert.equal(values.rent, "1.200,00");
  assert.equal(values.adjustmentIndex, "IGPM");
  assert.equal(values.adjustmentMonth, "3");
  assert.equal(values.condominioAmount, "");
  const formFieldNames = buildRentalEditForm().fields.map((field) => field.name);
  for (const name of Object.keys(values)) assert.ok(formFieldNames.includes(name), name);

  const built = buildRentalEditRequest({ ...values, propertyId: "property-1", rent: "1.350,00" });
  assert.equal(built.ok, true);
  if (built.ok) assert.equal(built.request.rentCents, 135000);
  const invalid = buildRentalEditRequest({ ...values, propertyId: "property-1", tenantDocument: "111.444.777-00" });
  assert.equal(invalid.ok, false);
});

test("confirmação da edição lista campos alterados e pendências, sem valores", () => {
  const text = buildRentalEditConfirmationText({ propertyLabel: "Kitnet 01", changed: ["rentCents", "dueDay"], pendingItems: ["vincular_contrato_pdf"], unchanged: false });
  assert.equal(text, "Locação de Kitnet 01 corrigida: aluguel, vencimento. Pendências: anexar o PDF do contrato.");
  assert.equal(buildRentalEditConfirmationText({ propertyLabel: "Kitnet 01", changed: [], pendingItems: [], unchanged: true }), "Nada mudou na locação de Kitnet 01.");
});

test("encerrar: exige data passada ou de hoje e motivo; aceita documentos no próprio formulário", () => {
  const today = "2026-02-10";
  assert.deepEqual(buildRentalCloseRequest({}, today), {
    ok: false,
    errors: { propertyId: "Selecione o imóvel.", endedOn: "Informe a data de saída.", reason: "Escolha o motivo." },
  });
  const future = buildRentalCloseRequest({ propertyId: "p1", endedOn: "11/02/2026", reason: "fim_contrato" }, today);
  assert.equal(future.ok, false);
  const bad = buildRentalCloseRequest({ propertyId: "p1", endedOn: "31/02/2026", reason: "fim_contrato" }, today);
  assert.equal(!bad.ok && bad.errors.endedOn, "Use o formato DD/MM/AAAA.");
  assert.deepEqual(buildRentalCloseRequest({ propertyId: "p1", endedOn: "10/02/2026", reason: "inadimplencia", notes: " chaves ok " }, today), {
    ok: true,
    request: { propertyId: "p1", endedOn: "2026-02-10", reason: "inadimplencia", notes: "chaves ok" },
  });
  const withDocs = withInlineDocumentFields(buildRentalCloseForm());
  assert.equal(inlineDocumentSubjectFor(withDocs), "rentals");
  assert.ok(withDocs.fields.some((field) => field.name === "documents"));
  assert.equal(
    buildRentalCloseConfirmationText({ propertyLabel: "Kitnet 01", endedOn: "2026-01-31", reason: "rescisao_locatario", documentsNote: "1 documento anexado." }),
    "Locação de Kitnet 01 encerrada em 31/01/2026 (Rescisão pelo inquilino). O imóvel voltou a vago e a locação está no histórico. 1 documento anexado.",
  );
});

test("histórico: uma linha por locação, CPF só mascarado", () => {
  const items = [
    {
      caseId: "c2", status: "active" as const, tenantName: "Inquilino B", tenantDocumentMasked: "***.***.***-35", startDate: "2025-03-01",
      endDate: "2026-02-28", endedOn: null, closeReason: null, rentCents: 120000, documents: [], registeredAt: "2025-03-01T00:00:00Z",
    },
    {
      caseId: "c1", status: "closed" as const, tenantName: "Antigo", tenantDocumentMasked: null, startDate: "2023-01-01", endDate: null,
      endedOn: "2024-12-31", closeReason: "fim_contrato" as const, rentCents: null,
      documents: [{ documentId: "d1", category: "vistoria", fileName: "vistoria.pdf", url: "/uploads/d1" }, { documentId: "d2", category: "outro", fileName: "x.pdf", url: null }],
      registeredAt: "2023-01-01T00:00:00Z",
    },
  ];
  assert.deepEqual(buildRentalHistoryLines(items), [
    "Ativa · Inquilino B (***.***.***-35) · desde 01/03/2025 · R$ 1.200,00 · sem documentos",
    "Encerrada · Antigo · 01/01/2023 a 31/12/2024 · Fim do contrato · 2 documentos",
  ]);
  assert.equal(buildRentalHistoryText("Kitnet 01", items), "Histórico de Kitnet 01: 1 locação ativa e 1 encerrada.");
  assert.equal(buildRentalHistoryText("Kitnet 01", []), "Kitnet 01 ainda não tem locações cadastradas.");
});

test("erros em português", () => {
  assert.match(describeRentalLifecycleError(404, "RENTAL_LEASE_NOT_FOUND", "encerrar"), /não tem locação ativa/);
  assert.equal(describeRentalLifecycleError(403, undefined, "encerrar"), "Sua função atual não pode encerrar locações neste workspace.");
});
