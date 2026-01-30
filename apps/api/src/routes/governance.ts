import { Router } from "express";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { getRun } from "../services/runs";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { maskText } from "../services/masker";
import { checkScopePermission } from "packages/core/src/security/rbac.ts";

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
    canCalibrate: Boolean(canCalibrate),
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
