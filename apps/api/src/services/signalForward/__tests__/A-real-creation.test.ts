// Cenário A — criação autorizada com createRunRecord REAL (não fixture).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";
import { FINGERPRINT_CONTRACT_VERSION } from "../originContract.ts";

test("createRunRecord real: atribuição válida, solicitação+run+vínculo persistidos", async () => {
  const client = createNamedClient("poc-real-a");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-a");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-a",
    };

    const result = await forwardSignalToMkt(input, {}, client.prisma);

    assert.equal(result.reused, false);
    assert.equal(result.status, "run_created");
    assert.ok(result.destinationRunId);

    const forward = await client.prisma.signalForwardRequest.findUnique({
      where: { id: result.forwardRequestId },
    });
    assert.equal(forward?.destinationRunId, result.destinationRunId);
    assert.equal(forward?.status, "run_created");
    assert.equal(forward?.sourceRunId, sourceRunId);
    // fingerprint calculado no servidor (64 hex chars = sha256) — não é o
    // que o chamador forneceria (chamador nem fornece mais esse campo).
    assert.match(forward?.requestFingerprint ?? "", /^[a-f0-9]{64}$/);
    // versão do fingerprint persistida explicitamente pelo servidor, igual à
    // constante realmente usada para calcular requestFingerprint (mesma fonte,
    // originContract.ts) — não derivada de parsing do hash.
    assert.equal(forward?.fingerprintVersion, FINGERPRINT_CONTRACT_VERSION);
    // snapshot da origem preservado, correspondente ao response real do run de origem
    assert.deepEqual(forward?.originSnapshot, { signalAnalysis: { summary: "sinal sintético de teste" } });

    // createRunRecord REAL: confirma assignmentId/agentVersion resolvidos de
    // verdade (não nulos), prova de que assertWorkspaceAgentEnabled real rodou.
    const run = await client.prisma.run.findUnique({ where: { id: result.destinationRunId! } });
    assert.equal(run?.agent, "mkt");
    assert.equal(run?.tenantId, tenantId);
    assert.equal(run?.workspaceId, workspaceId);
    assert.ok(run?.assignmentId, "assignmentId deveria estar resolvido pela atribuição real");
    assert.equal(run?.agentVersion, "1.0.0");
    const requestMeta = run?.request as any;
    assert.equal(requestMeta?.metadata?.signalForwardRequestId, result.forwardRequestId);
  } finally {
    await client.close();
  }
});
