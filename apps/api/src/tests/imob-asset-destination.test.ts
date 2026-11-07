import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  imobAssetDealCompleteSchema,
  imobAssetDealCreateSchema,
  imobPropertyCreateSchema,
  imobRentalLeaseCreateSchema,
} from "../routes/imobCrmSchemas";
import { ImobAssetDealService, EXCHANGE_DEAL_FLOW, PROPERTY_ASKING_PRICE_COLUMN_MAX } from "../services/imob/crm/imobAssetDealService";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import { normalizeImobCrmPropertyDestination, normalizeImobCrmPropertyGoal } from "../services/imob/crm/imobCrmPropertyGoals";
import { ImobRentalLeaseLifecycleService, ImobRentalLeaseService, RENTAL_LEASE_FLOW } from "../services/imob/crm/imobRentalLeaseService";
import { SALE_DEAL_FLOW } from "../services/imob/crm/imobSaleContractService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
type Row = Record<string, any>;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "not" in expected) return row[key] !== expected.not;
    if (expected && typeof expected === "object" && "in" in expected) return (expected.in as unknown[]).includes(row[key]);
    return row[key] === expected;
  });
}

function createPrisma(seed: { properties?: Row[]; cases?: Row[] } = {}) {
  const properties = [...(seed.properties ?? [])];
  const cases = [...(seed.cases ?? [])];
  const caseEvents: Row[] = [];
  const memoryEvents: Row[] = [];
  const prisma: any = {
    imobProperty: {
      // Cópia, como o Prisma real: quem lê "antes" não pode ver o "depois" do update.
      findFirst: async ({ where }: { where: Row }) => {
        const row = properties.find((item) => matches(item, where));
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `property-${properties.length + 1}`, ...data, owner: null };
        properties.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = properties.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return { ...row, owner: null };
      },
    },
    imobOwner: { findFirst: async () => ({ id: "owner-1" }) },
    imobLead: { findFirst: async () => null },
    imobCase: {
      findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => cases.filter((row) => matches(row, where)).sort((a, b) => +b.createdAt - +a.createdAt),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `case-${cases.length + 1}`, createdAt: new Date(), ...data, owner: null, property: null, lead: null };
        cases.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = cases.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
    memoryEvent: { create: async ({ data }: { data: Row }) => memoryEvents.push(data), findMany: async () => [] },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma, properties, cases, caseEvents, memoryEvents };
}

const baseProperty = {
  id: "property-1",
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  ownerId: "owner-1",
  status: "ready",
  address: "Rua Exemplo, 100",
  propertyType: "kitnet",
  askingPriceCents: null,
  metadata: { externalPropertyRef: "Kitnet 101", occupancy: { value: "vago", origin: "informed_by_manager" } },
};

const leaseInput = (overrides: Row = {}) =>
  imobRentalLeaseCreateSchema.parse({
    propertyId: "property-1",
    tenantName: "Pessoa A",
    agreementType: "escrito",
    startDate: "2024-03-01",
    endDate: "2025-02-28",
    rentCents: 100000,
    dueDay: 5,
    ...overrides,
  });

// ---------------------------------------------------------------- destinação

test("destinação: ausência ≠ sem_destinacao e o legado de lead/busca não muda", () => {
  assert.equal(normalizeImobCrmPropertyDestination(null), null);
  assert.equal(normalizeImobCrmPropertyDestination(""), null);
  assert.equal(normalizeImobCrmPropertyDestination("sem_destinacao"), "sem_destinacao");
  assert.equal(normalizeImobCrmPropertyDestination("temporada"), "aluguel_por_temporada");
  assert.equal(normalizeImobCrmPropertyDestination("locacao"), "locacao");
  // objetivo de lead/busca continua só com os 3 valores históricos
  assert.equal(normalizeImobCrmPropertyGoal("permuta"), null);
  assert.equal(normalizeImobCrmPropertyGoal("locação"), "locacao");
});

test("destinação: cadastro normaliza, audita definição; troca audita alteração; sem mudança não audita", async () => {
  const fixture = createPrisma({ properties: [] });
  const service = new ImobCrmMutationService(fixture.prisma);
  const created = await service.createProperty(scope, imobPropertyCreateSchema.parse({ address: "Rua A, 1", city: "Joinville", goal: "Permuta" }) as any);
  assert.equal(created.status, "created");
  assert.equal(fixture.properties[0].goal, "permuta");
  const setEvent = fixture.memoryEvents.find((event) => event.metadata.change === "destination_set");
  assert.deepEqual([setEvent?.metadata.from, setEvent?.metadata.to], [null, "permuta"]);

  fixture.properties[0].tenantId = scope.tenantId;
  fixture.properties[0].workspaceId = scope.workspaceId;
  fixture.properties[0].status = "pending_data";
  await service.updateProperty(scope, fixture.properties[0].id, { goal: "manutencao" } as any);
  const changed = fixture.memoryEvents.find((event) => event.metadata.change === "destination_changed");
  assert.deepEqual([changed?.metadata.from, changed?.metadata.to], ["permuta", "manutencao"]);

  const before = fixture.memoryEvents.length;
  await service.updateProperty(scope, fixture.properties[0].id, { goal: "manutencao" } as any);
  assert.equal(fixture.memoryEvents.filter((e) => String(e.metadata.change).startsWith("destination")).length, 2);
  assert.ok(fixture.memoryEvents.length > before, "o audit genérico de update continua existindo");
});

test("destinação: sem goal informado não grava destinação nem audita definição", async () => {
  const fixture = createPrisma();
  await new ImobCrmMutationService(fixture.prisma).createProperty(scope, imobPropertyCreateSchema.parse({ address: "Rua A, 1" }) as any);
  assert.equal(fixture.properties[0].goal, null);
  assert.equal(fixture.memoryEvents.some((event) => event.metadata.change === "destination_set"), false);
});

test("destinação: valor legado desconhecido é preservado, nada é apagado", async () => {
  const fixture = createPrisma();
  await new ImobCrmMutationService(fixture.prisma).createProperty(scope, imobPropertyCreateSchema.parse({ address: "Rua A, 1", goal: "outro_legado" }) as any);
  assert.equal(fixture.properties[0].goal, "outro_legado");
});

// ------------------------------------------------------------ locação histórica

test("locação histórica: nasce encerrada, não ocupa a unidade e aparece no histórico", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const result = await new ImobRentalLeaseService(fixture.prisma).registerLease(
    scope,
    leaseInput({ closure: { endedOn: "2025-02-28", reason: "fim_contrato" } }),
    "2026-01-01",
  );
  assert.equal(result.status, "created");
  assert.equal(fixture.cases.length, 1, "um único caso, sem passar por 'ativa'");
  const [created] = fixture.cases;
  assert.equal(created.flow, RENTAL_LEASE_FLOW);
  assert.equal(created.status, "closed");
  assert.equal(created.stage, "ended");
  assert.deepEqual(created.pendingItems, []);
  assert.equal(created.metadata.closure.endedOn, "2025-02-28");
  assert.equal(created.metadata.closure.historical, true);
  assert.equal(fixture.caseEvents[0]?.type, "rental.lease.registered_historical");
  assert.equal(fixture.caseEvents.some((event) => event.type === "rental.lease.closed"), false, "sem fechamento em segundo passo");
  assert.deepEqual(fixture.properties[0].metadata.occupancy, baseProperty.metadata.occupancy, "ocupação intacta");

  const history = await new ImobRentalLeaseLifecycleService(fixture.prisma).history(scope, "property-1");
  assert.equal(history.status, "ok");
  if (history.status !== "ok") return;
  assert.equal(history.data.items[0].status, "closed");
  assert.equal(history.data.items[0].endedOn, "2025-02-28");
});

test("locação histórica: rejeita saída antes do início e no futuro; duplicata não repete", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const service = new ImobRentalLeaseService(fixture.prisma);
  assert.equal(imobRentalLeaseCreateSchema.safeParse({ propertyId: "p", tenantName: "A", startDate: "2025-01-01", closure: { endedOn: "2024-12-31", reason: "outro" } }).success, false);
  assert.equal((await service.registerLease(scope, leaseInput({ closure: { endedOn: "2030-01-01", reason: "outro" } }), "2026-01-01")).status, "ended_in_future");
  assert.equal(fixture.cases.length, 0);
  const closure = { endedOn: "2025-02-28", reason: "fim_contrato" };
  assert.equal((await service.registerLease(scope, leaseInput({ closure }), "2026-01-01")).status, "created");
  assert.equal((await service.registerLease(scope, leaseInput({ closure }), "2026-01-01")).status, "lease_already_registered");
  assert.equal(fixture.cases.length, 1);
});

test("locação nova segue ativa e ocupa; histórica convive com a ativa", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const service = new ImobRentalLeaseService(fixture.prisma);
  assert.equal((await service.registerLease(scope, leaseInput({ startDate: "2026-01-01", endDate: null }), "2026-02-01")).status, "created");
  assert.equal(fixture.cases[0].status, "active");
  assert.equal(fixture.properties[0].metadata.occupancy.value, "locado");
  const historical = await service.registerLease(scope, leaseInput({ closure: { endedOn: "2025-02-28", reason: "fim_contrato" } }), "2026-02-01");
  assert.equal(historical.status, "created");
  assert.equal(fixture.cases.filter((row) => row.status === "active").length, 1);
  assert.equal((await service.registerLease(scope, leaseInput({ startDate: "2026-03-01", endDate: null }), "2026-02-01")).status, "lease_already_active");
});

// ------------------------------------------------------------------- negócios

test("venda: cria sale.deal no formato do serviço de venda, com valor e estado", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const input = imobAssetDealCreateSchema.parse({ propertyId: "property-1", kind: "venda", askingPriceCents: 25_000_000, counterpartyName: "Comprador X" });
  const result = await new ImobAssetDealService(fixture.prisma).register(scope, input);
  assert.equal(result.status, "created");
  const [created] = fixture.cases;
  assert.equal(created.flow, SALE_DEAL_FLOW);
  assert.equal(created.status, "active");
  assert.equal(created.metadata.state, "em_andamento");
  assert.equal(created.metadata.terms.priceCents.value, 25_000_000);
  assert.equal(created.metadata.buyerParty.name.value, "Comprador X");
  assert.equal(fixture.caseEvents[0]?.type, "sale.deal.registered");
  assert.equal(fixture.properties[0].askingPriceCents, 25_000_000);
  if (result.status === "created") assert.equal(result.data.propertyProjection, "applied");
});

test("venda: valor acima da coluna Int não trunca nem falha — fica integral no negócio", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const huge = PROPERTY_ASKING_PRICE_COLUMN_MAX + 1;
  const result = await new ImobAssetDealService(fixture.prisma).register(scope, imobAssetDealCreateSchema.parse({ propertyId: "property-1", kind: "venda", askingPriceCents: huge }));
  assert.equal(result.status, "created");
  assert.equal(fixture.cases[0].metadata.terms.priceCents.value, huge);
  assert.equal(fixture.properties[0].askingPriceCents, null, "projeção opcional não aplicada");
  if (result.status === "created") assert.equal(result.data.propertyProjection, "kept_in_deal_only");
});

test("venda: concluída nasce encerrada; segunda em andamento é recusada; conclusão encerra", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const service = new ImobAssetDealService(fixture.prisma);
  const done = await service.register(scope, imobAssetDealCreateSchema.parse({ propertyId: "property-1", kind: "venda", state: "concluida" }));
  assert.equal(done.status, "created");
  assert.equal(fixture.cases[0].status, "closed");
  assert.equal(fixture.cases[0].stage, "completed");
  assert.equal(fixture.caseEvents[0]?.type, "sale.deal.registered_completed");

  const active = await service.register(scope, imobAssetDealCreateSchema.parse({ propertyId: "property-1", kind: "venda" }));
  assert.equal(active.status, "created");
  assert.equal((await service.register(scope, imobAssetDealCreateSchema.parse({ propertyId: "property-1", kind: "venda" }))).status, "deal_already_active");
  const caseId = active.status === "created" ? active.data.caseId : "";
  const completed = await service.complete(scope, imobAssetDealCompleteSchema.parse({ caseId, notes: "escritura feita" }));
  assert.equal(completed.status, "completed");
  assert.equal(fixture.cases.find((row) => row.id === caseId)?.status, "closed");
  assert.equal(fixture.cases.find((row) => row.id === caseId)?.metadata.state, "concluida");
  assert.ok(fixture.caseEvents.some((event) => event.type === "sale.deal.completed"));
  assert.equal((await service.complete(scope, { caseId })).status, "deal_not_active");

  const listed = await service.list(scope, "property-1", "venda");
  assert.equal(listed.status, "ok");
  if (listed.status === "ok") assert.deepEqual(listed.data.items.map((item) => item.state).sort(), ["concluida", "concluida"]);
});

test("permuta: exchange.deal próprio (não é venda com valor zero), com torna e conclusão", async () => {
  const fixture = createPrisma({ properties: [{ ...baseProperty }] });
  const service = new ImobAssetDealService(fixture.prisma);
  const result = await service.register(scope, imobAssetDealCreateSchema.parse({
    propertyId: "property-1",
    kind: "permuta",
    askingPriceCents: 30_000_000,
    counterpartyName: "Pessoa Y",
    receivedAssetDescription: "Terreno 300 m²",
    receivedValueCents: 25_000_000,
    tornaCents: 5_000_000,
  }));
  assert.equal(result.status, "created");
  const [created] = fixture.cases;
  assert.equal(created.flow, EXCHANGE_DEAL_FLOW);
  assert.notEqual(created.flow, SALE_DEAL_FLOW);
  assert.equal(created.metadata.exchange.offeredAsset.propertyId, "property-1");
  assert.equal(created.metadata.exchange.offeredAsset.valueCents.value, 30_000_000);
  assert.equal(created.metadata.exchange.receivedAsset.description.value, "Terreno 300 m²");
  assert.equal(created.metadata.exchange.tornaCents.value, 5_000_000);
  assert.equal(created.metadata.terms, undefined, "sem preço de venda");
  assert.equal(fixture.properties[0].askingPriceCents, null, "permuta não altera preço pretendido do imóvel");
  assert.equal(fixture.caseEvents[0]?.type, "exchange.deal.registered");

  const caseId = result.status === "created" ? result.data.caseId : "";
  assert.equal((await service.complete(scope, { caseId })).status, "completed");
  assert.ok(fixture.caseEvents.some((event) => event.type === "exchange.deal.completed"));
});

test("negócios: isolamento por workspace/tenant e imóvel arquivado", async () => {
  const fixture = createPrisma({
    properties: [{ ...baseProperty }, { ...baseProperty, id: "property-2", status: "archived" }, { ...baseProperty, id: "property-3", workspaceId: "workspace-b" }],
    cases: [{ id: "case-foreign", tenantId: scope.tenantId, workspaceId: "workspace-b", propertyId: "property-3", flow: SALE_DEAL_FLOW, status: "active", metadata: {}, createdAt: new Date() }],
  });
  const service = new ImobAssetDealService(fixture.prisma);
  for (const propertyId of ["property-2", "property-3", "inexistente"]) {
    assert.equal((await service.register(scope, imobAssetDealCreateSchema.parse({ propertyId, kind: "venda" }))).status, "property_not_found");
  }
  // Outro workspace e imóvel inexistente nunca são lidos; arquivado só tem histórico (leitura), sem negócios.
  assert.equal((await service.list(scope, "property-3")).status, "property_not_found");
  assert.equal((await service.list(scope, "inexistente")).status, "property_not_found");
  const archived = await service.list(scope, "property-2");
  assert.equal(archived.status, "ok");
  if (archived.status === "ok") assert.deepEqual(archived.data.items, []);
  const own = await service.list(scope, "property-1");
  assert.equal(own.status === "ok" && own.data.items.length, 0, "negócio de outro workspace não vaza");
  assert.equal((await service.complete(scope, { caseId: "case-foreign" })).status, "deal_not_found");
});

test("negócios: schema aceita valor grande (sem teto comercial novo) mas não negativo/fracionado", () => {
  assert.equal(imobAssetDealCreateSchema.safeParse({ propertyId: "p", kind: "venda", askingPriceCents: 9_000_000_000_000 }).success, true);
  assert.equal(imobAssetDealCreateSchema.safeParse({ propertyId: "p", kind: "venda", askingPriceCents: -1 }).success, false);
  assert.equal(imobAssetDealCreateSchema.safeParse({ propertyId: "p", kind: "venda", askingPriceCents: 10.5 }).success, false);
  assert.equal(imobAssetDealCreateSchema.safeParse({ propertyId: "p", kind: "tokenizacao" }).success, false);
  assert.equal(imobAssetDealCreateSchema.parse({ propertyId: "p", kind: "permuta" }).state, "em_andamento");
});

test("rotas /deals: autorização antes de qualquer escrita e schema validado", () => {
  const source = readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8");
  for (const [route, call] of [
    ['router.post("/deals"', "register("],
    ['router.get("/deals"', "list("],
    ['router.post("/deals/complete"', "complete("],
  ] as const) {
    const start = source.indexOf(route);
    assert.ok(start >= 0, route);
    const block = source.slice(start, source.indexOf("router.", start + 10));
    assert.ok(block.indexOf("rentalLifecycleScope(") >= 0 && block.indexOf("rentalLifecycleScope(") < block.indexOf(call), `${route} verifica acesso antes de ${call}`);
  }
  assert.match(source, /imobAssetDealCreateSchema\.safeParse/);
  assert.match(source, /imobAssetDealCompleteSchema\.safeParse/);
});
