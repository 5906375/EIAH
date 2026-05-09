import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";

let request: ReturnType<typeof supertest>;
let prismaGlobal: any;
let closePrismaResources: () => Promise<unknown>;
let closeRunEventStream: () => Promise<unknown>;
let closeRunEventsTransport: () => Promise<unknown>;
let closeRunQueueConnections: () => Promise<unknown>;
let closeMemoryResources: () => Promise<unknown>;
let closeRedisPublisher: () => Promise<unknown>;
let closeRunEventPublisherResources: () => Promise<unknown>;
let closeTenantPolicyStoreResources: () => Promise<unknown>;
let closeCriticalMetricsRedis: () => Promise<unknown>;
let closeCriticalKillSwitchRedis: () => Promise<unknown>;

function reportActiveHandles(label: string) {
  if (process.env.IMOB_HTTP_TEST_DEBUG_HANDLES !== "1") return;
  const handles = ((process as any)._getActiveHandles?.() as unknown[] | undefined) ?? [];
  const requests = ((process as any)._getActiveRequests?.() as unknown[] | undefined) ?? [];
  const resources = typeof (process as any).getActiveResourcesInfo === "function"
    ? (process as any).getActiveResourcesInfo()
    : [];
  console.error(`[imob-http-debug] ${label} handles=${handles.length} requests=${requests.length}`);
  console.error(`[imob-http-debug] resources ${JSON.stringify(resources)}`);
  for (const handle of handles) {
    const summary = {
      type: (handle as any)?.constructor?.name ?? typeof handle,
      remoteAddress: (handle as any)?.remoteAddress ?? null,
      remotePort: (handle as any)?.remotePort ?? null,
      localAddress: (handle as any)?.localAddress ?? null,
      localPort: (handle as any)?.localPort ?? null,
      hasDestroy: typeof (handle as any)?.destroy === "function",
      hasClose: typeof (handle as any)?.close === "function",
    };
    console.error(`[imob-http-debug] handle ${JSON.stringify(summary)}`);
  }
}

function debugCleanupStep(label: string) {
  if (process.env.IMOB_HTTP_TEST_DEBUG_HANDLES !== "1") return;
  console.error(`[imob-http-debug] cleanup ${label}`);
}

function destroyResidualNetworkSockets(ports: number[]) {
  const handles = (process as any)._getActiveHandles?.() as unknown[] | undefined;
  if (!handles) return 0;
  let destroyed = 0;
  for (const handle of handles) {
    const remotePort = (handle as any)?.remotePort;
    const remoteAddress = (handle as any)?.remoteAddress;
    if (!ports.includes(remotePort) || remoteAddress !== "127.0.0.1") continue;
    if (typeof (handle as any)?.unref === "function") {
      (handle as any).unref();
    }
    if (typeof (handle as any)?.destroy === "function") {
      (handle as any).destroy();
      destroyed += 1;
    }
  }
  return destroyed;
}

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-resolve-${suffix}`;
const workspaceId = `workspace-imob-resolve-${suffix}`;
const userId = `user-imob-resolve-${suffix}`;
const apiToken = `tok-imob-resolve-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  if (process.env.VITEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.VITEST_DATABASE_URL;
  }
  if (process.env.VITEST_REDIS_URL) {
    process.env.REDIS_URL = process.env.VITEST_REDIS_URL;
  }

  const dbModule = await import("@repo/db");
  prismaGlobal = dbModule.prismaGlobal;
  closePrismaResources = dbModule.closePrismaResources;

  ({ closeRunEventStream } = await import("../services/runEventStream"));
  ({ closeRunEventsTransport } = await import("../services/runEvents"));
  ({ closeRunQueueConnections } = await import("@eiah/core/queue/runQueue"));
  ({ closeMemoryResources } = await import("../services/memory"));
  ({ closeRedisPublisher } = await import("../../../../packages/core/src/events/redisPublisher"));
  ({ closeRunEventPublisherResources } = await import("../../../../packages/core/src/events/runEventPublisher.js"));
  ({ closeTenantPolicyStoreResources } = await import("../../../../packages/core/policy/TenantPolicyStore"));
  ({ closeCriticalMetricsRedis } = await import("../../../../packages/core/src/metrics/criticalMetrics.js"));
  ({ closeCriticalKillSwitchRedis } = await import("../../../../packages/core/src/security/killSwitch.js"));

  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Resolver Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-resolve-turn-test",
      revoked: false,
    },
  });
});

after(async () => {
  debugCleanupStep("start");
  await prismaGlobal.$executeRaw`
    DELETE FROM memory_events
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
  `;
  debugCleanupStep("after-memory-events");
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-case-events");
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-cases");
  await prismaGlobal.imobProperty.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-properties");
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-owners");
  await prismaGlobal.imobLead.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-leads");
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-tokens");
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-users");
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  debugCleanupStep("after-workspaces");
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  debugCleanupStep("after-tenants");
  await closeMemoryResources();
  debugCleanupStep("after-closeMemoryResources");
  await closeRedisPublisher();
  debugCleanupStep("after-closeRedisPublisher");
  await closeRunEventPublisherResources();
  debugCleanupStep("after-closeRunEventPublisherResources");
  await closeTenantPolicyStoreResources();
  debugCleanupStep("after-closeTenantPolicyStoreResources");
  await closeCriticalMetricsRedis();
  debugCleanupStep("after-closeCriticalMetricsRedis");
  await closeCriticalKillSwitchRedis();
  debugCleanupStep("after-closeCriticalKillSwitchRedis");
  await closeRunEventStream();
  debugCleanupStep("after-closeRunEventStream");
  await closeRunEventsTransport();
  debugCleanupStep("after-closeRunEventsTransport");
  await closeRunQueueConnections();
  debugCleanupStep("after-closeRunQueueConnections");
  await closePrismaResources();
  debugCleanupStep("after-closePrismaResources");
  destroyResidualNetworkSockets([6379, 5433]);
  debugCleanupStep("after-destroyResidualNetworkSockets");
  reportActiveHandles("after-cleanup");
});

test("IMOB resolve-turn returns inventory guidance contract over HTTP", async () => {
  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ message: "quero alugar apto" });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.action, "realestate.search_inventory");
  assert.equal(response.body?.data?.threadLabel, "Busca de imóveis");
});

test("IMOB resolve-turn records semantic telemetry for operational guidance", async () => {
  const beforeCount = await prismaGlobal.memoryEvent.count({
    where: { tenantId, workspaceId, key: "conversation.telemetry" },
  });

  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ message: "quais documentos normalmente faltam nessa fase?" });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.mode, "consult");

  const telemetryRows = await prismaGlobal.memoryEvent.findMany({
    where: { tenantId, workspaceId, key: "conversation.telemetry" },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(telemetryRows.length > beforeCount);
  assert.ok(
    telemetryRows.some(
      (row) =>
        (row.metadata as any)?.event === "imob_guidance_resolved"
        && (row.metadata as any)?.action === response.body?.data?.action,
    ),
  );
});

test("IMOB resolve-turn records consultive read and specialist telemetry for case guidance", async () => {
  const createdCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "contract.prepare",
      stage: "documentacao",
      status: "running",
      blockers: ["receipt pendente para fechamento"],
      pendingItems: ["bundle"],
      metadata: {},
    },
  });

  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      caseId: createdCase.id,
      message: "qual status desse caso?",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.mode, "consult");

  const telemetryRows = await prismaGlobal.memoryEvent.findMany({
    where: { tenantId, workspaceId, key: "conversation.telemetry" },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(
    telemetryRows.some(
      (row) =>
        (row.metadata as any)?.event === "imob_consultive_case_read"
        && (row.metadata as any)?.caseId === createdCase.id,
    ),
  );
  assert.ok(
    telemetryRows.some(
      (row) =>
        (row.metadata as any)?.event === "imob_specialist_suggested"
        && (row.metadata as any)?.caseId === createdCase.id,
    ),
  );
});

test("IMOB search inventory returns backend presentation over HTTP", async () => {
  const response = await request
    .post("/api/imob/search/inventory")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      query: "buscar locação em São Paulo até 3500",
      region: "São Paulo",
      segment: "locacao",
      slots: { city: "São Paulo", budgetMax: 3500 },
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.total, 0);
  assert.match(response.body?.data?.presentation?.text ?? "", /refinar essa busca/i);
});


test("IMOB resolve-turn processes owner + property + lead batch intake over HTTP", async () => {
  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: [
        "Captar proprietario Joana Batch email joana.batch@example.com telefone 11999991111 documento 12345678901",
        "Cadastrar imóvel apartamento para venda em Itapema com 2 quartos endereco Rua Batch 101 proprietario Joana Batch valor 700000",
        "Cadastrar lead Mario Batch telefone 47999991111 email mario.batch@example.com interesse compra em Itapema orçamento 720000",
      ].join("\n"),
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.mode, "consult");
  assert.equal(response.body?.data?.action, "crm.batch.intake");
  assert.match(response.body?.data?.presentation?.text ?? "", /processei [23] operação\(ões\) deste lote/i);
  assert.ok((response.body?.data?.presentation?.card?.lines?.length ?? 0) >= 2);

  const caseCount = await prismaGlobal.imobCase.count({ where: { tenantId, workspaceId } });
  assert.ok(caseCount >= 1);
});

test.skip("IMOB resolve-turn handles owner dedupe choices over HTTP without looping", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Proprietario HTTP",
      phone: "47999990000",
      email: "prop.http@example.com",
      document: "41741741785",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
    },
  });

  const start = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ message: "quero incluir proprietário" });

  assert.equal(start.status, 200);
  assert.equal(start.body?.ok, true);

  const dedupe = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: "Proprietario HTTP",
      threadState: start.body?.data?.conversationState,
    });

  assert.equal(dedupe.status, 200);
  assert.equal(dedupe.body?.ok, true);
  assert.equal(dedupe.body?.data?.action, "crm.registration.dedupe_review");
  const dedupeCtas = Array.isArray(dedupe.body?.data?.presentation?.card?.ctas) ? dedupe.body.data.presentation.card.ctas : [];
  assert.equal(dedupeCtas[0]?.nextMessage, `editar proprietário ${owner.id}`);
  assert.equal(dedupeCtas[1]?.label, "Criar novo");
  assert.equal(dedupeCtas[2]?.label, "Ver cadastros");

  const updateExisting = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: "atualizar existente",
      threadState: dedupe.body?.data?.conversationState,
    });

  assert.equal(updateExisting.status, 200);
  assert.equal(updateExisting.body?.ok, true);
  assert.equal(updateExisting.body?.data?.action, "crm.owner.update");
  assert.notEqual(updateExisting.body?.data?.action, "crm.registration.dedupe_review");

  const listExisting = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: "cadastros",
      threadState: dedupe.body?.data?.conversationState,
    });

  assert.equal(listExisting.status, 200);
  assert.equal(listExisting.body?.ok, true);
  assert.equal(listExisting.body?.data?.action, "crm.owner.list");

  const createNew = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: "novo cadastro",
      threadState: dedupe.body?.data?.conversationState,
    });

  assert.equal(createNew.status, 200);
  assert.equal(createNew.body?.ok, true);
  assert.notEqual(createNew.body?.data?.action, "crm.registration.dedupe_review");
  assert.equal(createNew.body?.data?.conversationState?.operational?.status, "collecting");
});

test("IMOB resolve-turn keeps read-only pilot consult without mutating CRM rows over HTTP", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Owner Pilot HTTP",
      phone: "47911111111",
      email: "owner.pilot@example.com",
      document: "11122233344",
      status: "ready_for_review",
      pendingItems: [],
    },
  });
  const property = await prismaGlobal.imobProperty.create({
    data: {
      tenantId,
      workspaceId,
      ownerId: owner.id,
      propertyType: "apartamento",
      goal: "locacao",
      city: "Balneário Camboriú",
      address: "Rua Piloto 100",
      status: "ready_for_review",
      pendingItems: [],
    },
  });
  const lead = await prismaGlobal.imobLead.create({
    data: {
      tenantId,
      workspaceId,
      name: "Lead Pilot HTTP",
      phone: "47922222222",
      email: "lead.pilot@example.com",
      goal: "locacao",
      targetCity: "Balneário Camboriú",
      stage: "qualified",
      temperature: "warm",
      pendingItems: [],
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "visit.schedule",
      stage: "visita",
      status: "running",
      nextStep: "confirmar agenda da visita",
      blockers: [],
      pendingItems: [],
      ownerId: owner.id,
      propertyId: property.id,
      leadId: lead.id,
      metadata: {},
    },
  });

  const before = await prismaGlobal.imobCase.findUnique({
    where: { id: imobCase.id },
    select: { updatedAt: true, nextStep: true, status: true, pendingItems: true, blockers: true },
  });

  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      caseId: imobCase.id,
      message: "qual status desse caso?",
    });

  const after = await prismaGlobal.imobCase.findUnique({
    where: { id: imobCase.id },
    select: { updatedAt: true, nextStep: true, status: true, pendingItems: true, blockers: true },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.action, "crm.case.pipeline_status");
  assert.equal(response.body?.data?.presentation?.pilotOperationalState?.status, "approval_required");
  assert.equal(before?.updatedAt?.toISOString(), after?.updatedAt?.toISOString());
  assert.deepEqual(before, after);
});
