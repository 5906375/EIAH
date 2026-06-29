export type GuardrailLedgerEvent = {
  type: string;
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  actor?: string;
  scope?: string;
  action?: string;
  decision?: "allow" | "deny" | "error";
  reasonCode?: string;
  requestId?: string;
  runId?: string;
  message?: string;
  timestamp?: Date;
};

async function loadGuardrailPersistenceDeps() {
  const [{ prismaGlobal }, { recordGuardrailAudit, recordGuardrailLedger }] = await Promise.all([
    import("@repo/db"),
    import("../services/guardrailLedgerStore"),
  ]);

  return { prismaGlobal, recordGuardrailAudit, recordGuardrailLedger };
}

export const guardrailLedger = {
  async log(event: GuardrailLedgerEvent) {
    const { prismaGlobal, recordGuardrailAudit, recordGuardrailLedger } =
      await loadGuardrailPersistenceDeps();
    const actionType = event.type || `rbac.scope.${event.decision ?? "deny"}`;
    const actorId = event.actorId ?? event.actor ?? null;
    // GuardrailLedger persists the canonical action/hash surface.
    // GuardrailAuditLedger persists operational metadata used by audit/read APIs.
    const payload = {
      workspaceId: event.workspaceId ?? null,
      actorId,
      scope: event.scope ?? event.action ?? null,
      action: event.action ?? event.scope ?? null,
      decision: event.decision ?? "deny",
      reasonCode: event.reasonCode ?? null,
      requestId: event.requestId ?? null,
      runId: event.runId ?? null,
      message: event.message ?? null,
      timestamp: (event.timestamp ?? new Date()).toISOString(),
      eventType: event.type,
    };

    await recordGuardrailLedger({
      prisma: prismaGlobal as never,
      tenantId: event.tenantId,
      runId: event.runId ?? null,
      actionType,
      payload,
      isSystemFault: event.decision === "error",
    });

    await recordGuardrailAudit({
      prisma: prismaGlobal as never,
      tenantId: event.tenantId,
      workspaceId: event.workspaceId ?? null,
      runId: event.runId ?? null,
      eventType: actionType,
      severity:
        event.decision === "error" ? "error" : event.decision === "deny" ? "warn" : "info",
      message:
        event.message ??
        `${event.decision ?? "deny"} scope '${event.scope ?? event.action ?? "unknown"}' (${event.reasonCode ?? "unknown"})`,
      metadata: payload,
    });
  },
};
