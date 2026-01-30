import crypto from "node:crypto";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { SignerManager } from "../security/signerManager";

export type RecordCriticalActionParams = {
  runId: string;
  tenantId: string;
  actionType: string;
  payload: unknown;
  workspaceId?: string | null;
  expectedCriticalHash?: string;
  trustScore?: number | null;
  riskScore?: number | null;
  txId?: string | null;
};

export class LedgerService {
  constructor(
    private readonly prisma: PrismaClient = prismaGlobal,
    private readonly signerManager: SignerManager = SignerManager.fromEnv()
  ) {}

  /**
   * Registers a critical action with a signed proof.
   * Roadmap v3 - Phase 4.
   */
  async recordCriticalAction(params: RecordCriticalActionParams) {
    const payloadHash = this.generateHash(params.payload);
    if (params.expectedCriticalHash && params.expectedCriticalHash !== payloadHash) {
      throw new Error("LedgerService: critical_hash mismatch");
    }

    const criticalHash = params.expectedCriticalHash ?? payloadHash;
    const signedAt = new Date();
    const nonce = crypto.randomUUID();
    const tenantHash = this.generateHash(params.tenantId);

    const signatureData = await this.signerManager.signCriticalHash({
      hashHex: payloadHash,
      context: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.runId,
        actionHash: criticalHash,
        tenantHash,
        nonce,
        timestamp: signedAt.toISOString(),
      },
    });

    return this.prisma.guardrailLedger.create({
      data: {
        runId: params.runId,
        tenantId: params.tenantId,
        actionType: params.actionType,
        criticalHash,
        payloadHash,
        signature: signatureData.signature,
        signatureKeyId: signatureData.keyId,
        signedAt,
        trustScore: params.trustScore ?? null,
        riskScore: params.riskScore ?? null,
        txId: params.txId ?? null,
      },
    });
  }

  private generateHash(payload: unknown): string {
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }
}
