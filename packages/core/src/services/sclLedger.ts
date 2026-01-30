import crypto from "node:crypto";
import { Prisma, prismaGlobal, type PrismaClient } from "@repo/db";
import {
  evaluateSignaturePolicy,
  signaturePolicyConfigFromEnv,
  type RiskLevel,
} from "../policies/signaturePolicy";
import { SignerManager } from "../security/signerManager";
import { recordGuardrailAudit, recordGuardrailLedger } from "./guardrailLedgerStore";

export type TrustScoreReport = {
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
};

async function evaluateTrustScore(
  prisma: PrismaClient,
  tenantId: string
): Promise<TrustScoreReport> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [violations, blocks, intents] = await Promise.all([
    prisma.guardrailLedger.count({
      where: { tenantId, actionType: { startsWith: "violation" }, timestamp: { gte: sevenDaysAgo } },
    }),
    prisma.guardrailLedger.count({
      where: { tenantId, actionType: { startsWith: "blocked" }, timestamp: { gte: sevenDaysAgo } },
    }),
    prisma.guardrailLedger.count({
      where: { tenantId, actionType: "intent.validation", timestamp: { gte: sevenDaysAgo } },
    }),
  ]);

  let score = 80;
  const reasons: string[] = [];

  if (violations > 0) {
    score -= Math.min(violations * 10, 40);
    reasons.push(`Violations last 7d: ${violations}`);
  }

  if (blocks > 0) {
    score -= Math.min(blocks * 15, 45);
    reasons.push(`Blocks last 7d: ${blocks}`);
  }

  if (intents > 20) {
    score -= 5;
    reasons.push("High intent volume (rate-limited)");
  }

  if (score < 0) score = 0;

  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level, reasons };
}

function toJsonValue(payload: unknown) {
  return payload === undefined
    ? Prisma.DbNull
    : payload === null
    ? Prisma.JsonNull
    : (payload as Prisma.InputJsonValue);
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function appendSignedHash(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  runId: string;
  payload: unknown;
  riskLevel?: RiskLevel;
  trustScore?: TrustScoreReport;
}) {
  const client = params.prisma ?? prismaGlobal;
  const riskLevel: RiskLevel = params.riskLevel ?? "medium";

  const criticalHash = sha256Hex(JSON.stringify({ runId: params.runId, payload: params.payload }));
  const tenantHash = sha256Hex(params.tenantId);
  const txId = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const signedAt = new Date();

  const trustScore = params.trustScore ?? (await evaluateTrustScore(client, params.tenantId));
  const policyConfig = signaturePolicyConfigFromEnv();
  const decision = evaluateSignaturePolicy(
    {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      trustScore,
      tenantHash,
      actionHash: criticalHash,
      nonce,
      riskLevel,
    },
    policyConfig
  );

  if (!decision.allowed) {
    await recordGuardrailLedger({
      prisma: client,
      tenantId: params.tenantId,
      actionType: "signature.rejected",
      idempotencyKey: params.runId,
      usageCount: 1,
    });
    await recordGuardrailAudit({
      prisma: client,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      eventType: "signature.rejected",
      severity: "warn",
      message: decision.reason ?? "signature policy rejected",
      metadata: { trustScore, riskLevel, tenantHash, actionHash: criticalHash },
    });

    throw new Error(`SignaturePolicyRejected:${decision.reason ?? "unknown"}`);
  }

  let signature: string | null = null;
  let signatureAlg: string | null = null;
  let signatureKeyId: string | null = null;

  if (decision.requireSignature) {
    const signer = SignerManager.fromEnv();

    // Sign a stable hash of the signing payload.
    const signingPayload = {
      v: 1,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      txId,
      criticalHash,
      tenantHash,
      nonce,
      signedAt: signedAt.toISOString(),
      riskLevel,
    };
    const signingHashHex = sha256Hex(JSON.stringify(signingPayload));

    try {
      const signed = await signer.signCriticalHash({
        hashHex: signingHashHex,
        context: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId ?? null,
          runId: params.runId,
          actionHash: criticalHash,
          tenantHash,
          nonce,
          timestamp: signedAt.toISOString(),
          riskLevel,
        },
      });

      signature = signed.signature;
      signatureAlg = signed.algorithm;
      signatureKeyId = signed.keyId;

      await recordGuardrailLedger({
        prisma: client,
        tenantId: params.tenantId,
        actionType: "signature.signed",
        idempotencyKey: txId,
        usageCount: 1,
      });
      await recordGuardrailAudit({
        prisma: client,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.runId,
        eventType: "signature.signed",
        severity: "info",
        message: "SCL signing completed",
        metadata: {
          txId,
          criticalHash,
          tenantHash,
          nonce,
          algorithm: signatureAlg,
          keyId: signatureKeyId,
          signingHashHex,
        },
      });
    } catch (error) {
      await recordGuardrailLedger({
        prisma: client,
        tenantId: params.tenantId,
        actionType: "signature.failed",
        idempotencyKey: txId,
        usageCount: 1,
      });
      await recordGuardrailAudit({
        prisma: client,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.runId,
        eventType: "signature.failed",
        severity: "error",
        message: "SCL signing failed",
        metadata: {
          txId,
          criticalHash,
          tenantHash,
          nonce,
          riskLevel,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      if (policyConfig.enforceOnMissingSigner) {
        throw error;
      }
    }
  }

  await client.sclLedger.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      criticalHash,
      txId,
      payload: toJsonValue(params.payload),
      signature,
      signatureAlg,
      signatureKeyId,
      signatureNonce: nonce,
      tenantHash,
      signedAt,
    },
  });

  return {
    criticalHash,
    txId,
    signature,
    signatureAlg,
    signatureKeyId,
    signatureNonce: nonce,
    tenantHash,
    signedAt: signedAt.toISOString(),
  };
}
