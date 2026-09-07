// Cenário E — releitura inconsistente. Usa SIMULAÇÃO CONTROLADA: os estados
// abaixo (solicitação ausente após um P2002 supostamente detectado; solicitação
// existente sem destinationRunId) não são produzidos pela transação real do
// mecanismo (que cria solicitação+run+vínculo atomicamente) — são forçados
// diretamente no banco para testar a reação de recoverExistingSignalForwardRequest
// a uma inconsistência, não o caminho feliz do mecanismo.
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, resetFixturesForTenant } from "./helpers.ts";
import { recoverExistingSignalForwardRequest, SignalForwardInconsistencyError } from "../service.ts";

test("[simulação controlada] solicitação ausente: nenhum sucesso, nenhum run criado", async () => {
  const client = createNamedClient("poc-tx-inconsistent-missing");
  try {
    await resetFixturesForTenant(client.prisma, "poc-tenant-missing");

    const input = {
      tenantId: "poc-tenant-missing", workspaceId: "poc-workspace-missing",
      requestedByUserId: "poc-user-1", sourceRunId: "poc-source-run-missing",
      destinationAgent: "mkt", idempotencyKey: "poc-key-missing-nonexistent",
      requestFingerprint: "poc-fp-missing",
    };

    await assert.rejects(
      recoverExistingSignalForwardRequest(client.prisma, input),
      (err: unknown) =>
        err instanceof SignalForwardInconsistencyError &&
        err.message === "unique_violation_without_matching_row"
    );

    const runCount = await client.prisma.runFixture.count({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId },
    });
    assert.equal(runCount, 0, "nenhum run deveria ter sido criado como compensação");
  } finally {
    await client.close();
  }
});

test("[simulação controlada] destinationRunId nulo: nenhum sucesso, nenhum run criado como compensação", async () => {
  const client = createNamedClient("poc-tx-inconsistent-nullrun");
  try {
    await resetFixturesForTenant(client.prisma, "poc-tenant-nullrun");

    const input = {
      tenantId: "poc-tenant-nullrun", workspaceId: "poc-workspace-nullrun",
      requestedByUserId: "poc-user-1", sourceRunId: "poc-source-run-nullrun",
      destinationAgent: "mkt", idempotencyKey: "poc-key-nullrun",
      requestFingerprint: "poc-fp-nullrun",
    };

    // Estado forçado diretamente (fora da transação real) — não representa o
    // comportamento normal do mecanismo, apenas testa a reação à inconsistência.
    await client.prisma.signalForwardRequest.create({
      data: {
        tenantId: input.tenantId, workspaceId: input.workspaceId,
        sourceRunId: input.sourceRunId, destinationAgent: input.destinationAgent,
        idempotencyKey: input.idempotencyKey, requestFingerprint: input.requestFingerprint,
        requestedByUserId: input.requestedByUserId, status: "pending_dispatch",
        destinationRunId: null,
      },
    });

    await assert.rejects(
      recoverExistingSignalForwardRequest(client.prisma, input),
      (err: unknown) =>
        err instanceof SignalForwardInconsistencyError &&
        err.message === "existing_request_without_destination_run"
    );

    const runCount = await client.prisma.runFixture.count({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId },
    });
    assert.equal(runCount, 0, "nenhum run deveria ter sido criado como compensação automática");
  } finally {
    await client.close();
  }
});
