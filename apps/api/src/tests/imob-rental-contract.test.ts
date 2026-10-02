import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { imobRentalContractGenerateSchema } from "../routes/imobCrmSchemas";
import { buildRentalContractText, computeEndDate, monthsBetween } from "../services/contracts/rentalContractTemplate";
import {
  ImobRentalContractService,
  composePropertyAddress,
  purposeFromPropertyType,
} from "../services/imob/crm/imobRentalContractService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
const LANDLORD_CPF = "52998224725";
const TENANT_CPF = "11144477735";
type Row = Record<string, any>;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "not" in expected) return row[key] !== expected.not;
    return row[key] === expected;
  });
}

function createPrisma(seed: { owners?: Row[]; properties?: Row[]; cases?: Row[] }) {
  const owners = [...(seed.owners ?? [])];
  const properties = [...(seed.properties ?? [])];
  const cases = [...(seed.cases ?? [])];
  const caseEvents: Row[] = [];
  const memoryEvents: Row[] = [];
  const update = (rows: Row[]) => async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((item) => item.id === where.id)!;
    Object.assign(row, data);
    return row;
  };
  const prisma: any = {
    imobOwner: { findFirst: async ({ where }: { where: Row }) => owners.find((row) => matches(row, where)) ?? null, update: update(owners) },
    imobProperty: { findFirst: async ({ where }: { where: Row }) => properties.find((row) => matches(row, where)) ?? null, update: update(properties) },
    imobCase: { findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null, update: update(cases) },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
    memoryEvent: { create: async ({ data }: { data: Row }) => memoryEvents.push(data) },
  };
  return { prisma, owners, properties, cases, caseEvents, memoryEvents };
}

const base = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
const owner = { ...base, id: "owner-1", status: "ready", name: "Proprietária A", document: LANDLORD_CPF, metadata: null };
const property = {
  ...base,
  id: "property-1",
  status: "ready",
  ownerId: "owner-1",
  propertyType: "kitnet",
  address: "Rua Exemplo, 100",
  neighborhood: "Centro",
  city: "Cidade X",
  metadata: { externalPropertyRef: "Kitnet 01" },
};
const lease = {
  ...base,
  id: "case-1",
  propertyId: "property-1",
  flow: "rental.lease",
  status: "active",
  pendingItems: ["inquilino_documento", "vincular_contrato_pdf"],
  metadata: {
    tenantParty: { name: { value: "Inquilino B", origin: "informed_by_manager" }, document: { value: null, origin: "unknown" } },
    startDate: { value: "2025-03-01", origin: "informed_by_manager" },
    endDate: { value: "2026-02-28", origin: "informed_by_manager" },
    rentCents: { value: 120000, origin: "informed_by_manager" },
    dueDay: { value: 10, origin: "informed_by_manager" },
    adjustmentIndex: { value: "IGPM", origin: "informed_by_manager" },
    adjustmentMonth: { value: 3, origin: "informed_by_manager" },
    guarantee: { type: { value: "caucao", origin: "informed_by_manager" }, expectedAmountCents: { value: 240000, origin: "informed_by_manager" } },
    charges: { iptu: { value: "inquilino" }, condominio: { value: "nao_existe" }, condominioAmountCents: { value: null } },
  },
};

const generateInput = (overrides: Row = {}) => imobRentalContractGenerateSchema.parse({
  propertyId: "property-1",
  landlordName: "Proprietária A",
  landlordDocument: LANDLORD_CPF,
  tenantName: "Inquilino B",
  tenantDocument: TENANT_CPF,
  propertyAddress: "Rua Exemplo, 100, unidade Kitnet 01, Cidade X",
  purpose: "residencial",
  registryNumber: "12.345",
  startDate: "2025-03-01",
  durationMonths: 12,
  rentCents: 120000,
  dueDay: 10,
  adjustmentIndex: "IGP-M",
  adjustmentMonth: 3,
  guaranteeType: "caucao",
  guaranteeAmountCents: 240000,
  iptu: "inquilino",
  condominio: "nao_existe",
  forumCity: "Cidade X",
  ...overrides,
});

test("prefill puxa locador do proprietário, imóvel e valores da locação", async () => {
  const { prisma } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property }], cases: [structuredClone(lease)] });
  const result = await new ImobRentalContractService(prisma).prefill(scope, "property-1");
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  const data = result.data;
  assert.equal(data.landlordName, "Proprietária A");
  assert.equal(data.landlordDocument, LANDLORD_CPF);
  assert.equal(data.tenantName, "Inquilino B");
  assert.equal(data.tenantDocument, null);
  assert.equal(data.purpose, "residencial");
  assert.equal(data.durationMonths, 12);
  assert.equal(data.rentCents, 120000);
  assert.equal(data.adjustmentIndex, "IGP-M");
  assert.equal(data.guaranteeType, "caucao");
  assert.equal(data.forumCity, "Cidade X");
  assert.match(data.propertyAddress ?? "", /Rua Exemplo, 100, unidade Kitnet 01, bairro Centro, Cidade X/);
  assert.deepEqual(data.gaps, []);
});

test("prefill avisa quando o imóvel não tem proprietário e quando não há locação ativa", async () => {
  const { prisma } = createPrisma({ properties: [{ ...property, ownerId: null }], cases: [structuredClone(lease)] });
  const service = new ImobRentalContractService(prisma);
  const result = await service.prefill(scope, "property-1");
  assert.equal(result.status, "ok");
  if (result.status === "ok") assert.match(result.data.gaps[0], /sem proprietário/);
  assert.equal((await service.prefill(scope, "property-x")).status, "lease_not_found");
});

test("gerar devolve ao cadastro o CPF do locatário e a matrícula, sem sobrescrever", async () => {
  const { prisma, cases, properties, caseEvents } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property, metadata: { ...property.metadata } }], cases: [structuredClone(lease)] });
  const result = await new ImobRentalContractService(prisma).generate(scope, generateInput());
  assert.equal(result.status, "generated");
  if (result.status !== "generated") return;
  assert.equal(cases[0].metadata.tenantParty.document.value, TENANT_CPF);
  assert.deepEqual(cases[0].pendingItems, ["vincular_contrato_pdf"]);
  assert.equal(cases[0].metadata.contractTerms.purpose, "residencial");
  assert.equal(properties[0].metadata.registryNumber, "12.345");
  assert.ok(result.data.writtenBack.includes("CPF/CNPJ do locatário na locação"));
  assert.equal(caseEvents[0].type, "rental.lease.contract_draft_generated");
  assert.doesNotMatch(JSON.stringify(caseEvents[0]), new RegExp(TENANT_CPF));
  assert.match(result.data.fileName, /^minuta-locacao-.*\.pdf$/);
});

test("gerar recusa CPF inválido e imóvel sem locação ativa", async () => {
  const { prisma } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property }], cases: [structuredClone(lease)] });
  const service = new ImobRentalContractService(prisma);
  assert.equal((await service.generate(scope, generateInput({ tenantDocument: "12345678988" }))).status, "invalid_tenant_document");
  assert.equal((await service.generate(scope, generateInput({ landlordDocument: "12345678988" }))).status, "invalid_landlord_document");
  assert.equal((await service.generate(scope, generateInput({ propertyId: "property-x" }))).status, "lease_not_found");
});

test("schema exige nome do fiador quando a garantia é fiador", () => {
  assert.equal(imobRentalContractGenerateSchema.safeParse({ ...generateInput(), guaranteeType: "fiador", guarantorName: null }).success, false);
  assert.equal(imobRentalContractGenerateSchema.safeParse({ ...generateInput(), guaranteeType: "fiador", guarantorName: "Fiador C" }).success, true);
});

test("minuta traz partes, prazo, aluguel, reajuste, garantia e foro", () => {
  const { text, endDate } = buildRentalContractText(generateInput());
  assert.equal(endDate, "2026-02-28");
  assert.match(text, /^MINUTA — revisar antes de assinar/);
  assert.match(text, /CONTRATO DE LOCAÇÃO RESIDENCIAL/);
  assert.match(text, /LOCADOR: Proprietária A, inscrito\(a\) no CPF sob o nº 529\.982\.247-25/);
  assert.match(text, /matrícula nº 12\.345/);
  assert.match(text, /prazo de 12 meses, com início em 01\/03\/2025 e término em 28\/02\/2026/);
  assert.match(text, /R\$\s?1\.200,00, com vencimento todo dia 10/);
  assert.match(text, /IGP-M, no mês de março/);
  assert.match(text, /caução em dinheiro no valor de R\$\s?2\.400,00/);
  assert.match(text, /Não há condomínio/);
  assert.match(text, /foro da comarca de Cidade X/);
});

test("auxiliares de data e finalidade", () => {
  assert.equal(computeEndDate("2025-03-01", 30), "2027-08-31");
  assert.equal(monthsBetween("2025-03-01", "2026-02-28"), 12);
  assert.equal(monthsBetween("2025-03-10", "2027-03-09"), 24);
  assert.equal(purposeFromPropertyType("sala_comercial"), "comercial");
  assert.equal(purposeFromPropertyType("kitnet"), "residencial");
  assert.equal(purposeFromPropertyType("terreno"), null);
  assert.equal(composePropertyAddress({ address: null, city: null, metadata: null }), null);
});

test("rotas de contrato exigem imob.chat.use e permissão de locação", () => {
  const source = readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8");
  for (const route of ['router.get("/contracts/rental/prefill"', 'router.post("/contracts/rental/generate"']) {
    const start = source.indexOf(route);
    assert.ok(start > 0, route);
    const block = source.slice(start, start + 1200);
    assert.match(block, /"imob\.chat\.use"/);
    assert.match(block, /ensureImobStagePermission\(res, workspaceAccess\.permissions, "active"/);
  }
});
