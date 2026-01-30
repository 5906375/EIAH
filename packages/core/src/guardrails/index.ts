export type GuardrailAction = "allow" | "observe" | "block";
export type CognitiveCognitiveGuardrailSeverity = "info" | "warn" | "error" | "critical";

export type GuardrailFinding = {
  code: string;
  action: GuardrailAction;
  severity: CognitiveCognitiveGuardrailSeverity;
  message: string;
  detail?: Record<string, unknown>;
};

export type GuardrailReport = {
  action: GuardrailAction;
  maxSeverity: CognitiveCognitiveGuardrailSeverity;
  findings: GuardrailFinding[];
};

export type GuardrailContext = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  agent: string;
  prompt: string;
  outputText?: string | null;
  rawResponse?: unknown;
  plan?: Array<{ action?: string | null }>;
  outputs?: Record<string, unknown>;
};

export type Guardrail = {
  name: string;
  evaluate: (context: GuardrailContext) => Promise<GuardrailFinding | null> | GuardrailFinding | null;
};

const severityRank: Record<CognitiveCognitiveGuardrailSeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
  critical: 3,
};

const actionRank: Record<GuardrailAction, number> = {
  allow: 0,
  observe: 1,
  block: 2,
};

function maxSeverity(a: CognitiveCognitiveGuardrailSeverity, b: CognitiveCognitiveGuardrailSeverity) {
  return severityRank[a] >= severityRank[b] ? a : b;
}

function maxAction(a: GuardrailAction, b: GuardrailAction) {
  return actionRank[a] >= actionRank[b] ? a : b;
}

export async function runGuardrails(context: GuardrailContext, guardrails: Guardrail[]): Promise<GuardrailReport> {
  const findings: GuardrailFinding[] = [];
  let action: GuardrailAction = "allow";
  let severity: CognitiveCognitiveGuardrailSeverity = "info";

  for (const guardrail of guardrails) {
    const finding = await guardrail.evaluate(context);
    if (!finding) continue;
    findings.push(finding);
    action = maxAction(action, finding.action);
    severity = maxSeverity(severity, finding.severity);
  }

  return { action, maxSeverity: severity, findings };
}

function textIncludesAny(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function parseJsonLoose(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function hasEvidence(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const candidates = ["evidence", "sources", "citations", "refs", "referencias", "referências"];
  for (const key of candidates) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === "string" && value.trim().length > 0) return true;
  }
  return false;
}

function countPlannedActions(plan?: Array<{ action?: string | null }>) {
  if (!plan) return 0;
  return plan.filter((step) => typeof step.action === "string" && step.action.trim().length > 0).length;
}

export function defaultRunGuardrails(): Guardrail[] {
  return [placeholderTemplateGuardrail(), evidenceRequiredGuardrail(), toolUseRequiredGuardrail()];
}

export function placeholderTemplateGuardrail(): Guardrail {
  const patterns = ["as an ai language model", "[insert", "<placeholder>", "lorem ipsum"];
  return {
    name: "placeholder_template",
    evaluate: (context) => {
      const text = (context.outputText ?? "").trim();
      if (!text) return null;
      const lower = text.toLowerCase();
      const hit = patterns.find((pattern) => lower.includes(pattern));
      if (!hit) return null;
      return {
        code: "output.placeholder_template",
        action: "block",
        severity: "error",
        message: `Output contains placeholder/template content: "${hit}"`,
      };
    },
  };
}

export function evidenceRequiredGuardrail(): Guardrail {
  const highRiskKeywords = [
    "payment",
    "transfer",
    "senha",
    "password",
    "secret",
    "pii",
    "cpf",
    "cnpj",
    "wallet",
    "txid",
  ];
  return {
    name: "evidence_required",
    evaluate: (context) => {
      const text = (context.outputText ?? "").trim();
      if (!text) return null;

      if (!textIncludesAny(text, highRiskKeywords)) return null;

      const json = parseJsonLoose(text);
      const evidenceInJson = json ? hasEvidence(json) : false;
      const evidenceInText = textIncludesAny(text, ["fonte:", "fontes:", "source:", "sources:", "citação", "citacao"]);

      if (evidenceInJson || evidenceInText) return null;

      return {
        code: "output.evidence_missing",
        action: "block",
        severity: "error",
        message: "High-risk content detected but no evidence/citations were provided.",
        detail: { highRiskKeywords },
      };
    },
  };
}

export function toolUseRequiredGuardrail(): Guardrail {
  const toolRequiredKeywords = [
    "consultei",
    "pesquisei",
    "busquei",
    "on-chain",
    "blockchain",
    "api",
    "query",
    "consulte",
  ];
  return {
    name: "tool_use_required",
    evaluate: (context) => {
      const text = (context.outputText ?? "").trim();
      if (!text) return null;

      if (!textIncludesAny(text, toolRequiredKeywords)) return null;

      const actionsUsed = countPlannedActions(context.plan);
      if (actionsUsed > 0) return null;

      return {
        code: "output.tool_use_required",
        action: "block",
        severity: "warn",
        message: "Output implies tool usage, but no actions/tools were executed in the plan.",
        detail: { actionsUsed, toolRequiredKeywords },
      };
    },
  };
}
