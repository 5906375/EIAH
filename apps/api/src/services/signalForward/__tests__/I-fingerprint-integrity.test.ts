// Cenário I — fingerprint calculado pelo servidor; tentativa de influenciá-lo
// externamente; preservação do conteúdo (snapshot) após a origem mudar.
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt, ConflictError, type SignalForwardRequestInput } from "../signalForwardingService.ts";
import { computeRequestFingerprint, FINGERPRINT_CONTRACT_VERSION } from "../originContract.ts";

test("fingerprint é recalculado no servidor mesmo se o chamador tentar fornecer um valor (campo extra ignorado)", async () => {
  const client = createNamedClient("poc-real-i1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-i1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const base: SignalForwardRequestInput = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-i1",
    };
    // Simula um chamador que não respeita o tipo (ex.: cliente HTTP antigo
    // reenviando campos removidos) tentando influenciar o fingerprint E sua versão.
    const tampered = {
      ...base,
      requestFingerprint: "attacker-controlled-value",
      fingerprintVersion: "attacker-controlled-version",
    } as unknown as SignalForwardRequestInput;

    const result = await forwardSignalToMkt(tampered, {}, client.prisma);

    const forward = await client.prisma.signalForwardRequest.findUnique({ where: { id: result.forwardRequestId } });
    assert.notEqual(forward?.requestFingerprint, "attacker-controlled-value");
    assert.match(forward?.requestFingerprint ?? "", /^[a-f0-9]{64}$/, "fingerprint real, calculado no servidor");
    // O cliente não controla fingerprintVersion — é sempre a constante do servidor.
    assert.notEqual(forward?.fingerprintVersion, "attacker-controlled-version");
    assert.equal(forward?.fingerprintVersion, FINGERPRINT_CONTRACT_VERSION);
  } finally {
    await client.close();
  }
});

test("preservação do conteúdo: alterar a origem DEPOIS do encaminhamento não reescreve o snapshot já persistido, e bloqueia reuso silencioso", async () => {
  const client = createNamedClient("poc-real-i2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-i2");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input: SignalForwardRequestInput = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-i2",
    };

    const first = await forwardSignalToMkt(input, {}, client.prisma);
    const forwardBefore = await client.prisma.signalForwardRequest.findUnique({ where: { id: first.forwardRequestId } });
    const originalSnapshot = forwardBefore?.originSnapshot;
    const originalFingerprint = forwardBefore?.requestFingerprint;
    const originalFingerprintVersion = forwardBefore?.fingerprintVersion;
    assert.equal(originalFingerprintVersion, FINGERPRINT_CONTRACT_VERSION);

    // Origem MUDA depois do encaminhamento (ex.: alguém reprocessou o run do Radar).
    await client.prisma.run.update({
      where: { id: sourceRunId },
      data: { response: { signalAnalysis: { summary: "conteúdo alterado depois" } } },
    });

    // Retry com a MESMA chave: não deve trocar silenciosamente o conteúdo do
    // run já criado — deve ser tratado como conflito.
    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof ConflictError
    );

    const forwardAfter = await client.prisma.signalForwardRequest.findUnique({ where: { id: first.forwardRequestId } });
    assert.deepEqual(forwardAfter?.originSnapshot, originalSnapshot, "snapshot original preservado, não sobrescrito pela origem alterada");
    assert.equal(forwardAfter?.requestFingerprint, originalFingerprint, "fingerprint original preservado");
    assert.equal(forwardAfter?.fingerprintVersion, originalFingerprintVersion, "versão do fingerprint estável — não recalculada nem trocada por uma tentativa que resultou em conflito");
    assert.equal(forwardAfter?.destinationRunId, first.destinationRunId, "run de destino original preservado, nenhum novo run criado");
  } finally {
    await client.close();
  }
});

test("computeRequestFingerprint é determinístico e sensível ao conteúdo (unidade, sem banco)", () => {
  const a = computeRequestFingerprint({
    sourceRunId: "run-1", destinationAgent: "mkt", originSnapshot: { b: 2, a: 1 },
  });
  const b = computeRequestFingerprint({
    sourceRunId: "run-1", destinationAgent: "MKT", originSnapshot: { a: 1, b: 2 },
  });
  assert.equal(a, b, "normalização determinística: ordem de chaves e caixa do destino não devem importar");

  const c = computeRequestFingerprint({
    sourceRunId: "run-1", destinationAgent: "mkt", originSnapshot: { a: 1, b: 3 },
  });
  assert.notEqual(a, c, "conteúdo diferente deve produzir fingerprint diferente");
});
