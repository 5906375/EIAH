import { describe, it, expect } from "vitest";
import Redis from "ioredis";
import { prismaGlobal } from "@repo/db";
import { evaluateIntent } from "../services/intentValidator";

describe("governance e2e", () => {
  const hasEnv =
    !!process.env.DATABASE_URL &&
    !!(process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL);

  const testFn = hasEnv ? it : it.skip;

  testFn("fluxo assinado + outbox Redis publica evento", async () => {
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

      expect(!!intent.signature).toBe(true);

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

      expect(found).toBe(true);
    } finally {
      const ignoreCleanupError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("append-only")) return;
        if (message.includes("Foreign key constraint")) return;
        throw error;
      };
      try {
        await prismaGlobal.runEvent.deleteMany({ where: { runId } });
      } catch (error) {
        ignoreCleanupError(error);
      }
      try {
        await prismaGlobal.approvalRecord.deleteMany({ where: { runId } });
      } catch (error) {
        ignoreCleanupError(error);
      }
      try {
        await prismaGlobal.planStepRecord.deleteMany({ where: { runId } });
      } catch (error) {
        ignoreCleanupError(error);
      }
      // guardrail_ledger é append-only; evitar deletes para não gerar warnings
      try {
        await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId } });
      } catch (error) {
        ignoreCleanupError(error);
      }
      try {
        await prismaGlobal.sclLedger.deleteMany({ where: { tenantId } });
      } catch (error) {
        ignoreCleanupError(error);
      }
      // Mantemos run/workspace/tenant para evitar FK warnings ligados ao append-only ledger.
      await redis.quit();
    }
  });
});
