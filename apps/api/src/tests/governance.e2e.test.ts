import { test } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { prismaGlobal } from "@repo/db";
import { evaluateIntent } from "../services/intentValidator";

test("fluxo assinado + outbox Redis publica evento", async (t) => {
  if (!process.env.DATABASE_URL || !(process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL)) {
    t.skip("DATABASE_URL/REDIS_URL nao configurados");
    return;
  }

  process.env.INTENT_SIGNATURE_SECRET ||= "test-secret";
  process.env.RUN_EVENTS_USE_OUTBOX = "true";

  const { emitRunEvent } = await import("../services/runEventEmitter");
  const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL!;
  const redis = new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 2 });

  const suffix = Date.now().toString(36);
  const tenantId = `tenant-${suffix}`;
  const workspaceId = `workspace-${suffix}`;
  const runId = `run-${suffix}`;

  try {
    await prismaGlobal.tenant.create({
      data: {
        id: tenantId,
        name: `Tenant ${suffix}`,
      },
    });

    await prismaGlobal.workspace.create({
      data: {
        id: workspaceId,
        tenantId,
        name: `Workspace ${suffix}`,
      },
    });

    await prismaGlobal.run.create({
      data: {
        id: runId,
        tenantId,
        workspaceId,
        agent: "agent-test",
        status: "pending",
        request: {
          prompt: "teste",
        },
        costCents: 0,
      },
    });

    const intent = await evaluateIntent({
      prompt: "teste com assinatura",
      metadata: {},
      tenantId,
      workspaceId,
      runId,
      prisma: prismaGlobal,
    });

    assert.ok(intent.signature, "signature deve ser gerada quando secret esta configurado");

    await emitRunEvent({
      runId,
      tenantId,
      workspaceId,
      type: "run.action.judge",
      payload: { ok: true },
    });

    const streamKey = process.env.RUN_EVENTS_OUTBOX_STREAM ?? "run-events-outbox";
    const entries = await redis.xrevrange(streamKey, "+", "-", "COUNT", 20);
    const found = entries.some(([, fields]) => {
      const index = fields.findIndex((value) => value === "event");
      if (index < 0) return false;
      try {
        const event = JSON.parse(fields[index + 1] ?? "{}") as { runId?: string };
        return event.runId === runId;
      } catch {
        return false;
      }
    });

    assert.equal(found, true, "evento deve estar no outbox stream");
  } finally {
    await prismaGlobal.runEvent.deleteMany({ where: { runId } });
    await prismaGlobal.run.deleteMany({ where: { id: runId } });
    await prismaGlobal.workspace.deleteMany({ where: { id: workspaceId } });
    await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
    await redis.quit();
  }
});
