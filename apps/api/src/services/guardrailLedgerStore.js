import { prisma } from "@repo/db";
import { createLedgerBackedIdempotencyStore } from "@eiah/core";
export function createGuardrailLedgerStore() {
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
        isUniqueConstraintError: (error) => {
            const typedError = error;
            return typedError?.code === "P2002";
        },
    });
}
//# sourceMappingURL=guardrailLedgerStore.js.map