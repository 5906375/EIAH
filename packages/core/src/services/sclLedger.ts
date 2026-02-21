import crypto from "node:crypto";
import {
  evaluateSignaturePolicy,
  signaturePolicyConfigFromEnv,
  type RiskLevel,
} from "../policies/signaturePolicy";
import { SignerManager } from "../security/signerManager";
import { recordGuardrailAudit, recordGuardrailLedger } from "./guardrailLedgerStore";
import { addCriticalLatency, incrCriticalCounter, recordCriticalSample } from "../metrics/criticalMetrics";
import { Web3Executor } from "./web3Executor";

export type TrustScoreReport = {
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
};

type SclPrismaLike = {
  guardrailLedger: {
    count: (args: {
      where: {
        tenantId: string;
        actionType?: { startsWith: string };
        timestamp?: { gte: Date };
      };
    }) => Promise<number>;
  };
  sclLedger: {
    create: (args: {
      data: {
        tenantId: string;
        workspaceId: string | null;
        runId: string;
        criticalHash: string;
        txId: string;
        payload: unknown;
        signature: string | null;
        signatureAlg: string | null;
        signatureKeyId: string | null;
        signatureNonce: string;
        tenantHash: string;
        signedAt: Date;
      };
    }) => Promise<unknown>;
  };
  guardrailAuditLedger: {
    create: (args: {
      data: {
        tenantId: string;
        workspaceId: string | null;
        runId: string | null;
        eventType: string;
        severity: string;
        message: string;
        metadata: unknown;
      };
    }) => Promise<unknown>;
  };
};

async function evaluateTrustScore(
  prisma: SclPrismaLike,
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
  return payload === undefined ? null : payload;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function parseOnchainRiskTiers() {
  const raw = process.env.WEB3_ONCHAIN_RISK_TIERS ?? "critical";
  const valid: RiskLevel[] = ["low", "medium", "high", "critical"];
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is RiskLevel => valid.includes(item as RiskLevel));
}

export async function appendSignedHash(params: {
  prisma?: SclPrismaLike;
  tenantId: string;
  workspaceId?: string | null;
  runId: string;
  payload: unknown;
  riskLevel?: RiskLevel;
  trustScore?: TrustScoreReport;
  requireSignature?: boolean;
}) {
  const client = params.prisma;
  if (!client) {
    throw new Error("appendSignedHash requires prisma instance");
  }
  const riskLevel: RiskLevel = params.riskLevel ?? "medium";
  const requireSignature = params.requireSignature ?? false;

  const criticalHash = sha256Hex(JSON.stringify({ runId: params.runId, payload: params.payload }));
  const tenantHash = sha256Hex(params.tenantId);
  let txId: string = crypto.randomUUID();
  let nonce: string = crypto.randomUUID();
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

  const onchainEnabled = envBool("WEB3_EXECUTOR_ENABLED", false);
  const onchainRiskTiers = parseOnchainRiskTiers();
  const shouldUseOnchain = onchainEnabled && onchainRiskTiers.includes(riskLevel);

  if (shouldUseOnchain) {
    const web3 = Web3Executor.fromEnv(client);
    const web3Result = await web3.submitAndWait({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      criticalHash,
      idempotencyKey: `web3:${params.runId}:${criticalHash}`,
      nonce,
    });
    txId = web3Result.txId;
    nonce = web3Result.nonce;

    if (web3Result.status !== "confirmed" && envBool("WEB3_EXECUTOR_FAIL_CLOSED", true)) {
      throw new Error(`Web3TxNotConfirmed:${web3Result.status}`);
    }
  }

  let signature: string | null = null;
  let signatureAlg: string | null = null;
  let signatureKeyId: string | null = null;

  if (decision.requireSignature) {
    const signer = SignerManager.fromEnv();
    const signerStart = Date.now();

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

      await addCriticalLatency("vault_sign_latency", Date.now() - signerStart);
      await incrCriticalCounter("vault_sign_ok_total");

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
      const reason = (() => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("SignerCircuitOpen")) return "circuit_open";
        if (message.toLowerCase().includes("timeout") || message.includes("AbortError")) {
          return "timeout";
        }
        if (message.toLowerCase().includes("vault")) return "vault_error";
        return "unknown";
      })();
      await incrCriticalCounter("vault_sign_fail_total", { reason });
      await recordCriticalSample({
        kind: "signer_fail",
        runId: params.runId,
        payload: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId ?? null,
          runId: params.runId,
          riskLevel,
          reason,
          error: error instanceof Error ? error.message : String(error),
        },
      });
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

  if (requireSignature && !signature) {
    await recordGuardrailLedger({
      prisma: client,
      tenantId: params.tenantId,
      actionType: "signature.required_missing",
      idempotencyKey: params.runId,
      usageCount: 1,
    });
    await recordGuardrailAudit({
      prisma: client,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      eventType: "signature.required_missing",
      severity: "error",
      message: "Signature required but missing",
      metadata: { riskLevel },
    });
    throw new Error("SignatureRequiredMissing");
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
