import { PrismaClient, Prisma } from "@prisma/client";
import { createLedgerBackedIdempotencyStore, type IdempotencyStore } from "@eiah/core";

const prisma = new PrismaClient();

export function createGuardrailLedgerStore(): IdempotencyStore {
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
    isUniqueConstraintError: (error) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
  });
}
