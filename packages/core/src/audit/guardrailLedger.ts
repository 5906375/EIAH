export type GuardrailLedgerEvent = {
  type: string;
  tenantId: string;
  workspaceId?: string;
  actor?: string;
  runId?: string;
  requestId?: string;
  action?: string;
  message?: string;
  timestamp?: Date;
};

type GuardrailLedgerWriter = (event: GuardrailLedgerEvent) => Promise<void>;

let writer: GuardrailLedgerWriter | null = null;
const metrics = {
  guardrailLedgerWriteFailedTotal: 0,
  guardrailLedgerFallbackTotal: 0,
};

export function configureGuardrailLedgerWriter(nextWriter: GuardrailLedgerWriter | null) {
  writer = nextWriter;
}

export function getGuardrailLedgerMetrics() {
  return { ...metrics };
}

export const guardrailLedger = {
  async log(event: GuardrailLedgerEvent) {
    if (!writer) {
      metrics.guardrailLedgerFallbackTotal += 1;
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "guardrail_ledger_unconfigured",
          type: event.type,
          tenantId: event.tenantId,
          workspaceId: event.workspaceId ?? null,
          action: event.action ?? null,
        })
      );
      return;
    }
    try {
      await writer(event);
    } catch (error) {
      metrics.guardrailLedgerWriteFailedTotal += 1;
      console.error(
        JSON.stringify({
          level: "error",
          event: "guardrail_ledger_write_failed",
          type: event.type,
          tenantId: event.tenantId,
          workspaceId: event.workspaceId ?? null,
          action: event.action ?? null,
          message: error instanceof Error ? error.message : String(error),
          guardrail_ledger_write_failed_total: metrics.guardrailLedgerWriteFailedTotal,
        })
      );
    }
  },
};
