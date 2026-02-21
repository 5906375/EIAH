import crypto from "node:crypto";
import { z } from "zod";
import {
  encodeGuardrailKey,
  rateLimit,
  requireIdempotency,
  type IdempotencyStore,
  type RateLimiter,
} from "../guardrails";
import { registerAction } from "../actionRegistry";
import { createProof, finalizeProof } from "../../services/pouService";
import { InMemoryLLMCache } from "../../llm/cache";
import { type LLMTask, isTaskRouterEnabled, runTaskWithFallback } from "../../llm/router";
import { buildLLMAuditMetadata, type LLMAuditMetadata } from "../../llm/audit";
import { validateModelOutputJson } from "../../llm/validators";

export type RegisterRealEstateActionsOptions = {
  idempotencyStore: IdempotencyStore;
  rateLimiter: RateLimiter;
};

type WhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  parameters: Array<{ type: "text"; text: string }>;
  sub_type?: "quick_reply" | "url";
  index?: number;
};

type WhatsAppSendTemplateRequest = {
  tenantId: string;
  workspaceId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
  context?: Record<string, unknown>;
};

type WhatsAppSendTemplateResult = {
  messageId: string;
};

export interface RealEstateWhatsAppGateway {
  sendTemplate(input: WhatsAppSendTemplateRequest): Promise<WhatsAppSendTemplateResult>;
}

const SHORT_LLM_CACHE_TTL_MS = 60_000;
const intentClassifyCache = new InMemoryLLMCache<string>({
  ttlMs: SHORT_LLM_CACHE_TTL_MS,
  maxEntries: 300,
});
const tenantFaqCache = new InMemoryLLMCache<string>({
  ttlMs: SHORT_LLM_CACHE_TTL_MS,
  maxEntries: 300,
});

const IntentClassifySchema = z.object({
  intent: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const ContractExtractSchema = z.object({
  clauses: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
      })
    )
    .default([]),
  entities: z.record(z.string()).optional(),
});

const JudgePolicySchema = z.object({
  decision: z.enum(["allow", "review", "deny"]),
  reason: z.string().optional(),
});

const LLMAuditOutputSchema = z.object({
  task: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  promptHash: z.string(),
  outputHash: z.string(),
  latencyMs: z.number(),
  fallbackAttempt: z.number().optional(),
  cacheHit: z.boolean().optional(),
  timestamp: z.string(),
});

let whatsappGateway: RealEstateWhatsAppGateway | null = null;

export function configureRealEstateIntegrations(params: {
  whatsappGateway?: RealEstateWhatsAppGateway | null;
}) {
  whatsappGateway = params.whatsappGateway ?? null;
}

const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM");
const DueRuleSchema = z.literal("BUSINESS_DAY_NTH=6");

const LeaseSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  leaseId: z.string().min(1),
  period: PeriodSchema,
  dueRule: DueRuleSchema.default("BUSINESS_DAY_NTH=6"),
  reminderOffsetBusinessDays: z.number().int().min(1).default(2),
  rentAmount: z.number().nonnegative(),
  condoBaseAmount: z.number().nonnegative(),
  condoAdjustmentAmount: z.number().optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  tenantName: z.string().optional(),
  tenantEmail: z.string().optional(),
  tenantDocument: z.string().optional(),
});

const ComputeDueDateInputSchema = z.object({
  period: PeriodSchema,
  nth: z.number().int().min(1).max(31).default(6),
  reminderOffset: z.number().int().min(1).max(15).default(2),
});

const ComputeDueDateOutputSchema = z.object({
  period: PeriodSchema,
  dueDate: z.string(),
  reminderDate: z.string(),
  nth: z.number().int(),
  reminderOffset: z.number().int(),
  holidayCalendar: z.literal("BR_NATIONAL_V1_WEEKEND_ONLY"),
});

const GenerateMonthlyInputSchema = z.object({
  period: PeriodSchema,
  nth: z.number().int().min(1).max(31).default(6),
  reminderOffset: z.number().int().min(1).max(15).default(2),
  preview: z.boolean().default(true),
  leases: z.array(LeaseSchema).min(1),
});

const GenerateMonthlyOutputSchema = z.object({
  preview: z.boolean(),
  period: PeriodSchema,
  chargeItems: z.array(
    z.object({
      id: z.string(),
      tenantId: z.string(),
      workspaceId: z.string(),
      leaseId: z.string(),
      period: PeriodSchema,
      dueRule: DueRuleSchema,
      reminderOffsetBusinessDays: z.number().int(),
      rentAmount: z.number(),
      condoBaseAmount: z.number(),
      condoAdjustmentAmount: z.number().optional(),
      evidenceRefs: z.array(z.string()).optional(),
      dueDate: z.string(),
      reminderDate: z.string(),
      totalAmount: z.number(),
    })
  ),
  llm: z.array(LLMAuditOutputSchema).optional(),
});

const SuggestAdjustmentInputSchema = z.object({
  period: PeriodSchema,
  lease: LeaseSchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
  evidenceScore: z.number().min(0).max(1).default(0.5),
});

const SuggestAdjustmentOutputSchema = z.object({
  mode: z.literal("shadow"),
  leaseId: z.string(),
  period: PeriodSchema,
  suggestedAdjustmentAmount: z.number(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  llm: z.array(LLMAuditOutputSchema).optional(),
});

const ApplyAdjustmentInputSchema = z.object({
  period: PeriodSchema,
  lease: LeaseSchema,
  adjustmentAmount: z.number(),
  idempotencyKey: z.string().min(1),
  approval: z
    .object({
      approved: z.boolean().default(false),
      approverId: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

const ApplyAdjustmentOutputSchema = z.object({
  leaseId: z.string(),
  period: PeriodSchema,
  applied: z.boolean(),
  adjustmentAmount: z.number(),
  totalAmount: z.number(),
  requiresApproval: z.boolean(),
  approvalThreshold: z.number(),
  idempotencyKey: z.string(),
  llm: z.array(LLMAuditOutputSchema).optional(),
});

const CloseMonthInputSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  period: PeriodSchema,
  runId: z.string().min(1),
  actionId: z.string().default("realestate.close_month"),
  summary: z.record(z.any()),
});

const CloseMonthOutputSchema = z.object({
  period: PeriodSchema,
  closed: z.boolean(),
  pou: z
    .object({
      id: z.string(),
      status: z.string(),
      compositeTxId: z.string(),
    })
    .nullable(),
});

const PublishTenantSummaryInputSchema = z.object({
  period: PeriodSchema,
  lease: LeaseSchema,
  includePII: z.boolean().default(false),
});

const PublishTenantSummaryOutputSchema = z.object({
  leaseId: z.string(),
  period: PeriodSchema,
  tenant: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    document: z.string().nullable(),
  }),
  billing: z.object({
    rentAmount: z.number(),
    condoBaseAmount: z.number(),
    condoAdjustmentAmount: z.number(),
    totalAmount: z.number(),
  }),
  llm: z.array(LLMAuditOutputSchema).optional(),
});

const WhatsAppSendTemplateInputSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
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

const WhatsAppSendTemplateOutputSchema = z.object({
  messageId: z.string(),
  provider: z.literal("whatsapp"),
  llm: z.array(LLMAuditOutputSchema).optional(),
});

function addBusinessDays(baseDate: Date, days: number) {
  const date = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    remaining -= 1;
  }
  return date;
}

function nthBusinessDayUtc(year: number, monthIndex: number, nth: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  let business = 0;
  while (date.getUTCMonth() === monthIndex) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      business += 1;
      if (business === nth) return date;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function toDateOnly(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parsePeriod(period: string) {
  const [year, month] = period.split("-").map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error("Invalid period");
  }
  return { year, monthIndex: month - 1 };
}

function maskEmail(value: string | undefined) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  const prefix = local.length <= 2 ? `${local[0] ?? "*"}` : `${local.slice(0, 2)}***`;
  return `${prefix}@${domain}`;
}

function maskDocument(value: string | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

function hashPayload(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolveApprovalThreshold() {
  const raw = Number(process.env.REALESTATE_ADJUSTMENT_APPROVAL_THRESHOLD ?? "500");
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

async function runRealEstateTask(params: {
  task: LLMTask;
  prompt: string;
  outputMode: "text" | "json";
  jsonSchema?: z.ZodSchema<any>;
  cache?: InMemoryLLMCache<string>;
}) {
  if (!isTaskRouterEnabled()) return null;

  const startedAt = Date.now();
  const cacheKey = params.cache?.makeKey({
    task: params.task,
    prompt: params.prompt,
    metadata: { domain: "realestate" },
  });
  const cached = cacheKey ? params.cache?.get(cacheKey) : null;
  if (cached) {
    const cachedAudit = buildLLMAuditMetadata({
      task: params.task,
      provider: "cache",
      model: "in-memory",
      prompt: params.prompt,
      output: cached,
      latencyMs: 0,
      cacheHit: true,
    });
    if (params.outputMode === "json" && params.jsonSchema) {
      const validated = validateModelOutputJson(params.jsonSchema, cached);
      if (validated.ok) {
        return { output: cached, parsed: validated.data, audit: cachedAudit };
      }
    }
    return { output: cached, parsed: null, audit: cachedAudit };
  }

  try {
    const request = {
      model: "openai:gpt-4o-mini",
      messages: [
        {
          role: "system" as const,
          content: "You are a real-estate operations copilot. Keep answers concise.",
        },
        {
          role: "user" as const,
          content: params.prompt,
        },
      ],
      metadata: {
        domain: "realestate",
        llmTask: params.task,
      },
    };

    let response = await runTaskWithFallback(params.task, request);
    let parsed: unknown = null;
    if (params.outputMode === "json" && params.jsonSchema) {
      let validated = validateModelOutputJson(params.jsonSchema, response.output);
      if (!validated.ok) {
        const retryPrompt = `${params.prompt}\nReturn only a valid JSON object with no markdown.`;
        response = await runTaskWithFallback(params.task, {
          ...request,
          messages: [
            ...request.messages,
            { role: "user", content: retryPrompt },
          ],
        });
        validated = validateModelOutputJson(params.jsonSchema, response.output);
      }
      if (validated.ok) {
        parsed = validated.data;
      }
    }

    if (cacheKey && params.cache) {
      params.cache.set(cacheKey, response.output);
    }

    const audit = buildLLMAuditMetadata({
      task: params.task,
      provider: response.provider,
      model: response.model,
      prompt: params.prompt,
      output: response.output,
      latencyMs: Date.now() - startedAt,
      fallbackAttempt:
        typeof (response.raw as Record<string, unknown> | null)?.["fallbackAttempt"] === "number"
          ? ((response.raw as Record<string, unknown>)["fallbackAttempt"] as number)
          : undefined,
    });

    return { output: response.output, parsed, audit };
  } catch (error) {
    const output = `LLM_TASK_FAILED:${error instanceof Error ? error.message : String(error)}`;
    const audit = buildLLMAuditMetadata({
      task: params.task,
      provider: "router_error_fallback",
      model: "deterministic",
      prompt: params.prompt,
      output,
      latencyMs: Date.now() - startedAt,
    });
    return { output, parsed: null, audit };
  }
}

export function registerRealEstateActions(options: RegisterRealEstateActionsOptions) {
  registerAction({
    name: "calendar.compute_due_date",
    description: "Compute due date and reminder date from period by nth business day (BR national).",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: ComputeDueDateInputSchema,
      output: ComputeDueDateOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) => `calendar.compute_due_date:${context.tenantId ?? "global"}`,
      }),
    ],
    handler: async ({ input }) => {
      const payload = ComputeDueDateInputSchema.parse(input);
      const { year, monthIndex } = parsePeriod(payload.period);
      const due = nthBusinessDayUtc(year, monthIndex, payload.nth);
      const reminder = addBusinessDays(due, -1 * payload.reminderOffset);
      return {
        status: "success",
        output: {
          period: payload.period,
          dueDate: toDateOnly(due),
          reminderDate: toDateOnly(reminder),
          nth: payload.nth,
          reminderOffset: payload.reminderOffset,
          holidayCalendar: "BR_NATIONAL_V1_WEEKEND_ONLY",
        },
      };
    },
  });

  registerAction({
    name: "realestate.generate_monthly",
    description: "Generate monthly charge items in preview mode without committing billing.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: GenerateMonthlyInputSchema,
      output: GenerateMonthlyOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        ttlMs: 10 * 60 * 1000,
        keyResolver: (context) => {
          const payload = GenerateMonthlyInputSchema.parse(context.input);
          return encodeGuardrailKey({
            tenantId: context.tenantId ?? "global",
            actionType: context.action,
            idempotencyKey: `${payload.period}:${payload.leases.map((l) => l.leaseId).join(",")}`,
          });
        },
      }),
    ],
    handler: async ({ input }) => {
      const payload = GenerateMonthlyInputSchema.parse(input);
      const llmAudits: LLMAuditMetadata[] = [];
      const intentResult = await runRealEstateTask({
        task: "intent_classify",
        prompt: `Classify billing intent for monthly generation. period=${payload.period}; leases=${payload.leases.length}; preview=${payload.preview}`,
        outputMode: "json",
        jsonSchema: IntentClassifySchema,
        cache: intentClassifyCache,
      });
      if (intentResult?.audit) {
        llmAudits.push(intentResult.audit);
      }
      const chargeItems = payload.leases.map((lease) => {
        const { year, monthIndex } = parsePeriod(payload.period);
        const due = nthBusinessDayUtc(year, monthIndex, payload.nth);
        const reminder = addBusinessDays(due, -1 * payload.reminderOffset);
        const adjustment = lease.condoAdjustmentAmount ?? 0;
        return {
          id: `charge_${lease.leaseId}_${payload.period}`,
          tenantId: lease.tenantId,
          workspaceId: lease.workspaceId,
          leaseId: lease.leaseId,
          period: payload.period,
          dueRule: "BUSINESS_DAY_NTH=6",
          reminderOffsetBusinessDays: payload.reminderOffset,
          rentAmount: lease.rentAmount,
          condoBaseAmount: lease.condoBaseAmount,
          condoAdjustmentAmount: adjustment === 0 ? undefined : adjustment,
          evidenceRefs: lease.evidenceRefs,
          dueDate: toDateOnly(due),
          reminderDate: toDateOnly(reminder),
          totalAmount: Number((lease.rentAmount + lease.condoBaseAmount + adjustment).toFixed(2)),
        };
      });

      return {
        status: "success",
        output: {
          preview: payload.preview,
          period: payload.period,
          chargeItems,
          llm: llmAudits.length > 0 ? llmAudits : undefined,
        },
      };
    },
  });

  registerAction({
    name: "realestate.suggest_adjustment",
    description: "Suggest condo adjustment from evidences in shadow mode.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: SuggestAdjustmentInputSchema,
      output: SuggestAdjustmentOutputSchema,
    },
    handler: async ({ input }) => {
      const payload = SuggestAdjustmentInputSchema.parse(input);
      const llmAudits: LLMAuditMetadata[] = [];
      const extractResult = await runRealEstateTask({
        task: "contract_extract",
        prompt: `Extract contract and condo adjustment clues for lease=${payload.lease.leaseId}; period=${payload.period}; evidences=${payload.evidenceRefs.join(",") || "none"}`,
        outputMode: "json",
        jsonSchema: ContractExtractSchema,
      });
      if (extractResult?.audit) {
        llmAudits.push(extractResult.audit);
      }
      const multiplier = payload.evidenceScore >= 0.8 ? 0.12 : payload.evidenceScore >= 0.5 ? 0.06 : 0.02;
      const suggested = Number((payload.lease.condoBaseAmount * multiplier).toFixed(2));
      return {
        status: "success",
        output: {
          mode: "shadow",
          leaseId: payload.lease.leaseId,
          period: payload.period,
          suggestedAdjustmentAmount: suggested,
          confidence: payload.evidenceScore,
          reasons: [
            `evidence_count=${payload.evidenceRefs.length}`,
            `evidence_score=${payload.evidenceScore.toFixed(2)}`,
          ],
          evidenceRefs: payload.evidenceRefs,
          llm: llmAudits.length > 0 ? llmAudits : undefined,
        },
      };
    },
  });

  registerAction({
    name: "realestate.apply_adjustment",
    description: "Commit condo adjustment with idempotency and approval threshold.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: ApplyAdjustmentInputSchema,
      output: ApplyAdjustmentOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        ttlMs: 24 * 60 * 60 * 1000,
        keyResolver: (context) => {
          const payload = ApplyAdjustmentInputSchema.parse(context.input);
          return encodeGuardrailKey({
            tenantId: context.tenantId ?? "global",
            actionType: context.action,
            idempotencyKey: payload.idempotencyKey,
          });
        },
      }),
    ],
    handler: async ({ input }) => {
      const payload = ApplyAdjustmentInputSchema.parse(input);
      const llmAudits: LLMAuditMetadata[] = [];
      const judgeResult = await runRealEstateTask({
        task: "judge_policy",
        prompt: `Judge policy for apply_adjustment lease=${payload.lease.leaseId}; period=${payload.period}; amount=${payload.adjustmentAmount}; hasApproval=${payload.approval?.approved === true}`,
        outputMode: "json",
        jsonSchema: JudgePolicySchema,
      });
      if (judgeResult?.audit) {
        llmAudits.push(judgeResult.audit);
      }
      const threshold = resolveApprovalThreshold();
      const requiresApproval = Math.abs(payload.adjustmentAmount) >= threshold;
      if (requiresApproval && payload.approval?.approved !== true) {
        return {
          status: "error",
          error: "APPROVAL_REQUIRED_FOR_ADJUSTMENT",
          retryable: false,
        };
      }
      const totalAmount = Number(
        (payload.lease.rentAmount + payload.lease.condoBaseAmount + payload.adjustmentAmount).toFixed(2)
      );
      return {
        status: "success",
        output: {
          leaseId: payload.lease.leaseId,
          period: payload.period,
          applied: true,
          adjustmentAmount: payload.adjustmentAmount,
          totalAmount,
          requiresApproval,
          approvalThreshold: threshold,
          idempotencyKey: payload.idempotencyKey,
          llm: llmAudits.length > 0 ? llmAudits : undefined,
        },
      };
    },
  });

  registerAction({
    name: "realestate.close_month",
    description: "Close billing month and generate PoU receipt.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: CloseMonthInputSchema,
      output: CloseMonthOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        ttlMs: 24 * 60 * 60 * 1000,
        keyResolver: (context) => {
          const payload = CloseMonthInputSchema.parse(context.input);
          return encodeGuardrailKey({
            tenantId: payload.tenantId,
            actionType: context.action,
            idempotencyKey: `${payload.period}:${payload.runId}`,
          });
        },
      }),
    ],
    handler: async ({ input }) => {
      const payload = CloseMonthInputSchema.parse(input);
      const paramsHash = hashPayload({ period: payload.period, summary: payload.summary });
      const intentHash = hashPayload({ action: payload.actionId, runId: payload.runId });
      const signatureHash = hashPayload({ tenantId: payload.tenantId, workspaceId: payload.workspaceId });
      const resultHash = hashPayload(payload.summary);

      const created = await createProof({
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        input: {
          runId: payload.runId,
          actionId: payload.actionId,
          intentHash,
          paramsHash,
          signatureHash,
          resultHash,
          trustSnapshot: { source: "realestate.close_month" },
        },
        failStop: false,
      });

      if (!created) {
        return {
          status: "success",
          output: {
            period: payload.period,
            closed: true,
            pou: null,
          },
        };
      }

      let finalizedStatus = created.status;
      try {
        const finalized = await finalizeProof({
          pouId: created.id,
          signIfMissing: true,
        });
        finalizedStatus = finalized.status;
      } catch {
        // keep created PoU in pending/failed path when attestation cannot be finalized
      }

      return {
        status: "success",
        output: {
          period: payload.period,
          closed: true,
          pou: {
            id: created.id,
            status: finalizedStatus,
            compositeTxId: created.compositeTxId,
          },
        },
      };
    },
  });

  registerAction({
    name: "realestate.publish_tenant_summary",
    description: "Publish tenant summary in read-only mode with PII masking.",
    version: "1.0.0",
    criticality: "low",
    contract: {
      input: PublishTenantSummaryInputSchema,
      output: PublishTenantSummaryOutputSchema,
    },
    handler: async ({ input }) => {
      const payload = PublishTenantSummaryInputSchema.parse(input);
      const llmAudits: LLMAuditMetadata[] = [];
      const faqResult = await runRealEstateTask({
        task: "tenant_faq",
        prompt: `Generate tenant FAQ context for lease=${payload.lease.leaseId}; period=${payload.period}; includePII=${payload.includePII}`,
        outputMode: "text",
        cache: tenantFaqCache,
      });
      if (faqResult?.audit) {
        llmAudits.push(faqResult.audit);
      }
      const adjustment = payload.lease.condoAdjustmentAmount ?? 0;
      return {
        status: "success",
        output: {
          leaseId: payload.lease.leaseId,
          period: payload.period,
          tenant: {
            name: payload.lease.tenantName ?? null,
            email: payload.includePII ? payload.lease.tenantEmail ?? null : maskEmail(payload.lease.tenantEmail),
            document: payload.includePII
              ? payload.lease.tenantDocument ?? null
              : maskDocument(payload.lease.tenantDocument),
          },
          billing: {
            rentAmount: payload.lease.rentAmount,
            condoBaseAmount: payload.lease.condoBaseAmount,
            condoAdjustmentAmount: adjustment,
            totalAmount: Number((payload.lease.rentAmount + payload.lease.condoBaseAmount + adjustment).toFixed(2)),
          },
          llm: llmAudits.length > 0 ? llmAudits : undefined,
        },
      };
    },
  });

  registerAction({
    name: "whatsapp_send_template",
    description: "Send WhatsApp template message with opt-in gate enforced by provider.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: WhatsAppSendTemplateInputSchema,
      output: WhatsAppSendTemplateOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        ttlMs: 60 * 60 * 1000,
        keyResolver: (context) => {
          const payload = WhatsAppSendTemplateInputSchema.parse(context.input);
          return encodeGuardrailKey({
            tenantId: payload.tenantId,
            actionType: context.action,
            idempotencyKey: `${payload.to}:${payload.templateName}:${hashPayload(payload.context ?? {})}`,
          });
        },
      }),
    ],
    handler: async ({ input }) => {
      const payload = WhatsAppSendTemplateInputSchema.parse(input);
      const llmAudits: LLMAuditMetadata[] = [];
      const messageResult = await runRealEstateTask({
        task: "collections_message",
        prompt: `Create a short collections reminder message for template=${payload.templateName}; to=${payload.to}; language=${payload.languageCode}`,
        outputMode: "text",
      });
      if (messageResult?.audit) {
        llmAudits.push(messageResult.audit);
      }
      if (!whatsappGateway) {
        return {
          status: "error",
          error: "WHATSAPP_GATEWAY_NOT_CONFIGURED",
          retryable: false,
        };
      }
      const sent = await whatsappGateway.sendTemplate(payload);
      return {
        status: "success",
        output: {
          messageId: sent.messageId,
          provider: "whatsapp",
          llm: llmAudits.length > 0 ? llmAudits : undefined,
        },
      };
    },
  });
}
