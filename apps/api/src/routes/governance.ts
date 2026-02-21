import { Router } from "express";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { requirePermission } from "../middlewares/requirePermission";
import { getRun } from "../services/runs";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { maskText } from "../services/masker";
import { checkScopePermission } from "@eiah/core/security/rbac";
import {
  reconcileLedgerService,
  addCriticalLatency,
  incrCriticalCounter,
  recordCriticalLatencySample,
} from "@eiah/core";
import { toPendingApprovalDto } from "../services/policyEngineAdapter";
import { toPoUResponseV1 } from "../services/pouResponse";

export const governanceRouter = Router();
governanceRouter.use(enforceTenant);

const CalibrationSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  gate: z.enum(["intent", "trust", "judge"]),
  label: z.enum(["false_positive", "false_negative"]),
  comment: z.string().max(500).optional(),
});

const TrustHistoryWindowSchema = z.enum(["7d", "30d"]).default("30d");

type GateDecision = "observed" | "allowed" | "blocked" | "error";
type GateMode = "shadow" | "enforce";

type GateVerdict = {
  gate: "intent" | "trust" | "judge";
  decision: GateDecision;
  mode?: GateMode;
  score?: number;
  threshold?: number;
  reasonCodes?: string[];
  policyVersion?: string;
  model?: string;
  stepId?: string | null;
  createdAt?: Date;
};

function sanitizeComment(comment?: string) {
  if (!comment) return undefined;
  let masked = comment;
  const rules = [
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b\d{2}\s?\d{4,5}-?\d{4}\b/g,
    /token|secret|password|key/gi,
  ];
  for (const regex of rules) {
    masked = maskText(masked, regex);
  }
  return masked.slice(0, 500);
}

function pickLatest(events: GateVerdict[]) {
  if (!events.length) return undefined;
  return events.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  })[0];
}

function downsamplePoints<T>(points: T[], maxPoints = 200) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % step === 0);
}

async function buildPhase4AnchoringEvidence(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  runId: string;
}) {
  const run = await params.prisma.run.findFirst({
    where: {
      id: params.runId,
      tenantId: params.tenantId,
    },
    select: {
      criticalHash: true,
      sclTxId: true,
      txId: true,
    },
  });

  const runCriticalHash = run?.criticalHash ?? null;
  const runSclTxId = run?.sclTxId ?? null;

  const [sclByTx, sclByCriticalHash, guardrailByCriticalHash] = await Promise.all([
    runSclTxId
      ? params.prisma.sclLedger.findFirst({
          where: {
            tenantId: params.tenantId,
            runId: params.runId,
            txId: runSclTxId,
          },
          select: {
            txId: true,
            criticalHash: true,
            signature: true,
            signedAt: true,
          },
        })
      : Promise.resolve(null),
    runCriticalHash
      ? params.prisma.sclLedger.findFirst({
          where: {
            tenantId: params.tenantId,
            runId: params.runId,
            criticalHash: runCriticalHash,
          },
          orderBy: { createdAt: "desc" },
          select: {
            txId: true,
            criticalHash: true,
            signature: true,
            signedAt: true,
          },
        })
      : Promise.resolve(null),
    runCriticalHash
      ? params.prisma.guardrailLedger.findFirst({
          where: {
            tenantId: params.tenantId,
            runId: params.runId,
            criticalHash: runCriticalHash,
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const matchedScl = sclByTx ?? sclByCriticalHash;
  const hasRunPointers = Boolean(runCriticalHash && runSclTxId);
  const hashConsistent =
    Boolean(matchedScl?.criticalHash) && Boolean(runCriticalHash) && matchedScl!.criticalHash === runCriticalHash;
  const txConsistent = Boolean(sclByTx && runSclTxId && sclByTx.txId === runSclTxId);
  const signaturePresent = Boolean(matchedScl?.signature);
  const guardrailLinked = Boolean(guardrailByCriticalHash);
  const consistent = hasRunPointers && hashConsistent && txConsistent;
  const strength = consistent && signaturePresent && guardrailLinked ? "strong" : "weak";
  const status = consistent ? "anchored" : hasRunPointers ? "inconsistent" : "missing_phase4_anchor";

  return {
    phase4Dependency: "required",
    status,
    strength,
    consistent,
    pointers: {
      runCriticalHash,
      runSclTxId,
      runTxId: run?.txId ?? null,
    },
    checks: {
      hasRunPointers,
      sclFoundByTx: Boolean(sclByTx),
      sclFoundByCriticalHash: Boolean(sclByCriticalHash),
      hashConsistent,
      txConsistent,
      signaturePresent,
      guardrailLinked,
    },
  };
}

governanceRouter.get("/runs/:id/governance", requirePermission("governance.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const run = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!run) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "run" },
    });
  }

  const auditEvents = await prisma.guardrailAuditLedger.findMany({
    where: {
      tenantId: authContext.tenantId,
      runId: req.params.id,
    },
    orderBy: { createdAt: "asc" },
  });

  const pouRecords = await prisma.proofOfUsage.findMany({
    where: {
      tenantId: authContext.tenantId,
      runId: req.params.id,
    },
    orderBy: { createdAt: "desc" },
  });

  const intentEvents: GateVerdict[] = [];
  const trustEvents: GateVerdict[] = [];
  const judgeEvents: GateVerdict[] = [];

  auditEvents.forEach((event) => {
    const metadata = (event.metadata ?? {}) as Record<string, unknown>;
    if (event.eventType.startsWith("intent.validation.")) {
      const decision: GateDecision =
        event.eventType === "intent.validation.blocked"
          ? "blocked"
          : event.eventType === "intent.validation.observe"
          ? "observed"
          : "allowed";
      intentEvents.push({
        gate: "intent",
        decision,
        mode: metadata.mode === "enforce" ? "enforce" : "shadow",
        score: typeof metadata.score === "number" ? metadata.score : undefined,
        reasonCodes: Array.isArray(metadata.flags) ? (metadata.flags as string[]) : undefined,
        stepId: typeof metadata.stepId === "string" ? metadata.stepId : null,
        createdAt: event.createdAt,
      });
      return;
    }

    if (event.eventType.startsWith("trust.gate.")) {
      trustEvents.push({
        gate: "trust",
        decision: event.eventType === "trust.gate.blocked" ? "blocked" : "allowed",
        score: typeof metadata.trustScore === "number" ? metadata.trustScore : undefined,
        threshold: Number(process.env.TRUST_SCORE_THRESHOLD ?? 40),
        reasonCodes: metadata.trustLevel ? [String(metadata.trustLevel)] : undefined,
        stepId: typeof metadata.stepId === "string" ? metadata.stepId : null,
        createdAt: event.createdAt,
      });
      return;
    }

    if (event.eventType.startsWith("judge.")) {
      const decision: GateDecision =
        event.eventType === "judge.execution.blocked"
          ? "blocked"
          : event.eventType === "judge.execution.allowed"
          ? "allowed"
          : event.eventType === "judge.shadow.observed"
          ? "observed"
          : "error";
      judgeEvents.push({
        gate: "judge",
        decision,
        mode: metadata.mode === "enforce" ? "enforce" : "shadow",
        score: typeof metadata.confidence === "number" ? metadata.confidence : undefined,
        threshold: typeof metadata.threshold === "number" ? metadata.threshold : undefined,
        reasonCodes: Array.isArray(metadata.reasons) ? (metadata.reasons as string[]) : undefined,
        policyVersion: typeof metadata.policyVersion === "string" ? metadata.policyVersion : "judge-v1",
        model: typeof metadata.modelVersion === "string" ? metadata.modelVersion : undefined,
        stepId: typeof metadata.stepId === "string" ? metadata.stepId : null,
        createdAt: event.createdAt,
      });
    }
  });

  const trustReport = await evaluateTrustScore(prisma, authContext.tenantId, authContext.workspaceId);
  const trustThreshold = Number(process.env.TRUST_SCORE_THRESHOLD ?? 40);
  const trustAllowed = trustScoreAllowsExecution(trustReport, trustThreshold);
  const trustSummary: GateVerdict = pickLatest(trustEvents) ?? {
    gate: "trust",
    decision: trustAllowed ? "allowed" : "blocked",
    score: trustReport.score,
    threshold: trustThreshold,
    reasonCodes: trustReport.reasons,
  };

  const canCalibrate = await checkScopePermission({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    tokenId: authContext.tokenId,
    scope: "governance:calibrate",
  });

  return res.json({
    runId: run.id,
    workspaceId: run.workspaceId,
    gates: {
      intent: pickLatest(intentEvents),
      trust: trustSummary,
      judge: pickLatest(judgeEvents),
    },
    proofs: pouRecords.map((pou) => ({
      id: pou.id,
      actionId: pou.actionId,
      status: pou.status,
      compositeTxId: pou.compositeTxId,
      trustSnapshot: pou.trustSnapshot ?? null,
      createdAt: pou.createdAt,
      finalizedAt: pou.finalizedAt,
    })),
    evidence: {
      auditEventIds: auditEvents.map((event) => event.id),
    },
    canCalibrate: Boolean(canCalibrate),
  });
});

governanceRouter.get("/ledger/pou/:id", requirePermission("ledger.view"), async (req, res) => {
  const startedAt = Date.now();
  await incrCriticalCounter("pou_endpoint_requests_total");
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    await incrCriticalCounter("pou_endpoint_errors_total", { code: "auth_context_missing" });
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  try {
    const record = await prisma.proofOfUsage.findFirst({
      where: { id: req.params.id, tenantId: authContext.tenantId },
    });

    if (!record) {
      await incrCriticalCounter("pou_endpoint_errors_total", { code: "not_found" });
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "pou" },
      });
    }

    const anchoring = await buildPhase4AnchoringEvidence({
      prisma,
      tenantId: authContext.tenantId,
      runId: record.runId,
    });

    await incrCriticalCounter("pou_endpoint_success_total");
    return res.json(
      toPoUResponseV1({
        record: {
          id: record.id,
          tenantId: record.tenantId,
          workspaceId: record.workspaceId,
          runId: record.runId,
          actionId: record.actionId,
          status: record.status,
          compositeTxId: record.compositeTxId,
          intentHash: record.intentHash,
          paramsHash: record.paramsHash,
          signatureHash: record.signatureHash,
          resultHash: record.resultHash,
          trustSnapshot: record.trustSnapshot ?? null,
          failureReason: record.failureReason ?? null,
          attestationKeyId: record.attestationKeyId ?? null,
          attestationSignature: record.attestationSignature ?? null,
          canonicalResultRef: record.canonicalResultRef ?? null,
          createdAt: record.createdAt,
          finalizedAt: record.finalizedAt,
        },
        anchoring,
      })
    );
  } catch {
    await incrCriticalCounter("pou_endpoint_errors_total", { code: "internal_error" });
    return res.status(500).json({
      ok: false,
      error: { code: "POU_READ_FAILED", message: "Failed to read PoU" },
    });
  } finally {
    const durationMs = Date.now() - startedAt;
    await addCriticalLatency("pou_endpoint_latency", durationMs);
    await recordCriticalLatencySample("pou_endpoint_latency_ms", durationMs);
  }
});

governanceRouter.get("/ledger/:txId([A-Za-z0-9-]{16,})", requirePermission("ledger.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const txId = (req.params.txId ?? "").trim();
  if (!txId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_TXID", message: "txId" },
    });
  }

  const runByTx = await prisma.run.findFirst({
    where: {
      tenantId: authContext.tenantId,
      OR: [{ txId }, { sclTxId: txId }],
    },
    select: {
      id: true,
      status: true,
      txId: true,
      sclTxId: true,
      criticalHash: true,
      createdAt: true,
      finishedAt: true,
      workspaceId: true,
    },
  });

  const runId = runByTx?.id ?? null;

  const sclEntry = await prisma.sclLedger.findFirst({
    where: {
      tenantId: authContext.tenantId,
      txId,
      ...(runId ? { runId } : {}),
    },
    select: {
      id: true,
      runId: true,
      txId: true,
      criticalHash: true,
      signature: true,
      signedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const runIdForProof = runId ?? sclEntry?.runId ?? null;
  const proofs = runIdForProof
    ? await prisma.proofOfUsage.findMany({
        where: {
          tenantId: authContext.tenantId,
          runId: runIdForProof,
        },
        select: {
          id: true,
          actionId: true,
          status: true,
          compositeTxId: true,
          createdAt: true,
          finalizedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  if (!runByTx && !sclEntry && proofs.length === 0) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "txId" },
    });
  }

  const matchedPoUByTxId = proofs.find((item) => item.compositeTxId === txId) ?? null;
  const hasRun = Boolean(runByTx);
  const hasScl = Boolean(sclEntry);
  const runSclAligned =
    Boolean(runByTx?.sclTxId) && Boolean(sclEntry?.txId) && runByTx!.sclTxId === sclEntry!.txId;
  const runHashAligned =
    Boolean(runByTx?.criticalHash) &&
    Boolean(sclEntry?.criticalHash) &&
    runByTx!.criticalHash === sclEntry!.criticalHash;

  return res.json({
    ok: true,
    txId,
    run: runByTx
      ? {
          id: runByTx.id,
          workspaceId: runByTx.workspaceId,
          status: runByTx.status,
          txId: runByTx.txId ?? null,
          sclTxId: runByTx.sclTxId ?? null,
          criticalHash: runByTx.criticalHash ?? null,
          createdAt: runByTx.createdAt,
          finishedAt: runByTx.finishedAt,
        }
      : null,
    scl: sclEntry
      ? {
          id: sclEntry.id,
          runId: sclEntry.runId,
          txId: sclEntry.txId,
          criticalHash: sclEntry.criticalHash,
          signaturePresent: Boolean(sclEntry.signature),
          signedAt: sclEntry.signedAt,
          createdAt: sclEntry.createdAt,
        }
      : null,
    pou: {
      matchedByTxId: matchedPoUByTxId
        ? {
            id: matchedPoUByTxId.id,
            actionId: matchedPoUByTxId.actionId,
            status: matchedPoUByTxId.status,
            compositeTxId: matchedPoUByTxId.compositeTxId,
            createdAt: matchedPoUByTxId.createdAt,
            finalizedAt: matchedPoUByTxId.finalizedAt,
          }
        : null,
      receiptsByRun: proofs.map((item) => ({
        id: item.id,
        actionId: item.actionId,
        status: item.status,
        compositeTxId: item.compositeTxId,
        createdAt: item.createdAt,
        finalizedAt: item.finalizedAt,
      })),
    },
    reconciliation: {
      hasRun,
      hasScl,
      hasPoU: proofs.length > 0,
      runSclAligned,
      runHashAligned,
      matchedPoUByTxId: Boolean(matchedPoUByTxId),
      runId: runByTx?.id ?? sclEntry?.runId ?? null,
      sclEntryId: sclEntry?.id ?? null,
      pouReceiptIds: proofs.map((item) => item.id),
    },
  });
});

governanceRouter.get(
  "/workspaces/:id/trust-history",
  requirePermission("governance.trust.view"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    if (authContext.workspaceId !== req.params.id) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Workspace mismatch" },
      });
    }

    const window = TrustHistoryWindowSchema.parse(req.query.window ?? "30d");
    const windowDays = window === "7d" ? 7 : 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const entries = await prisma.guardrailLedger.findMany({
      where: {
        tenantId: authContext.tenantId,
        trustScore: { not: null },
        timestamp: { gte: since },
        run: { workspaceId: authContext.workspaceId },
      },
      orderBy: { timestamp: "asc" },
      select: {
        timestamp: true,
        trustScore: true,
      },
    });

    const points = downsamplePoints(
      entries.map((entry) => ({
        t: entry.timestamp.toISOString(),
        score: entry.trustScore ?? 0,
      }))
    );

    return res.json({
      workspaceId: authContext.workspaceId,
      window,
      points,
    });
  }
);

governanceRouter.get("/governance/overview", requirePermission("governance.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const limit = Math.min(Number(req.query.limit ?? 200), 500);

  const latestIntentEvent = await prisma.runEvent.findFirst({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      type: "run.intent.evaluated",
    },
    orderBy: { createdAt: "desc" },
  });

  let intentSummary: {
    runId: string;
    createdAt: Date;
    intent: string | null;
    actions: string[];
  } | null = null;

  if (latestIntentEvent) {
    const payload = (latestIntentEvent.payload ?? {}) as Record<string, unknown>;
    const intentPayload =
      typeof payload.intent === "object" && payload.intent !== null
        ? (payload.intent as Record<string, unknown>)
        : null;
    const intentText =
      (intentPayload && typeof intentPayload.purpose === "string" && intentPayload.purpose) ||
      (typeof payload.purpose === "string" && payload.purpose) ||
      (typeof payload.prompt === "string" && payload.prompt) ||
      null;

    const actionEvents = await prisma.runEvent.findMany({
      where: {
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        runId: latestIntentEvent.runId,
        type: {
          in: [
            "run.action.completed",
            "run.action.failed",
            "run.action.enqueued",
            "run.action.observe",
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const actions: string[] = [];
    actionEvents.forEach((event) => {
      const actionPayload = (event.payload ?? {}) as Record<string, unknown>;
      const name =
        (typeof actionPayload.action === "string" && actionPayload.action) ||
        (typeof actionPayload.actionName === "string" && actionPayload.actionName) ||
        null;
      if (name && !actions.includes(name)) {
        actions.push(name);
      }
    });

    intentSummary = {
      runId: latestIntentEvent.runId,
      createdAt: latestIntentEvent.createdAt,
      intent: intentText,
      actions,
    };
  }

  const judgeEvents = await prisma.runEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      type: "run.action.judge",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let flagged = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const flagCounts = new Map<string, number>();

  judgeEvents.forEach((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const score = typeof payload.score === "number" ? payload.score : null;
    if (typeof score === "number") {
      scoreSum += score;
      scoreCount += 1;
    }
    const flags = Array.isArray(payload.flags)
      ? (payload.flags as Array<string>).filter((flag) => typeof flag === "string")
      : [];
    if (flags.length > 0 || (typeof score === "number" && score < 0)) {
      flagged += 1;
    }
    flags.forEach((flag) => {
      const current = flagCounts.get(flag) ?? 0;
      flagCounts.set(flag, current + 1);
    });
  });

  const topFlags = Array.from(flagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([flag, count]) => ({ flag, count }));

  const judgeSummary = {
    total: judgeEvents.length,
    flagged,
    clean: Math.max(0, judgeEvents.length - flagged),
    avgScore: scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(2)) : null,
    lastSeen: judgeEvents[0]?.createdAt ?? null,
    topFlags,
  };

  return res.json({
    ok: true,
    intent: intentSummary,
    judge: judgeSummary,
  });
});

governanceRouter.get(
  "/governance/pending-approvals",
  requirePermission("approvals.view"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const limit = Math.min(Number(req.query.limit ?? 200), 500);
    let runs: Array<{ id: string; createdAt?: Date | null; request?: unknown; userId?: string | null }> = [];
    try {
      runs = await prisma.run.findMany({
        where: {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          status: "awaiting_approval",
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, createdAt: true, request: true, userId: true },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invalid input value for enum") && message.includes("RunStatus")) {
        return res.json({ ok: true, items: [], warning: "awaiting_approval_not_available" });
      }
      throw error;
    }

    const runIds = runs.map((run) => run.id);
    const blockEvents = runIds.length
      ? await prisma.runEvent.findMany({
          where: {
            tenantId: authContext.tenantId,
            workspaceId: authContext.workspaceId,
            runId: { in: runIds },
            type: "run.blocked.guardrails",
          },
          orderBy: { createdAt: "desc" },
          take: runIds.length * 2,
        })
      : [];

    const reasonByRunId = new Map<string, string | null>();
    blockEvents.forEach((event) => {
      if (reasonByRunId.has(event.runId)) return;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const reason = typeof payload.reason === "string" ? payload.reason : null;
      reasonByRunId.set(event.runId, reason);
    });

    const items = runs.map((run) =>
      toPendingApprovalDto({
        run,
        reason: reasonByRunId.get(run.id) ?? null,
      })
    );

    return res.json({ ok: true, items });
  }
);

governanceRouter.get(
  "/ledger/integrity/report",
  requirePermission("integrity.view"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const since = typeof req.query.since === "string" ? new Date(req.query.since) : undefined;
    const until = typeof req.query.until === "string" ? new Date(req.query.until) : undefined;
    const limit = Math.min(Number(req.query.limit ?? 500), 2000);

    const result = await reconcileLedgerService({
      tenantId: authContext.tenantId,
      since: since && Number.isFinite(since.getTime()) ? since : undefined,
      until: until && Number.isFinite(until.getTime()) ? until : undefined,
      limit,
      persistReport: false,
      prisma,
    });

    const actionTypes = Array.from(
      new Set(result.missingInScl.map((item) => item.actionType))
    );
    const registry = await prisma.actionRegistry.findMany({
      where: { name: { in: actionTypes } },
      select: { name: true, criticality: true },
    });
    const criticalityByAction = new Map<string, string>(
      registry.map((row) => [row.name, row.criticality ?? "unknown"])
    );

    const rows = [
      ...result.missingInScl.map((item) => ({
        runId: item.runId ?? "—",
        actionId: item.actionType,
        criticality: (criticalityByAction.get(item.actionType) ?? "unknown") as
          | "low"
          | "medium"
          | "high"
          | "critical"
          | "unknown",
        status: "missing_in_scl",
        lastSeen: item.timestamp.toISOString(),
        intentHash: item.criticalHash,
        payloadHash: item.criticalHash,
        policyHash: null,
        signatureHash: null,
        txId: item.txId,
      })),
      ...result.missingInGuardrail.map((item) => ({
        runId: item.runId ?? "—",
        actionId: "scl.ledger",
        criticality: "high" as const,
        status: "missing_in_guardrail",
        lastSeen: item.createdAt.toISOString(),
        intentHash: item.criticalHash,
        payloadHash: item.criticalHash,
        policyHash: null,
        signatureHash: null,
        txId: item.txId,
      })),
      ...result.mismatchedTx.map((item) => ({
        runId: item.sclId ?? "—",
        actionId: "guardrail↔scl",
        criticality: "high" as const,
        status: "hash_mismatch",
        lastSeen: new Date().toISOString(),
        intentHash: item.criticalHash,
        payloadHash: item.criticalHash,
        policyHash: null,
        signatureHash: null,
        txId: item.sclTxId ?? null,
      })),
    ];

    const totalChecks = result.checkedGuardrail + result.checkedScl;
    const issueCount =
      result.missingInScl.length + result.missingInGuardrail.length + result.mismatchedTx.length;
    const matchRatio =
      totalChecks > 0
        ? Number(((totalChecks - issueCount) / totalChecks).toFixed(4))
        : 1;

    return res.json({
      ok: true,
      summary: {
        checkedGuardrail: result.checkedGuardrail,
        checkedScl: result.checkedScl,
        missingInScl: result.missingInScl.length,
        missingInGuardrail: result.missingInGuardrail.length,
        mismatchedTx: result.mismatchedTx.length,
        matchRatio,
      },
      rows,
    });
  }
);

governanceRouter.post(
  "/governance/calibrations",
  requirePermission("governance.trust.manage"),
  requireScope("governance:calibrate"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = CalibrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PAYLOAD", message: "Invalid calibration payload" },
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;
    const comment = sanitizeComment(payload.comment);

    await prisma.guardrailAuditLedger.create({
      data: {
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        runId: payload.runId,
        eventType: "governance.calibration",
        severity: "info",
        message: `Calibration reported: ${payload.label}`,
        metadata: {
          gate: payload.gate,
          label: payload.label,
          stepId: payload.stepId ?? null,
          comment: comment ?? null,
        },
      },
    });

    return res.json({ ok: true });
  }
);
