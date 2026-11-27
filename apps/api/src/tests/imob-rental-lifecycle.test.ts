import assert from "node:assert/strict";
import test from "node:test";

import { imobRentalLeaseCloseSchema, imobRentalLeaseCreateSchema } from "../routes/imobCrmSchemas";
import {
  ImobRentalLeaseLifecycleService,
  diffRentalLeaseFields,
  rentalLeasePendingAfterEdit,
  rentalLeaseToInput,
  validateRentalLeaseClose,
} from "../services/imob/crm/imobRentalLeaseService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
const TENANT_CPF = "11144477735";
type Row = Record<string, any>;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "not" in expected) return row[key] !== expected.not;
    return row[key] === expected;
  });
}

function createPrisma(seed: { properties?: Row[]; cases?: Row[] }) {
  const properties = (seed.properties ?? []).map((row) => structuredClone(row));
  const cases = (seed.cases ?? []).map((row) => structuredClone(row));
  const caseEvents: Row[] = [];
  const update = (rows: Row[]) => async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((item) => item.id === where.id)!;
    Object.assign(row, data);
    return row;
  };
  const prisma: any = {
    imobProperty: { findFirst: async ({ where }: { where: Row }) => properties.find((row) => matches(row, where)) ?? null, update: update(properties) },
    imobCase: {
      findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => cases.filter((row) => matches(row, where)).sort((a, b) => b.createdAt - a.createdAt),
      update: update(cases),
    },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
  };
  prisma.$transaction = async (fn: (tx: any) => Promise<unknown>) => fn(prisma);
  return { prisma, properties, cases, caseEvents };
}

const base = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
const property = { ...base, id: "property-1", status: "ready", metadata: { externalPropertyRef: "Kitnet 01", occupancy: { value: "locado" } } };
const informed = (value: unknown) => ({ value, origin: value === null ? "unknown" : "informed_by_manager" });
const lease = {
  ...base,
  id: "case-1",
  propertyId: "property-1",
  flow: "rental.lease",
  status: "active",
  stage: "active",
  createdAt: new Date("2025-03-01T12:00:00Z"),
  pendingItems: ["inquilino_documento", "vincular_contrato_pdf"],
  metadata: {
    importSource: "imob_rental_lease_form_v1",
    stableAgreementKey: "rental:property-1:2025-03-01",
    hasLinkedDocument: false,
    agreementType: informed("escrito"),
    tenantParty: { name: informed("Inquilino B"), document: informed(null), phone: informed("47999990000"), email: informed(null) },
    startDate: informed("2025-03-01"),
    endDate: informed("2026-02-28"),
    rentCents: informed(120000),
    dueDay: informed(10),
    adjustmentIndex: informed("IGPM"),
    adjustmentMonth: informed(3),
    guarantee: { type: informed("caucao"), expectedAmountCents: informed(240000), receivedStatus: "not_tracked" },
    charges: { iptu: informed("inquilino"), condominio: informed("nao_existe"), condominioAmountCents: informed(null) },
    notes: null,
    documents: [{ documentId: "doc-1", category: "minuta_contrato", fileName: "minuta.pdf", url: "/uploads/doc-1" }],
    contractTerms: { durationMonths: 12 },
  },
};

const editInput = (overrides: Row = {}) => imobRentalLeaseCreateSchema.parse({
  ...rentalLeaseToInput("property-1", lease.metadata),
  ...overrides,
});

test("rentalLeaseToInput devolve os valores da locação no formato do cadastro", () => {
  const values = rentalLeaseToInput("property-1", lease.metadata);
  assert.equal(values.tenantName, "Inquilino B");
  assert.equal(values.rentCents, 120000);
  assert.equal(values.agreementType, "escrito");
  assert.equal(values.guaranteeType, "caucao");
  assert.equal(values.tenantDocument, null);
});

test("editar locação grava só os campos novos, preserva documentos e registra só nomes de campos", async () => {
  const { prisma, cases, caseEvents } = createPrisma({ properties: [property], cases: [lease] });
  const result = await new ImobRentalLeaseLifecycleService(prisma).update(scope, editInput({ rentCents: 135000, tenantDocument: TENANT_CPF }));
  assert.equal(result.status, "updated");
  if (result.status !== "updated") return;
  assert.deepEqual(result.data.changed.sort(), ["rentCents", "tenantDocument"]);
  const saved = cases[0];
  assert.equal(saved.metadata.rentCents.value, 135000);
  assert.equal(saved.metadata.tenantParty.document.value, TENANT_CPF);
  assert.equal(saved.metadata.documents.length, 1, "documentos vinculados continuam");
  assert.deepEqual(saved.metadata.contractTerms, { durationMonths: 12 });
  assert.equal(saved.metadata.importSource, "imob_rental_lease_form_v1");
  assert.deepEqual(saved.pendingItems, ["vincular_contrato_pdf"], "CPF informado baixa a pendência; contrato segue pendente");
  assert.equal(caseEvents[0].type, "rental.lease.updated");
  assert.equal(JSON.stringify(caseEvents[0].payload).includes(TENANT_CPF), false, "o evento não leva o CPF");
  assert.equal(result.data.tenantDocumentMasked, "***.***.***-35");
});

test("editar sem mudança não grava nada", async () => {
  const { prisma, caseEvents } = createPrisma({ properties: [property], cases: [lease] });
  const result = await new ImobRentalLeaseLifecycleService(prisma).update(scope, editInput());
  assert.equal(result.status, "unchanged");
  assert.equal(caseEvents.length, 0);
});

test("editar recusa CPF inválido e imóvel sem locação ativa", async () => {
  const { prisma } = createPrisma({ properties: [property], cases: [lease] });
  const service = new ImobRentalLeaseLifecycleService(prisma);
  assert.equal((await service.update(scope, editInput({ tenantDocument: "11144477700" }))).status, "invalid_document");
  assert.equal((await service.update(scope, editInput({ propertyId: "property-2" }))).status, "lease_not_found");
});

test("pendência do contrato: some quando o contrato assinado já foi anexado e volta só se o acordo passou a escrito", () => {
  const input = editInput();
  assert.deepEqual(rentalLeasePendingAfterEdit(input, ["inquilino_documento"], "escrito"), ["inquilino_documento"]);
  assert.deepEqual(rentalLeasePendingAfterEdit(input, [], "verbal"), ["inquilino_documento", "vincular_contrato_pdf"]);
  assert.deepEqual(rentalLeasePendingAfterEdit(editInput({ agreementType: "verbal" }), ["vincular_contrato_pdf"], "escrito"), ["inquilino_documento"]);
});

test("diffRentalLeaseFields ignora diferença de caixa no índice", () => {
  const before = editInput();
  assert.deepEqual(diffRentalLeaseFields(before, { ...before, adjustmentIndex: "igpm" }), []);
  assert.deepEqual(diffRentalLeaseFields(before, { ...before, dueDay: 5 }), ["dueDay"]);
});

test("encerrar: locação vira encerrada, imóvel volta a vago, motivo e data no evento", async () => {
  const { prisma, cases, properties, caseEvents } = createPrisma({ properties: [property], cases: [lease] });
  const input = imobRentalLeaseCloseSchema.parse({ propertyId: "property-1", endedOn: "2026-01-31", reason: "rescisao_locatario", notes: "Entregou as chaves" });
  const result = await new ImobRentalLeaseLifecycleService(prisma).close(scope, input, "2026-02-10");
  assert.equal(result.status, "closed");
  assert.equal(cases[0].status, "closed");
  assert.equal(cases[0].stage, "ended");
  assert.deepEqual(cases[0].pendingItems, []);
  assert.equal(cases[0].metadata.closure.reason, "rescisao_locatario");
  assert.equal(cases[0].metadata.closure.endedOn, "2026-01-31");
  assert.equal(cases[0].metadata.documents.length, 1, "documentos ficam no histórico");
  assert.equal(properties[0].metadata.occupancy.value, "vago");
  assert.equal(properties[0].metadata.externalPropertyRef, "Kitnet 01");
  assert.equal(caseEvents[0].type, "rental.lease.closed");
  assert.deepEqual(caseEvents[0].payload, { source: "imob_rental_lease_form_v1", endedOn: "2026-01-31", reason: "rescisao_locatario" });

  const again = await new ImobRentalLeaseLifecycleService(prisma).close(scope, input, "2026-02-10");
  assert.equal(again.status, "lease_not_found", "não encerra duas vezes");
});

test("encerrar recusa data antes do início e data futura", () => {
  const input = { propertyId: "property-1", endedOn: "2025-02-01", reason: "fim_contrato" as const };
  assert.equal(validateRentalLeaseClose(input, "2025-03-01", "2026-02-10"), "ended_before_start");
  assert.equal(validateRentalLeaseClose({ ...input, endedOn: "2026-03-01" }, "2025-03-01", "2026-02-10"), "ended_in_future");
  assert.equal(validateRentalLeaseClose({ ...input, endedOn: "2026-02-10" }, "2025-03-01", "2026-02-10"), null);
  assert.equal(imobRentalLeaseCloseSchema.safeParse({ ...input, reason: "mudou" }).success, false);
});

test("histórico lista locação ativa e encerradas, com CPF mascarado e documentos", async () => {
  const closed = {
    ...structuredClone(lease),
    id: "case-0",
    status: "closed",
    createdAt: new Date("2023-01-01T12:00:00Z"),
    metadata: {
      ...structuredClone(lease.metadata),
      tenantParty: { name: informed("Antigo Inquilino"), document: informed(TENANT_CPF) },
      closure: { endedOn: "2024-12-31", reason: "fim_contrato" },
    },
  };
  const { prisma } = createPrisma({ properties: [property], cases: [lease, closed] });
  const result = await new ImobRentalLeaseLifecycleService(prisma).history(scope, "property-1");
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.data.items.map((item) => [item.caseId, item.status]), [["case-1", "active"], ["case-0", "closed"]]);
  const old = result.data.items[1];
  assert.equal(old.tenantDocumentMasked, "***.***.***-35");
  assert.equal(old.endedOn, "2024-12-31");
  assert.equal(old.closeReason, "fim_contrato");
  assert.equal(old.documents[0].fileName, "minuta.pdf");
  assert.equal(JSON.stringify(result.data).includes(TENANT_CPF), false, "CPF completo não sai no histórico");

  const missing = await new ImobRentalLeaseLifecycleService(prisma).history(scope, "property-x");
  assert.equal(missing.status, "property_not_found");
});
