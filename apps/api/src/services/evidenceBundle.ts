import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { deriveExecutionEvidence } from "./executionEvidence";

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sortedEntries = Object.keys(record)
    .sort()
    .map((key) => [key, sortValue(record[key])] as const);
  return Object.fromEntries(sortedEntries);
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type BuildRunEvidenceBundleParams = {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  runId: string;
};

export async function buildRunEvidenceBundle(params: BuildRunEvidenceBundleParams) {
  const run = await params.prisma.run.findFirst({
    where: {
      id: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });
  if (!run) return null;

  const events = await params.prisma.runEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
    },
    orderBy: { createdAt: "asc" },
  });

  const sclEntries = await params.prisma.sclLedger.findMany({
    where: {
      tenantId: params.tenantId,
      runId: params.runId,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const guardrailEntries = await params.prisma.guardrailLedger.findMany({
    where: {
      tenantId: params.tenantId,
      runId: params.runId,
    },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  const intentEvent = [...events].reverse().find((event) => event.type === "run.intent.evaluated") ?? null;
  const ragSnapshotEvent = [...events].reverse().find((event) => event.type === "run.context.rag_snapshot") ?? null;
  const toolOutputEvents = events.filter(
    (event) => event.type === "run.action.completed" || event.type === "run.action.failed"
  );
  const billingUsageEvents = events.filter((event) => event.type === "billing.usage.updated");
  const billingGuardEvents = events.filter(
    (event) =>
      event.type === "run.billing.shadow" ||
      event.type === "run.billing.soft_limit" ||
      event.type === "run.billing.blocked"
  );

  const intentDoc = {
    runId: run.id,
    eventId: intentEvent?.id ?? null,
    createdAt: intentEvent?.createdAt ?? null,
    payload: intentEvent?.payload ?? null,
  };
  const contextDoc = {
    writeLabel:
      typeof run.request === "object" &&
      run.request &&
      !Array.isArray(run.request) &&
      "metadata" in (run.request as Record<string, unknown>) &&
      typeof (run.request as Record<string, unknown>).metadata === "object" &&
      (run.request as Record<string, unknown>).metadata &&
      !Array.isArray((run.request as Record<string, unknown>).metadata)
        ? (((run.request as Record<string, unknown>).metadata as Record<string, unknown>).writeLabel ?? null)
        : null,
    ragSnapshot: ragSnapshotEvent?.payload ?? null,
  };
  const outputDoc = {
    runResponse: run.response ?? null,
    toolEvents: toolOutputEvents.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      payload: event.payload ?? null,
      criticalHash: event.criticalHash ?? null,
      sclTxId: event.sclTxId ?? null,
    })),
    billing: {
      usageEvents: billingUsageEvents.map((event) => {
        const payload =
          event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? (event.payload as Record<string, unknown>)
            : {};
        return {
          id: event.id,
          type: event.type,
          createdAt: event.createdAt,
          ledgerId: typeof payload.ledgerId === "string" ? payload.ledgerId : null,
          requestId: typeof payload.requestId === "string" ? payload.requestId : null,
          mode: typeof payload.mode === "string" ? payload.mode : null,
          cycleStart: typeof payload.cycleStart === "string" ? payload.cycleStart : null,
          cycleEnd: typeof payload.cycleEnd === "string" ? payload.cycleEnd : null,
          usage:
            payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
              ? payload.usage
              : null,
        };
      }),
      guardEvents: billingGuardEvents.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt,
        payload: event.payload ?? null,
      })),
    },
  };
  const execution = deriveExecutionEvidence({
    status: run.status,
    errorCode: run.errorCode,
    response: run.response,
  });
  const decisionsDoc = {
    guardrail: guardrailEntries.map((entry) => ({
      id: entry.id,
      actionType: entry.actionType,
      txId: entry.txId ?? null,
      riskScore: entry.riskScore ?? null,
      trustScore: entry.trustScore ?? null,
      criticalHash: entry.criticalHash,
      timestamp: entry.timestamp,
    })),
  };
  const pouDoc = {
    schema: "pou.unavailable.v1",
    receipts: [] as unknown[],
    reason: "proof_of_usage_not_available_in_current_schema",
  };
  const sclDoc = sclEntries.map((entry) => ({
    id: entry.id,
    txId: entry.txId,
    criticalHash: entry.criticalHash,
    signaturePresent: Boolean(entry.signature),
    signedAt: entry.signedAt ?? null,
    createdAt: entry.createdAt,
  }));

  const intentRaw = stableJson(intentDoc);
  const contextRaw = stableJson(contextDoc);
  const outputRaw = stableJson(outputDoc);
  const decisionsRaw = stableJson(decisionsDoc);
  const pouRaw = stableJson(pouDoc);
  const sclRaw = stableJson(sclDoc);

  const manifest = {
    version: "bundle.v2",
    runId: run.id,
    generatedAt: new Date().toISOString(),
    execution,
    files: [
      { name: "intent.json", sha256: sha256Hex(intentRaw), sizeBytes: Buffer.byteLength(intentRaw, "utf8") },
      { name: "context.json", sha256: sha256Hex(contextRaw), sizeBytes: Buffer.byteLength(contextRaw, "utf8") },
      { name: "output.json", sha256: sha256Hex(outputRaw), sizeBytes: Buffer.byteLength(outputRaw, "utf8") },
      {
        name: "decisions.json",
        sha256: sha256Hex(decisionsRaw),
        sizeBytes: Buffer.byteLength(decisionsRaw, "utf8"),
      },
      { name: "pou.json", sha256: sha256Hex(pouRaw), sizeBytes: Buffer.byteLength(pouRaw, "utf8") },
      { name: "scl.json", sha256: sha256Hex(sclRaw), sizeBytes: Buffer.byteLength(sclRaw, "utf8") },
    ],
  };
  const manifestRaw = stableJson(manifest);
  const bundleHash = sha256Hex(
    stableJson({
      manifest,
      intentHash: manifest.files[0].sha256,
      contextHash: manifest.files[1].sha256,
      outputHash: manifest.files[2].sha256,
      decisionsHash: manifest.files[3].sha256,
      pouHash: manifest.files[4].sha256,
      sclHash: manifest.files[5].sha256,
    })
  );

  return {
    run,
    bundleHash,
    manifest,
    hashes: {
      intentHash: manifest.files[0].sha256,
      contextHash: manifest.files[1].sha256,
      outputHash: manifest.files[2].sha256,
      decisionsHash: manifest.files[3].sha256,
      pouHash: manifest.files[4].sha256,
      sclHash: manifest.files[5].sha256,
      manifestHash: sha256Hex(manifestRaw),
    },
    files: {
      "intent.json": intentDoc,
      "context.json": contextDoc,
      "output.json": outputDoc,
      "decisions.json": decisionsDoc,
      "pou.json": pouDoc,
      "scl.json": sclDoc,
      "manifest.json": JSON.parse(manifestRaw),
    },
  };
}
