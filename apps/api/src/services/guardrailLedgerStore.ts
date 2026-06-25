import crypto from "node:crypto";
import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import {
  createLedgerBackedIdempotencyStore,
  type IdempotencyStore,
} from "@eiah/core";

// 🔧 substitui o uso direto de PrismaClient
type TenantPrismaClient = PrismaClient;

export function createGuardrailLedgerStore(
  tenantId: string,
  workspaceId: string,
  client?: TenantPrismaClient
): IdempotencyStore {
  const db = client ?? prismaGlobal;

  return createLedgerBackedIdempotencyStore({
    insert: async (entry) => {
      const { tenantId, actionType, idempotencyKey, usageCount } = entry;
      const runId =
        typeof (entry as { runId?: unknown }).runId === "string"
          ? (entry as unknown as { runId: string }).runId
          : null;
      const criticalHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            event: "guardrail.ledger.insert",
            tenantId,
            actionType,
            idempotencyKey,
            usageCount: usageCount ?? 1,
          })
        )
        .digest("hex");
      const payloadHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            idempotencyKey,
            usageCount: usageCount ?? 1,
          })
        )
        .digest("hex");
      await db.guardrailLedger.create({
        data: {
          tenantId,
          runId,
          actionType,
          criticalHash,
          payloadHash,
        },
      });
    },
    cleanup: async ({ tenantId, actionType, before }) => {
      await db.guardrailLedger.deleteMany({
        where: {
          tenantId,
          actionType,
          timestamp: { lt: before },
        },
      });
    },
    isUniqueConstraintError: (error: unknown) => {
      const typed = error as Prisma.PrismaClientKnownRequestError | null;
      return typed?.code === "P2002";
    },
  });
}
