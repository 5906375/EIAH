import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { assertDisposableDatabase, openPgClient } from "./support/verticalEvaluationRealDb";
import { cleanupImobClaimFixture, imobClaimFixtureNames, seedImobClaimFixture } from "./support/imobClaimFixture";

/**
 * P-04 — o que o `claimOnly` do Front Door ESCREVE? PostgreSQL real DESCARTÁVEL, HTTP real, dados sintéticos, sem provider.
 * Extraído de marketplace.installations.activate.test.ts (job W4 do CI, banco `eiah_ci`, sem EIAH_DISPOSABLE_INFRA) porque exige a guarda de
 * banco descartável. Roda no CI no job `logistica_core_integration` (banco `eiah_logistica_core_ci`, EIAH_DISPOSABLE_INFRA=1) via
 * `pnpm test:imob-claim-only-writes:integration`. A guarda abaixo roda ANTES dos hooks: nada é semeado fora de infraestrutura descartável.
 */
assertDisposableDatabase();

let request: ReturnType<typeof supertest>;
const sx = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-p04`;
const names = imobClaimFixtureNames(sx);
const { ids, tokens } = names;
let caseId = "";
let caseOtherWorkspaceId = "";

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);
  ({ caseId, caseOtherWorkspaceId } = await seedImobClaimFixture(request, sx, names));
});

after(async () => {
  await cleanupImobClaimFixture(ids);
  await prismaGlobal.$disconnect();
});

describe("P-04: claimOnly não escreve (auditoria, telemetria, memória)", () => {
  const claim = (who: keyof typeof tokens, message: string, over: Record<string, unknown> = {}) =>
    request.post("/api/imob/chat/resolve-turn").set("Authorization", `Bearer ${tokens[who]}`).send({ message, claimOnly: true, ...over });
  const claimNeeds = [
    "Quero divulgar este apartamento do Batel.",
    "Precisamos preparar uma campanha para esse imóvel.",
    "O Marketing pode ajudar a anunciar essa unidade?",
  ];

  // P-04: o que o claimOnly escreve? `sideEffects()` conta só linhas de domínio; aqui medimos QUALQUER escrita (auditoria, telemetria, memória):
  // uma conexão independente lê pg_current_xact_id() antes e depois — só transações que escrevem consomem xid; leitura pura não consome.
  test("P-04 claimOnly (reivindicado com e sem caso, negado, não reivindicado, com marcadores de fluxo no threadState) não abre transação de escrita nem cria memory_events", async () => {
    assertDisposableDatabase();
    const pg = await openPgClient();
    try {
      const xid = async () => BigInt((await pg.query<{ x: string }>("SELECT pg_current_xact_id()::text AS x")).rows[0]!.x);
      const memory = () => prismaGlobal.memoryEvent.count({ where: { tenantId: ids.t } });
      // a espera de 300 ms depois da resposta captura também escritas assíncronas disparadas pelo pedido (não aguardadas pela resposta)
      const writesDuring = async (work: () => Promise<unknown>) => { const a = await xid(); await work(); await new Promise((resolve) => setTimeout(resolve, 300)); return Number(await xid() - a) - 1; };
      // controle positivo: o instrumento enxerga uma escrita feita por OUTRA conexão (pool do Prisma)
      const control = await writesDuring(() => prismaGlobal.memoryEvent.create({ data: { tenantId: ids.t, workspaceId: ids.w, agentId: "p04-control", key: "p04.control", content: "controle" } }));
      assert.ok(control >= 1, `o instrumento deve detectar escrita (medido ${control})`);
      const flow = { activeCaseId: caseId, activeThreadId: "thread-p04", operational: { flow: "property.create", status: "collecting" } };
      const cases: Array<[string, () => Promise<{ status: number; body: any }>]> = [
        ...(["a", "b"] as const).flatMap((who) => [[`${who}: caso explícito`, () => claim(who, claimNeeds[0], { caseId })], [`${who}: sem caso`, () => claim(who, claimNeeds[0])]] as Array<[string, () => Promise<{ status: number; body: any }>]>),
        ["a: estado de agente", () => claim("a", "Isso já contratou o Marketing?")],
        ["a: caso de outro workspace (negado)", () => claim("a", claimNeeds[0], { caseId: caseOtherWorkspaceId })],
        ["c: etapa não permitida (negado)", () => claim("c", claimNeeds[0], { caseId })],
        ["a: não reivindicado", () => claim("a", "Como funciona o billing?")],
        ["a: marcadores de fluxo/caso no threadState", () => claim("a", claimNeeds[0], { caseId, threadState: flow })],
        ["a: marcadores de fluxo sem caseId", () => claim("a", claimNeeds[1], { threadState: flow })],
      ];
      const outcomes: Record<string, string> = {};
      for (const [label, send] of cases) {
        const eventsBefore = await memory();
        let response!: { status: number; body: any };
        const writes = await writesDuring(async () => { response = await send(); });
        outcomes[label] = `${response.status}/claimed=${response.body?.claimed ?? "n/d"}`;
        assert.equal(response.status, 200, label);
        assert.equal(writes, 0, `${label}: nenhuma transação de escrita (medido ${writes})`);
        assert.equal(await memory(), eventsBefore, `${label}: nenhum memory_event (auditoria/telemetria)`);
      }
      assert.ok(Object.values(outcomes).some((value) => value.endsWith("claimed=true")), "ao menos um caso foi realmente reivindicado");
      console.log(`P04-CLAIM-WRITES ${JSON.stringify({ control, outcomes })}`);
    } finally { await pg.end(); }
  });
});
