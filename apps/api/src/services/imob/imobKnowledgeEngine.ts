import {
  ImobKnowledgeBaseLoaderError,
  loadImobKnowledgeBase,
  type ImobKnowledgeAllowedScope,
  type ImobKnowledgeCategory,
  type ImobKnowledgeEntry,
  type ImobKnowledgeRiskLevel,
  type ImobKnowledgeSourceKind,
} from "./imobKnowledgeBaseLoader";
import { normalizeImobText } from "./imobConversationState";

export type ImobKnowledgeGovernedIntent =
  | "capture"
  | "rental_documents"
  | "visit_briefing"
  | "initial_triage"
  | "glossary";

export type ImobKnowledgeDecisionMode =
  | "shadow_context"
  | "human_review_required";

export type ImobKnowledgeSensitivity =
  | "pricing"
  | "valuation"
  | "contract_finalization"
  | "approval"
  | "financial_decision";

export type ImobKnowledgeContext = {
  shadowMode: true;
  mode: ImobKnowledgeDecisionMode;
  entryId: string;
  category: ImobKnowledgeCategory;
  riskLevel: ImobKnowledgeRiskLevel;
  requiresHumanReview: boolean;
  allowedScopes: ImobKnowledgeAllowedScope[];
  disallowedUses: string[];
  source: {
    kind: ImobKnowledgeSourceKind;
    ref: string;
    authority: "primary" | "secondary" | "advisory";
  };
  lastUpdated: string;
  provenance: {
    resolver: "imob_kb_engine.v1";
    strategy: "deterministic_intent_map";
    kbId: string;
    manifestVersion: string;
    manifestPath: string;
    loadedAt: string;
    matchedIntent: ImobKnowledgeGovernedIntent;
    matchedSignals: string[];
    entrySource: {
      kind: ImobKnowledgeSourceKind;
      ref: string;
      authority: "primary" | "secondary" | "advisory";
    };
  };
  governance: {
    humanReviewRequired: boolean;
    blockedAutomaticUses: string[];
    sensitiveTopics: ImobKnowledgeSensitivity[];
    safeGuidance: string | null;
  };
};

export class ImobKnowledgeEngineError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ImobKnowledgeEngineError";
    this.code = code;
    this.details = details;
  }
}

type SignalMatch = {
  intent: ImobKnowledgeGovernedIntent;
  signals: string[];
};

const ENTRY_BY_INTENT: Record<ImobKnowledgeGovernedIntent, string> = {
  capture: "imob.playbook.captacao-basics.v1",
  rental_documents: "imob.checklist.locacao-checklist.v1",
  visit_briefing: "imob.template.briefing-visita.v1",
  initial_triage: "imob.policy.atendimento-inicial.v1",
  glossary: "imob.glossary.termos-operacionais.v1",
};

const SENSITIVE_SIGNAL_MAP: Array<{
  topic: ImobKnowledgeSensitivity;
  signals: string[];
  blockedUses: string[];
}> = [
  {
    topic: "pricing",
    signals: ["preco", "preço", "precificar", "quanto cobrar", "quanto anunciar", "valor ideal"],
    blockedUses: ["automatic_price_decision", "automatic_pricing_decision"],
  },
  {
    topic: "valuation",
    signals: ["valuation", "avaliacao", "avaliação", "avaliar imovel", "avaliar imóvel"],
    blockedUses: ["automatic_price_decision", "automatic_pricing_decision"],
  },
  {
    topic: "contract_finalization",
    signals: ["contrato final", "finalizar contrato", "clausula final", "cláusula final", "assinatura final"],
    blockedUses: ["automatic_contract_finalization", "automatic_contract_decision"],
  },
  {
    topic: "approval",
    signals: ["aprovar", "aprovação", "aprovacao", "pode aprovar", "decidir aprovacao"],
    blockedUses: ["automatic_approval_decision", "automatic_document_approval", "automatic_visit_approval"],
  },
  {
    topic: "financial_decision",
    signals: ["decisao financeira", "decisão financeira", "financeira final", "repasse final", "comissao final", "comissão final"],
    blockedUses: ["automatic_approval_decision", "automatic_price_decision", "automatic_pricing_decision"],
  },
];

function includesAny(text: string, candidates: string[]) {
  return candidates.filter((candidate) => text.includes(normalizeImobText(candidate)));
}

function matchGovernedIntent(normalizedMessage: string): SignalMatch {
  const glossarySignals = includesAny(normalizedMessage, [
    "glossario",
    "glossário",
    "termos",
    "o que significa",
    "significado",
    "conceito de",
  ]);
  if (glossarySignals.length > 0) {
    return { intent: "glossary", signals: glossarySignals };
  }

  const visitSignals = includesAny(normalizedMessage, [
    "visita",
    "briefing",
    "agendar visita",
    "tour",
    "roteiro da visita",
  ]);
  if (visitSignals.length > 0) {
    return { intent: "visit_briefing", signals: visitSignals };
  }

  const rentalDocumentSignals = includesAny(normalizedMessage, [
    "locacao",
    "locação",
    "aluguel",
    "documentos",
    "documentacao",
    "documentação",
    "contrato",
    "garantia",
    "checklist",
  ]);
  if (rentalDocumentSignals.length > 0) {
    return { intent: "rental_documents", signals: rentalDocumentSignals };
  }

  const triageSignals = includesAny(normalizedMessage, [
    "atendimento inicial",
    "triagem",
    "primeiro atendimento",
    "como atender",
    "onboarding",
    "politica",
    "política",
  ]);
  if (triageSignals.length > 0) {
    return { intent: "initial_triage", signals: triageSignals };
  }

  const captureSignals = includesAny(normalizedMessage, [
    "captacao",
    "captação",
    "captar",
    "proprietario",
    "proprietário",
    "playbook",
    "imovel",
    "imóvel",
  ]);
  if (captureSignals.length > 0) {
    return { intent: "capture", signals: captureSignals };
  }

  return { intent: "initial_triage", signals: ["fallback_policy"] };
}

function collectSensitiveTopics(normalizedMessage: string) {
  const topics: ImobKnowledgeSensitivity[] = [];
  const blockedUses = new Set<string>();

  for (const candidate of SENSITIVE_SIGNAL_MAP) {
    if (includesAny(normalizedMessage, candidate.signals).length === 0) continue;
    topics.push(candidate.topic);
    for (const blockedUse of candidate.blockedUses) {
      blockedUses.add(blockedUse);
    }
  }

  return {
    topics,
    blockedUses: [...blockedUses].sort(),
  };
}

function findEntry(entries: ImobKnowledgeEntry[], entryId: string) {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) {
    throw new ImobKnowledgeEngineError("IMOB_KB_ENTRY_NOT_FOUND", "Knowledge base entry not found for governed intent", {
      entryId,
    });
  }
  return entry;
}

function buildSafeGuidance(topics: ImobKnowledgeSensitivity[]) {
  if (topics.length === 0) return null;

  return [
    "Consulta tratada apenas como orientação documental do acervo IMOB.",
    "Preço, valuation, aprovação, decisão financeira e finalização contratual exigem revisão humana.",
  ].join(" ");
}

export function resolveImobKnowledgeContext(options: {
  message: string;
  rootDir?: string;
  manifestPath?: string;
}): ImobKnowledgeContext {
  try {
    const result = loadImobKnowledgeBase({
      rootDir: options.rootDir,
      manifestPath: options.manifestPath,
    });
    const normalizedMessage = normalizeImobText(options.message);
    const intentMatch = matchGovernedIntent(normalizedMessage);
    const sensitivity = collectSensitiveTopics(normalizedMessage);
    const entryId =
      sensitivity.topics.length > 0 && intentMatch.intent === "capture"
        ? ENTRY_BY_INTENT.initial_triage
        : ENTRY_BY_INTENT[intentMatch.intent];
    const entry = findEntry(result.entries, entryId);
    const blockedAutomaticUses = entry.disallowedUses.filter((item) => sensitivity.blockedUses.includes(item));
    const humanReviewRequired = entry.requiresHumanReview || blockedAutomaticUses.length > 0;

    return {
      shadowMode: true,
      mode: humanReviewRequired ? "human_review_required" : "shadow_context",
      entryId: entry.id,
      category: entry.category,
      riskLevel: entry.riskLevel,
      requiresHumanReview: humanReviewRequired,
      allowedScopes: [...entry.allowedScopes],
      disallowedUses: [...entry.disallowedUses],
      source: { ...entry.source },
      lastUpdated: entry.lastUpdated,
      provenance: {
        resolver: "imob_kb_engine.v1",
        strategy: "deterministic_intent_map",
        kbId: result.manifest.kbId,
        manifestVersion: result.manifest.version,
        manifestPath: result.paths.manifestPath,
        loadedAt: result.loadedAt,
        matchedIntent: intentMatch.intent,
        matchedSignals: [...intentMatch.signals],
        entrySource: { ...entry.source },
      },
      governance: {
        humanReviewRequired,
        blockedAutomaticUses,
        sensitiveTopics: [...sensitivity.topics],
        safeGuidance: buildSafeGuidance(sensitivity.topics),
      },
    };
  } catch (error) {
    if (error instanceof ImobKnowledgeBaseLoaderError) {
      throw new ImobKnowledgeEngineError("IMOB_KB_UNAVAILABLE", "IMOB knowledge base is unavailable", {
        causeCode: error.code,
        causeDetails: error.details ?? null,
      });
    }
    if (error instanceof ImobKnowledgeEngineError) {
      throw error;
    }
    throw new ImobKnowledgeEngineError("IMOB_KB_ENGINE_FAILED", "Unexpected IMOB knowledge engine failure", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
