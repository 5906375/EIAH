import {
  evaluateAllImobPilotPromotionRuntime,
  type ImobPilotPromotionNextOperationalAction,
  type ImobPilotPromotionRuntimeDecision,
} from "./imobPilotPromotionRuntime";
import type {
  ImobPromotionReadinessLabel,
  ImobPromotionReviewFlowCard,
  ImobPromotionReviewSurfaceSnapshot,
} from "./imobConversationContract";
import type { ImobPilotFlowHistoryEntry } from "./imobPilotFlowHistory";
import type { ImobPilotFlowRegistryEntry } from "./imobPilotFlowRegistry";
import type { ImobPilotFlowType } from "./imobPilotFlowRuntime";
import type { ImobPilotFlowPromotionThresholds } from "./imobPilotFlowPromotion";

const FLOW_PRIORITY: ImobPilotFlowType[] = [
  "assisted_calendar_flow",
  "assisted_listing_flow",
  "assisted_reengagement_flow",
  "shadow_capture_enrichment_flow",
];

function mapReadinessLabel(action: ImobPilotPromotionNextOperationalAction): ImobPromotionReadinessLabel {
  switch (action) {
    case "promote_to_pilot":
    case "maintain_pilot":
      return "ready";
    case "keep_shadow":
      return "shadow";
    case "hold_rollout":
      return "hold";
    case "regress_to_shadow":
      return "regress";
  }
}

function describeBusinessImpact(flowType: ImobPilotFlowType) {
  switch (flowType) {
    case "assisted_calendar_flow":
      return "Impacta diretamente a experiência do cliente final e a conversão operacional da visita.";
    case "assisted_listing_flow":
      return "Impacta diretamente a velocidade de ativação comercial do estoque e a oferta disponível ao cliente final.";
    case "assisted_reengagement_flow":
      return "Impacta a retomada comercial de leads e proprietários, com sensibilidade alta de consentimento e política.";
    case "shadow_capture_enrichment_flow":
      return "Impacta expansão de base e inteligência comercial, com risco alto de proveniência, privacidade e reconciliação.";
  }
}

function describeOperatorNote(action: ImobPilotPromotionNextOperationalAction) {
  switch (action) {
    case "promote_to_pilot":
      return "Abrir piloto controlado com monitoramento de KPIs e revisão diária.";
    case "maintain_pilot":
      return "Manter o piloto ativo e observar estabilidade operacional antes de ampliar escopo.";
    case "keep_shadow":
      return "Manter observação em shadow e coletar mais evidência antes de avançar.";
    case "hold_rollout":
      return "Corrigir bloqueios operacionais e de governança antes de qualquer promoção.";
    case "regress_to_shadow":
      return "Reduzir rollout imediatamente e revisar governança, duplicidade e estabilidade do fluxo.";
  }
}

function describeRiskSummary(reasonCodes: string[]) {
  if (reasonCodes.length === 0) return "Sem bloqueios relevantes no momento para revisão operacional.";
  const labels: Record<string, string> = {
    flow_not_found: "flow ainda não governado corretamente",
    insufficient_completed_runs: "amostra operacional ainda insuficiente para promoção",
    evidence_below_threshold: "evidência operacional abaixo do mínimo esperado",
    block_rate_above_threshold: "taxa de bloqueio acima do limite seguro",
    duplicate_rate_above_threshold: "taxa de duplicidade acima do limite seguro",
    ownership_mismatch: "preservação de ownership do IMOB não está íntegra",
  };
  return reasonCodes.map((code) => labels[code] ?? code).join("; ");
}

function buildSummary(flows: ImobPromotionReviewFlowCard[]) {
  const ready = flows.filter((item) => item.readinessLabel === "ready");
  const shadow = flows.filter((item) => item.readinessLabel === "shadow");
  const hold = flows.filter((item) => item.readinessLabel === "hold");
  const regress = flows.filter((item) => item.readinessLabel === "regress");

  const names: Record<ImobPilotFlowType, string> = {
    assisted_calendar_flow: "agenda",
    assisted_listing_flow: "publicação",
    assisted_reengagement_flow: "retomada",
    shadow_capture_enrichment_flow: "captação/enrichment",
  };

  const readyNames = ready.map((item) => names[item.flowType]);
  const shadowNames = shadow.map((item) => names[item.flowType]);
  const holdNames = hold.map((item) => names[item.flowType]);
  const regressNames = regress.map((item) => names[item.flowType]);

  const parts = [
    readyNames.length > 0 ? `${readyNames.join(" e ")} têm prontidão para piloto controlado` : null,
    shadowNames.length > 0 ? `${shadowNames.join(" e ")} seguem em observação shadow` : null,
    holdNames.length > 0 ? `${holdNames.join(" e ")} exigem hold por governança ou estabilidade` : null,
    regressNames.length > 0 ? `${regressNames.join(" e ")} pedem regressão para shadow` : null,
  ].filter(Boolean);

  if (parts.length === 0) return "Nenhum flow disponível para revisão operacional no momento.";
  return `${parts.join(". ")}.`;
}

export function buildImobPromotionReviewSurface(params: {
  history: ImobPilotFlowHistoryEntry[];
  thresholdsByFlow?: Partial<Record<ImobPilotFlowType, Partial<ImobPilotFlowPromotionThresholds>>>;
  registryEntriesByFlow?: Partial<Record<ImobPilotFlowType, ImobPilotFlowRegistryEntry>>;
  generatedAt?: string | null;
}) {
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const decisions = evaluateAllImobPilotPromotionRuntime({
    history: params.history,
    thresholdsByFlow: params.thresholdsByFlow,
    registryEntriesByFlow: params.registryEntriesByFlow,
    generatedAt,
  });

  const flows = decisions
    .sort((left, right) => FLOW_PRIORITY.indexOf(left.flowType) - FLOW_PRIORITY.indexOf(right.flowType))
    .map((decision) => ({
      flowType: decision.flowType,
      currentStage: decision.currentStage,
      recommendedStage: decision.recommendedStage,
      eligible: decision.eligible,
      nextOperationalAction: decision.nextOperationalAction,
      reasonCodes: [...decision.reasonCodes],
      metrics: decision.metrics,
      readinessLabel: mapReadinessLabel(decision.nextOperationalAction),
      evidenceRefs: decision.evidenceRefs ? [...decision.evidenceRefs] : undefined,
      businessImpact: describeBusinessImpact(decision.flowType),
      operatorNote: describeOperatorNote(decision.nextOperationalAction),
      riskSummary: describeRiskSummary(decision.reasonCodes),
    })) satisfies ImobPromotionReviewFlowCard[];

  return {
    generatedAt,
    visibleAgentId: "IMOB",
    summary: buildSummary(flows),
    flows,
    nextOperationalActions: flows.map((item) => item.operatorNote),
  } satisfies ImobPromotionReviewSurfaceSnapshot;
}
