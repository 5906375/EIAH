import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { imobSaleContractGenerateSchema } from "../routes/imobCrmSchemas";
import { buildSaleContractText } from "../services/contracts/saleContractTemplate";
import { ImobSaleContractService, SALE_DEAL_FLOW } from "../services/imob/crm/imobSaleContractService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
const SELLER_CPF = "52998224725";
const BUYER_CPF = "11144477735";
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
  const leads: Row[] = [];
  const update = (rows: Row[]) => async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((item) => item.id === where.id)!;
    Object.assign(row, data);
    return { ...row, owner: null, property: null, lead: null };
  };
  const prisma: any = {
    imobOwner: { findFirst: async ({ where }: { where: Row }) => owners.find((row) => matches(row, where)) ?? null, update: update(owners) },
    imobProperty: { findFirst: async ({ where }: { where: Row }) => properties.find((row) => matches(row, where)) ?? null, update: update(properties) },
    imobLead: { findFirst: async () => null, create: async ({ data }: { data: Row }) => leads.push(data) },
    imobCase: {
      findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null,
      update: update(cases),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `case-${cases.length + 1}`, ...data, owner: null, property: null, lead: null };
        cases.push(row);
        return row;
      },
    },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
    memoryEvent: { create: async ({ data }: { data: Row }) => memoryEvents.push(data), findMany: async () => [] },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma, owners, properties, cases, caseEvents, leads };
}

const base = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
const owner = { ...base, id: "owner-1", status: "ready", name: "Vendedora A", document: null };
const property = { ...base, id: "property-1", status: "ready", ownerId: "owner-1", address: "Rua Venda, 50", neighborhood: "Centro", city: "Cidade Y", askingPriceCents: null, metadata: { externalPropertyRef: "Casa 1" } };

const input = (overrides: Row = {}) => imobSaleContractGenerateSchema.parse({
  propertyId: "property-1",
  sellerName: "Vendedora A",
  sellerDocument: SELLER_CPF,
  buyerName: "Comprador B",
  buyerDocument: BUYER_CPF,
  propertyAddress: "Rua Venda, 50, Cidade Y",
  registryNumber: "9.876",
  priceCents: 50000000,
  downPaymentCents: 5000000,
  paymentMethod: "financiamento",
  deedDeadlineDays: 60,
  possession: "escritura",
  commissionPercent: 6,
  forumCity: "Cidade Y",
  ...overrides,
});

test("prefill: vendedor do proprietário, imóvel do cadastro, comprador vazio", async () => {
  const { prisma } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property }] });
  const result = await new ImobSaleContractService(prisma).prefill(scope, "property-1");
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.data.sellerName, "Vendedora A");
  assert.equal(result.data.buyerName, null);
  assert.equal(result.data.saleCaseId, null);
  assert.match(result.data.propertyAddress ?? "", /Rua Venda, 50, unidade Casa 1, bairro Centro, Cidade Y/);
  assert.equal(result.data.forumCity, "Cidade Y");
});

test("gerar registra o negócio sale.deal sem lead e devolve ao cadastro o que faltava", async () => {
  const { prisma, cases, owners, properties, leads } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property, metadata: { ...property.metadata } }] });
  const result = await new ImobSaleContractService(prisma).generate(scope, input());
  assert.equal(result.status, "generated");
  if (result.status !== "generated") return;
  assert.equal(cases.length, 1);
  assert.equal(cases[0].flow, SALE_DEAL_FLOW);
  assert.equal(cases[0].metadata.buyerParty.document.value, BUYER_CPF);
  assert.equal(leads.length, 0);
  assert.equal(owners[0].document, SELLER_CPF);
  assert.equal(properties[0].askingPriceCents, 50000000);
  assert.equal(properties[0].metadata.registryNumber, "9.876");
  assert.deepEqual(result.data.writtenBack, ["CPF/CNPJ do proprietário", "matrícula do imóvel", "preço de venda do imóvel"]);
  assert.match(result.data.fileName, /^minuta-compra-venda-.*\.pdf$/);

  const again = await new ImobSaleContractService(prisma).prefill(scope, "property-1");
  assert.equal(again.status === "ok" && again.data.buyerName, "Comprador B");
  const second = await new ImobSaleContractService(prisma).generate(scope, input({ priceCents: 48000000 }));
  assert.equal(second.status, "generated");
  assert.equal(cases.length, 1, "mesmo negócio é atualizado, não duplicado");
  assert.equal(properties[0].askingPriceCents, 50000000, "preço do cadastro não é sobrescrito");
});

test("recusa CPF inválido, sinal maior que o preço e imóvel inexistente", async () => {
  const { prisma } = createPrisma({ owners: [{ ...owner }], properties: [{ ...property }] });
  const service = new ImobSaleContractService(prisma);
  assert.equal((await service.generate(scope, input({ buyerDocument: "12345678988" }))).status, "invalid_buyer_document");
  assert.equal((await service.generate(scope, input({ sellerDocument: "12345678988" }))).status, "invalid_seller_document");
  assert.equal((await service.generate(scope, input({ downPaymentCents: 60000000 }))).status, "down_payment_above_price");
  assert.equal((await service.generate(scope, input({ propertyId: "x" }))).status, "property_not_found");
});

test("minuta de compra e venda: partes, preço, arras, escritura, posse, corretagem e foro", () => {
  const { text, balanceCents } = buildSaleContractText(input());
  assert.equal(balanceCents, 45000000);
  assert.match(text, /^MINUTA — revisar antes de assinar/);
  assert.match(text, /PROMESSA DE COMPRA E VENDA DE IMÓVEL/);
  assert.match(text, /VENDEDOR: Vendedora A, inscrito\(a\) no CPF sob o nº 529\.982\.247-25/);
  assert.match(text, /matrícula nº 9\.876/);
  assert.match(text, /R\$\s?500\.000,00/);
  assert.match(text, /arras confirmatórias/);
  assert.match(text, /saldo de R\$\s?450\.000,00 será pago por meio de financiamento/);
  assert.match(text, /em até 60 dias/);
  assert.match(text, /posse do imóvel será transmitida ao COMPRADOR na data da assinatura da escritura/);
  assert.match(text, /corretagem de 6%/);
  assert.match(text, /foro da comarca de Cidade Y/);
  assert.doesNotMatch(buildSaleContractText(input({ commissionPercent: null, downPaymentCents: null })).text, /CORRETAGEM|arras/);
});

test("rotas de venda exigem imob.chat.use e permissão de negócio", () => {
  const source = readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8");
  for (const route of ['router.get("/contracts/sale/prefill"', 'router.post("/contracts/sale/generate"']) {
    const start = source.indexOf(route);
    assert.ok(start > 0, route);
    const block = source.slice(start, start + 1200);
    assert.match(block, /"imob\.chat\.use"/);
    assert.match(block, /ensureImobStagePermission/);
  }
});
