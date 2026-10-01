import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { imobRentalLeaseCreateSchema } from "../routes/imobCrmSchemas";
import {
  ImobRentalLeaseService,
  RENTAL_LEASE_FLOW,
  isValidCpf,
  maskTaxDocument,
} from "../services/imob/crm/imobRentalLeaseService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
const VALID_CPF = "52998224725";

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "not" in expected) return row[key] !== expected.not;
    return row[key] === expected;
  });
}

function createPrisma(seed: { properties?: Row[]; cases?: Row[] } = {}) {
  const properties = [...(seed.properties ?? [])];
  const cases = [...(seed.cases ?? [])];
  const caseEvents: Row[] = [];
  const memoryEvents: Row[] = [];
  const leads: Row[] = [];
  const prisma: any = {
    imobProperty: {
      findFirst: async ({ where }: { where: Row }) => properties.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = properties.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return { ...row, owner: null };
      },
    },
    imobOwner: { findFirst: async () => ({ id: "owner-1" }) },
    imobLead: { findFirst: async () => null, create: async ({ data }: { data: Row }) => leads.push(data) },
    imobCase: {
      findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `case-${cases.length + 1}`, ...data, owner: null, property: null, lead: null };
        cases.push(row);
        return row;
      },
    },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
    memoryEvent: {
      create: async ({ data }: { data: Row }) => memoryEvents.push(data),
      findMany: async () => [],
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma, properties, cases, caseEvents, leads };
}

const baseProperty = {
  id: "property-1",
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  ownerId: "owner-1",
  status: "ready",
  address: "Rua Exemplo, 100",
  propertyType: "kitnet",
  metadata: { externalPropertyRef: "Kitnet 01" },
};

function leaseInput(overrides: Row = {}) {
  return imobRentalLeaseCreateSchema.parse({
    propertyId: "property-1",
    tenantName: "Pessoa A",
    tenantDocument: VALID_CPF,
    tenantPhone: "47900000000",
    agreementType: "escrito",
    startDate: "2025-03-01",
    endDate: "2026-02-28",
    rentCents: 120000,
    dueDay: 10,
    adjustmentIndex: "igpm",
    adjustmentMonth: 3,
    guaranteeType: "caucao",
    guaranteeAmountCents: 240000,
    iptu: "inquilino",
    condominio: "nao_existe",
    ...overrides,
  });
}

test("CPF: checksum validation and masking", () => {
  assert.equal(isValidCpf(VALID_CPF), true);
  assert.equal(isValidCpf("52998224700"), false);
  assert.equal(isValidCpf("11111111111"), false);
  assert.equal(maskTaxDocument(VALID_CPF), "***.***.***-25");
  assert.equal(maskTaxDocument(null), null);
});

test("schema: rejects end before start, bad dates and malformed documents", () => {
  assert.equal(imobRentalLeaseCreateSchema.safeParse({ propertyId: "p", tenantName: "A", startDate: "2026-01-01", endDate: "2025-01-01" }).success, false);
  assert.equal(imobRentalLeaseCreateSchema.safeParse({ propertyId: "p", tenantName: "A", startDate: "01/03/2025" }).success, false);
  assert.equal(imobRentalLeaseCreateSchema.safeParse({ propertyId: "p", tenantName: "A", tenantDocument: "123" }).success, false);
  const minimal = imobRentalLeaseCreateSchema.parse({ propertyId: "p", tenantName: "A" });
  assert.equal(minimal.agreementType, "desconhecido");
  assert.equal(minimal.guaranteeType, "desconhecido");
});

test("registers a lease as a rental.lease case linked to the property, without creating a lead", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const result = await new ImobRentalLeaseService(fixture.prisma).registerLease(scope, leaseInput());

  assert.equal(result.status, "created");
  assert.equal(fixture.leads.length, 0, "a current lease must not create a sales lead");
  assert.equal(fixture.cases.length, 1);
  const [created] = fixture.cases;
  assert.equal(created.flow, RENTAL_LEASE_FLOW);
  assert.equal(created.status, "active");
  assert.equal(created.propertyId, "property-1");
  assert.equal(created.ownerId, "owner-1");
  assert.equal(created.leadId, null);
  assert.equal(created.metadata.tenantParty.document.value, VALID_CPF);
  assert.equal(created.metadata.tenantParty.document.origin, "informed_by_manager");
  assert.equal(created.metadata.rentCents.value, 120000);
  assert.equal(created.metadata.adjustmentIndex.value, "IGPM");
  assert.equal(created.metadata.guarantee.receivedStatus, "not_tracked");
  assert.deepEqual(created.pendingItems, ["vincular_contrato_pdf"]);
  assert.equal(fixture.caseEvents[0]?.type, "rental.lease.registered");
  assert.deepEqual(fixture.properties[0]?.metadata.occupancy, { value: "locado", origin: "informed_by_manager" });
  assert.equal(fixture.properties[0]?.metadata.externalPropertyRef, "Kitnet 01", "existing property metadata is kept");

  if (result.status !== "created") return;
  assert.equal(result.data.propertyLabel, "Kitnet 01");
  assert.equal(result.data.tenantDocumentMasked, "***.***.***-25");
  assert.doesNotMatch(JSON.stringify(result.data), new RegExp(VALID_CPF), "response never echoes the full CPF");
});

test("missing values stay unknown and become pending items (nothing inferred)", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const input = imobRentalLeaseCreateSchema.parse({ propertyId: "property-1", tenantName: "Pessoa B", agreementType: "verbal" });
  const result = await new ImobRentalLeaseService(fixture.prisma).registerLease(scope, input);

  assert.equal(result.status, "created");
  const [created] = fixture.cases;
  assert.deepEqual(created.pendingItems, ["aluguel", "inicio", "vencimento_dia", "inquilino_documento"]);
  assert.deepEqual(created.metadata.rentCents, { value: null, origin: "unknown" });
  assert.deepEqual(created.metadata.agreementType, { value: "verbal", origin: "informed_by_manager" });
});

test("refuses a second active lease on the same property", async () => {
  const fixture = createPrisma({
    properties: [{ ...baseProperty }],
    cases: [{ id: "case-existing", tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId: "property-1", flow: RENTAL_LEASE_FLOW, status: "active" }],
  });
  const result = await new ImobRentalLeaseService(fixture.prisma).registerLease(scope, leaseInput());
  assert.deepEqual(result, { status: "lease_already_active", caseId: "case-existing" });
  assert.equal(fixture.cases.length, 1);
});

test("refuses unknown, archived or foreign-workspace properties and invalid CPF", async () => {
  const service = (properties: Row[]) => new ImobRentalLeaseService(createPrisma({ properties }).prisma);
  assert.equal((await service([]).registerLease(scope, leaseInput())).status, "property_not_found");
  assert.equal((await service([{ ...baseProperty, status: "archived" }]).registerLease(scope, leaseInput())).status, "property_not_found");
  assert.equal((await service([{ ...baseProperty, workspaceId: "workspace-b" }]).registerLease(scope, leaseInput())).status, "property_not_found");
  assert.equal((await service([{ ...baseProperty }]).registerLease(scope, leaseInput({ tenantDocument: "52998224700" }))).status, "invalid_document");
});

test("route: POST /rentals checks IMOB chat and stage permissions before writing", () => {
  const source = readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8");
  const start = source.indexOf('router.post("/rentals"');
  assert.ok(start >= 0);
  const block = source.slice(start, source.indexOf("router.post(", start + 10));
  assert.ok(block.indexOf('"imob.chat.use"') < block.indexOf("registerLease("));
  assert.ok(block.indexOf("ensureImobStagePermission(") < block.indexOf("registerLease("));
  assert.match(block, /imobRentalLeaseCreateSchema\.safeParse/);
});

test("opening the lease form in the chat persists nothing (no empty lead or case)", async () => {
  const { resolveImobTurn } = await import("../services/imob/imobTurnResolver");
  const resolved = resolveImobTurn({
    message: "quero cadastrar locatário",
    access: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, entitlements: { REAL_ESTATE_CORE: true } },
  });
  assert.equal(resolved.presentation.form?.entity, "locacao");

  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const { ImobCrmMutationService } = await import("../services/imob/crm/imobCrmMutationService");
  const persisted = await new ImobCrmMutationService(fixture.prisma).upsertCaseFromResolvedTurn(scope, {
    threadId: "thread-1",
    resolved: resolved as any,
  });
  assert.equal(persisted, null);
  assert.equal(fixture.leads.length, 0);
  assert.equal(fixture.cases.length, 0);
});
