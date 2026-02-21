import { Router, type Response } from "express";
import { reconcileLedgerService } from "@eiah/core";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requirePermission } from "../middlewares/requirePermission";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { toPendingApprovalDto } from "../services/policyEngineAdapter";

export type CockpitQueueSnapshot = {
  approvals: {
    total: number;
    items: Array<{
      runId: string;
      status: "awaiting_approval";
      reason: string | null;
      requiredApprovals: number;
      criticality: "low" | "medium" | "high" | "critical" | "unknown";
      createdAt: string | null;
      requestedBy: string | null;
    }>;
  };
  reconcile: {
    pending: number;
    sample: Array<{
      kind: "missing_in_scl" | "missing_in_guardrail" | "mismatched_tx";
      referenceId: string;
      runId: string | null;
      actionType: string | null;
      txId: string | null;
    }>;
  };
  expiringDelegations: {
    total: number;
    windowDays: number;
    items: Array<{
      id: string;
      delegatorId: string;
      delegateeId: string;
      marketplaceId: string | null;
      scope: string;
      trustMin: number;
      status: string;
      validUntil: string;
      hoursToExpire: number;
    }>;
  };
  whatsappFailures: {
    total: number;
    items: Array<{
      messageId: string;
      to: string;
      status: string;
      sentAt: string;
      updatedAt: string;
    }>;
  };
};

type CockpitBuildDeps = {
  reconcile?: typeof reconcileLedgerService;
  now?: Date;
};

function parseBoolEnv(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

export function isCockpitQueuesEnabled() {
  return parseBoolEnv(process.env.COCKPIT_QUEUES_ENABLED, false);
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

export async function buildCockpitQueueSnapshot(
  request: TenantAwareRequest,
  deps: CockpitBuildDeps = {}
): Promise<CockpitQueueSnapshot> {
  const prisma = request.prisma!;
  const auth = request.authContext!;
  const now = deps.now ?? new Date();
  const limit = Math.min(Number(request.query?.limit ?? 50), 200);
  const expiringWindowDays = Math.min(
    Number(request.query?.expiringWindowDays ?? process.env.COCKPIT_EXPIRING_WINDOW_DAYS ?? "7"),
    30
  );
  const expiringUntil = new Date(now.getTime() + expiringWindowDays * 24 * 60 * 60 * 1000);

  let runs: Array<{ id: string; createdAt?: Date | null; request?: unknown; userId?: string | null }> = [];
  try {
    runs = await prisma.run.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId: auth.workspaceId,
        status: "awaiting_approval",
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, request: true, userId: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("invalid input value for enum") || !message.includes("RunStatus")) {
      throw error;
    }
  }

  const runIds = runs.map((run) => run.id);
  const blockEvents = runIds.length
    ? await prisma.runEvent.findMany({
        where: {
          tenantId: auth.tenantId,
          workspaceId: auth.workspaceId,
          runId: { in: runIds },
          type: "run.blocked.guardrails",
        },
        orderBy: { createdAt: "desc" },
        take: runIds.length * 2,
      })
    : [];
  const reasonByRunId = new Map<string, string | null>();
  blockEvents.forEach((event) => {
    if (reasonByRunId.has(event.runId)) return;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    reasonByRunId.set(event.runId, typeof payload.reason === "string" ? payload.reason : null);
  });
  const approvalsItems = runs.map((run) =>
    toPendingApprovalDto({
      run,
      reason: reasonByRunId.get(run.id) ?? null,
    })
  );

  const reconcile = deps.reconcile ?? reconcileLedgerService;
  const reconcileResult = await reconcile({
    tenantId: auth.tenantId,
    limit: Math.max(100, limit),
    persistReport: false,
    prisma,
  });
  const reconcileSample: CockpitQueueSnapshot["reconcile"]["sample"] = [
    ...reconcileResult.missingInScl.slice(0, 20).map((item) => ({
      kind: "missing_in_scl" as const,
      referenceId: item.id,
      runId: item.runId ?? null,
      actionType: item.actionType,
      txId: item.txId ?? null,
    })),
    ...reconcileResult.missingInGuardrail.slice(0, 20).map((item) => ({
      kind: "missing_in_guardrail" as const,
      referenceId: item.id,
      runId: item.runId ?? null,
      actionType: null,
      txId: item.txId,
    })),
    ...reconcileResult.mismatchedTx.slice(0, 20).map((item) => ({
      kind: "mismatched_tx" as const,
      referenceId: item.guardrailId,
      runId: null,
      actionType: null,
      txId: item.sclTxId ?? item.guardrailTxId ?? null,
    })),
  ];

  const delegationRows = await prisma.delegationPolicy.findMany({
    where: {
      delegatorId: auth.tenantId,
      validUntil: {
        gt: now,
        lte: expiringUntil,
      },
    },
    orderBy: { validUntil: "asc" },
    take: limit,
  });
  const expiringDelegations = delegationRows.map((item) => ({
    id: item.id,
    delegatorId: item.delegatorId,
    delegateeId: item.delegateeId,
    marketplaceId: item.marketplaceId ?? null,
    scope: item.scope,
    trustMin: item.trustMin,
    status: item.status,
    validUntil: item.validUntil.toISOString(),
    hoursToExpire: Math.max(0, Math.floor((item.validUntil.getTime() - now.getTime()) / (60 * 60 * 1000))),
  }));

  const whatsappRows = await prisma.$queryRawUnsafe<
    Array<{
      message_id: string;
      phone_e164: string;
      status: string;
      sent_at: Date | string;
      updated_at: Date | string;
    }>
  >(
    `
      SELECT message_id, phone_e164, status, sent_at, updated_at
      FROM whatsapp_message_log
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND status = 'failed'
      ORDER BY updated_at DESC
      LIMIT $3
    `,
    auth.tenantId,
    auth.workspaceId,
    limit
  );
  const whatsappFailures = whatsappRows.map((row) => ({
    messageId: row.message_id,
    to: row.phone_e164,
    status: row.status,
    sentAt: toIso(row.sent_at),
    updatedAt: toIso(row.updated_at),
  }));

  return {
    approvals: {
      total: approvalsItems.length,
      items: approvalsItems,
    },
    reconcile: {
      pending:
        reconcileResult.missingInScl.length +
        reconcileResult.missingInGuardrail.length +
        reconcileResult.mismatchedTx.length,
      sample: reconcileSample,
    },
    expiringDelegations: {
      total: expiringDelegations.length,
      windowDays: expiringWindowDays,
      items: expiringDelegations,
    },
    whatsappFailures: {
      total: whatsappFailures.length,
      items: whatsappFailures,
    },
  };
}

export const cockpitRouter = Router();
cockpitRouter.use(enforceTenant);

export async function getCockpitQueuesHandler(req: TenantAwareRequest, res: Response) {
  if (!isCockpitQueuesEnabled()) {
    return res.status(404).json({
      ok: false,
      error: { code: "COCKPIT_QUEUES_DISABLED", message: "cockpit queues endpoint disabled" },
    });
  }

  if (!req.authContext || !req.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const snapshot = await buildCockpitQueueSnapshot(req);
  return res.json({ ok: true, data: snapshot });
}

cockpitRouter.get(
  "/cockpit/queues",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  requirePermission("runs.execute"),
  (req, res) => getCockpitQueuesHandler(req as TenantAwareRequest, res)
);
