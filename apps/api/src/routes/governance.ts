import { Router } from "express";
import { z } from "zod";
import { checkScopePermission } from "@eiah/core";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { getRun } from "../services/runs";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { maskText } from "../services/masker";
import { buildRunEvidenceBundle } from "../services/evidenceBundle";
import { resolvePoUForLedger } from "../services/pouService";
import { resolveTrustSnapshotForLedger } from "../services/trustSnapshotService";
import { buildLedgerReceiptCanonV1, validateReceiptCanonCriticalChain } from "../services/receiptCanonService";
import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";
import { buildImobCrmLegacyCanonicalCase } from "../services/imob/crm/imobCrmLegacyCanonical";

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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeComment(comment?: string) {
  if (!comment) return undefined;
  let masked = comment;
  const rules = [
    /\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b\d{2}\s?\d{4,5}\-?\d{4}\b/g,
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

function buildImobGovernanceCaseContext(item: {
  id: string;
  tenantId: string;
  workspaceId: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  threadId?: string | null;
  updatedAt?: Date | null;
  lead?: unknown;
  property?: unknown;
  owner?: unknown;
  metadata?: unknown;
}) {
  const metadata = asObject(item.metadata) ?? {};
  const proof = asObject(metadata.proof);
  return buildImobCrmCaseContextFromRecord({
    id: item.id,
    flow: item.flow,
    stage: item.stage,
    status: item.status,
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blockers: item.blockers,
    pendingItems: item.pendingItems,
    threadId: item.threadId ?? null,
    updatedAt: item.updatedAt ?? null,
    lead: item.lead ?? null,
    property: item.property ?? null,
    owner: item.owner ?? null,
    runId: asString(proof?.runId) ?? asString(metadata.runId),
    txId: asString(proof?.txId) ?? asString(metadata.txId),
    receiptPath: asString(proof?.receiptPath) ?? asString(metadata.receiptPath),
    bundlePath: asString(proof?.bundlePath) ?? asString(metadata.bundlePath),
    verifyUrl: asString(proof?.verifyUrl) ?? asString(metadata.verifyUrl),
    proof: proof as never,
  }, buildImobCrmLegacyCanonicalCase);
}

function buildImobGovernanceOperationalSeed(item: {
  id: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible?: string | null;
  property?: unknown;
}) {
  const operational: Record<string, unknown> = {
    flow: item.flow,
  };

  if (item.flow === "commission.settle") {
    operational.commissionDraft = {
      dealId: item.id,
      brokerRef: item.ownerResponsible ?? "broker-pending",
      settlementStatus: item.status === "success" || item.stage === "settled" ? "paid" : "ready",
    };
  }

  if (item.flow === "listing.activate") {
    operational.campaignDraft = {
      propertyId: asString(asObject(item.property)?.id) ?? item.id,
      campaignRef: `campaign:${item.id}`,
      objective: "promote_listing",
      approvalRequired: true,
      approvalStatus: item.status === "success" ? "approved" : "pending",
      policyStatus: item.status === "success" ? "ready" : "pending",
      consentStatus: item.status === "success" ? "ready" : "pending",
      evidenceStatus: item.status === "success" ? "ready" : "pending",
      activationStatus: item.status === "success" ? "published" : "draft",
    };
  }

  return operational;
}

const TX_ID_PATTERN = /^[A-Za-z0-9-]{16,}$/;
const REASON_CODE_INVALID_TXID = "invalid_txid_format";
const REASON_CODE_TXID_NOT_FOUND = "txid_not_found";
const REASON_CODE_MISSING_RUN_FOR_TXID = "missing_run_for_txid";
const REASON_CODE_MISSING_BUNDLE_HASH_FOR_RUN = "missing_bundle_hash_for_run";

governanceRouter.get("/runs/:id/governance", async (req, res) => {
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
    evidence: {
      auditEventIds: auditEvents.map((event) => event.id),
    },
    canCalibrate: canCalibrate.allowed,
  });
});

governanceRouter.get("/governance/imob/cases/:caseId/evidence", requireScope("ledger.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await prisma.imobCase.findFirst({
    where: {
      id: req.params.caseId,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, document: true, status: true } },
      property: {
        select: {
          id: true,
          propertyType: true,
          city: true,
          neighborhood: true,
          address: true,
          goal: true,
          status: true,
          ownerId: true,
        },
      },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          goal: true,
          targetCity: true,
          budgetMaxCents: true,
          targetNeighborhood: true,
          stage: true,
          temperature: true,
          pendingItems: true,
        },
      },
    },
  });

  if (!item) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "imob_case" },
    });
  }

  const caseContext = buildImobGovernanceCaseContext(item);
  const operational = buildImobGovernanceOperationalSeed(item);
  const canonicalContext = buildImobCaseContextV1({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    caseId: item.id,
    caseContext,
    operational,
  });

  const events = await prisma.imobCaseEvent.findMany({
    where: {
      caseId: item.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      evidenceRef: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      summary: true,
      evidenceRef: true,
      runId: true,
      createdAt: true,
    },
  });

  const proof = caseContext.proof ?? null;
  const evidence = canonicalContext.evidence ?? null;
  const bundlePath = proof?.bundlePath
    ?? (typeof evidence?.evidenceBundleId === "string" && evidence.evidenceBundleId.startsWith("/") ? evidence.evidenceBundleId : null);
  const receiptPath = proof?.receiptPath
    ?? (typeof evidence?.receiptId === "string" && evidence.receiptId.startsWith("/") ? evidence.receiptId : null);
  const ledgerPath = proof?.txId ? `/api/ledger/${encodeURIComponent(proof.txId)}` : receiptPath;

  return res.json({
    ok: true,
    data: {
      caseId: item.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      flow: item.flow,
      mission: canonicalContext.missionContext?.mission ?? "case_review",
      stage: item.stage,
      status: item.status,
      evidence,
      export: {
        runId: proof?.runId ?? null,
        txId: proof?.txId ?? evidence?.ledgerTxId ?? null,
        receiptPath,
        bundlePath,
        verifyUrl: proof?.verifyUrl ?? ledgerPath ?? null,
        bundleEndpointTemplate: "/api/runs/:runId/bundle",
        ledgerEndpointTemplate: "/api/ledger/:txId",
      },
      audit: {
        sourceFlow: canonicalContext.legacyCompatibility?.sourceFlow ?? item.flow,
        sourceMission: canonicalContext.legacyCompatibility?.sourceMission ?? canonicalContext.missionContext?.mission ?? null,
        eventRefs: events.map((event) => ({
          id: event.id,
          type: event.type,
          summary: event.summary,
          evidenceRef: event.evidenceRef,
          runId: event.runId,
          createdAt: event.createdAt,
        })),
      },
    },
  });
});

governanceRouter.get("/ledger/:txId", requireScope("ledger.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const txId = (req.params.txId ?? "").trim();
  if (!txId || !TX_ID_PATTERN.test(txId)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_TXID",
        message: "txId",
        reasonCodes: [REASON_CODE_INVALID_TXID],
      },
    });
  }

  const runByTx = await prisma.run.findFirst({
    where: {
      tenantId: authContext.tenantId,
      OR: [{ txId }, { sclTxId: txId }],
    },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      request: true,
      txId: true,
      sclTxId: true,
      criticalHash: true,
      approvalStatus: true,
      approvedBy: true,
      approvedAt: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  const sclEntry = await prisma.sclLedger.findFirst({
    where: {
      tenantId: authContext.tenantId,
      txId,
      ...(runByTx?.id ? { runId: runByTx.id } : {}),
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

  if (!runByTx && !sclEntry) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "txId",
        reasonCodes: [REASON_CODE_TXID_NOT_FOUND],
      },
    });
  }

  let bundleHash: string | null = null;
  if (runByTx) {
    const rebuiltBundle = await buildRunEvidenceBundle({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: runByTx.workspaceId,
      runId: runByTx.id,
    });
    bundleHash = rebuiltBundle?.bundleHash ?? null;
  }

  const hasRun = Boolean(runByTx);
  const hasScl = Boolean(sclEntry);
  const pou = await resolvePoUForLedger();
  const hasPoU = pou.receiptsByRun.length > 0;
  const trustSnapshot = runByTx
    ? await resolveTrustSnapshotForLedger({
        prisma,
        tenantId: authContext.tenantId,
        workspaceId: runByTx.workspaceId,
        runId: runByTx.id,
      })
    : null;
  const runSclAligned = Boolean(runByTx?.sclTxId) && Boolean(sclEntry?.txId) && runByTx?.sclTxId === sclEntry?.txId;
  const runHashAligned =
    Boolean(runByTx?.criticalHash) &&
    Boolean(sclEntry?.criticalHash) &&
    runByTx?.criticalHash === sclEntry?.criticalHash;

  const invariant = {
    txIdToRunId: Boolean(runByTx?.id),
    runIdToBundleHash: Boolean(bundleHash),
    exportBundlePath: runByTx ? `/api/runs/${runByTx.id}/bundle` : null,
    status: "ok" as "ok" | "broken",
    reasons: [] as string[],
  };

  if (!invariant.txIdToRunId) {
    invariant.status = "broken";
    invariant.reasons.push(REASON_CODE_MISSING_RUN_FOR_TXID);
  }
  if (invariant.txIdToRunId && !invariant.runIdToBundleHash) {
    invariant.status = "broken";
    invariant.reasons.push(REASON_CODE_MISSING_BUNDLE_HASH_FOR_RUN);
  }

  if (invariant.status === "broken") {
    return res.status(409).json({
      ok: false,
      error: {
        code: "RECEIPT_CANON_INCONSISTENT",
        message: "receiptCanon",
        reasonCodes: invariant.reasons,
      },
      txId,
      runId: runByTx?.id ?? sclEntry?.runId ?? null,
      invariant,
      reconciliation: {
        hasRun,
        hasScl,
        hasPoU,
        runSclAligned,
        runHashAligned,
        matchedPoUByTxId: Boolean(pou.matchedByTxId),
      },
    });
  }

  const requestObj = asObject(runByTx?.request);
  const metadata = asObject(requestObj?.metadata);
  const requiresApprovalByMeta =
    asBoolean(metadata?.requiresApproval) === true ||
    asBoolean(metadata?.requires_confirmation) === true ||
    asBoolean(metadata?.approvalRequired) === true;
  const riskTier = asString(metadata?.riskTier)?.toLowerCase();
  const requiresApprovalByTier = riskTier === "high" || riskTier === "critical";
  const approvalRequired = Boolean(requiresApprovalByMeta || requiresApprovalByTier);

  const approvalEvents = runByTx
    ? await prisma.runEvent.findMany({
        where: {
          tenantId: authContext.tenantId,
          runId: runByTx.id,
          type: "run.approved",
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
    : [];
  const latestApproval = approvalEvents[0] ?? null;
  const latestPayload = asObject(latestApproval?.payload);
  const approvalStatus =
    (runByTx?.approvalStatus as "not_required" | "pending" | "approved" | "rejected" | null) ??
    (approvalRequired ? "pending" : "not_required");
  const approval = {
    required: approvalRequired,
    status: approvalStatus,
    approvalId: latestApproval?.id ?? null,
    approvedBy: (runByTx?.approvedBy as string | null) ?? asString(latestPayload?.approvedBy),
    approvedAt:
      (runByTx?.approvedAt instanceof Date ? runByTx.approvedAt.toISOString() : null) ??
      asString(latestPayload?.approvedAt),
  };

  const delegationMeta = asObject(metadata?.delegation);
  const validUntil = asString(delegationMeta?.validUntil);
  const delegationValidUntil = validUntil ? new Date(validUntil) : null;
  const isDelegationExpired =
    delegationValidUntil instanceof Date &&
    !Number.isNaN(delegationValidUntil.getTime()) &&
    delegationValidUntil.getTime() < Date.now();
  const delegationStatus: "active" | "expired" | "not_delegated" = delegationMeta
    ? isDelegationExpired
      ? "expired"
      : "active"
    : "not_delegated";
  const delegation = {
    status: delegationStatus,
    delegationId: asString(delegationMeta?.id),
    scope: Array.isArray(delegationMeta?.scope)
      ? (delegationMeta?.scope.filter((item) => typeof item === "string") as string[])
      : null,
    trustMin: asNumber(delegationMeta?.trustMin),
    validUntil,
  };

  const canonValidation = runByTx
    ? validateReceiptCanonCriticalChain({
        txId,
        runId: runByTx.id,
        workspaceId: runByTx.workspaceId,
        tenantId: authContext.tenantId,
        actorId: authContext.userId ?? null,
        actorType: authContext.userId ? "user" : "system",
        bundleHash,
        invariant,
        pou,
        trustSnapshot,
        approval,
        delegation,
        reconciliation: {
          hasRun,
          hasScl,
          hasPoU,
          runSclAligned,
          runHashAligned,
          matchedPoUByTxId: Boolean(pou.matchedByTxId),
        },
      })
    : { ok: true, reasonCodes: [] };
  if (!canonValidation.ok) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "RECEIPT_CANON_INCONSISTENT",
        message: "receiptCanon",
        reasonCodes: canonValidation.reasonCodes,
      },
      txId,
      runId: runByTx?.id ?? sclEntry?.runId ?? null,
      invariant,
      reconciliation: {
        hasRun,
        hasScl,
        hasPoU,
        runSclAligned,
        runHashAligned,
        matchedPoUByTxId: Boolean(pou.matchedByTxId),
      },
    });
  }

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
          bundleHash,
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
    pou,
    reconciliation: {
      hasRun,
      hasScl,
      hasPoU,
      runSclAligned,
      runHashAligned,
      matchedPoUByTxId: Boolean(pou.matchedByTxId),
      runId: runByTx?.id ?? sclEntry?.runId ?? null,
      bundleHash,
      sclEntryId: sclEntry?.id ?? null,
      pouReceiptIds: pou.receiptsByRun.map((item) => item.id),
    },
    invariant,
    receiptCanon: runByTx
      ? buildLedgerReceiptCanonV1({
          txId,
          runId: runByTx.id,
          workspaceId: runByTx.workspaceId,
          tenantId: authContext.tenantId,
          actorId: authContext.userId ?? null,
          actorType: authContext.userId ? "user" : "system",
          bundleHash,
          invariant,
          pou,
          trustSnapshot,
          approval,
          delegation,
          reconciliation: {
            hasRun,
            hasScl,
            hasPoU,
            runSclAligned,
            runHashAligned,
            matchedPoUByTxId: Boolean(pou.matchedByTxId),
          },
        })
      : null,
  });
});

governanceRouter.get("/workspaces/:id/trust-history", async (req, res) => {
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
});

governanceRouter.post(
  "/governance/calibrations",
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
