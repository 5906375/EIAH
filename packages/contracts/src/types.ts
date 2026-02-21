import { z } from "zod";

export const RunStatusSchema = z.enum([
  "pending",
  "awaiting_approval",
  "running",
  "success",
  "error",
  "blocked",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunModeSchema = z.enum(["LIVE", "DRY_RUN"]);
export type RunMode = z.infer<typeof RunModeSchema>;

export const PoUStatusSchema = z.enum(["PENDING", "FINALIZED", "FAILED", "PENDING_TRUST"]);
export type PoUStatus = z.infer<typeof PoUStatusSchema>;

const PoUAnchoringStatusSchema = z.enum(["anchored", "inconsistent", "missing_phase4_anchor"]);
const PoUAnchoringStrengthSchema = z.enum(["strong", "weak"]);

export const PoUResponseV1Schema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal("pou.v1"),
  data: z.object({
    id: z.string(),
    tenantId: z.string(),
    workspaceId: z.string().nullable(),
    runId: z.string(),
    actionId: z.string(),
    status: PoUStatusSchema,
    compositeTxId: z.string(),
    hashes: z.object({
      intentHash: z.string(),
      paramsHash: z.string(),
      signatureHash: z.string(),
      resultHash: z.string(),
    }),
    trustSnapshot: z.record(z.unknown()).nullable(),
    failureReason: z.string().nullable(),
    attestationKeyId: z.string().nullable(),
    attestationSignature: z.string().nullable(),
    canonicalResultRef: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    finalizedAt: z.string().datetime({ offset: true }).nullable(),
    anchoring: z.object({
      phase4Dependency: z.literal("required"),
      status: PoUAnchoringStatusSchema,
      strength: PoUAnchoringStrengthSchema,
      consistent: z.boolean(),
      pointers: z.object({
        runCriticalHash: z.string().nullable(),
        runSclTxId: z.string().nullable(),
        runTxId: z.string().nullable(),
      }),
      checks: z.object({
        hasRunPointers: z.boolean(),
        sclFoundByTx: z.boolean(),
        sclFoundByCriticalHash: z.boolean(),
        hashConsistent: z.boolean(),
        txConsistent: z.boolean(),
        signaturePresent: z.boolean(),
        guardrailLinked: z.boolean(),
      }),
    }),
  }),
});
export type PoUResponseV1 = z.infer<typeof PoUResponseV1Schema>;

export const ApprovalDecisionSchema = z.enum(["APPROVED", "REJECTED"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const RUN_EVENT_TYPES = [
  "run.requested",
  "run.enqueued",
  "run.started",
  "run.completed",
  "run.failed",
  "run.token",
  "run.token.summary",
  "run.trustscore.blocked",
  "run.intent.evaluated",
  "run.blocked.guardrails",
  "run.guardrails.evaluated",
  "run.approved",
  "run.rejected",
  "run.replay.requested",
  "run.replay.enqueued",
  "run.replay.started",
  "run.replay.completed",
  "run.action.plan",
  "run.action.call",
  "run.action.result",
  "run.action.observe",
  "run.action.observe.failed",
  "run.action.replan",
  "run.action.reflect",
  "run.action.enqueued",
  "run.action.proof_finalized",
  "run.action.proof_pending_trust",
  "run.action.proof_failed",
  "run.action.pending_signature",
  "run.action.signed",
  "run.action.execute_started",
  "run.action.execute_finished",
  "run.action.completed",
  "run.action.failed",
  "run.action.judge",
  "run.step.started",
  "run.step.completed",
  "run.step.failed",
  "run.step.skipped",
  "run.step.timeout",
  "run.plan.generated",
  "run.plan.truncated",
  "run.orchestrator.started",
  "run.orchestrator.finished",
  "run.external.legacy_api_call",
  "run.reflect.completed",
] as const;

export const RunEventTypeSchema = z.enum(RUN_EVENT_TYPES);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;

export const RunSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  userId: z.string().optional().nullable(),
  agent: z.string(),
  status: RunStatusSchema,
  runMode: RunModeSchema,
  request: z.unknown(),
  response: z.unknown().nullable().optional(),
  costCents: z.number().int(),
  traceId: z.string().nullable().optional(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().optional().nullable(),
  errorCode: z.string().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Run = z.infer<typeof RunSchema>;

export const RunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  userId: z.string().optional().nullable(),
  type: z.string(),
  payload: z.unknown().nullable().optional(),
  criticalHash: z.string().nullable().optional(),
  sclTxId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const ApprovalRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  attempt: z.number().int(),
  tenantId: z.string(),
  approverId: z.string(),
  decision: ApprovalDecisionSchema,
  reason: z.string().nullable().optional(),
  policyId: z.string().nullable().optional(),
  policyVersion: z.string(),
  requiredMinTrust: z.number().nullable().optional(),
  approverTrust: z.number(),
  intentHash: z.string(),
  planHash: z.string(),
  idempotencyKey: z.string().nullable().optional(),
  payloadHash: z.string(),
  sclSignature: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const PendingApprovalSchema = z.object({
  runId: z.string(),
  status: z.literal("awaiting_approval"),
  reason: z.string().nullable().optional(),
  requiredApprovals: z.number().int(),
  criticality: z.enum(["low", "medium", "high", "critical", "unknown"]),
  createdAt: z.coerce.date().nullable().optional(),
  requestedBy: z.string().nullable().optional(),
});
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;

export const AgentToolSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
]);

export const AgentProfileSchema = z.object({
  id: z.string(),
  agent: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  model: z.string(),
  systemPrompt: z.string(),
  tools: z.union([z.array(AgentToolSchema), z.record(z.any())]).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export const PricingSchema = z.object({
  id: z.string(),
  agent: z.string(),
  perRunCents: z.number().int().nonnegative(),
  perMBcents: z.number().int().nonnegative(),
  active: z.boolean(),
  createdAt: z.coerce.date(),
});
export type Pricing = z.infer<typeof PricingSchema>;

export const PlanQuotaSchema = z.object({
  projectId: z.string(),
  softLimitCents: z.number().int().nonnegative(),
  hardLimitCents: z.number().int().nonnegative(),
  monthUsageCents: z.number().int().nonnegative(),
  updatedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});
export type PlanQuota = z.infer<typeof PlanQuotaSchema>;

export const BillingLedgerEntrySchema = z.object({
  runId: z.string(),
  workspaceId: z.string(),
  tenantId: z.string(),
  amountCents: z.number().int(),
  currency: z.string().length(3),
  status: z.enum(["pending", "settled", "failed"]).default("pending"),
  metadata: z.record(z.any()).optional(),
});
export type BillingLedgerEntry = z.infer<typeof BillingLedgerEntrySchema>;

export const UploadedDocumentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  agentSlug: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  storageKey: z.string(),
  url: z.string(),
  createdAt: z.coerce.date(),
});
export type UploadedDocument = z.infer<typeof UploadedDocumentSchema>;

export const ApiTokenSchema = z.object({
  id: z.string(),
  token: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  revoked: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const RunListResponseSchema = z.object({
  items: z.array(RunSchema),
  total: z.number().int(),
});
export type RunListResponse = z.infer<typeof RunListResponseSchema>;

export const RunEventsResponseSchema = z.object({
  items: z.array(RunEventSchema),
});
export type RunEventsResponse = z.infer<typeof RunEventsResponseSchema>;

export const MemoryScopeSchema = z.object({
  tenantId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
});
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryRecordSchema = z.object({
  key: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const MemoryVectorMatchSchema = z.object({
  key: z.string(),
  score: z.number(),
  metadata: z.record(z.unknown()).optional(),
});
export type MemoryVectorMatch = z.infer<typeof MemoryVectorMatchSchema>;

export const MemorySnapshotSchema = z.object({
  shortTerm: z.array(MemoryRecordSchema),
  longTerm: z.array(MemoryRecordSchema),
  vectorMatches: z.array(MemoryVectorMatchSchema),
  cursor: z.string().nullable().optional(),
});
export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

export const MemoryEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  runId: z.string().nullable().optional(),
  key: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
});
export type MemoryEvent = z.infer<typeof MemoryEventSchema>;

export const EmbeddingChunkSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
  chunkKey: z.string(),
  embedding: z.array(z.number()),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type EmbeddingChunk = z.infer<typeof EmbeddingChunkSchema>;

const BrandingFieldSchema = z
  .string()
  .min(2)
  .transform((value) => value.trim());

export const PlanBrandingSchema = z.object({
  brand_name: BrandingFieldSchema,
  logo_url: z
    .string()
    .url()
    .transform((value) => value.trim()),
  primary_color: z
    .string()
    .min(1)
    .max(32)
    .transform((value) => value.trim()),
  email_from: z
    .string()
    .email()
    .transform((value) => value.trim()),
});
export type PlanBranding = z.infer<typeof PlanBrandingSchema>;

const PlanRulesInputSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .nullable();

const PlanCustomTextsInputSchema = z
  .union([
    z.record(z.string()),
    z.array(
      z.object({
        key: z.string(),
        value: z.string(),
      })
    ),
  ])
  .optional()
  .nullable();

function normalizePlanRules(
  rules: z.infer<typeof PlanRulesInputSchema>
): string[] {
  if (!rules) return [];
  if (Array.isArray(rules)) {
    return rules
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return rules
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeCustomTexts(
  value: z.infer<typeof PlanCustomTextsInputSchema>
): Record<string, string> | undefined {
  if (!value) return undefined;

  if (Array.isArray(value)) {
    const aggregated: Record<string, string> = {};
    value.forEach((entry) => {
      const key = entry.key.trim();
      const val = entry.value.trim();
      if (key && val) {
        aggregated[key] = val;
      }
    });
    return Object.keys(aggregated).length > 0 ? aggregated : undefined;
  }

  const entries = Object.entries(value)
    .map(([key, val]) => [key.trim(), typeof val === "string" ? val.trim() : ""] as const)
    .filter(([key, val]) => key.length > 0 && val.length > 0);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

const RawPlanSpecSchema = z.object({
  plan_id: z
    .string()
    .min(2)
    .transform((value) => value.trim()),
  name: z
    .string()
    .min(2)
    .transform((value) => value.trim()),
  amount: z.coerce
    .number({
      invalid_type_error: "amount must be a number",
    })
    .int()
    .positive(),
  currency: z.enum(["BRL", "USD"]),
  interval: z.enum(["monthly", "yearly"]),
  branding: PlanBrandingSchema,
  rules: PlanRulesInputSchema,
  metadata: z.record(z.unknown()).optional(),
  custom_texts: PlanCustomTextsInputSchema,
});

export const PlanSpecSchema = RawPlanSpecSchema.transform((input) => ({
  ...input,
  rules: normalizePlanRules(input.rules),
  custom_texts: normalizeCustomTexts(input.custom_texts),
}));
export type PlanSpec = z.infer<typeof PlanSpecSchema>;

export const NeedMoreInfoFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "select"]).optional(),
  placeholder: z.string().optional(),
  helper: z.string().optional(),
  required: z.boolean().optional(),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
      })
    )
    .optional(),
});
export type NeedMoreInfoField = z.infer<typeof NeedMoreInfoFieldSchema>;

export const NeedMoreInfoPayloadSchema = z.object({
  status: z.literal("need_more_info"),
  title: z.string().optional(),
  message: z.string().optional(),
  fields: z.array(NeedMoreInfoFieldSchema),
});
export type NeedMoreInfoPayload = z.infer<typeof NeedMoreInfoPayloadSchema>;

function extractNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function evaluatePlanSpecAdditionalInfo(
  spec: PlanSpec
): NeedMoreInfoPayload | null {
  const metadata = (spec.metadata ?? {}) as Record<string, unknown>;
  const rules = spec.rules ?? [];

  const requiresLiquidityProof = rules.some((rule) => {
    const normalized = rule.toLowerCase();
    return (
      normalized.includes("liquidity") ||
      normalized.includes("fluxo_de_caixa") ||
      normalized.includes("cashflow")
    );
  });

  const cashPosition =
    extractNumericValue(metadata.cash_position) ??
    extractNumericValue(metadata.cashPosition) ??
    null;

  const fields: NeedMoreInfoField[] = [];

  if (requiresLiquidityProof && !metadata.liquidity_proof) {
    fields.push({
      key: "liquidity_proof",
      label: "Documento ou link de comprovação de liquidez",
      type: "text",
      placeholder: "URL segura ou ID do documento no cofre",
      helper: "Necessário para validar garantias antes da criação do plano.",
      required: true,
    });
  }

  if (cashPosition !== null && cashPosition <= 0) {
    fields.push({
      key: "cash_recovery_plan",
      label: "Plano de recomposição de caixa",
      type: "textarea",
      helper:
        "Descreva como o tenant garantirá saldo positivo nos próximos 30 dias (fontes, prazos, responsáveis).",
      required: true,
    });
    fields.push({
      key: "liquidity_buffer_source",
      label: "Fonte de liquidez imediata",
      type: "text",
      placeholder: "Linha de crédito, fundo garantidor, capital comprometido...",
      required: true,
    });
  }

  if (fields.length === 0) {
    return null;
  }

  return {
    status: "need_more_info",
    title: "Dados financeiros obrigatórios antes de criar o plano",
    message:
      "Forneça as evidências adicionais abaixo para cumprir os requisitos de governança e liquidez.",
    fields,
  };
}
