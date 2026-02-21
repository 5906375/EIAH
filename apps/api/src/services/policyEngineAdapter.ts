import { createDelegationProvider, evaluatePolicy, type PolicyEvaluation } from "@eiah/core";
import type { PrismaClient } from "@repo/db/client";
import { evaluateTrustScore } from "./trustScore";

export type ApprovalCriticality = "low" | "medium" | "high" | "critical" | "unknown";
export type PolicyApprovalStatus = "awaiting_approval";

export type PendingApprovalDto = {
  runId: string;
  status: PolicyApprovalStatus;
  reason: string | null;
  requiredApprovals: number;
  criticality: ApprovalCriticality;
  createdAt: string | null;
  requestedBy: string | null;
};

function resolveCriticality(request: unknown): ApprovalCriticality {
  if (!request || typeof request !== "object" || Array.isArray(request)) return "unknown";
  const metadata = (request as { metadata?: Record<string, unknown> }).metadata ?? null;
  const raw =
    typeof metadata?.criticality === "string"
      ? metadata.criticality
      : typeof (metadata as any)?.intent?.sensitivity === "string"
      ? ((metadata as any).intent as { sensitivity?: string }).sensitivity
      : null;
  const normalized = raw ? raw.trim().toLowerCase() : "unknown";
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "unknown";
}

function resolveRequiredApprovals(request: unknown) {
  if (request && typeof request === "object" && !Array.isArray(request)) {
    const metadata = (request as { metadata?: Record<string, unknown> }).metadata ?? null;
    const raw = metadata?.requiredApprovals;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.round(raw);
    }
  }
  const fallbackRaw = Number(process.env.APPROVAL_REQUIRED_COUNT ?? "1");
  return Number.isFinite(fallbackRaw) && fallbackRaw > 0 ? Math.round(fallbackRaw) : 1;
}

export type PolicyEngineMode = "shadow" | "enforce";

export type PolicyEngineResult = PolicyEvaluation & {
  mode: PolicyEngineMode;
  blocked: boolean;
};

function resolvePolicyMode(): PolicyEngineMode {
  const raw = (process.env.POLICY_ENGINE_MODE ?? "shadow").trim().toLowerCase();
  return raw === "enforce" ? "enforce" : "shadow";
}

function toDecision(
  evaluation: PolicyEvaluation,
  mode: PolicyEngineMode
): PolicyEngineResult {
  const blocked = evaluation.decision === "deny" && mode === "enforce";
  return { ...evaluation, mode, blocked };
}

export async function evaluatePolicyEngine(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  userId?: string | null;
  scope: "read" | "execute" | "admin";
  action: string;
}): Promise<PolicyEngineResult> {
  const policies = await params.prisma.delegationPolicy.findMany({
    where: { delegateeId: params.tenantId },
    select: {
      id: true,
      delegateeId: true,
      delegatorId: true,
      scope: true,
      trustMin: true,
      validUntil: true,
      status: true,
    },
  });

  if (!policies || policies.length === 0) {
    return toDecision({ decision: "allow", reason: null, policyRefs: null }, resolvePolicyMode());
  }

  const trustReport = await evaluateTrustScore(
    params.prisma,
    params.tenantId,
    params.workspaceId ?? ""
  );

  const evaluation = await evaluatePolicy({
    context: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      userId: params.userId ?? null,
      trustScore: trustReport.score,
      now: new Date(),
    },
    request: {
      action: params.action,
      scope: params.scope,
      policies: { delegations: policies },
    },
    providers: [createDelegationProvider()],
  });

  return toDecision(evaluation, resolvePolicyMode());
}

export function toPendingApprovalDto(params: {
  run: { id: string; createdAt?: Date | null; request?: unknown; userId?: string | null };
  reason?: string | null;
}): PendingApprovalDto {
  return {
    runId: params.run.id,
    status: "awaiting_approval",
    reason: params.reason ?? null,
    requiredApprovals: resolveRequiredApprovals(params.run.request),
    criticality: resolveCriticality(params.run.request),
    createdAt: params.run.createdAt ? params.run.createdAt.toISOString() : null,
    requestedBy: params.run.userId ?? null,
  };
}
