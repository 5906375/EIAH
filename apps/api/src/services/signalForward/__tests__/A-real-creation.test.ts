// Cenário A — criação autorizada com createRunRecord REAL (não fixture).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";

test("createRunRecord real: atribuição válida, solicitação+run+vínculo persistidos", async () => {
  const client = createNamedClient("poc-real-a");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-a");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-a", requestFingerprint: "fp-a",
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
