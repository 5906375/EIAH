import crypto from "node:crypto";
import { prismaGlobal } from "@repo/db";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import {
  buildShadowExecutionContract,
  ShadowExecutionApprovalStatus,
  ShadowExecutionContract,
  ShadowExecutionEvidenceRef,
  ShadowExecutionPreview,
  ShadowExecutionStage,
} from "../types/shadowExecutionContract";

// Persistência durável do shadow execution sobre guardrail_audit_ledger.
// Cache em memória atua apenas como acelerador fail-safe.

const shadowExecutionCache = new Map<string, ShadowExecutionContract>();
const shadowExecutionPayloadCache = new Map<
  string,
  {
    prompt: string;
    metadata?: Record<string, unknown>;
    tools?: string[];
  }
>();
const runToShadowExecutionCache = new Map<string, string>();

function buildScopedKey(tenantId: string, workspaceId: string, shadowExecutionId: string) {
  return `${tenantId}:${workspaceId}:${shadowExecutionId}`;
}

function buildSnapshotEventType(shadowExecutionId: string) {
  return `shadow.execution.snapshot.${shadowExecutionId}`;
}

function buildPayloadEventType(shadowExecutionId: string) {
  return `shadow.execution.payload.${shadowExecutionId}`;
}

function buildRunLinkEventType(runId: string) {
  return `shadow.execution.run_link.${runId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readMetadataField<T>(metadata: unknown, key: string): T | null {
  const root = asRecord(metadata);
  if (!root) return null;
  return (root[key] as T | undefined) ?? null;
}

async function persistShadowExecutionSnapshot(contract: ShadowExecutionContract) {
  shadowExecutionCache.set(contract.shadowExecutionId, contract);
  await recordGuardrailAudit({
    prisma: prismaGlobal,
    tenantId: contract.tenantId,
    workspaceId: contract.workspaceId,
    eventType: buildSnapshotEventType(contract.shadowExecutionId),
    severity: "info",
    message: contract.shadowExecutionId,
    metadata: {
      shadowExecution: contract,
    },
  });
}

async function persistShadowExecutionPayload(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
  payload: {
    prompt: string;
    metadata?: Record<string, unknown>;
    tools?: string[];
  };
}) {
  shadowExecutionPayloadCache.set(params.shadowExecutionId, params.payload);
  await recordGuardrailAudit({
    prisma: prismaGlobal,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    eventType: buildPayloadEventType(params.shadowExecutionId),
    severity: "info",
    message: params.shadowExecutionId,
    metadata: {
      executionPayload: params.payload,
    },
  });
}

async function persistRunShadowLink(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  shadowExecutionId: string;
}) {
  runToShadowExecutionCache.set(params.runId, params.shadowExecutionId);
  await recordGuardrailAudit({
    prisma: prismaGlobal,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    eventType: buildRunLinkEventType(params.runId),
    severity: "info",
    message: params.shadowExecutionId,
    metadata: {
      shadowExecutionId: params.shadowExecutionId,
    },
  });
}

async function loadShadowExecutionSnapshot(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
}) {
  const cached = shadowExecutionCache.get(params.shadowExecutionId);
  if (cached && cached.tenantId === params.tenantId && cached.workspaceId === params.workspaceId) {
    return cached;
  }

  const audit = await prismaGlobal.guardrailAuditLedger.findFirst({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      eventType: buildSnapshotEventType(params.shadowExecutionId),
    },
    orderBy: { createdAt: "desc" },
  });

  const shadowExecution = readMetadataField<ShadowExecutionContract>(audit?.metadata, "shadowExecution");
  if (!shadowExecution) return null;
  const parsed = buildShadowExecutionContract(shadowExecution);
  shadowExecutionCache.set(parsed.shadowExecutionId, parsed);
  return parsed;
}

async function loadShadowExecutionPayload(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
}) {
  const cached = shadowExecutionPayloadCache.get(params.shadowExecutionId);
  if (cached) return cached;

  const audit = await prismaGlobal.guardrailAuditLedger.findFirst({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      eventType: buildPayloadEventType(params.shadowExecutionId),
    },
    orderBy: { createdAt: "desc" },
  });

  const executionPayload = readMetadataField<{
    prompt: string;
    metadata?: Record<string, unknown>;
    tools?: string[];
  }>(audit?.metadata, "executionPayload");
  if (!executionPayload) return null;
  shadowExecutionPayloadCache.set(params.shadowExecutionId, executionPayload);
  return executionPayload;
}

async function findShadowExecutionIdByRunId(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
}) {
  const cached = runToShadowExecutionCache.get(params.runId);
  if (cached) return cached;

  const audit = await prismaGlobal.guardrailAuditLedger.findFirst({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
      eventType: buildRunLinkEventType(params.runId),
    },
    orderBy: { createdAt: "desc" },
  });

  const shadowExecutionId =
    readMetadataField<string>(audit?.metadata, "shadowExecutionId") ??
    (typeof audit?.message === "string" && audit.message.trim().length > 0 ? audit.message.trim() : null);

  if (!shadowExecutionId) return null;
  runToShadowExecutionCache.set(params.runId, shadowExecutionId);
  return shadowExecutionId;
}

export async function createShadowExecutionSnapshot(params: {
  tenantId: string;
  workspaceId: string;
  agentId: string;
  inputRef: string;
  runId?: string | null;
  approvalStatus: ShadowExecutionApprovalStatus;
  preview: ShadowExecutionPreview;
  evidenceRefs: ShadowExecutionEvidenceRef[];
  executionPayload?: {
    prompt: string;
    metadata?: Record<string, unknown>;
    tools?: string[];
  };
}) {
  const shadowExecutionId = buildScopedKey(
    params.tenantId,
    params.workspaceId,
    `shadow_${crypto.randomUUID()}`
  );
  const contract = buildShadowExecutionContract({
    shadowExecutionId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    inputRef: params.inputRef,
    currentStage: params.approvalStatus === "pending" ? "approval" : "sandbox",
    sideEffectMode: "simulated_external_write",
    approvalStatus: params.approvalStatus,
    preview: params.preview,
    promotion: {
      target: "none",
      promotedByUserId: null,
      promotedAt: null,
      productionRunId: null,
    },
    evidenceRefs: params.evidenceRefs,
  });
  await persistShadowExecutionSnapshot(contract);
  if (params.executionPayload) {
    await persistShadowExecutionPayload({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      shadowExecutionId,
      payload: params.executionPayload,
    });
  }
  if (params.runId) {
    await persistRunShadowLink({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
      shadowExecutionId,
    });
  }
  return contract;
}

export async function createShadowExecutionPreview(params: {
  tenantId: string;
  workspaceId: string;
  agentId: string;
  inputRef: string;
  approvalStatus: ShadowExecutionApprovalStatus;
  preview: ShadowExecutionPreview;
  evidenceRefs: ShadowExecutionEvidenceRef[];
  executionPayload?: {
    prompt: string;
    metadata?: Record<string, unknown>;
    tools?: string[];
  };
}) {
  const shadowExecutionId = buildScopedKey(
    params.tenantId,
    params.workspaceId,
    `shadow_${crypto.randomUUID()}`
  );
  const contract = buildShadowExecutionContract({
    shadowExecutionId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    inputRef: params.inputRef,
    currentStage: params.approvalStatus === "pending" ? "approval" : "preview",
    sideEffectMode: "preview_only",
    approvalStatus: params.approvalStatus,
    preview: params.preview,
    promotion: {
      target: "none",
      promotedByUserId: null,
      promotedAt: null,
      productionRunId: null,
    },
    evidenceRefs: params.evidenceRefs,
  });
  await persistShadowExecutionSnapshot(contract);
  if (params.executionPayload) {
    await persistShadowExecutionPayload({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      shadowExecutionId,
      payload: params.executionPayload,
    });
  }
  return contract;
}

export async function getShadowExecutionSnapshot(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
}) {
  return loadShadowExecutionSnapshot(params);
}

export async function getShadowExecutionRuntime(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
}) {
  const snapshot = await loadShadowExecutionSnapshot(params);
  if (!snapshot) return null;
  return {
    snapshot,
    executionPayload:
      (await loadShadowExecutionPayload({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        shadowExecutionId: params.shadowExecutionId,
      })) ?? null,
  };
}

export async function listShadowExecutionSnapshots(params: {
  tenantId: string;
  workspaceId?: string | null;
  limit?: number;
  currentStage?: ShadowExecutionStage;
  approvalStatus?: ShadowExecutionApprovalStatus;
  agentId?: string;
}) {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
  const audits = await prismaGlobal.guardrailAuditLedger.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      eventType: {
        startsWith: "shadow.execution.snapshot.",
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit * 5,
  });

  const seen = new Set<string>();
  const items: ShadowExecutionContract[] = [];

  for (const audit of audits) {
    const shadowExecution = readMetadataField<ShadowExecutionContract>(audit.metadata, "shadowExecution");
    if (!shadowExecution) continue;
    const parsed = buildShadowExecutionContract(shadowExecution);
    if (params.agentId && parsed.agentId !== params.agentId) continue;
    if (params.currentStage && parsed.currentStage !== params.currentStage) continue;
    if (params.approvalStatus && parsed.approvalStatus !== params.approvalStatus) continue;
    if (seen.has(parsed.shadowExecutionId)) continue;
    seen.add(parsed.shadowExecutionId);
    shadowExecutionCache.set(parsed.shadowExecutionId, parsed);
    items.push(parsed);
    if (items.length >= limit) break;
  }

  return items;
}

export async function updateShadowExecutionApprovalByRunId(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  approvedByUserId: string | null;
  productionRunId?: string | null;
}) {
  const shadowExecutionId = await findShadowExecutionIdByRunId({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
  });
  if (!shadowExecutionId) return null;

  const current = await loadShadowExecutionSnapshot({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    shadowExecutionId,
  });
  if (!current) return null;

  const updated = buildShadowExecutionContract({
    ...current,
    currentStage: "approval",
    approvalStatus: "approved",
    promotion: {
      target: current.promotion.target === "none" ? "workspace_production" : current.promotion.target,
      promotedByUserId: params.approvedByUserId,
      promotedAt: new Date(),
      productionRunId: params.productionRunId ?? current.promotion.productionRunId,
    },
    evidenceRefs: [
      ...current.evidenceRefs,
      {
        source: "guardrail_audit",
        refId: params.runId,
        label: `approval:${params.runId}`,
      },
    ],
  });

  await persistShadowExecutionSnapshot(updated);
  if (params.productionRunId) {
    await persistRunShadowLink({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.productionRunId,
      shadowExecutionId: updated.shadowExecutionId,
    });
  }
  return updated;
}

export async function promoteShadowExecution(params: {
  tenantId: string;
  workspaceId: string;
  shadowExecutionId: string;
  promotedByUserId: string | null;
  productionRunId: string;
  auditRefId?: string | null;
}) {
  const current = await loadShadowExecutionSnapshot(params);
  if (!current) return null;

  const updated = buildShadowExecutionContract({
    ...current,
    currentStage: "production",
    sideEffectMode: "production_write",
    promotion: {
      target: "workspace_production",
      promotedByUserId: params.promotedByUserId,
      promotedAt: new Date(),
      productionRunId: params.productionRunId,
    },
    evidenceRefs: [
      ...current.evidenceRefs,
      ...(params.auditRefId
        ? [
            {
              source: "guardrail_audit" as const,
              refId: params.auditRefId,
              label: `shadow_promotion_audit:${params.auditRefId}`,
            },
          ]
        : []),
      {
        source: "run",
        refId: params.productionRunId,
        label: `production_run:${params.productionRunId}`,
      },
    ],
  });

  await persistShadowExecutionSnapshot(updated);
  await persistRunShadowLink({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.productionRunId,
    shadowExecutionId: updated.shadowExecutionId,
  });
  return updated;
}
