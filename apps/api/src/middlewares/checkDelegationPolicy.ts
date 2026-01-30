import { Response } from "express";
import { recordGuardrailLedger } from "@eiah/core";
import { DEFAULT_TRUST_SCORE } from "../services/trustScoreEngine";
import type { TenantAwareRequest } from "./enforceTenant";
import { Prisma } from "@repo/db";

type DelegationContext = {
  delegationId?: string | null;
  delegatorId?: string | null;
  marketplaceId?: string | null;
  scope?: string | null;
};

type DelegationPolicySummary = {
  id: string;
  delegatorId: string;
  delegateeId: string;
  marketplaceId?: string | null;
  scope: string;
  trustMin: number;
  validUntil: Date;
  policyHash: string;
  signatureHash: string;
  createdAt: Date;
};

function getHeaderValue(req: TenantAwareRequest, key: string) {
  return req.header(key) ?? req.header(key.toLowerCase()) ?? null;
}

function extractDelegationContext(req: TenantAwareRequest): DelegationContext {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const delegationId = getHeaderValue(req, "x-delegation-id") ?? (body.delegationId as string | null);
  const delegatorId = getHeaderValue(req, "x-delegator-id") ?? (body.delegatorId as string | null);
  const marketplaceId = getHeaderValue(req, "x-marketplace-id") ?? (body.marketplaceId as string | null);
  const scope = getHeaderValue(req, "x-delegation-scope") ?? (body.scope as string | null);

  return { delegationId, delegatorId, marketplaceId, scope };
}

function requireAuthContext(req: TenantAwareRequest, res: Response) {
  if (!req.authContext || !req.prisma) {
    res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
    return false;
  }
  return true;
}

export async function checkDelegationPolicy(req: TenantAwareRequest, res: Response) {
  const context = extractDelegationContext(req);
  if (!context.delegationId && !context.delegatorId) {
    return true;
  }

  if (!requireAuthContext(req, res)) {
    return false;
  }

  const tenantId = req.authContext!.tenantId;
  const now = new Date();
  let policy: DelegationPolicySummary | null = null;

  if (context.delegationId) {
    policy = (await req.prisma!.delegationPolicy.findUnique({
      where: { id: context.delegationId },
    })) as DelegationPolicySummary | null;
  } else if (context.delegatorId) {
    policy = (await req.prisma!.delegationPolicy.findFirst({
      where: {
        delegatorId: context.delegatorId,
        delegateeId: tenantId,
        scope: context.scope ?? "execute",
        ...(context.marketplaceId ? { marketplaceId: context.marketplaceId } : {}),
        validUntil: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    })) as DelegationPolicySummary | null;
  }

  if (!policy || policy.delegateeId !== tenantId) {
    res.status(403).json({
      ok: false,
      error: { code: "DELEGATION_MISSING", message: "Delegation policy not found" },
    });
    return false;
  }

  if (policy.validUntil.getTime() <= Date.now()) {
    res.status(403).json({
      ok: false,
      error: { code: "DELEGATION_EXPIRED", message: "Delegation policy expired" },
    });
    return false;
  }

  if (policy.marketplaceId) {
    const item = await req.prisma!.marketplaceItem.findUnique({
      where: { id: policy.marketplaceId },
    });

    const workspaceId = req.authContext?.workspaceId ?? null;
    const agentId = item?.name ?? policy.marketplaceId;
    let agentTrustScore = item?.trustScore ?? DEFAULT_TRUST_SCORE;

    if (workspaceId) {
      const trustRecord = await req.prisma!.agentTrustScore.findUnique({
        where: { unique_trustscore_agent: { tenantId, workspaceId, agentId } },
      });
      if (typeof trustRecord?.currentScore === "number") {
        agentTrustScore = trustRecord.currentScore;
      }
    }

    if (agentTrustScore < policy.trustMin) {
      res.status(403).json({
        ok: false,
        error: { code: "DELEGATION_TRUST_TOO_LOW", message: "Trust score below policy minimum" },
      });
      return false;
    }
  }

  try {
    await recordGuardrailLedger({
      prisma: req.prisma as any,
      tenantId,
      actionType: "delegation.used",
      idempotencyKey: policy.id,
      usageCount: 1,
    });
  } catch (error) {
    const typed = error as Prisma.PrismaClientKnownRequestError | null;
    if (typed?.code !== "P2002") {
      throw error;
    }
  }

  req.delegationPolicy = policy;
  return true;
}
