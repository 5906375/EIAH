export type GuardrailLedgerEvent = {
  type: string;
  tenantId: string;
  workspaceId?: string;
  actor?: string;
  action?: string;
  message?: string;
  timestamp?: Date;
};

/**
 * Minimal guardrail ledger adapter.
 * TODO: wire to GuardrailAuditLedger/GuardrailLedger via Prisma when available.
 */
export const guardrailLedger = {
  async log(_event: GuardrailLedgerEvent) {
    // No-op placeholder to keep RBAC logging non-blocking.
  },
};
