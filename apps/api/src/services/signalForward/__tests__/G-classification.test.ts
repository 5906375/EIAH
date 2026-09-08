// Cenário G — classificação (duplicidade esperada real, fingerprint incompatível
// real, outra violação/formato inconclusivo via unidade sintética — mesma técnica
// já validada na prova experimental, agora contra o classificador REAL do produto).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, createOriginRun, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt, ConflictError } from "../signalForwardingService.ts";
import { classifySignalForwardUniqueViolation } from "../classifier.ts";
import { FINGERPRINT_CONTRACT_VERSION } from "../originContract.ts";

test("duplicidade esperada real: segunda chamada com mesma chave/origem reutiliza", async () => {
  const client = createNamedClient("poc-real-g1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-g1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-g1",
    };

    const first = await forwardSignalToMkt(input, {}, client.prisma);
    const second = await forwardSignalToMkt(input, {}, client.prisma);

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.destinationRunId, second.destinationRunId);

    // versão do fingerprint estável na reutilização idempotente (nenhuma
    // segunda gravação/recalculo altera a versão persistida na criação).
    const forward = await client.prisma.signalForwardRequest.findUnique({
      where: { id: first.forwardRequestId },
    });
    assert.equal(forward?.fingerprintVersion, FINGERPRINT_CONTRACT_VERSION);
  } finally {
    await client.close();
  }
});

test("conflito de conteúdo real: mesma chave, origem diferente (fingerprint diverge) -> 409, nenhum registro adicional", async () => {
  const client = createNamedClient("poc-real-g2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-g2");
    const { userId, sourceRunId: sourceRunA } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const sourceRunB = await createOriginRun(client.prisma, {
      tenantId, workspaceId, response: { signalAnalysis: { summary: "sinal DIFERENTE" } },
    });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const base = { tenantId, workspaceId, requestedByUserId: userId, destinationAgent: "mkt", idempotencyKey: "key-g2" };

    const first = await forwardSignalToMkt({ ...base, sourceRunId: sourceRunA }, {}, client.prisma);
    assert.equal(first.reused, false);

    await assert.rejects(
      forwardSignalToMkt({ ...base, sourceRunId: sourceRunB }, {}, client.prisma),
      (err: unknown) => err instanceof ConflictError
    );

    const count = await client.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: base.idempotencyKey },
    });
    assert.equal(count, 1, "nenhum registro adicional; o original permanece");

    const preserved = await client.prisma.signalForwardRequest.findFirst({
      where: { tenantId, workspaceId, idempotencyKey: base.idempotencyKey },
    });
    assert.equal(preserved?.sourceRunId, sourceRunA, "vínculo original preservado, não sobrescrito pela tentativa em conflito");
  } finally {
    await client.close();
  }
});

test("classificador real: formato inconclusivo/outra violação (sintético)", () => {
  assert.deepEqual(
    classifySignalForwardUniqueViolation(Object.assign(new Error(), { code: "P2002", meta: undefined })),
    { kind: "unclassified" }
  );
  assert.deepEqual(
    classifySignalForwardUniqueViolation(Object.assign(new Error(), {
      code: "P2002",
      meta: { modelName: "OutroModelo", driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields: ["x"] } } } },
    })),
    { kind: "other_unique_violation" }
  );
  assert.deepEqual(classifySignalForwardUniqueViolation(null), { kind: "unclassified" });
});
