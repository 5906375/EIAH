import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import * as Core from "@eiah/core";
import { appendSclRecord } from "../services/sclLedger";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireIdempotency } from "../middlewares/auth";
import { requirePermission } from "../middlewares/requirePermission";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { evaluatePolicyEngine } from "../services/policyEngineAdapter";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { createWhatsAppService, createWhatsAppTransportStub } from "../integrations/whatsapp";
import { createPrismaWhatsAppStore } from "../integrations/whatsapp/store";
import { createWhatsAppTransportMeta, isWhatsAppProviderEnabled } from "../integrations/whatsapp/meta";
import { emitRunEvent } from "../services/runEventEmitter";

const realestateRouter = Router();
realestateRouter.use(enforceTenant);

function resolveWhatsAppTransport() {
  if (!isWhatsAppProviderEnabled()) {
    return createWhatsAppTransportStub();
  }
  try {
    return createWhatsAppTransportMeta();
  } catch (error) {
    console.warn(
      "whatsapp.meta.disabled_using_stub",
      error instanceof Error ? error.message : String(error)
    );
    return createWhatsAppTransportStub();
  }
}

const whatsappStore = createPrismaWhatsAppStore();
const whatsappService = createWhatsAppService({
  store: whatsappStore,
  transport: resolveWhatsAppTransport(),
});
const executeRegisteredAction = Core.executeRegisteredAction;
type ConfigureRealEstateIntegrationsFn = (params: {
  whatsappGateway?: {
    sendTemplate: (input: {
      tenantId: string;
      workspaceId: string;
      to: string;
      templateName: string;
      languageCode: string;
      components?: Array<{
        type: "header" | "body" | "button";
        parameters: Array<{ type: "text"; text: string }>;
        sub_type?: "quick_reply" | "url";
        index?: number;
      }>;
      context?: Record<string, unknown>;
    }) => Promise<{ messageId: string }>;
  } | null;
}) => void;
const configureRealEstateIntegrations = (Core as any)
  .configureRealEstateIntegrations as ConfigureRealEstateIntegrationsFn | undefined;
configureRealEstateIntegrations?.({
  whatsappGateway: {
    sendTemplate: (input) => whatsappService.sendTemplate(input),
  },
});

const LeaseScopeSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  leaseId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueRule: z.literal("BUSINESS_DAY_NTH=6").default("BUSINESS_DAY_NTH=6"),
  reminderOffsetBusinessDays: z.number().int().min(1).default(2),
  rentAmount: z.number().nonnegative(),
  condoBaseAmount: z.number().nonnegative(),
  condoAdjustmentAmount: z.number().optional(),
  evidenceRefs: z.array(z.string()).optional(),
  tenantName: z.string().optional(),
  tenantEmail: z.string().optional(),
  tenantDocument: z.string().optional(),
});

const DryRunBodySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  nth: z.number().int().min(1).max(31).default(6),
  reminderOffset: z.number().int().min(1).max(15).default(2),
  leases: z.array(LeaseScopeSchema).min(1),
});

const ApplyAdjustmentBodySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  lease: LeaseScopeSchema,
  adjustmentAmount: z.number(),
  runId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
  approval: z
    .object({
      approved: z.boolean().default(false),
      approverId: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

const WhatsAppSendBodySchema = z.object({
  to: z.string().min(8),
  templateName: z.string().min(1),
  languageCode: z.string().min(2),
  components: z
    .array(
      z.object({
        type: z.enum(["header", "body", "button"]),
        parameters: z.array(z.object({ type: z.literal("text"), text: z.string() })).default([]),
        sub_type: z.enum(["quick_reply", "url"]).optional(),
        index: z.number().int().optional(),
      })
    )
    .optional(),
  context: z.record(z.any()).optional(),
});

const WhatsAppOptInBodySchema = z.object({
  to: z.string().min(8),
  optedIn: z.boolean().default(true),
  source: z.string().optional(),
});

function hashObject(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolveHeaderIdempotencyKey(req: TenantAwareRequest) {
  const key = req.header("Idempotency-Key") ?? req.header("idempotency-key");
  if (typeof key !== "string" || key.trim().length === 0) return null;
  return key.trim();
}

function assertLeaseScope(request: TenantAwareRequest, lease: z.infer<typeof LeaseScopeSchema>) {
  if (!request.authContext) return false;
  return (
    lease.tenantId === request.authContext.tenantId &&
    lease.workspaceId === request.authContext.workspaceId
  );
}

realestateRouter.post(
  "/realestate/dry-run",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  requirePermission("runs.execute"),
  requireIdempotency,
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = DryRunBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }

    const hasOutOfScopeLease = parsed.data.leases.some((lease) => !assertLeaseScope(request, lease));
    if (hasOutOfScopeLease) {
      return res.status(403).json({
        ok: false,
        error: { code: "LEASE_SCOPE_FORBIDDEN", message: "leaseId does not belong to tenant/workspace" },
      });
    }

    const [policyDecision, trust] = await Promise.all([
      evaluatePolicyEngine({
        prisma: request.prisma,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        userId: request.authContext.userId ?? null,
        scope: "execute",
        action: "realestate.generate_monthly",
      }),
      evaluateTrustScore(
        request.prisma,
        request.authContext.tenantId,
        request.authContext.workspaceId
      ),
    ]);

    if (!trustScoreAllowsExecution(trust)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "TRUST_SCORE_BLOCKED",
          message: "Trust score below threshold for dry-run execution",
        },
        trust,
      });
    }

    if (policyDecision.blocked) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "POLICY_DENIED",
          message: policyDecision.reason ?? "Policy engine denied execution",
        },
        policyDecision,
      });
    }

    const actionResult = await executeRegisteredAction("realestate.generate_monthly", {
      action: "realestate.generate_monthly",
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      runId: `dryrun:${Date.now()}`,
      metadata: {
        idempotencyKey: resolveHeaderIdempotencyKey(request),
      },
      input: {
        period: parsed.data.period,
        nth: parsed.data.nth,
        reminderOffset: parsed.data.reminderOffset,
        preview: true,
        leases: parsed.data.leases,
      },
    });

    if (actionResult.status !== "success") {
      return res.status(422).json({
        ok: false,
        error: { code: "PREVIEW_FAILED", message: actionResult.error ?? "Failed to compute preview" },
      });
    }

    const preview = actionResult.output ?? null;
    const planHash = hashObject({
      action: "realestate.generate_monthly",
      period: parsed.data.period,
      leases: parsed.data.leases.map((lease) => lease.leaseId),
    });
    const diffHash = hashObject(preview);

    return res.json({
      ok: true,
      policyDecision,
      trust,
      preview,
      planHash,
      diffHash,
      idempotencyKey: resolveHeaderIdempotencyKey(request),
    });
  }
);

realestateRouter.post(
  "/realestate/apply-adjustment",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  requirePermission("runs.execute"),
  requireIdempotency,
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = ApplyAdjustmentBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }

    if (!assertLeaseScope(request, parsed.data.lease)) {
      return res.status(403).json({
        ok: false,
        error: { code: "LEASE_SCOPE_FORBIDDEN", message: "leaseId does not belong to tenant/workspace" },
      });
    }

    const idempotencyKey =
      parsed.data.idempotencyKey ??
      resolveHeaderIdempotencyKey(request) ??
      `${parsed.data.lease.leaseId}:${parsed.data.period}:${parsed.data.runId}`;

    const actionResult = await executeRegisteredAction("realestate.apply_adjustment", {
      action: "realestate.apply_adjustment",
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      runId: parsed.data.runId,
      metadata: { idempotencyKey },
      input: {
        period: parsed.data.period,
        lease: parsed.data.lease,
        adjustmentAmount: parsed.data.adjustmentAmount,
        idempotencyKey,
        approval: parsed.data.approval,
      },
    });

    if (actionResult.status !== "success") {
      return res.status(412).json({
        ok: false,
        error: {
          code: "APPLY_ADJUSTMENT_BLOCKED",
          message: actionResult.error ?? "Adjustment blocked by policy",
        },
      });
    }

    const ledger = await appendSclRecord({
      prisma: request.prisma,
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      runId: parsed.data.runId,
      riskLevel: "low",
      payload: {
        action: "realestate.apply_adjustment",
        leaseId: parsed.data.lease.leaseId,
        period: parsed.data.period,
        adjustmentAmount: parsed.data.adjustmentAmount,
        idempotencyKey,
        output: actionResult.output,
      },
    });

    const llmAudit = Array.isArray((actionResult.output as any)?.llm)
      ? ((actionResult.output as any).llm as Array<Record<string, unknown>>)
      : [];
    if (llmAudit.length > 0) {
      try {
        await emitRunEvent({
          prisma: request.prisma,
          runId: parsed.data.runId,
          tenantId: request.authContext.tenantId,
          workspaceId: request.authContext.workspaceId,
          userId: request.authContext.userId ?? undefined,
          type: "run.action.llm.audit",
          payload: {
            action: "realestate.apply_adjustment",
            leaseId: parsed.data.lease.leaseId,
            period: parsed.data.period,
            llm: llmAudit,
          },
          criticalHash: ledger.criticalHash,
          sclTxId: ledger.txId,
        });
      } catch {
        // Avoid failing request path if run event persistence is temporarily unavailable.
      }
    }

    return res.json({
      ok: true,
      result: actionResult.output,
      ledger: {
        txId: ledger.txId,
        criticalHash: ledger.criticalHash,
      },
    });
  }
);

realestateRouter.post(
  "/realestate/whatsapp/opt-in",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  requirePermission("delegation.manage"),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = WhatsAppOptInBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }

    await whatsappStore.upsertOptIn({
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      to: parsed.data.to,
      optedIn: parsed.data.optedIn,
      source: parsed.data.source,
    });

    return res.json({ ok: true });
  }
);

realestateRouter.post(
  "/realestate/whatsapp/send",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  requirePermission("delegation.manage"),
  requireIdempotency,
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = WhatsAppSendBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    }

    const actionResult = await executeRegisteredAction("whatsapp_send_template", {
      action: "whatsapp_send_template",
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      runId: `wa:${Date.now()}`,
      metadata: { idempotencyKey: resolveHeaderIdempotencyKey(request) },
      input: {
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        ...parsed.data,
      },
    });

    if (actionResult.status !== "success") {
      const message = actionResult.error ?? "Failed to send WhatsApp template";
      const code = message.includes("WHATSAPP_OPT_IN_REQUIRED")
        ? "WHATSAPP_OPT_IN_REQUIRED"
        : "WHATSAPP_SEND_FAILED";
      return res.status(code === "WHATSAPP_OPT_IN_REQUIRED" ? 412 : 422).json({
        ok: false,
        error: { code, message },
      });
    }

    return res.json({ ok: true, result: actionResult.output });
  }
);

export { realestateRouter };
