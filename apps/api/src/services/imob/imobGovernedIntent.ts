import { type ImobIntent } from "./imobConversationContract";
import { normalizeImobText } from "./imobConversationState";

export type ImobGovernedIntentSignal = {
  intent: ImobIntent;
  score: number;
  reason: string;
};

export type ImobGovernedIntentClassification = {
  version: "imob.intent.v1";
  normalized: string;
  primaryIntent: ImobIntent;
  candidates: ImobIntentSignal[];
  ambiguous: boolean;
};

function hasAny(text: string, candidates: string[]) {
  return candidates.some((candidate) => text.includes(candidate));
}

export function isImobGovernedRulesConfigurationRequest(message: string) {
  const text = normalizeImobText(message);
  const hasRulesSignal = hasAny(text, [
    "regras",
    "regra",
    "checkin",
    "check in",
    "checkout",
    "check out",
    "hospedes",
    "hóspedes",
    "hospedagem",
  ]);
  const hasPropertyContext = hasAny(text, [
    "imovel",
    "imóvel",
    "temporada",
    "diaria",
    "diária",
    "locacao",
    "locação",
    "aluguel",
  ]);
  return hasRulesSignal && hasPropertyContext;
}

export function isImobGovernedLeadToPropertyLinkRequest(message: string) {
  const text = normalizeImobText(message);
  const hasLeadContext = hasAny(text, ["lead", "cliente", "comprador", "locatario"]);
  const hasLinkVerb = hasAny(text, ["vincular", "associar", "conectar"]);
  const hasPropertyContext = hasAny(text, ["imovel", "imóvel", "apartamento", "casa"]);
  return hasLeadContext && hasLinkVerb && hasPropertyContext;
}

export function isImobGovernedDocumentCollectionRequest(message: string) {
  const text = normalizeImobText(message);
  const hasCollectionVerb = hasAny(text, ["coletar", "coleta", "receber", "enviar", "subir", "anexar"]);
  const hasDocumentSubject = hasAny(text, ["document", "matricula", "matrícula", "contrato", "comprovante", "certidao", "certidão"]);
  return hasCollectionVerb && hasDocumentSubject;
}

function collectIntentSignals(message: string): ImobGovernedIntentSignal[] {
  const text = normalizeImobText(message);
  const signals: ImobIntentSignal[] = [];

  if (isImobGovernedLeadToPropertyLinkRequest(message)) {
    signals.push({ intent: "capture", score: 5, reason: "lead_property_link" });
  }
  if (isImobGovernedRulesConfigurationRequest(message)) {
    signals.push({ intent: "rules", score: 5, reason: "rules_configuration" });
  }
  if (hasAny(text, ["comissao", "comissão", "repasse", "sinal"])) {
    signals.push({ intent: "commission", score: 4, reason: "commission_terms" });
  }
  if (hasAny(text, ["deal", "negocio", "negócio", "review do negocio", "review do negócio", "revisar negocio", "revisar negócio"])) {
    signals.push({ intent: "deal", score: 4, reason: "deal_terms" });
  }
  if (hasAny(text, ["contrato", "assinatura", "minuta"])) {
    signals.push({ intent: "contract", score: 4, reason: "contract_terms" });
  }
  if (isImobGovernedDocumentCollectionRequest(message)) {
    signals.push({ intent: "documents", score: 4, reason: "document_collection" });
  }
  if (hasAny(text, ["proposta", "oferta", "negocia"])) {
    signals.push({ intent: "proposal", score: 4, reason: "proposal_terms" });
  }
  if (hasAny(text, ["visita", "agendar", "agenda", "tour"])) {
    signals.push({ intent: "visit", score: 4, reason: "visit_terms" });
  }
  if (hasAny(text, ["lead", "triagem", "qualificar cliente", "qualificar lead"])) {
    signals.push({ intent: "lead", score: 4, reason: "lead_terms" });
  }
  if (hasAny(text, ["publicar", "anuncio", "anúncio", "listing", "portal"])) {
    signals.push({ intent: "listing", score: 4, reason: "listing_terms" });
  }
  if (hasAny(text, ["cadastrar", "capta", "propriet", "imovel", "imóvel", "vender"])) {
    signals.push({ intent: "capture", score: 3, reason: "capture_terms" });
  }
  if (hasAny(text, ["alugar", "loca", "procur", "quartos"])) {
    signals.push({ intent: "match", score: 3, reason: "match_terms" });
  }

  return signals;
}

export function classifyImobGovernedIntent(message: string): ImobGovernedIntentClassification {
  const normalized = normalizeImobText(message);
  const aggregated = new Map<ImobIntent, ImobIntentSignal>();

  for (const signal of collectIntentSignals(message)) {
    const existing = aggregated.get(signal.intent);
    if (!existing || signal.score > existing.score) {
      aggregated.set(signal.intent, signal);
      continue;
    }
    aggregated.set(signal.intent, {
      intent: existing.intent,
      score: existing.score + Math.max(1, signal.score - 1),
      reason: `${existing.reason},${signal.reason}`,
    });
  }

  const candidates = [...aggregated.values()].sort((left, right) => right.score - left.score);
  const primaryIntent = candidates[0]?.intent ?? "adjustment";
  const ambiguous = Boolean(
    candidates[0]
      && candidates[1]
      && candidates[0].score >= 4
      && candidates[1].score >= 4
      && Math.abs(candidates[0].score - candidates[1].score) <= 1,
  );

  return {
    version: "imob.intent.v1",
    normalized,
    primaryIntent,
    candidates,
    ambiguous,
  };
}

export function buildImobGovernedIntentClarificationChoices(intents: ImobIntent[]) {
  const catalog: Record<ImobIntent, { label: string; nextMessage: string }> = {
    capture: { label: "Captação", nextMessage: "cadastrar proprietário" },
    lead: { label: "Lead", nextMessage: "qualificar lead" },
    visit: { label: "Visita", nextMessage: "agendar visita" },
    documents: { label: "Documentos", nextMessage: "revisar documentos" },
    proposal: { label: "Proposta", nextMessage: "abrir proposta" },
    contract: { label: "Contrato", nextMessage: "preparar contrato" },
    deal: { label: "Negociação", nextMessage: "revisar negociação" },
    listing: { label: "Anúncio", nextMessage: "publicar imóvel" },
    rules: { label: "Regras", nextMessage: "configurar regras da temporada" },
    commission: { label: "Comissão", nextMessage: "fechar comissão" },
    match: { label: "Busca", nextMessage: "buscar imóvel" },
    adjustment: { label: "Ajuste", nextMessage: "ajustar cadastro" },
  };

  return intents
    .map((intent) => ({ intent, ...catalog[intent] }))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.intent === item.intent) === index)
    .slice(0, 3);
}
