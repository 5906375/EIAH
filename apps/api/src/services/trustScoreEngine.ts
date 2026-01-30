/**
 * trustScoreEngine.ts
 * Módulo de Governança Cognitiva responsável por pontuação dinâmica de confiança.
 * Integra com GuardrailLedger e pode ser consultado pelo IntentValidator.
 */

import { prismaGlobal } from "@repo/db";
import { emitRunEvent } from "./runEventEmitter";

export const DEFAULT_TRUST_SCORE = 100;
export const MIN_TRUST_SCORE = 0;
export const MAX_TRUST_SCORE = 200;

type TrustScoreContext = {
  tenantId?: string;
  workspaceId?: string;
  runId?: string;
  userId?: string | null;
};

export async function get(
  agentId: string,
  tenantId?: string,
  workspaceId?: string
): Promise<number> {
  if (!tenantId || !workspaceId) {
    return DEFAULT_TRUST_SCORE;
  }

  const score = await prismaGlobal.agentTrustScore.findUnique({
    where: { tenantId_workspaceId_agentId: { tenantId, workspaceId, agentId } },
  });

  return score?.currentScore ?? DEFAULT_TRUST_SCORE;
}

export async function update(
  agentId: string,
  delta: number,
  reason: string,
  context?: TrustScoreContext
): Promise<number> {
  const tenantId = context?.tenantId;
  const workspaceId = context?.workspaceId;
  const runId = context?.runId;

  if (!tenantId || !workspaceId) {
    return DEFAULT_TRUST_SCORE;
  }

  const existing = await prismaGlobal.agentTrustScore.findUnique({
    where: { tenantId_workspaceId_agentId: { tenantId, workspaceId, agentId } },
  });

  const prev = existing?.currentScore ?? DEFAULT_TRUST_SCORE;
  const next = Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, prev + delta));
  const trend = next > prev ? "rising" : next < prev ? "falling" : "stable";

  await prismaGlobal.agentTrustScore.upsert({
    where: { tenantId_workspaceId_agentId: { tenantId, workspaceId, agentId } },
    update: { currentScore: next, lastDelta: delta, trend },
    create: {
      tenantId,
      workspaceId,
      agentId,
      currentScore: next,
      baseline: DEFAULT_TRUST_SCORE,
      lastDelta: delta,
      trend,
    },
  });

  await prismaGlobal.guardrailAuditLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId: runId ?? null,
      eventType: "trust.update",
      severity: delta < 0 ? "warning" : "info",
      message: `Trust score updated to ${next} (${trend})`,
      metadata: { agentId, delta, reason, prev, next },
    },
  });

  if (runId) {
    await emitRunEvent({
      runId,
      tenantId,
      workspaceId,
      userId: context?.userId ?? undefined,
      type: "trust.update",
      payload: { agentId, delta, prev, next, reason },
    });
  }

  return next;
}

export async function increment(
  agentId: string,
  value = 1,
  reason = "positive_observe",
  context?: TrustScoreContext
) {
  return update(agentId, value, reason, context);
}

export async function decrement(
  agentId: string,
  value = 1,
  reason = "observe_failed",
  context?: TrustScoreContext
) {
  return update(agentId, -Math.abs(value), reason, context);
}
