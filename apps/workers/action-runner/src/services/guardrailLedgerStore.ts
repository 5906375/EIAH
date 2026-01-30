import type { PrismaClient, Prisma } from "@repo/db";
import { createLedgerBackedIdempotencyStore, type IdempotencyStore } from "@eiah/core";

/**
 * Guardrail ledger store sem criar Prisma internamente.
 * O caller deve fornecer um PrismaClient já escopado (ex.: por tenant/workspace).
 */
export function createGuardrailLedgerStore(prisma: PrismaClient): IdempotencyStore {
  return createLedgerBackedIdempotencyStore({
    insert: async ({ tenantId, actionType, idempotencyKey, usageCount }) => {
      await prisma.guardrailLedger.create({
        data: {
          tenantId,
          actionType,
          idempotencyKey,
          usageCount: usageCount ?? 1,
        },
      });
    },
    cleanup: async ({ tenantId, actionType, before }) => {
      await prisma.guardrailLedger.deleteMany({
        where: {
          tenantId,
          actionType,
          timestamp: {
            lt: before,
          },
        },
      });
    },
    isUniqueConstraintError: (error: unknown) => {
      const typedError = error as Prisma.PrismaClientKnownRequestError | null | undefined;
      return typedError?.code === "P2002";
    },
  });
}
