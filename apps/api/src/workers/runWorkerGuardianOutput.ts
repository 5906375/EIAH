import crypto from "node:crypto";

import type { GuardianReport } from "@eiah/core";

type UsageStats = {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
} | null;

type Snapshot = {
  usage?: UsageStats;
  model?: string;
  traceId?: string;
};

type AuditTrailSources = {
  receiptId: string | null;
  verifyUrl: string | null;
  evidenceBundleId: string | null;
};

type StepOutput = { stepId: string; data: unknown };
type GuardianEvaluationScope = {
  kind: "single_route" | "single_step" | "plan_overview";
  activeStepId: string | null;
  activeStepTitle: string | null;
};
type StructuredRecipeStep = {
  id: string;
  title: string;
  objective: string | null;
  checks: string[];
  evidence: string[];
  blocking: boolean;
};
type ChecklistItem = {
  item: string;
  status: GuardianReport["checklist"][number]["status"];
  expectedEvidence: string;
  collectedEvidence: string | null;
  sha256: string | null;
  blocking: boolean;
  reasonCode: string | null;
  summary: string | null;
  nextAction: string | null;
  findings: string[];
};

type ObservedGuardianSignal = ChecklistItem & {
  sourceStep: string;
};

type PlainObject = Record<string, unknown>;
type GovernanceContext = NonNullable<GuardianReport["governance"]>;

const REQUIRED_GUARDIAN_STEPS = [
  "runtime_health",
  "go_live_artifacts",
  "rollback_readiness",
  "policy_guardrails",
] as const;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseUsageNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractExecutionInput(metadata: Record<string, unknown>) {
  if (isPlainObject(metadata.executionInput)) return metadata.executionInput;
  if (isPlainObject(metadata.form)) return metadata.form;
  return metadata;
}

function extractLinkedRecipeData(metadata: Record<string, unknown>) {
  if (!isPlainObject(metadata.linkedRecipe)) return null;
  const linkedRecipe = metadata.linkedRecipe;
  const content = isPlainObject(linkedRecipe.content) ? linkedRecipe.content : null;
  const stageExecution = isPlainObject(linkedRecipe.stageExecution) ? linkedRecipe.stageExecution : null;
  return {
    contentMode: content?.mode === "staged" ? "staged" : "simple",
    expectedOutcome: asString(content?.expectedOutcome),
    goCondition: asString(content?.goCondition),
    steps: Array.isArray(content?.steps)
      ? content.steps
          .filter((step): step is PlainObject => isPlainObject(step))
          .map((step) => ({
            id: asString(step.id) ?? "step",
            title: asString(step.title) ?? "Etapa sem título",
            objective: asString(step.objective),
            checks: Array.isArray(step.checks)
              ? step.checks.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              : [],
            evidence: Array.isArray(step.evidence)
              ? step.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              : [],
            blocking: typeof step.blocking === "boolean" ? step.blocking : true,
          } satisfies StructuredRecipeStep))
      : [],
    stageExecutionMode: asString(stageExecution?.mode),
    activeStepId: asString(stageExecution?.activeStepId),
    activeStepTitle: asString(stageExecution?.activeStepTitle),
  };
}

function extractGovernanceContext(metadata: Record<string, unknown>): GovernanceContext | null {
  if (!isPlainObject(metadata.governanceContext)) return null;
  const raw = metadata.governanceContext;
  const policyDecision =
    raw.policyDecision === "allowed" || raw.policyDecision === "denied" || raw.policyDecision === "needs_review"
      ? raw.policyDecision
      : "needs_review";
  const trustLevel =
    raw.trustLevel === "high" || raw.trustLevel === "medium" || raw.trustLevel === "low" ? raw.trustLevel : undefined;

  return {
    tenantIdPresent: typeof raw.tenantIdPresent === "boolean" ? raw.tenantIdPresent : false,
    workspaceIdPresent: typeof raw.workspaceIdPresent === "boolean" ? raw.workspaceIdPresent : false,
    rbacEvaluated: typeof raw.rbacEvaluated === "boolean" ? raw.rbacEvaluated : false,
    entitlementEvaluated: typeof raw.entitlementEvaluated === "boolean" ? raw.entitlementEvaluated : false,
    trustScoreEvaluated: typeof raw.trustScoreEvaluated === "boolean" ? raw.trustScoreEvaluated : false,
    costGuardEvaluated: typeof raw.costGuardEvaluated === "boolean" ? raw.costGuardEvaluated : false,
    policyDecision,
    reasonCode: asString(raw.reasonCode),
    trustScore: parseUsageNumber(raw.trustScore),
    trustLevel,
  };
}

function resolveGuardianEvaluationScope(metadata: Record<string, unknown>): GuardianEvaluationScope {
  const linkedRecipe = extractLinkedRecipeData(metadata);
  if (!linkedRecipe || linkedRecipe.contentMode !== "staged" || linkedRecipe.steps.length <= 1) {
    return { kind: "single_route", activeStepId: null, activeStepTitle: null };
  }
  if (linkedRecipe.stageExecutionMode === "step" && linkedRecipe.activeStepId) {
    return {
      kind: "single_step",
      activeStepId: linkedRecipe.activeStepId,
      activeStepTitle: linkedRecipe.activeStepTitle,
    };
  }
  return { kind: "plan_overview", activeStepId: null, activeStepTitle: null };
}

function detectPiiStatus(form: Record<string, unknown>): GuardianReport["piiStatus"] {
  const signals = asString(form.piiSignals)?.toLowerCase();
  if (!signals) return "unknown";
  if (signals.includes("segredo comercial") || signals.includes("sensitive_business")) {
    return "sensitive_business_data";
  }
  if (
    signals.includes("sem ofusca") ||
    signals.includes("nao ofusca") ||
    signals.includes("não ofusca") ||
    signals.includes("exposto") ||
    signals.includes("pii")
  ) {
    return "masking_required";
  }
  return "safe";
}

function detectEnvironment(form: Record<string, unknown>, metadata: Record<string, unknown>) {
  return (
    asString(form.environment) ??
    asString(form.ambiente) ??
    asString(metadata.environment) ??
    asString(metadata.env) ??
    null
  );
}

function extractAuditTrailSources(params: {
  metadata: Record<string, unknown>;
  runId: string;
  txId?: string | null;
  criticalHash?: string | null;
}): AuditTrailSources {
  const executionInput = isPlainObject(params.metadata.executionInput) ? params.metadata.executionInput : null;
  const form = isPlainObject(params.metadata.form) ? params.metadata.form : null;
  const sources = [executionInput, form, params.metadata].filter((item): item is PlainObject => Boolean(item));

  const explicitReceiptId = sources.map((item) => asString(item.receiptId)).find(Boolean) ?? null;
  const explicitReceiptPath = sources.map((item) => asString(item.receiptPath)).find(Boolean) ?? null;
  const explicitVerifyUrl = sources.map((item) => asString(item.verifyUrl)).find(Boolean) ?? null;
  const explicitEvidenceBundleId = sources.map((item) => asString(item.evidenceBundleId)).find(Boolean) ?? null;
  const explicitBundlePath = sources.map((item) => asString(item.bundlePath)).find(Boolean) ?? null;

  const txId = asString(params.txId) ?? null;
  const bundlePath = explicitBundlePath ?? (params.criticalHash ? `/api/runs/${encodeURIComponent(params.runId)}/bundle` : null);
  const verifyUrl = explicitVerifyUrl ?? explicitReceiptPath ?? (txId ? `/api/ledger/${encodeURIComponent(txId)}` : null);

  return {
    receiptId: explicitReceiptId ?? explicitReceiptPath ?? txId,
    verifyUrl,
    evidenceBundleId: explicitEvidenceBundleId ?? bundlePath,
  };
}

function extractHash(values: string[]) {
  const hash = values
    .flatMap((value) => value.match(/\b[a-f0-9]{64}\b/gi) ?? [])
    .find(Boolean);
  return hash ?? null;
}

function buildEvidenceHash(values: string[]) {
  const normalized = Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "pt-BR"))
    )
  );
  if (normalized.length === 0) return null;
  return crypto.createHash("sha256").update(normalized.join("\n"), "utf8").digest("hex");
}

function mapStepToExpectedEvidence(step: string) {
  switch (step) {
    case "runtime_health":
      return "Resposta válida do /api/health com database connected.";
    case "go_live_artifacts":
      return "Pacote canônico de evidências de go-live no repositório.";
    case "rollback_readiness":
      return "Plano de rollback documentado e disponível.";
    case "policy_guardrails":
      return "ADR da stack oficial e evidência fail-closed 403.";
    default:
      return "Evidência probatória estruturada para a etapa.";
  }
}

function mapStepStatus(status: string): GuardianReport["checklist"][number]["status"] {
  if (status === "verified") return "complete";
  if (status === "warning") return "partial";
  if (status === "degraded") return "degraded";
  return "missing";
}

function defaultMissingReasonCode(step: string) {
  switch (step) {
    case "runtime_health":
      return "HEALTHCHECK_MISSING";
    case "rollback_readiness":
      return "ROLLBACK_MISSING";
    case "policy_guardrails":
      return "FAIL_CLOSED_403_MISSING";
    default:
      return "EVIDENCE_MISSING";
  }
}

function buildMissingChecklistItem(step: string): ChecklistItem {
  return {
    item: step,
    status: "missing",
    expectedEvidence: mapStepToExpectedEvidence(step),
    collectedEvidence: null,
    sha256: null,
    blocking: true,
    reasonCode: defaultMissingReasonCode(step),
    summary:
      step === "runtime_health"
        ? "Healthcheck obrigatório não foi reportado pelo runtime."
        : "Etapa obrigatória não foi reportada pelo runtime.",
    nextAction:
      step === "runtime_health"
        ? "Executar e registrar evidência válida do /api/health antes de novo parecer."
        : "Executar a etapa obrigatória e anexar evidência antes de novo parecer.",
    findings: [],
  };
}

function buildMissingStructuredChecklistItem(step: StructuredRecipeStep): ChecklistItem {
  return {
    item: step.title,
    status: "missing",
    expectedEvidence:
      step.evidence.length > 0 ? step.evidence.join(" · ") : step.objective ?? "Evidência obrigatória da etapa.",
    collectedEvidence: null,
    sha256: null,
    blocking: step.blocking,
    reasonCode: step.blocking ? "STEP_EVIDENCE_MISSING" : "STEP_REVIEW_REQUIRED",
    summary: `A etapa "${step.title}" ainda não foi comprovada nesta execução.`,
    nextAction: `Concluir a etapa "${step.title}" e anexar as evidências antes de novo parecer.`,
    findings: [],
  };
}

function extractChecklistPayload(value: unknown): PlainObject | null {
  if (!isPlainObject(value)) return null;
  if (isPlainObject(value.output)) return value.output;
  return value;
}

function extractObservedGuardianSignals(outputs: StepOutput[]) {
  return outputs
    .map((entry) => {
      const data = extractChecklistPayload(entry.data);
      if (!data) return null;
      const step = asString(data.step);
      const status = asString(data.status);
      if (!step || !status) return null;
      const evidenceRefs = Array.isArray(data.evidenceRefs)
        ? data.evidenceRefs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const findings = Array.isArray(data.findings)
        ? data.findings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const expectedEvidence = mapStepToExpectedEvidence(step);
      const collectedEvidence = evidenceRefs.length > 0 ? evidenceRefs.join(", ") : null;
      const normalizedStatus = mapStepStatus(status);
      const explicitHash = extractHash(findings);
      return {
        sourceStep: step,
        item: step,
        status: normalizedStatus,
        expectedEvidence,
        collectedEvidence,
        sha256: explicitHash ?? (normalizedStatus === "complete" ? buildEvidenceHash(evidenceRefs) : null),
        blocking: normalizedStatus === "missing",
        reasonCode: asString(data.reasonCode),
        summary: asString(data.summary),
        nextAction: asString(data.nextAction),
        findings,
      };
    })
    .filter((item): item is ObservedGuardianSignal => Boolean(item));
}

function extractChecklist(outputs: StepOutput[]) {
  const observed = extractObservedGuardianSignals(outputs);

  const checklistByStep = new Map(observed.map((item) => [item.item, item] as const));
  for (const step of REQUIRED_GUARDIAN_STEPS) {
    if (!checklistByStep.has(step)) {
      checklistByStep.set(step, buildMissingChecklistItem(step));
    }
  }

  return Array.from(checklistByStep.values());
}

function normalizeTokens(values: string[]) {
  return values
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9_à-ÿ]+/i))
    .filter((value) => value.length >= 3);
}

function getStructuredStepSignalAliases(step: StructuredRecipeStep) {
  const primary = normalizeTokens([step.title, step.objective ?? ""]);
  const secondary = normalizeTokens([...step.checks, ...step.evidence]);
  const haystack = Array.from(new Set([...primary, ...secondary]));
  const aliases = new Set<string>();

  if (
    haystack.some((token) =>
      ["segregação", "segregacao", "staging", "produção", "producao", "env", "vars", "urls", "dns", "tls"].includes(
        token
      )
    )
  ) {
    aliases.add("environment_segregation");
  }

  if (haystack.some((token) => ["health", "healthcheck", "database", "runtime"].includes(token))) {
    aliases.add("runtime_health");
  }

  if (haystack.some((token) => ["tenantid", "workspaceid", "403", "policy", "guardrail", "guardrails"].includes(token))) {
    aliases.add("policy_guardrails");
  }
  if (haystack.some((token) => ["rollback"].includes(token))) {
    aliases.add("rollback_readiness");
  }
  if (haystack.some((token) => ["artifact", "artefatos", "bundle", "probatório", "probatorio"].includes(token))) {
    aliases.add("go_live_artifacts");
  }
  if (haystack.some((token) => ["waf", "rate", "limit", "borda", "exposição", "publica", "publico"].includes(token))) {
    aliases.add("edge_protection");
  }

  return aliases;
}

function splitCollectedEvidence(value: string | null) {
  return (value ?? "")
    .split(/\s*·\s*|\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectEvidenceParts(signals: ObservedGuardianSignal[]) {
  return Array.from(new Set(signals.flatMap((item) => splitCollectedEvidence(item.collectedEvidence))));
}

function formatEvidenceSection(label: string, values: string[]) {
  return values.length > 0 ? `${label}: ${values.join(" · ")}` : null;
}

function buildStructuredCollectedEvidence(step: StructuredRecipeStep, matchedSignals: ObservedGuardianSignal[]) {
  const aliases = getStructuredStepSignalAliases(step);
  const environment = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "environment_segregation"));
  const runtime = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "runtime_health"));
  const policy = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "policy_guardrails"));
  const edge = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "edge_protection"));
  const rollback = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "rollback_readiness"));
  const artifacts = collectEvidenceParts(matchedSignals.filter((item) => item.sourceStep === "go_live_artifacts"));

  const sections = [
    aliases.has("environment_segregation") ? formatEvidenceSection("Segregação", environment) : null,
    aliases.has("runtime_health") ? formatEvidenceSection("Health", runtime) : null,
    aliases.has("policy_guardrails") ? formatEvidenceSection("Policy", policy) : null,
    aliases.has("edge_protection") ? formatEvidenceSection("Borda", edge) : null,
    aliases.has("rollback_readiness") ? formatEvidenceSection("Rollback", rollback) : null,
    aliases.has("go_live_artifacts") ? formatEvidenceSection("Bundle final", artifacts) : null,
  ].filter((item): item is string => Boolean(item));

  const allParts = Array.from(new Set([...environment, ...runtime, ...policy, ...edge, ...rollback, ...artifacts]));

  return {
    rendered: sections.length > 0 ? sections.join(" | ") : allParts.join(" · "),
    hashableParts: sections.length > 0 ? sections : allParts,
  };
}

function mergeStructuredStepSignals(step: StructuredRecipeStep, matchedSignals: ObservedGuardianSignal[]): ChecklistItem {
  if (matchedSignals.length === 0) return buildMissingStructuredChecklistItem(step);

  const statuses = matchedSignals.map((item) => item.status);
  const status = statuses.every((item) => item === "complete")
    ? "complete"
    : statuses.some((item) => item === "missing")
      ? "missing"
      : statuses.some((item) => item === "degraded")
        ? "degraded"
        : "partial";

  const collectedEvidenceData = buildStructuredCollectedEvidence(step, matchedSignals);
  const findings = matchedSignals.flatMap((item) => item.findings);
  const summaries = matchedSignals
    .map((item) => item.summary)
    .filter((item): item is string => Boolean(item));
  const nextActions = matchedSignals
    .map((item) => item.nextAction)
    .filter((item): item is string => Boolean(item));
  const reasonCode = matchedSignals.find((item) => item.reasonCode)?.reasonCode ?? null;

  const explicitHash = extractHash(findings);

  return {
    item: step.title,
    status,
    expectedEvidence:
      step.evidence.length > 0 ? step.evidence.join(" · ") : step.objective ?? "Evidência obrigatória da etapa.",
    collectedEvidence: collectedEvidenceData.rendered.length > 0 ? collectedEvidenceData.rendered : null,
    sha256: explicitHash ?? (status === "complete" ? buildEvidenceHash(collectedEvidenceData.hashableParts) : null),
    blocking: step.blocking && status === "missing",
    reasonCode:
      reasonCode ??
      (status === "missing" ? "STEP_EVIDENCE_MISSING" : status === "degraded" || status === "partial" ? "STEP_REVIEW_REQUIRED" : null),
    summary:
      summaries[0] ??
      (status === "complete"
        ? `A etapa "${step.title}" foi comprovada pelos checks executados nesta execução.`
        : `A etapa "${step.title}" foi parcialmente comprovada e ainda exige revisão antes do GO final.`),
    nextAction:
      status === "complete"
        ? null
        : nextActions[0] ?? `Concluir as evidências remanescentes da etapa "${step.title}".`,
    findings,
  };
}

function extractStructuredChecklist(
  metadata: Record<string, unknown>,
  scope: GuardianEvaluationScope,
  outputs: StepOutput[]
) {
  const linkedRecipe = extractLinkedRecipeData(metadata);
  if (!linkedRecipe || linkedRecipe.steps.length === 0) return [];
  const observedSignals = extractObservedGuardianSignals(outputs);
  const steps =
    scope.kind === "single_step" && scope.activeStepId
      ? linkedRecipe.steps.filter((step) => step.id === scope.activeStepId)
      : linkedRecipe.steps;
  return steps.map((step) => {
    const aliases = getStructuredStepSignalAliases(step);
    const matchedSignals = observedSignals.filter((item) => aliases.has(item.sourceStep));
    return mergeStructuredStepSignals(step, matchedSignals);
  });
}

function determineReasonCode(params: {
  tenantId?: string | null;
  workspaceId?: string | null;
  piiStatus: GuardianReport["piiStatus"];
  checklist: ReturnType<typeof extractChecklist>;
  scope: GuardianEvaluationScope;
}) {
  const { tenantId, workspaceId, piiStatus, checklist, scope } = params;
  if (!tenantId) return "TENANT_CONTEXT_MISSING";
  if (!workspaceId) return "WORKSPACE_CONTEXT_MISSING";
  if (piiStatus === "masking_required") return "PII_DETECTED_ABORT_FLOW";
  if (piiStatus === "sensitive_business_data") return "SENSITIVE_BUSINESS_DATA_MASKING_REQUIRED";

  if (scope.kind === "plan_overview") {
    if (checklist.some((item) => item.blocking && item.status === "missing")) return "PLAN_EVIDENCE_INCOMPLETE";
    if (checklist.some((item) => item.status === "partial" || item.status === "degraded")) return "REVIEW_REQUIRED";
    return "GO_READY";
  }

  if (scope.kind === "single_step") {
    if (checklist.some((item) => item.blocking && item.status === "missing")) return "STEP_EVIDENCE_MISSING";
    if (checklist.some((item) => item.status === "partial" || item.status === "degraded")) return "REVIEW_REQUIRED";
    return "GO_READY";
  }

  const runtimeHealth = checklist.find((item) => item.item === "runtime_health");
  const rollback = checklist.find((item) => item.item === "rollback_readiness");
  const policy = checklist.find((item) => item.item === "policy_guardrails");
  const artifacts = checklist.find((item) => item.item === "go_live_artifacts");

  if (!runtimeHealth || runtimeHealth.status === "missing") return "HEALTHCHECK_MISSING";
  if (runtimeHealth.findings.some((item) => item.includes("database=disconnected"))) return "DATABASE_DISCONNECTED";
  if (!rollback || rollback.status === "missing") return "ROLLBACK_MISSING";
  if (policy?.findings.some((item) => item.includes("fail_closed_evidence=false"))) return "FAIL_CLOSED_403_MISSING";
  if (artifacts && artifacts.status === "missing") return "EVIDENCE_MISSING";
  if (checklist.some((item) => item.status === "missing")) return "EVIDENCE_MISSING";
  if (checklist.some((item) => item.status === "degraded" && item.item.includes("waf"))) return "WAF_MONITOR_ONLY";
  if (checklist.some((item) => item.status === "degraded" && item.findings.some((entry) => entry.toLowerCase().includes("redis")))) {
    return "REDIS_DEGRADED";
  }
  if (checklist.some((item) => item.status === "partial" || item.status === "degraded")) return "REVIEW_REQUIRED";
  return "GO_READY";
}

function determineDecision(reasonCode: string): GuardianReport["guardianDecision"] {
  if (["GO_READY"].includes(reasonCode)) return "GO";
  if (["WAF_MONITOR_ONLY", "REDIS_DEGRADED", "REVIEW_REQUIRED"].includes(reasonCode)) return "DEGRADED";
  return "NO-GO";
}

function determineEvidenceStatus(checklist: ReturnType<typeof extractChecklist>): GuardianReport["evidenceStatus"] {
  if (checklist.length === 0) return "missing";
  if (checklist.every((item) => item.status === "complete")) return "complete";
  if (checklist.some((item) => item.status === "missing")) return "missing";
  return "partial";
}

function determineFinopsStatus(costCents: number | null | undefined, usage: UsageStats): GuardianReport["finopsStatus"] {
  const hasTokens = Boolean(
    usage &&
      [usage.promptTokens, usage.completionTokens, usage.cachedTokens, usage.totalTokens].some(
        (value) => typeof value === "number" && Number.isFinite(value) && value > 0
      )
  );
  const hasCost = typeof costCents === "number" && Number.isFinite(costCents) && costCents > 0;
  if (hasCost && hasTokens) return "calculated";
  if (hasCost || hasTokens) return "not_calculated";
  return "not_reported";
}

function normalizeFinops(costCents: number | null | undefined, usage: UsageStats, model?: string | null) {
  const promptTokens = parseUsageNumber(usage?.promptTokens);
  const completionTokens = parseUsageNumber(usage?.completionTokens);
  const cachedTokens = parseUsageNumber(usage?.cachedTokens);
  const totalTokensRaw = parseUsageNumber(usage?.totalTokens);
  const hasAnyComponent = [promptTokens, completionTokens, cachedTokens].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0
  );
  const totalTokens =
    totalTokensRaw && totalTokensRaw > 0
      ? totalTokensRaw
      : hasAnyComponent
        ? (promptTokens ?? 0) + (completionTokens ?? 0) + (cachedTokens ?? 0)
        : null;
  const hasCost = typeof costCents === "number" && Number.isFinite(costCents) && costCents > 0;

  return {
    model: model ?? null,
    promptTokens: promptTokens && promptTokens > 0 ? promptTokens : null,
    completionTokens: completionTokens && completionTokens > 0 ? completionTokens : null,
    totalTokens,
    estimatedCost: hasCost ? Number((costCents / 100).toFixed(2)) : null,
    currency: hasCost ? "BRL" : null,
  };
}

function buildBlockingIssues(reasonCode: string, checklist: ReturnType<typeof extractChecklist>) {
  const issues = checklist
    .filter((item) => item.blocking)
    .map((item) => ({
      code: item.reasonCode ?? reasonCode,
      message: item.summary ?? item.expectedEvidence,
      severity: item.item === "runtime_health" ? ("P0" as const) : ("P1" as const),
    }));
  if (issues.length === 0 && reasonCode === "HEALTHCHECK_MISSING") {
    issues.push({
      code: "HEALTHCHECK_MISSING",
      message: "Healthcheck obrigatório não foi reportado pelo runtime.",
      severity: "P0",
    });
  }
  if (issues.length === 0 && reasonCode !== "GO_READY") {
    issues.push({
      code: reasonCode,
      message: "O Guardian bloqueou ou degradou o avanço por ausência de contexto, evidência ou conformidade suficiente.",
      severity: reasonCode === "REVIEW_REQUIRED" ? "P2" : "P0",
    });
  }
  return issues;
}

function summarizeEvidenceStatus(checklist: ReturnType<typeof extractChecklist>) {
  const completed = checklist.filter((item) => item.status === "complete").length;
  const blocking = checklist.filter((item) => item.blocking).length;
  return { completed, blocking };
}

function buildSummary(decision: GuardianReport["guardianDecision"], reasonCode: string, checklist: ReturnType<typeof extractChecklist>) {
  const { completed, blocking } = summarizeEvidenceStatus(checklist);
  const firstBlocking = checklist.find((item) => item.blocking && item.status === "missing");
  if (decision === "GO") {
    return `O Guardian concluiu que este fluxo pode avançar. Todas as evidências obrigatórias foram localizadas e validadas para a rota analisada.`;
  }

  if (reasonCode === "PLAN_EVIDENCE_INCOMPLETE") {
    return `O plano principal ainda não está pronto para aprovação final. A etapa pendente mais crítica é: ${firstBlocking?.item ?? "etapa não identificada"}.`;
  }

  if (reasonCode === "STEP_EVIDENCE_MISSING") {
    return `A etapa atual da recipe ainda não foi concluída porque faltam evidências obrigatórias para ${firstBlocking?.item ?? "a etapa ativa"}.`;
  }

  if (reasonCode === "HEALTHCHECK_MISSING") {
    return `O Guardian não liberou o avanço porque faltou a evidência obrigatória do healthcheck da API. Registre uma resposta válida do /api/health e execute novamente para novo parecer.`;
  }

  if (reasonCode === "ROLLBACK_MISSING") {
    return `O Guardian não liberou o avanço porque o plano de rollback não foi comprovado. Documente e anexe a evidência de rollback antes de gerar novo parecer.`;
  }

  if (reasonCode === "FAIL_CLOSED_403_MISSING") {
    return `O Guardian não liberou o avanço porque a evidência de fail-closed 403 não foi comprovada. Corrija os guardrails e execute novamente antes do go-live.`;
  }

  if (reasonCode === "EVIDENCE_MISSING") {
    return `O Guardian não liberou o avanço porque ainda faltam evidências obrigatórias desta receita. Complete os artefatos esperados e execute novamente para novo parecer.`;
  }

  if (decision === "DEGRADED") {
    return `O Guardian encontrou pendências que exigem revisão antes do avanço completo. Há ${completed} evidências completas e ${blocking} bloqueios críticos registrados nesta execução.`;
  }

  return `O Guardian bloqueou o avanço desta execução por ausência de evidência ou conformidade suficiente. Há ${completed} evidências completas e ${blocking} bloqueios críticos registrados nesta trilha probatória.`;
}

function buildNextSteps(reasonCode: string, checklist: ReturnType<typeof extractChecklist>) {
  const steps = Array.from(
    new Set(
      checklist
    .map((item) => item.nextAction)
    .filter((item): item is string => Boolean(item))
    )
  ).slice(0, 7);
  if (steps.length > 0) return steps;
  if (reasonCode === "GO_READY") {
    return [
      "Registrar o receipt final do run.",
      "Promover o fluxo somente após conferência do verify_url.",
      "Monitorar health e rollback no pós-go-live imediato.",
    ];
  }
  return [
    "Corrigir as pendências probatórias indicadas pelo Guardian.",
    "Reexecutar os checks obrigatórios antes de novo parecer.",
    "Não promover a rota até remover o reasonCode atual.",
  ];
}

function buildCoverageMatrix(params: {
  route: string;
  scope: GuardianEvaluationScope;
  decision: GuardianReport["guardianDecision"];
  reasonCode: string;
  checklist: ReturnType<typeof extractChecklist>;
  metadata: Record<string, unknown>;
}): GuardianReport["coverageMatrix"] {
  const linkedRecipe = extractLinkedRecipeData(params.metadata);
  const completedCount = params.checklist.filter((item) => item.status === "complete").length;
  const totalCount = params.checklist.length;
  const completedItems = params.checklist
    .filter((item) => item.status === "complete")
    .map((item) => item.item)
    .slice(0, 6)
    .join(" · ");

  const base: GuardianReport["coverageMatrix"] = [
    {
      whatParecerAsks: "Decidir se o go-live controlado pode avançar com base em gates, evidência e governança.",
      whatRunAnswered: `O Guardian concluiu ${params.decision} com reasonCode ${params.reasonCode}.`,
      whatStillNeedsManualReview:
        params.decision === "GO"
          ? "A promoção real nas plataformas externas ainda depende da execução operacional do time/usuário."
          : "Ainda é necessário corrigir pendências antes de qualquer promoção real.",
    },
    {
      whatParecerAsks: "Conferir gates mínimos como segregação, health/fail-closed, borda pública, rollback e evidências finais.",
      whatRunAnswered:
        totalCount > 0
          ? `${completedCount}/${totalCount} etapas foram comprovadas nesta execução. Etapas completas: ${completedItems || "nenhuma"}.`
          : "Nenhuma etapa estruturada foi comprovada nesta execução.",
      whatStillNeedsManualReview:
        params.scope.kind === "plan_overview"
          ? "Uma revisão arquitetural ampla ainda pode ser necessária para itens fora do checklist operacional automatizado."
          : null,
    },
  ];

  if (params.route === "go_live_controlado.plano_principal_web" || linkedRecipe?.contentMode === "staged") {
    base.push({
      whatParecerAsks: "Orientar o próximo caminho de implementação para Vercel, AWS, Cloudflare e integração fim a fim.",
      whatRunAnswered:
        "O runtime validou o plano principal e anexou, via Recipe_Orchestrator, orientação de como seguir agora e recipes recomendadas em ordem.",
      whatStillNeedsManualReview:
        "A conferência manual de código, CI/drift documental, webhooks e módulos arquiteturais citados no parecer técnico continua fora do escopo desta validação automatizada.",
    });
  }

  return base;
}

function determineRiskLevel(params: {
  metadata: Record<string, unknown>;
  route: string;
  scope: GuardianEvaluationScope;
  piiStatus: GuardianReport["piiStatus"];
}): NonNullable<GuardianReport["riskLevel"]> {
  const linkedRecipe = extractLinkedRecipeData(params.metadata);
  const isStructuredGoLivePlan =
    params.route === "go_live_controlado.plano_principal_web" ||
    (params.route.startsWith("go_live_controlado.") && linkedRecipe?.contentMode === "staged" && linkedRecipe.steps.length > 1);

  if (isStructuredGoLivePlan || params.scope.kind === "plan_overview") return "critical";
  if (params.route.startsWith("go_live_controlado.") || params.piiStatus === "sensitive_business_data") return "high";
  if (params.piiStatus === "masking_required") return "medium";
  return "low";
}

function resolveGovernance(params: {
  metadata: Record<string, unknown>;
  tenantId?: string | null;
  workspaceId?: string | null;
  reasonCode: string;
}): GovernanceContext {
  const resolved =
    extractGovernanceContext(params.metadata) ??
    ({
      tenantIdPresent: Boolean(params.tenantId),
      workspaceIdPresent: Boolean(params.workspaceId),
      rbacEvaluated: false,
      entitlementEvaluated: false,
      trustScoreEvaluated: false,
      costGuardEvaluated: false,
      policyDecision: Boolean(params.tenantId) && Boolean(params.workspaceId) ? "allowed" : "denied",
      reasonCode: null,
      trustScore: null,
      trustLevel: undefined,
    } satisfies GovernanceContext);

  if (!resolved.tenantIdPresent || !resolved.workspaceIdPresent) {
    return {
      ...resolved,
      policyDecision: "denied",
      reasonCode: resolved.reasonCode ?? params.reasonCode,
    };
  }

  if (resolved.policyDecision === "needs_review" && params.reasonCode === "GO_READY") {
    return {
      ...resolved,
      policyDecision: "allowed",
    };
  }

  return resolved;
}

export function buildGuardianStructuredOutput(params: {
  agent: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  runId: string;
  runStatus: "success" | "error";
  costCents?: number | null;
  txId?: string | null;
  criticalHash?: string | null;
  metadata: Record<string, unknown>;
  outputs: StepOutput[];
  snapshot?: Snapshot | null;
}) {
  if (params.agent.trim().toLowerCase() !== "guardian") return null;

  const form = extractExecutionInput(params.metadata);
  const route = asString(form.requestType) ?? "guardian.unknown_route";
  const scope = resolveGuardianEvaluationScope(params.metadata);
  const piiStatus = detectPiiStatus(form);
  const checklist =
    scope.kind === "single_route"
      ? extractChecklist(params.outputs)
      : extractStructuredChecklist(params.metadata, scope, params.outputs);
  const reasonCode = determineReasonCode({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    piiStatus,
    checklist,
    scope,
  });
  const guardianDecision = determineDecision(reasonCode);
  const riskLevel = determineRiskLevel({
    metadata: params.metadata,
    route,
    scope,
    piiStatus,
  });
  const evidenceStatus = determineEvidenceStatus(checklist);
  const finopsStatus = determineFinopsStatus(params.costCents, params.snapshot?.usage ?? null);
  const finops = normalizeFinops(params.costCents, params.snapshot?.usage ?? null, params.snapshot?.model ?? null);
  const environment = detectEnvironment(form, params.metadata);
  const governance = resolveGovernance({
    metadata: params.metadata,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    reasonCode,
  });
  const auditTrail = extractAuditTrailSources({
    metadata: params.metadata,
    runId: params.runId,
    txId: params.txId,
    criticalHash: params.criticalHash,
  });

  const report: GuardianReport = {
    route,
    runStatus: params.runStatus,
    guardianDecision,
    evaluationScope: scope.kind,
    activeStepId: scope.activeStepId,
    activeStepTitle: scope.activeStepTitle,
    stageDecision: scope.kind === "single_step" ? guardianDecision : null,
    globalDecision: scope.kind === "single_step" ? "PENDING_OTHER_STEPS" : guardianDecision,
    reasonCode,
    evidenceStatus,
    exportStatus: "valid",
    riskLevel,
    piiStatus,
    finopsStatus,
    summary: buildSummary(guardianDecision, reasonCode, checklist),
    blockingIssues: buildBlockingIssues(reasonCode, checklist),
    checklist: checklist.map((item) => ({
      item: item.item,
      status: item.status,
      expectedEvidence: item.expectedEvidence,
      collectedEvidence: item.collectedEvidence ?? "não coletada",
      sha256: item.sha256,
      blocking: item.blocking,
    })),
    coverageMatrix: buildCoverageMatrix({
      route,
      scope,
      decision: guardianDecision,
      reasonCode,
      checklist,
      metadata: params.metadata,
    }),
    nextSteps: buildNextSteps(reasonCode, checklist),
    finops,
    governance,
    auditTrail: {
      runId: params.runId,
      traceId: params.snapshot?.traceId ?? null,
      receiptId: auditTrail.receiptId,
      verifyUrl: auditTrail.verifyUrl,
      evidenceBundleId: auditTrail.evidenceBundleId,
    },
    environment,
    nextAction: buildNextSteps(reasonCode, checklist)[0] ?? null,
  };

  return report;
}
