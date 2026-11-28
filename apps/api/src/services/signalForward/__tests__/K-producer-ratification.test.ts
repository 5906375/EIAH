// Cenário K — D5 integrado à cadeia real: identidade exata do produtor
// ("radar") e o contrato de conteúdo completo, ambos dentro de
// readAndValidateOrigin, exercitados via forwardSignalToMkt/
// recoverExistingSignalForwardRequest (nunca contornados em reenvios, porque
// os dois caminhos passam pela mesma função). Banco descartável real —
// mesma técnica das demais unidades desta pasta.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createNamedClient,
  seedRealScenario,
  createOriginRun,
  grantScope,
  newTenantWorkspace,
  defaultRadarSignalResult,
} from "./helpers";
import { forwardSignalToMkt, ConflictError } from "../signalForwardingService";
import { SignalForwardOriginError, computeRequestFingerprint, buildOriginSnapshot } from "../originContract";

test("produtor exato 'radar': origem aceita, encaminhamento prossegue normalmente", async () => {
  const client = createNamedClient("poc-real-k1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const result = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k1" },
      {},
      client.prisma
    );
    // D6: encaminhar não cria mais Run — status inicial é pending_dispatch,
    // aguardando confirmação humana (seção 22.7).
    assert.equal(result.status, "pending_dispatch");
    assert.equal(result.destinationRunId, null);
  } finally {
    await client.close();
  }
});

test("produtor diferente de 'radar' (ex.: 'mkt'): rejeitado, nenhum registro criado", async () => {
  const client = createNamedClient("poc-real-k2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k2");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const sourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId, agent: "mkt" });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k2" };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_agent_not_ratified" && err.context.agent === "mkt"
    );

    const requestCount = await client.prisma.signalForwardRequest.count({ where: { tenantId, workspaceId } });
    assert.equal(requestCount, 0, "nenhum SignalForwardRequest criado");
    const destinationRunCount = await client.prisma.run.count({ where: { tenantId, workspaceId, agent: "mkt", id: { not: sourceRunId } } });
    assert.equal(destinationRunCount, 0, "nenhum run de destino criado");
  } finally {
    await client.close();
  }
});

for (const variant of ["Radar", "RADAR", " radar", "radar ", "rad ar"]) {
  test(`variação de caixa/espaço ("${variant}") é rejeitada — comparação sempre exata, sem trim/lowercase`, async () => {
    const client = createNamedClient(`poc-real-k3-${variant.trim() || "blank"}`);
    try {
      const { tenantId, workspaceId } = newTenantWorkspace("real-k3");
      const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
      const sourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId, agent: variant });
      await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

      await assert.rejects(
        forwardSignalToMkt(
          { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: `key-k3-${variant}` },
          {},
          client.prisma
        ),
        (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_agent_not_ratified"
      );
    } finally {
      await client.close();
    }
  });
}

test("produtor rejeitado ANTES de qualquer erro detalhado de conteúdo (ordem: agente antes do validador)", async () => {
  const client = createNamedClient("poc-real-k4");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k4");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    // agent errado E response inválido para o contrato de conteúdo ao mesmo tempo —
    // se a ordem estivesse errada, o erro reportado seria de conteúdo, não de produtor.
    const sourceRunId = await createOriginRun(client.prisma, {
      tenantId, workspaceId, agent: "mkt", response: { totally: "not a radar signal" },
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    await assert.rejects(
      forwardSignalToMkt(
        { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k4" },
        {},
        client.prisma
      ),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_agent_not_ratified"
    );
  } finally {
    await client.close();
  }
});

test("origem 'radar' com conteúdo que não satisfaz RadarSignalResultV1 é rejeitada pelo validador (não pelo produtor)", async () => {
  const client = createNamedClient("poc-real-k5");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k5");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const sourceRunId = await createOriginRun(client.prisma, {
      tenantId, workspaceId, agent: "radar", response: { signalAnalysis: { summary: "formato legado, pré-D5" } },
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    await assert.rejects(
      forwardSignalToMkt(
        { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k5" },
        {},
        client.prisma
      ),
      // O payload legado não tem `contractVersion` — essa é a primeira
      // violação na ordem determinística (passo 1, antes até da checagem de
      // campos desconhecidos do passo 2).
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "radar_signal_field_missing" && err.context.field === "contractVersion"
    );

    const requestCount = await client.prisma.signalForwardRequest.count({ where: { tenantId, workspaceId } });
    assert.equal(requestCount, 0, "origem incompatível com o contrato V1 não gera nenhum efeito — sem adaptação heurística de formatos legados");
  } finally {
    await client.close();
  }
});

test("escopo/estado continuam bloqueando antes de qualquer checagem de produtor (H já cobre; aqui só a composição com D5)", async () => {
  const client = createNamedClient("poc-real-k6");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k6");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    // status pendente (não "success") E agent diferente de radar ao mesmo tempo —
    // o erro reportado deve ser o de ESTADO (já existente), não o de produtor,
    // porque a checagem de estado vem antes na ordem (seção 9.5/9.8 do documento).
    const sourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId, agent: "mkt", status: "pending" });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    await assert.rejects(
      forwardSignalToMkt(
        { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k6" },
        {},
        client.prisma
      ),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_not_in_required_state"
    );
  } finally {
    await client.close();
  }
});

test("fingerprint de uma origem válida é idêntico ao calculado independentemente com o mesmo snapshot (D5 não altera o algoritmo)", async () => {
  const client = createNamedClient("poc-real-k7");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k7");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const result = await forwardSignalToMkt(
      { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k7" },
      {},
      client.prisma
    );
    const forward = await client.prisma.signalForwardRequest.findUnique({ where: { id: result.forwardRequestId } });

    const sourceRun = await client.prisma.run.findUniqueOrThrow({ where: { id: sourceRunId } });
    const expectedFingerprint = computeRequestFingerprint({
      sourceRunId,
      destinationAgent: "mkt",
      originSnapshot: buildOriginSnapshot(sourceRun),
    });
    assert.equal(forward?.requestFingerprint, expectedFingerprint);
  } finally {
    await client.close();
  }
});

test("reordenar arrays de evidence/externalContent na origem, com os mesmos valores, produz conflito no reenvio (ordem faz parte do conteúdo comparado)", async () => {
  const client = createNamedClient("poc-real-k8");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-k8");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const sourceRunId = await createOriginRun(client.prisma, {
      tenantId, workspaceId,
      response: defaultRadarSignalResult({
        evidence: [{ description: "primeira" }, { description: "segunda" }],
      }),
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = { tenantId, workspaceId, requestedByUserId: userId, sourceRunId, destinationAgent: "mkt", idempotencyKey: "key-k8" };
    const first = await forwardSignalToMkt(input, {}, client.prisma);
    assert.equal(first.reused, false);

    // MESMOS dois itens de evidence, ORDEM trocada — mesmo conjunto de
    // valores, conteúdo semanticamente equivalente para um humano, mas
    // stableStringify preserva ordem de array, então o fingerprint diverge.
    await client.prisma.run.update({
      where: { id: sourceRunId },
      data: {
        response: defaultRadarSignalResult({
          evidence: [{ description: "segunda" }, { description: "primeira" }],
        }),
      },
    });

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof ConflictError
    );
  } finally {
    await client.close();
  }
});
