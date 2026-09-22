// Cenário H — validação da origem: existência escopada por tenant/workspace,
// isolamento cruzado (outro tenant, outro workspace do mesmo tenant), e
// estado/estrutura exigidos pelo contrato mínimo (provisório).
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createNamedClient, seedRealScenario, createOriginRun, grantScope, newTenantWorkspace } from "./helpers.ts";
import { forwardSignalToMkt } from "../signalForwardingService.ts";
import { SignalForwardOriginError } from "../originContract.ts";

test("origem inexistente: bloqueada, nenhum registro criado", async () => {
  const client = createNamedClient("poc-real-h1");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-h1");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId,
      sourceRunId: `nonexistent-${randomUUID()}`,
      destinationAgent: "mkt", idempotencyKey: "key-h1",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_not_found_in_scope"
    );

    const count = await client.prisma.signalForwardRequest.count({ where: { tenantId, workspaceId } });
    assert.equal(count, 0);
  } finally {
    await client.close();
  }
});

test("origem de outro tenant: bloqueada com o MESMO reasonCode de 'não encontrada' (sem revelar existência cross-tenant)", async () => {
  const client = createNamedClient("poc-real-h2");
  try {
    const scopeA = newTenantWorkspace("real-h2a");
    const scopeB = newTenantWorkspace("real-h2b");
    const { userId } = await seedRealScenario(client.prisma, scopeA);
    const { sourceRunId: foreignSourceRunId } = await seedRealScenario(client.prisma, scopeB);
    await grantScope(client.prisma, { tenantId: scopeA.tenantId, workspaceId: scopeA.workspaceId, scope: "runs.execute" });

    const input = {
      tenantId: scopeA.tenantId, workspaceId: scopeA.workspaceId, requestedByUserId: userId,
      sourceRunId: foreignSourceRunId, // Run real, mas de OUTRO tenant/workspace
      destinationAgent: "mkt", idempotencyKey: "key-h2",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_not_found_in_scope"
    );

    const count = await client.prisma.signalForwardRequest.count({
      where: { tenantId: scopeA.tenantId, workspaceId: scopeA.workspaceId },
    });
    assert.equal(count, 0, "nenhum vínculo cross-tenant deveria ter sido criado");
  } finally {
    await client.close();
  }
});

test("origem de outro workspace do MESMO tenant: bloqueada", async () => {
  const client = createNamedClient("poc-real-h3");
  try {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `t-real-h3-${suffix}`;
    const workspaceA = `w-real-h3-a-${suffix}`;
    const workspaceB = `w-real-h3-b-${suffix}`;
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId: workspaceA });
    const { sourceRunId: otherWorkspaceRunId } = await seedRealScenario(client.prisma, { tenantId, workspaceId: workspaceB });
    await grantScope(client.prisma, { tenantId, workspaceId: workspaceA, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId: workspaceA, requestedByUserId: userId,
      sourceRunId: otherWorkspaceRunId, // mesmo tenant, workspace DIFERENTE
      destinationAgent: "mkt", idempotencyKey: "key-h3",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_not_found_in_scope"
    );
  } finally {
    await client.close();
  }
});

test("origem incompatível com o contrato (estado não terminal de sucesso): bloqueada", async () => {
  const client = createNamedClient("poc-real-h4");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-h4");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const pendingSourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId, status: "pending" });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId: pendingSourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-h4",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_not_in_required_state"
    );
  } finally {
    await client.close();
  }
});

test("origem incompatível com o contrato (response não estruturado): bloqueada", async () => {
  const client = createNamedClient("poc-real-h5");
  try {
    const { tenantId, workspaceId } = newTenantWorkspace("real-h5");
    const { userId } = await seedRealScenario(client.prisma, { tenantId, workspaceId });
    const malformedSourceRunId = await createOriginRun(client.prisma, { tenantId, workspaceId, response: null });
    await grantScope(client.prisma, { tenantId, workspaceId, scope: "runs.execute" });

    const input = {
      tenantId, workspaceId, requestedByUserId: userId, sourceRunId: malformedSourceRunId,
      destinationAgent: "mkt", idempotencyKey: "key-h5",
    };

    await assert.rejects(
      forwardSignalToMkt(input, {}, client.prisma),
      (err: unknown) => err instanceof SignalForwardOriginError && err.reasonCode === "source_run_missing_structured_response"
    );
  } finally {
    await client.close();
  }
});
