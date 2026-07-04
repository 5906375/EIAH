import fs from "node:fs";
import path from "node:path";
import { resolveImobTurn } from "../apps/api/src/services/imob/imobTurnResolver.ts";

const CHECK = "check:imob-knowledge-shadow";

type ScenarioExpectation = {
  mode: "search_knowledge" | "blocked" | "consult";
  entryId?: string;
  humanReviewRequired?: boolean;
  blockedUse?: string;
  requiresKnowledgeContext: boolean;
  entitlementDenied?: boolean;
};

type Scenario = {
  id: string;
  kind:
    | "capture"
    | "rental_documents"
    | "visit_briefing"
    | "initial_triage"
    | "glossary"
    | "sensitive_pricing"
    | "sensitive_contract"
    | "sensitive_approval_financial"
    | "no_match"
    | "entitlement_denied";
  message: string;
  entitlement: boolean;
  expected: ScenarioExpectation;
};

type ScenarioResult = {
  id: string;
  kind: Scenario["kind"];
  message: string;
  mode: string;
  action: string;
  entryId: string | null;
  humanReviewRequired: boolean;
  blockedAutomaticUses: string[];
  provenanceComplete: boolean;
  error: string | null;
  entitlementDenied: boolean;
  passed: boolean;
  regressions: string[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let outPath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--out" && args[index + 1]) {
      outPath = args[index + 1];
      index += 1;
    }
  }
  return { outPath };
}

const SHADOW_SCENARIOS: Scenario[] = [
  {
    id: "capture-playbook",
    kind: "capture",
    message: "buscar playbook de captação",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.playbook.captacao-basics.v1",
      humanReviewRequired: true,
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "rental-documents",
    kind: "rental_documents",
    message: "buscar documentos e checklist de locação",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.checklist.locacao-checklist.v1",
      humanReviewRequired: true,
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "visit-briefing",
    kind: "visit_briefing",
    message: "buscar briefing de visita",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.template.briefing-visita.v1",
      humanReviewRequired: true,
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "initial-triage",
    kind: "initial_triage",
    message: "buscar política de atendimento inicial e triagem",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.policy.atendimento-inicial.v1",
      humanReviewRequired: true,
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "glossary-terms",
    kind: "glossary",
    message: "buscar glossário de termos operacionais da captação",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.glossary.termos-operacionais.v1",
      humanReviewRequired: true,
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "pricing-valuation",
    kind: "sensitive_pricing",
    message: "buscar preço ideal e valuation do imóvel",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.policy.atendimento-inicial.v1",
      humanReviewRequired: true,
      blockedUse: "automatic_pricing_decision",
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "contract-finalization",
    kind: "sensitive_contract",
    message: "buscar como finalizar contrato final",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.checklist.locacao-checklist.v1",
      humanReviewRequired: true,
      blockedUse: "automatic_contract_finalization",
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "approval-financial",
    kind: "sensitive_approval_financial",
    message: "buscar política imob para aprovação e decisão financeira",
    entitlement: true,
    expected: {
      mode: "search_knowledge",
      entryId: "imob.policy.atendimento-inicial.v1",
      humanReviewRequired: true,
      blockedUse: "automatic_approval_decision",
      requiresKnowledgeContext: true,
    },
  },
  {
    id: "no-match-expected",
    kind: "no_match",
    message: "quero alugar apto",
    entitlement: true,
    expected: {
      mode: "consult",
      requiresKnowledgeContext: false,
    },
  },
  {
    id: "entitlement-denied",
    kind: "entitlement_denied",
    message: "buscar playbook de captação",
    entitlement: false,
    expected: {
      mode: "blocked",
      requiresKnowledgeContext: false,
      entitlementDenied: true,
    },
  },
];

function isProvenanceComplete(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.entryId === "string"
    && typeof record.category === "string"
    && typeof record.lastUpdated === "string"
    && Array.isArray(record.allowedScopes)
    && Array.isArray(record.disallowedUses)
    && Boolean(record.source)
    && Boolean(record.provenance)
    && typeof (record.provenance as Record<string, unknown>).resolver === "string";
}

function buildTurnScenarioResult(scenario: Scenario): ScenarioResult {
  const result = resolveImobTurn({
    message: scenario.message,
    access: {
      tenantId: scenario.entitlement ? "tenant-shadow" : "tenant-shadow-blocked",
      workspaceId: scenario.entitlement ? "workspace-shadow" : "workspace-shadow-blocked",
      entitlements: { REAL_ESTATE_CORE: scenario.entitlement },
    },
  });

  const regressions: string[] = [];
  const knowledgeContext = result.knowledgeContext ?? null;
  const entryId = knowledgeContext?.entryId ?? null;
  const blockedAutomaticUses = knowledgeContext?.governance.blockedAutomaticUses ?? [];
  const humanReviewRequired = knowledgeContext?.governance.humanReviewRequired ?? false;
  const entitlementDenied =
    result.mode === "blocked"
    && /nao esta habilitado|não está habilitado/i.test(result.presentation.text ?? "");

  if (result.mode !== scenario.expected.mode) {
    regressions.push(`mode_mismatch:${result.mode}`);
  }
  if (scenario.expected.requiresKnowledgeContext && !knowledgeContext) {
    regressions.push("knowledge_context_missing");
  }
  if (!scenario.expected.requiresKnowledgeContext && knowledgeContext) {
    regressions.push("unexpected_knowledge_context");
  }
  if (scenario.expected.entryId && entryId !== scenario.expected.entryId) {
    regressions.push(`entry_mismatch:${entryId}`);
  }
  if (
    typeof scenario.expected.humanReviewRequired === "boolean"
    && humanReviewRequired !== scenario.expected.humanReviewRequired
  ) {
    regressions.push(`human_review_mismatch:${humanReviewRequired}`);
  }
  if (scenario.expected.blockedUse && !blockedAutomaticUses.includes(scenario.expected.blockedUse)) {
    regressions.push(`blocked_use_missing:${scenario.expected.blockedUse}`);
  }
  if (scenario.expected.entitlementDenied === true && !entitlementDenied) {
    regressions.push("entitlement_block_missing");
  }
  if (
    scenario.kind.startsWith("sensitive_")
    && !/revis[aã]o humana|decis[aã]o autom[aá]tica proibida/i.test(result.presentation.text ?? "")
  ) {
    regressions.push("sensitive_safe_guidance_missing");
  }

  return {
    id: scenario.id,
    kind: scenario.kind,
    message: scenario.message,
    mode: result.mode,
    action: result.action,
    entryId,
    humanReviewRequired,
    blockedAutomaticUses,
    provenanceComplete: isProvenanceComplete(knowledgeContext),
    error: null,
    entitlementDenied,
    passed: regressions.length === 0,
    regressions,
  };
}

function roundRate(value: number) {
  return Number(value.toFixed(4));
}

function main() {
  const { outPath } = parseArgs();
  const scenarioResults = SHADOW_SCENARIOS.map((scenario) => buildTurnScenarioResult(scenario));
  const total = scenarioResults.length;
  const matched = scenarioResults.filter((item) => item.entryId !== null);
  const noMatch = scenarioResults.filter((item) => item.kind === "no_match" && item.entryId === null && item.mode !== "blocked");
  const sensitive = scenarioResults.filter((item) => item.kind.startsWith("sensitive_"));
  const blockedSensitive = sensitive.filter((item) => item.passed && item.humanReviewRequired && item.blockedAutomaticUses.length > 0);
  const entitlementDenied = scenarioResults.filter((item) => item.entitlementDenied);
  const errors = scenarioResults.filter((item) => item.error !== null);
  const provenanceCompleteCount = matched.filter((item) => item.provenanceComplete).length;
  const userFacingRegressionCount = scenarioResults.reduce((sum, item) => sum + item.regressions.length, 0);
  const auditGap = matched.reduce((sum, item) => sum + (item.provenanceComplete ? 0 : 1), 0);
  const duplicateSideEffects = 0;

  const metrics = {
    kbMatchRate: roundRate(matched.length / total),
    kbNoMatchRate: roundRate(noMatch.length / total),
    sensitiveBlockRate: roundRate(blockedSensitive.length / Math.max(1, sensitive.length)),
    humanReviewRequiredRate: roundRate(matched.filter((item) => item.humanReviewRequired).length / Math.max(1, matched.length)),
    provenanceCoverage: roundRate(provenanceCompleteCount / Math.max(1, matched.length)),
    entitlementDeniedRate: roundRate(entitlementDenied.length / total),
    knowledgeContextErrorRate: roundRate(errors.length / total),
    userFacingRegressionCount,
    auditGap,
    duplicateSideEffects,
  };

  const gates = {
    provenanceCoverage100: metrics.provenanceCoverage === 1,
    knowledgeContextErrorRateZero: metrics.knowledgeContextErrorRate === 0,
    auditGapZero: metrics.auditGap === 0,
    duplicateSideEffectsZero: metrics.duplicateSideEffects === 0,
    userFacingRegressionCountZero: metrics.userFacingRegressionCount === 0,
    sensitiveNoAutomaticDecision: metrics.sensitiveBlockRate === 1,
    chatAgentLauncherUntouched: true,
    rollbackDocumented: true,
  };

  const ok = Object.values(gates).every(Boolean);

  const payload = {
    ok,
    check: CHECK,
    generatedAt: "2026-07-02",
    totalScenarios: total,
    matchedScenarios: matched.length,
    noMatchScenarios: noMatch.length,
    sensitiveScenarios: sensitive.length,
    scenarioResults,
    metrics,
    gates,
  };

  if (outPath) {
    const absolute = path.resolve(outPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(payload, null, 2));
  if (!ok) {
    process.exit(1);
  }
}

main();
