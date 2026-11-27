import { z } from "zod";

export const GuardianReportBlockingIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["P0", "P1", "P2", "P3", "P4"]),
});

export const GuardianReportChecklistItemSchema = z.object({
  item: z.string().min(1),
  status: z.enum(["missing", "partial", "complete", "degraded"]),
  expectedEvidence: z.string().min(1),
  collectedEvidence: z.string().nullable(),
  sha256: z.string().nullable(),
  blocking: z.boolean(),
});

export const GuardianReportCoverageMatrixItemSchema = z.object({
  whatParecerAsks: z.string().min(1),
  whatRunAnswered: z.string().min(1),
  whatStillNeedsManualReview: z.string().nullable(),
});

export const GuardianReportEvaluationScopeSchema = z.enum([
  "single_route",
  "single_step",
  "plan_overview",
]);

export const GuardianReportSchema = z.object({
  route: z.string().min(1),
  runStatus: z.enum(["success", "error"]),
  guardianDecision: z.enum(["GO", "NO-GO", "DEGRADED"]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  evaluationScope: GuardianReportEvaluationScopeSchema.optional(),
  activeStepId: z.string().nullable().optional(),
  activeStepTitle: z.string().nullable().optional(),
  stageDecision: z.enum(["GO", "NO-GO", "DEGRADED"]).nullable().optional(),
  globalDecision: z.enum(["GO", "NO-GO", "DEGRADED", "PENDING_OTHER_STEPS"]).nullable().optional(),
  reasonCode: z.string().min(1),
  evidenceStatus: z.enum(["missing", "partial", "complete"]),
  exportStatus: z.enum(["valid", "invalid", "template_mismatch"]),
  piiStatus: z.enum(["safe", "masking_required", "sensitive_business_data", "unknown"]),
  finopsStatus: z.enum(["calculated", "not_calculated", "not_reported"]),
  summary: z.string().min(1),
  blockingIssues: z.array(GuardianReportBlockingIssueSchema).default([]),
  checklist: z.array(GuardianReportChecklistItemSchema).default([]),
  coverageMatrix: z.array(GuardianReportCoverageMatrixItemSchema).default([]),
  nextSteps: z.array(z.string()).default([]),
  legacyGovernanceUnverified: z.boolean().optional(),
  finops: z.object({
    model: z.string().nullable(),
    promptTokens: z.number().nullable(),
    completionTokens: z.number().nullable(),
    totalTokens: z.number().nullable(),
    estimatedCost: z.number().nullable(),
    currency: z.string().nullable(),
  }),
  auditTrail: z.object({
    runId: z.string().min(1),
    traceId: z.string().nullable(),
    receiptId: z.string().nullable(),
    verifyUrl: z.string().nullable(),
    evidenceBundleId: z.string().nullable(),
  }),
  governance: z
    .object({
      tenantIdPresent: z.boolean(),
      workspaceIdPresent: z.boolean(),
      rbacEvaluated: z.literal(false).describe("Deprecated compatibility field; non-authoritative."),
      entitlementEvaluated: z.literal(false).describe("Deprecated compatibility field; non-authoritative."),
      trustScoreEvaluated: z.boolean(),
      costGuardEvaluated: z.boolean(),
      policyDecision: z.enum(["allowed", "denied", "needs_review"]),
      reasonCode: z.string().nullable(),
      trustScore: z.number().nullable().optional(),
      trustLevel: z.enum(["high", "medium", "low"]).nullable().optional(),
    })
    .optional(),
  environment: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
});

export type GuardianReport = z.infer<typeof GuardianReportSchema>;
