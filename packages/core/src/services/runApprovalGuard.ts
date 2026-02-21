import type { PrismaClient } from "@repo/db";
import { createLogger } from "../logging";
import { incrCriticalCounter } from "../metrics/criticalMetrics";
import { SignerManager } from "../security/signerManager";
import { canonicalizeResult, computeResultHash } from "./pouHash";

function parseBoolEnv(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) return true;
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  return fallback;
}

export function requiresApprovalFromRequest(request: unknown) {
  if (parseBoolEnv(process.env.RUN_APPROVAL_REQUIRED, false)) return true;
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  const metadata = (request as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const raw =
    (metadata as Record<string, unknown>).requiresApproval ??
    (metadata as Record<string, unknown>).requires_confirmation;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return ["true", "1", "yes", "on"].includes(raw.trim().toLowerCase());
  return false;
}

async function computePlanHashForRun(prisma: PrismaClient, runId: string) {
  const steps = await prisma.planStepRecord.findMany({
    where: { runId, stepType: "plan" },
    orderBy: { stepIndex: "asc" },
    select: { stepIndex: true, output: true },
  });

  const payload = steps.map((step) => ({
    stepIndex: step.stepIndex,
    output: step.output ?? null,
  }));

  return computeResultHash(canonicalizeResult(payload));
}

export async function ensureRunApproval(params: {
  prisma: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
}) {
  const logger = createLogger({ component: "run-approval-guard" });
  const currentPlanHash = await computePlanHashForRun(params.prisma, params.runId);
  const record = await params.prisma.approvalRecord.findFirst({
    where: { runId: params.runId },
    orderBy: { attempt: "desc" },
  });
  if (!record || record.decision !== "APPROVED") {
    return {
      ok: false,
      reason: "approval_missing",
      approval: record ?? null,
      planHash: currentPlanHash,
      approvedPlanHash: record?.planHash ?? null,
      approverId: record?.approverId ?? null,
      trustSnapshot: record
        ? {
            score: record.approverTrust,
            requiredMinTrust: record.requiredMinTrust ?? null,
            policyId: record.policyId ?? null,
            policyVersion: record.policyVersion ?? null,
          }
        : null,
    } as const;
  }

  if (record.planHash !== currentPlanHash) {
    await incrCriticalCounter("approval_plan_mismatch_total");
    logger.warn(
      { runId: params.runId, approvalId: record.id, planHash: currentPlanHash, approvedPlanHash: record.planHash },
      "run-approval-guard.plan_mismatch"
    );
    return {
      ok: false,
      reason: "plan_mismatch",
      approval: record,
      planHash: currentPlanHash,
      approvedPlanHash: record.planHash,
      approverId: record.approverId ?? null,
      trustSnapshot: {
        score: record.approverTrust,
        requiredMinTrust: record.requiredMinTrust ?? null,
        policyId: record.policyId ?? null,
        policyVersion: record.policyVersion ?? null,
      },
    } as const;
  }

  const signatureRequired =
    parseBoolEnv(process.env.APPROVAL_SIGNATURE_REQUIRED, false) ||
    parseBoolEnv(process.env.SIGNER_REQUIRED, false);
  if (signatureRequired && !record.sclSignature) {
    await incrCriticalCounter("approval_signature_verify_total", {
      result: "missing",
      reason: "signature_missing",
    });
    logger.warn(
      { runId: params.runId, approvalId: record.id },
      "run-approval-guard.signature_missing"
    );
    return {
      ok: false,
      reason: "signature_missing",
      approval: record,
      planHash: currentPlanHash,
      approvedPlanHash: record.planHash,
      approverId: record.approverId ?? null,
      trustSnapshot: {
        score: record.approverTrust,
        requiredMinTrust: record.requiredMinTrust ?? null,
        policyId: record.policyId ?? null,
        policyVersion: record.policyVersion ?? null,
      },
    } as const;
  }

  if (signatureRequired) {
    const signer = SignerManager.fromEnv();
    const verify = await signer.verifyCriticalSignature({
      payloadHash: record.payloadHash,
      signature: record.sclSignature ?? "",
      keyRef: record.tenantId,
    });

    if (!verify.ok) {
      await incrCriticalCounter("approval_signature_verify_total", {
        result: "invalid",
        reason: verify.reason ?? "invalid_signature",
      });
      logger.warn(
        {
          runId: params.runId,
          approvalId: record.id,
          reason: verify.reason ?? "invalid_signature",
        },
        "run-approval-guard.signature_invalid"
      );
      return {
        ok: false,
        reason: "invalid_signature",
        approval: record,
        planHash: currentPlanHash,
        approvedPlanHash: record.planHash,
        approverId: record.approverId ?? null,
        trustSnapshot: {
          score: record.approverTrust,
          requiredMinTrust: record.requiredMinTrust ?? null,
          policyId: record.policyId ?? null,
          policyVersion: record.policyVersion ?? null,
        },
      } as const;
    }

    await incrCriticalCounter("approval_signature_verify_total", {
      result: "ok",
      reason: "verified",
    });
  }

  return {
    ok: true,
    approval: record,
    planHash: currentPlanHash,
    approvedPlanHash: record.planHash,
    approverId: record.approverId ?? null,
    trustSnapshot: {
      score: record.approverTrust,
      requiredMinTrust: record.requiredMinTrust ?? null,
      policyId: record.policyId ?? null,
      policyVersion: record.policyVersion ?? null,
    },
  } as const;
}
