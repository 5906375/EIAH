// Cenário B — mesma chave, fingerprint incompatível.
import test from "node:test";
import assert from "node:assert/strict";
import { createNamedClient, resetFixturesForTenant } from "./helpers.ts";
import { forwardSignalToMkt, ConflictError } from "../service.ts";

test("mesma chave, fingerprint incompatível: 409 (ConflictError), nenhum registro adicional", async () => {
  const client = createNamedClient("poc-tx-fp-conflict");
  try {
    await resetFixturesForTenant(client.prisma, "poc-tenant-fp");

    const base = {
      tenantId: "poc-tenant-fp",
      workspaceId: "poc-workspace-fp",
      requestedByUserId: "poc-user-1",
      sourceRunId: "poc-source-run-fp",
      destinationAgent: "mkt",
      idempotencyKey: "poc-key-fp",
    };

    const first = await forwardSignalToMkt(client.prisma, { ...base, requestFingerprint: "poc-fp-original" });
    assert.equal(first.reused, false);

    await assert.rejects(
      forwardSignalToMkt(client.prisma, { ...base, requestFingerprint: "poc-fp-DIFFERENT" }),
      (err: unknown) => err instanceof ConflictError
    );

    const count = await client.prisma.signalForwardRequest.count({
      where: { tenantId: base.tenantId, workspaceId: base.workspaceId, idempotencyKey: base.idempotencyKey },
    });
    assert.equal(count, 1, "nenhum registro adicional deveria ter sido criado");

    const preserved = await client.prisma.signalForwardRequest.findFirst({
      where: { tenantId: base.tenantId, workspaceId: base.workspaceId, idempotencyKey: base.idempotencyKey },
    });
    assert.equal(preserved?.requestFingerprint, "poc-fp-original", "registro original deveria permanecer inalterado");
    assert.equal(preserved?.destinationRunId, first.destinationRunId, "destino original preservado");
  } finally {
    await client.close();
  }
});
