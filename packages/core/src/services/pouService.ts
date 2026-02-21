import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { prismaGlobal, Prisma } from "@repo/db";
import { SignerManager } from "../security/signerManager";
import { addCriticalLatency, incrCriticalCounter } from "../metrics/criticalMetrics";

type PoUStatus = "PENDING" | "FINALIZED" | "FAILED" | "PENDING_TRUST";
export type PoUFailureReason =
  | "DB_WRITE_FAILED"
  | "VALIDATION_ERROR"
  | "SIGNER_ERROR"
  | "OUTPUT_UNAVAILABLE"
  | "HASH_ERROR"
  | "ATTESTATION_FAILED"
  | "UNKNOWN";

export type ProofOfUsageInput = {
  runId: string;
  actionId: string;
  intentHash: string;
  paramsHash: string;
  signatureHash: string;
  resultHash: string;
  trustSnapshot?: Record<string, unknown> | null;
};

export type CompositeTxInput = ProofOfUsageInput & {
  trustSnapshot?: Record<string, unknown> | null;
};

const DOMAIN = "EIAH_POU_V1";
const SCHEMA_VERSION = 1;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `"${k}":${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isHexHash(value: string) {
  return /^[a-fA-F0-9]{64}$/.test(value) || /^0x[a-fA-F0-9]{64}$/.test(value);
}

function isBase64Hash(value: string) {
  return /^[A-Za-z0-9+/]{43}=*$/.test(value);
}

function assertHash(label: string, value: string) {
  if (!value || (!isHexHash(value) && !isBase64Hash(value))) {
    throw new Error(`Invalid ${label} format`);
  }
}

export function generateCompositeTxIdV1(input: CompositeTxInput) {
  assertHash("intentHash", input.intentHash);
  assertHash("paramsHash", input.paramsHash);
  assertHash("signatureHash", input.signatureHash);
  assertHash("resultHash", input.resultHash);

  const payload = {
    domain: DOMAIN,
    schemaVersion: SCHEMA_VERSION,
    runId: input.runId,
    actionId: input.actionId,
    intentHash: input.intentHash,
    paramsHash: input.paramsHash,
    signatureHash: input.signatureHash,
    resultHash: input.resultHash,
    trustSnapshot: input.trustSnapshot ?? null,
  };

  return sha256Hex(stableStringify(payload));
}

export async function createProof(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId?: string | null;
  input: ProofOfUsageInput;
  canonicalResultRef?: string | null;
  status?: PoUStatus;
  failStop?: boolean;
}) {
  const client = params.prisma ?? prismaGlobal;
  const status: PoUStatus = params.status ?? "PENDING";

  try {
    const compositeTxId = generateCompositeTxIdV1(params.input);

    const created = await client.proofOfUsage.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.input.runId,
        actionId: params.input.actionId,
        intentHash: params.input.intentHash,
        paramsHash: params.input.paramsHash,
        signatureHash: params.input.signatureHash,
        resultHash: params.input.resultHash,
        trustSnapshot:
          params.input.trustSnapshot === undefined
            ? Prisma.DbNull
            : params.input.trustSnapshot === null
            ? Prisma.JsonNull
            : (params.input.trustSnapshot as Prisma.InputJsonValue),
        compositeTxId,
        canonicalResultRef: params.canonicalResultRef ?? null,
        status,
      },
    });

    await incrCriticalCounter("pou_created_total");
    if (status === "PENDING_TRUST") {
      await incrCriticalCounter("pou_pending_trust_total");
    }
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await client.proofOfUsage.findFirst({
        where: {
          runId: params.input.runId,
          actionId: params.input.actionId,
        },
      });
      return existing;
    }

    const reason =
      error instanceof Error && error.message.includes("Invalid")
        ? "VALIDATION_ERROR"
        : "DB_WRITE_FAILED";
    await incrCriticalCounter("pou_failed_total", { reason });
    if (params.failStop) {
      throw error;
    }
    return null;
  }
}

export async function finalizeProof(params: {
  prisma?: PrismaClient;
  pouId: string;
  attestationSignature?: string;
  attestationKeyId?: string;
  signIfMissing?: boolean;
}) {
  const client = params.prisma ?? prismaGlobal;
  const startedAt = Date.now();
  const record = await client.proofOfUsage.findUnique({ where: { id: params.pouId } });
  if (!record) throw new Error("PoU not found");

  if (record.status === "FINALIZED" || record.status === "FAILED") {
    throw new Error("PoU status immutable");
  }

  let attestationSignature = params.attestationSignature ?? null;
  let attestationKeyId = params.attestationKeyId ?? null;

  if (!attestationSignature && params.signIfMissing !== false) {
    const signer = SignerManager.fromEnv();
    const signerStart = Date.now();
    const signed = await signer.signCriticalHash({
      hashHex: record.compositeTxId,
      context: {
        tenantId: record.tenantId,
        workspaceId: record.workspaceId ?? null,
        runId: record.runId,
        actionHash: record.compositeTxId,
        tenantHash: record.tenantId,
        nonce: record.id,
        timestamp: new Date().toISOString(),
        riskLevel: "critical",
      },
    });
    attestationSignature = signed.signature;
    attestationKeyId = signed.keyId;
    await addCriticalLatency("vault_sign_latency", Date.now() - signerStart);
  }

  if (!attestationSignature || !attestationKeyId) {
    throw new Error("Attestation signature required");
  }

  const updated = await client.proofOfUsage.update({
    where: { id: record.id },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
      attestationKeyId,
      attestationSignature,
    },
  });

  await addCriticalLatency("pou_finalize_latency", Date.now() - startedAt);
  await incrCriticalCounter("pou_finalized_total");
  return updated;
}

export async function failProof(params: {
  prisma?: PrismaClient;
  pouId: string;
  reason: PoUFailureReason;
}) {
  const client = params.prisma ?? prismaGlobal;
  const record = await client.proofOfUsage.findUnique({ where: { id: params.pouId } });
  if (!record) throw new Error("PoU not found");

  if (record.status === "FINALIZED" || record.status === "FAILED") {
    throw new Error("PoU status immutable");
  }

  const updated = await client.proofOfUsage.update({
    where: { id: record.id },
    data: {
      status: "FAILED",
      failureReason: params.reason,
      finalizedAt: new Date(),
    },
  });

  await incrCriticalCounter("pou_failed_total", { reason: params.reason });
  return updated;
}
