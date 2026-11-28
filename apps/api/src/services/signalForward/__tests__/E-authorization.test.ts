// Cenário E — autorização REAL (checkScopePermission real, fail-closed).
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, seedRealScenario, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt, SignalForwardAuthorizationError } from "../signalForwardingService.ts";

test("sem concessão de escopo: bloqueado por padrão (fail-closed), nenhum registro criado", async () => {
  const client = createNamedClient("poc-real-e1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-e1");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    // Nenhum grantScope() chamado — nenhuma TenantActionPolicy para este tenant/workspace.

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-e1",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardAuthorizationError
    );

    const requestCount = await client.prisma.signalForwardRequest.count({
      where: { tenantId, workspaceId, idempotencyKey: input.idempotencyKey },
    });
    assert.equal(requestCount, 0, "nenhuma solicitação deveria ter sido criada sem autorização");
  } finally {
    await client.close();
  }
});

test("reuso não dispensa autorização: escopo revogado após criação bloqueia a releitura idempotente", async () => {
  const client = createNamedClient("poc-real-e2");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-e2");
    const { userId, sourceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await client.prisma.tenantActionPolicy.create({
      data: { tenantId, workspaceId, actionName: "runs.execute", allowed: true },
    });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-e2",
    };

    const first = await forwardSignalToMkt(input, {}, client.prisma);
    assert.equal(first.reused, false);

    // Revoga o escopo (linha real, allowed:false) para este tenant/workspace exato.
    await client.prisma.tenantActionPolicy.updateMany({
      where: { tenantId, workspaceId, actionName: "runs.execute" },
      data: { allowed: false },
    });

    // Repetição da MESMA solicitação idempotente — não deve ser dispensada de autorização.
    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardAuthorizationError
    );
  } finally {
    await client.close();
  }
});
