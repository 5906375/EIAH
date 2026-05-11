import type { PrismaClient } from "@repo/db";
import { matchImobConversationalIntents } from "../imobIntentCatalog";
import { resolveImobBackingSpecialists } from "../imobSpecialistBridge";
import type {
  ImobPreparedFollowUp,
  ImobCrmCanonicalCase,
  ImobCrmCaseContext,
  ImobCrmConversationState,
  ImobCrmOwnerSummary,
  ImobCrmPropertySummary,
  ImobCrmRecommendedAction,
  ImobCrmTurnPresentation,
} from "./imobCrmAgentContract";
import { buildImobCrmBusinessReadHelpers } from "./imobCrmBusinessRead";
import { buildImobCrmCaseContextFromRecord } from "./imobCrmCaseContext";
import { buildImobCrmLegacyCanonicalCase } from "./imobCrmLegacyCanonical";
import { IMOB_CRM_PROPERTY_GOAL_OPTIONS, normalizeImobCrmPropertyGoal } from "./imobCrmPropertyGoals";
import {
  getImobCrmPropertyTypeLabel,
  IMOB_CRM_PROPERTY_TYPE_OPTIONS,
  normalizeImobCrmPropertyType,
} from "./imobCrmPropertyTypes";

// Legacy compatibility implementation.
// The active IMOB_CRM runtime now lives in turn-engine, business-read and operational modules.
// This module is kept only as a first-pass fallback for older operational behaviors wired from imob.ts.

type ResolverParams = {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  message: string;
  caseId?: string | null;
  threadState: ImobCrmConversationState | null | undefined;
};

type BusinessReadIntent = "pipeline_status" | "blocked_run_resolution" | "next_best_action";
type ResolverCaseRecord = {
  id: string;
  flow?: string | null;
  stage?: string | null;
  status?: string | null;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  threadId?: string | null;
  updatedAt?: { toISOString?: () => string } | null;
  lead?: ImobCrmCaseContext["lead"];
  property?: {
    id?: string;
    propertyType?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    goal?: string | null;
    askingPriceCents?: number | null;
    owner?: { id?: string; name?: string | null } | null;
  } | null;
  owner?: ImobCrmCaseContext["owner"];
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeImobCrmText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createEmptyThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
    operational: null,
  } as ImobCrmConversationState;
}

function mapFlowToJourneyType(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "property_capture";
    case "lead.qualify":
      return "lead_qualification";
    case "visit.schedule":
      return "visit_follow_up";
    case "documents.collect":
      return "documentation";
    case "proposal.create":
      return "proposal";
    case "deal.review":
      return "negotiation";
    case "contract.prepare":
      return "contract";
    case "commission.settle":
      return "commission";
    case "rules.configure":
      return "temporada_rules";
    default:
      return "operations";
  }
}

function mapFlowToCommercialGoal(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "captacao";
    case "lead.qualify":
      return "qualificacao";
    case "visit.schedule":
      return "visita";
    case "documents.collect":
      return "documentacao";
    case "proposal.create":
      return "proposta";
    case "deal.review":
      return "negociacao";
    case "contract.prepare":
      return "contrato";
    case "commission.settle":
      return "comissao";
    case "rules.configure":
      return "temporada";
    default:
      return "operacao";
  }
}

function buildRecommendedActions(params: {
  flow?: string | null;
  nextStep?: string | null;
  pendingItems: string[];
  blockers: string[];
}): ImobCrmRecommendedAction[] {
  const actions: ImobCrmRecommendedAction[] = [];
  const push = (action: typeof actions[number]) => {
    if (!actions.some((item) => item.id === action.id)) actions.push(action);
  };

  if (params.blockers.length > 0) {
    push({ id: "review_blockers", label: "Revisar bloqueios", actionType: "consultive", inputHint: "mostrar bloqueios do caso", reasonCode: "BLOCKERS_PRESENT" });
  }
  if (params.pendingItems.length > 0) {
    push({ id: "review_pending_items", label: "Ver pendências", actionType: "consultive", inputHint: "mostrar pendências do caso", reasonCode: "PENDING_ITEMS_PRESENT" });
  }

  switch ((params.flow ?? "").trim()) {
    case "owner.create":
      push({ id: "register_owner", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário" });
      break;
    case "property.create":
      push({ id: "register_property", label: "Cadastrar imóvel", actionType: "operational", inputHint: "cadastrar imóvel" });
      break;
    case "lead.qualify":
      push({ id: "qualify_lead", label: "Qualificar lead", actionType: "operational", inputHint: "qualificar lead deste caso" });
      break;
    case "visit.schedule":
      push({ id: "register_visit", label: "Registrar visita", actionType: "operational", inputHint: "registrar visita deste caso" });
      break;
    case "documents.collect":
      push({ id: "request_documents", label: "Cobrar documentação", actionType: "operational", inputHint: "solicitar documentos pendentes" });
      break;
    case "proposal.create":
      push({ id: "generate_proposal", label: "Montar proposta", actionType: "governed", inputHint: "gerar proposta para este caso" });
      break;
    case "deal.review":
      push({ id: "open_negotiation", label: "Avançar negociação", actionType: "governed", inputHint: "abrir negociação deste caso" });
      break;
    case "contract.prepare":
      push({ id: "prepare_contract", label: "Preparar contrato", actionType: "governed", inputHint: "preparar contrato deste caso" });
      break;
    case "commission.settle":
      push({ id: "settle_commission", label: "Liberar comissão", actionType: "governed", inputHint: "liberar comissão deste caso" });
      break;
    case "rules.configure":
      push({ id: "configure_seasonal_rules", label: "Configurar regras de temporada", actionType: "governed", inputHint: "configurar regras de hospedagem deste imóvel" });
      break;
    default:
      break;
  }

  if (params.nextStep) {
    const normalizedNextStep = normalizeImobCrmText(params.nextStep);
    if (!normalizedNextStep.includes("mostrar bloqueios do caso")) {
      push({ id: "follow_next_step", label: "Executar próximo passo", actionType: "consultive", inputHint: params.nextStep, reasonCode: "NEXT_STEP_AVAILABLE" });
    }
  }
  return actions.slice(0, 3);
}

function buildCaseContextFromRecord(item: ResolverCaseRecord): ImobCrmCaseContext {
  return buildImobCrmCaseContextFromRecord(item, buildImobCrmLegacyCanonicalCase);
}

function formatCaseFlowLabel(flow: string | null | undefined) {
  const labels: Record<string, string> = {
    "lead.qualify": "Lead",
    "proposal.create": "Proposta",
    "visit.schedule": "Visita",
    "contract.prepare": "Contrato",
    "commission.settle": "Comissão",
    "documents.collect": "Documentação",
    "property.create": "Captação",
    "owner.create": "Proprietário",
    "rules.configure": "Regras de temporada",
  };
  return labels[flow ?? ""] ?? "Caso";
}

function formatJourneyLabel(journeyType: string | null | undefined) {
  const normalized = (journeyType ?? "").trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Qualificação";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "closing") return "Fechamento";
  if (normalized === "commission") return "Comissão";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

function formatCommercialStageLabel(caseContext?: ImobCrmCaseContext | null) {
  const flow = asString(caseContext?.flow);
  const status = asString(caseContext?.status);
  const stage = asString(caseContext?.stage);
  if (flow === "lead.qualify") {
    if (status === "ready_for_review" || stage === "ready_for_review") return "Lead pronto para avançar";
    if (status === "pending_data" || stage === "pending_data") return "Lead com dados pendentes";
    if (stage === "qualified" || status === "qualified") return "Lead qualificado";
    return "Qualificação do lead";
  }
  if (flow === "property.create" || flow === "owner.create" || flow === "listing.activate") {
    if (status === "ready_for_review" || stage === "ready_for_review") return "Captação pronta para revisão";
    if (status === "pending_data" || stage === "pending_data") return "Captação com dados pendentes";
    return "Captação em andamento";
  }
  if (flow === "rules.configure") return "Regras de temporada";
  if (status === "ready_for_review" || stage === "ready_for_review") return "Pronto para revisão";
  return formatImobStatusLabel(status ?? stage);
}

function formatBusinessSubject(caseContext?: ImobCrmCaseContext | null) {
  const lead = asObject(caseContext?.lead);
  const property = asObject(caseContext?.property);
  const owner = asObject(caseContext?.owner);
  const leadName = asString(lead?.name);
  const goal = asString(lead?.goal);
  const city = asString(lead?.targetCity) ?? asString(property?.city);
  const budgetCents = typeof lead?.budgetMaxCents === "number" ? lead.budgetMaxCents : null;
  const propertyType = asString(property?.propertyType);
  const propertyAddress = asString(property?.address);
  const ownerName = asString(owner?.name);

  if (leadName) {
    return [
      `Lead ${leadName}`,
      goal ? `para ${goal}` : null,
      city ? `em ${city}` : null,
      budgetCents ? `com orçamento de ${formatBudgetCentsForImob(budgetCents)}` : null,
    ].filter(Boolean).join(" ");
  }
  if (propertyAddress || propertyType) {
    return [propertyType ? `Imóvel ${propertyType}` : "Imóvel", propertyAddress ? `em ${propertyAddress}` : null, city ? `em ${city}` : null].filter(Boolean).join(" ");
  }
  if (ownerName) return `Proprietário ${ownerName}`;
  return "Negócio imobiliário";
}

function formatBusinessNextStep(nextStep: string | null | undefined, caseContext?: ImobCrmCaseContext | null) {
  const normalized = normalizeImobCrmText(nextStep ?? "");
  if (!normalized) return "definir o próximo movimento comercial";
  if (normalized.includes("qualificar lead deste caso")) {
    const leadName = asString(asObject(caseContext?.lead)?.name);
    return leadName ? `qualificar o interesse do lead ${leadName} e vincular um imóvel aderente` : "qualificar o interesse do lead e vincular um imóvel aderente";
  }
  if (normalized.includes("vincular o lead")) return "vincular o lead a um imóvel ou à próxima etapa comercial";
  if (normalized.includes("cadastrar imovel")) return "completar o cadastro do imóvel";
  return nextStep ?? "definir o próximo movimento comercial";
}

function buildCaseExperienceWidget(caseContext?: ImobCrmCaseContext | null) {
  if (!caseContext?.canonical?.journeyType) return undefined;
  const recommendedActions = Array.isArray(caseContext.canonical.recommendedActions)
    ? caseContext.canonical.recommendedActions
        .map((item: any) => ({
          id: String(item?.id ?? ""),
          label: String(item?.label ?? "Próxima ação"),
          autoprompt: asString(item?.inputHint) ?? asString(item?.label),
        }))
        .filter((item: any) => item.id && item.label)
        .slice(0, 3)
    : [];
  const pendingItems = Array.isArray(caseContext.pendingItems) ? caseContext.pendingItems.map((item: any) => String(item)).filter(Boolean) : [];

  if (pendingItems.length > 0 || asString(caseContext.blocker)) {
    return {
      kind: "document_checklist",
      title: "Pendências do negócio",
      checklist: pendingItems.slice(0, 6),
      blocker: asString(caseContext.blocker) ?? null,
      nextStep: asString(caseContext.nextStep) ?? null,
      specialists: [],
    };
  }

  return {
    kind: "case_summary",
    title: "Resumo do negócio",
    journeyLabel: formatJourneyLabel(caseContext.canonical.journeyType),
    stageLabel: formatCommercialStageLabel(caseContext),
    nextStep: formatBusinessNextStep(asString(caseContext.nextStep), caseContext),
    blocker: asString(caseContext.blocker) ?? null,
    recommendedActions,
    specialists: [],
  };
}

function resolveBusinessReadIntent(message: string): BusinessReadIntent | null {
  const match = matchImobConversationalIntents(message).find((intent) =>
    intent.intentId === "pipeline_status" ||
    intent.intentId === "blocked_run_resolution" ||
    intent.intentId === "next_best_action"
  );
  if (match?.intentId) return match.intentId as BusinessReadIntent;
  const normalized = normalizeImobCrmText(message);
  if (
    (normalized.includes("resuma esse caso") || normalized.includes("resumir esse caso") || normalized.includes("resumo do caso"))
    && (normalized.includes("caso") || normalized.includes("atendimento"))
  ) {
    return "pipeline_status";
  }
  return null;
}

function getBusinessPendingItems(caseContext: ImobCrmCaseContext): string[] {
  const pendingItems = Array.isArray(caseContext?.pendingItems) ? caseContext.pendingItems : [];
  const missingContext = Array.isArray(caseContext?.canonical?.missingContext) ? caseContext.canonical.missingContext : [];
  return Array.from(new Set([...pendingItems, ...missingContext].map((item) => String(item)).filter(Boolean)));
}

function getBusinessBlockers(caseContext: ImobCrmCaseContext): string[] {
  const blockers = [
    ...(asString(caseContext?.blocker) ? [String(caseContext.blocker)] : []),
    ...(Array.isArray(caseContext?.canonical?.blockedActions) ? caseContext.canonical.blockedActions : []),
  ];
  return Array.from(new Set(blockers.map((item) => String(item)).filter(Boolean)));
}

function buildBusinessActionCtas(caseContext: ImobCrmCaseContext) {
  const actions = Array.isArray(caseContext?.canonical?.recommendedActions) ? caseContext.canonical.recommendedActions : [];
  return actions
    .map((item: any) => ({
      id: `case-action-${String(item?.id ?? "next")}`,
      label: String(item?.label ?? "Próximo passo"),
      kind: "primary" as const,
      action: "send_suggested_message" as const,
      nextMessage: asString(item?.inputHint) ?? asString(item?.label) ?? "mostrar próximo passo do caso",
    }))
    .filter((item: any) => item.label && item.nextMessage)
    .slice(0, 3);
}

const legacyBusinessRead = buildImobCrmBusinessReadHelpers({
  asObject,
  asString,
  asStringList,
  normalizeImobRouteText: normalizeImobCrmText,
  formatBudgetCentsForImob,
  formatImobStatusLabel,
  formatImobPendingList,
  formatImobCaseFlowLabel: (flow: string) => formatCaseFlowLabel(flow),
  titleCaseRouteWords: titleCaseWords,
  createEmptyThreadState,
  resolveImobBackingSpecialists,
  buildImobCanonicalCase: buildImobCrmLegacyCanonicalCase,
  resolveBusinessReadIntent,
});

function formatImobPendingList(items: unknown) {
  const pending = asStringList(items);
  if (pending.length === 0) return "sem pendências";
  return pending.join(", ");
}

function formatImobStatusLabel(status: string | null | undefined) {
  const normalized = normalizeImobCrmText(status ?? "");
  if (normalized === "ready_for_review") return "pronto para revisão";
  if (normalized === "pending_data") return "com dados pendentes";
  if (normalized === "collecting") return "em coleta";
  if (normalized === "qualified") return "qualificado";
  if (normalized === "blocked") return "bloqueado";
  if (normalized === "archived") return "arquivado";
  if (!status) return "não informado";
  return status.replace(/_/g, " ");
}

function formatBudgetCentsForImob(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value / 100);
}

function formatPropertyLookupLabel(item: { id: string; metadata?: unknown; propertyType?: string | null; address?: string | null }) {
  const metadata = asObject(item.metadata);
  const externalRef = asString(metadata?.externalPropertyRef);
  if (externalRef) return `Imóvel ${externalRef}`;
  if (item.address) return item.address;
  if (item.propertyType) return `Imóvel ${getImobCrmPropertyTypeLabel(item.propertyType)}`;
  return `Imóvel ${item.id}`;
}

function extractLeadEmailFromMessage(raw: string) {
  return raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() ?? null;
}

function extractLeadPhoneFromMessage(raw: string) {
  const match = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractLeadGoalFromMessage(raw: string) {
  const match = raw.match(
    /(?:(?:objetivo|finalidade) do (?:lead|cliente|comprador|compradora|locatario|locatário|locataria|locatária))\s*:?\s*([^,.;\n]+)/i,
  );
  return normalizeImobCrmPropertyGoal(match?.[1]?.trim() ?? null);
}

function extractLeadNameFromMessage(message: string) {
  const normalized = normalizeImobCrmText(message);
  const match = normalized.match(/(?:lead|cliente|comprador|locatario)\s+([a-z]+(?:\s+[a-z]+){0,2})/);
  return match?.[1] ? titleCaseWords(match[1]) : null;
}

function extractOwnerNameFromMessage(message: string) {
  const normalized = normalizeImobCrmText(message);
  if (/\b(?:este|esse|deste|desse|nesse)\s+caso\b/.test(normalized)) return null;
  const match = normalized.match(/(?:proprietario|dono)\s+([a-z]+(?:\s+[a-z]+){0,2})/);
  if (!match?.[1]) return null;
  const candidate = titleCaseWords(match[1]);
  const normalizedCandidate = normalizeImobCrmText(candidate);
  return normalizedCandidate === "null" || normalizedCandidate === "undefined" || normalizedCandidate === "none" ? null : candidate;
}

function extractOwnerExplicitNameFromMessage(message: string) {
  const match = message.match(/(?:nome do (?:proprietario|proprietário|dono|vendedor|locador))\s*:?[\s-]*([^,.;\n]+)/i);
  return match?.[1] ? titleCaseWords(match[1].trim()) : null;
}

function extractOwnerExplicitPhoneFromMessage(message: string) {
  const match = message.match(/(?:telefone do (?:proprietario|proprietário|dono|vendedor|locador))\s*:?[\s-]*([^\n]+)/i);
  if (!match?.[1]) return null;
  const phoneMatch = match[1].match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  return phoneMatch?.[0]?.trim() ?? null;
}

function extractOwnerExplicitEmailFromMessage(message: string) {
  const match = message.match(/(?:e-mail do|email do)\s+(?:proprietario|proprietário|dono|vendedor|locador)\s*:?[\s-]*([^\s,;]+)/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function extractOwnerExplicitDocumentFromMessage(message: string) {
  const match = message.match(/(?:(?:documento|cpf|cnpj) do (?:proprietario|proprietário|dono|vendedor|locador))\s*:?[\s-]*([^\n]+)/i);
  if (!match?.[1]) return null;
  const candidate = match[1].match(/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b|\b\d{11}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}\b|\b\d{14}\b/);
  return candidate?.[0] ?? null;
}

function sanitizeOwnerName(value: string | null | undefined, fallback = "Proprietário") {
  const trimmed = value?.trim() ?? "";
  const normalized = normalizeImobCrmText(trimmed);
  return !trimmed || normalized === "null" || normalized === "undefined" || normalized === "none" ? fallback : trimmed;
}

function getOwnerDedupeSelection(threadState: ImobCrmConversationState | null | undefined) {
  const operational = asObject(asObject(threadState)?.operational);
  const dedupeSelection = asObject(operational?.dedupeSelection);
  if (!dedupeSelection || asString(dedupeSelection.entity) !== "owner") return null;
  return {
    resolution: asString(dedupeSelection.resolution),
    selectedId: asString(dedupeSelection.selectedId),
    selectedRef: asString(dedupeSelection.selectedRef),
    selectedName: asString(dedupeSelection.selectedName),
  };
}

function buildChatSafeCaseLookupText(params: {
  scopedCaseId: string | null;
  flow: string | null | undefined;
  pendingItems: unknown;
  nextStep?: string | null;
  blocker?: string | null;
}) {
  const summary = params.scopedCaseId
    ? `Caso ${formatCaseFlowLabel(params.flow)} localizado.`
    : `Usei o caso IMOB mais recente para esta leitura: ${formatCaseFlowLabel(params.flow)}.`;
  const hints = [
    asStringList(params.pendingItems).length > 0 ? "Há pendências operacionais em aberto." : null,
    params.blocker ? "Existe um bloqueio ativo neste atendimento." : null,
    params.nextStep ? "Posso detalhar a próxima ação recomendada para este caso." : null,
  ].filter(Boolean);
  return [summary, ...hints].join("\n");
}

function extractDocumentFromMessage(raw: string) {
  const match = raw.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  return match?.[0] ?? null;
}

function extractAddressFromMessage(raw: string) {
  const explicitMatch = raw.match(/(?:endereco|endereço)(?: do imovel| do imóvel)?\s*:?\s*([^,.;\n]+(?:,[^.;\n]+)?)/i);
  if (explicitMatch?.[1]) return explicitMatch[1].trim();
  const match = raw.match(/(?:imovel|imóvel)\s+(.{6,160})$/i);
  return match?.[1]?.trim() ?? null;
}

function extractPropertyRefFromMessage(message: string) {
  const normalized = normalizeImobCrmText(message);
  return normalized.match(/(?:imovel|apartamento|apto|casa)\s*#?\s*([a-z0-9_-]{4,})/)?.[1] ?? null;
}

function extractCaseIdFromMessage(message: string): string | null {
  if (typeof message !== "string" || message.trim().length === 0) return null;
  const byLabelMatch = message.match(/(?:caso|case|processo)\s*(?:id)?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{2,})/i);
  if (byLabelMatch?.[1]) {
    const candidate = byLabelMatch[1].toLowerCase();
    if (["mais", "recente", "atual", "aberto", "disponivel", "disponível", "ultimo", "último"].includes(candidate)) return null;
    return byLabelMatch[1];
  }
  return null;
}

function extractOwnerCrudIdFromMessage(raw: string) {
  return raw.match(/propriet[aá]rio\s+([a-z0-9_-]{8,})/i)?.[1] ?? null;
}

function extractPropertyCrudIdFromMessage(raw: string) {
  return raw.match(/im[oó]vel\s+([a-z0-9_-]{8,})/i)?.[1] ?? null;
}

function buildOwnerUpdateForm(owner: ImobCrmOwnerSummary & { id: string }) {
  return {
    entity: "proprietario",
    action: "update",
    title: "Editar proprietário",
    label: "Editar proprietário",
    description: "Revise os dados do proprietário antes de salvar.",
    subjectId: owner.id,
    fields: [
      { name: "ownerName", label: "Nome completo", type: "text", value: sanitizeOwnerName(owner.name, ""), required: true },
      { name: "ownerPhone", label: "Telefone", type: "text", value: owner.phone ?? "", required: false },
      { name: "ownerEmail", label: "E-mail", type: "email", value: owner.email ?? "", required: false },
      { name: "ownerDocument", label: "Documento", type: "text", value: owner.document ?? "", required: false },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  };
}

function buildPropertyUpdateForm(property: ImobCrmPropertySummary & { id: string }) {
  const normalizedPropertyType = normalizeImobCrmPropertyType(property.propertyType) ?? null;
  return {
    entity: "imovel",
    action: "update",
    label: "Editar imóvel",
    description: "",
    subjectId: property.id,
    fields: [
      {
        name: "propertyType",
        label: "Tipo",
        type: "select",
        value: normalizedPropertyType ?? "",
        required: false,
        placeholder: "",
        options: IMOB_CRM_PROPERTY_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          group: option.category === "residential" ? "Residencial" : "Comercial",
        })),
      },
      {
        name: "goal",
        label: "Finalidade",
        type: "select",
        value: normalizeImobCrmPropertyGoal(property.goal) ?? "",
        required: false,
        placeholder: "",
        options: IMOB_CRM_PROPERTY_GOAL_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
      {
        name: "cep",
        label: "CEP",
        type: "text",
        value: "",
        required: false,
        inputMode: "numeric",
        maxLength: 9,
        lookup: {
          kind: "cep",
          autoFillTargets: {
            city: "city",
            address: "address",
          },
        },
      },
      { name: "city", label: "Cidade", type: "text", value: property.city ?? "", required: false },
      { name: "address", label: "Endereço", type: "text", value: property.address ?? "", required: false },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  };
}

function extractAmountAfterKeywords(message: string, keywords: string[]) {
  const normalized = normalizeImobCrmText(message);
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeImobCrmText(keyword);
    const match = normalized.match(new RegExp(`${normalizedKeyword}(?:\\s+(?:do|da|de)\\s+\\w+)?\\s*(?:r\\$\\s*)?([0-9][0-9.,]*)`));
    if (!match?.[1]) continue;
    const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(amount)) return Math.round(amount * 100);
  }
  return null;
}

function extractFreeformCityAfterKeywords(message: string, keywords: string[]) {
  const normalized = normalizeImobCrmText(message);
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeImobCrmText(keyword);
    const match = normalized.match(new RegExp(`${normalizedKeyword}\\s+([a-z\\s]{3,80})`));
    if (match?.[1]) return titleCaseWords(match[1].trim());
  }
  return null;
}

function extractListCityFilter(message: string) {
  const normalized = normalizeImobCrmText(message);
  const match = normalized.match(/(?:em|na cidade de|cidade)\s+([a-z\s]{3,80})$/);
  return match?.[1]?.trim() ?? null;
}

function buildOwnerPendingSuggestion(owner: { name: string; pendingItems?: unknown }) {
  const pending = asStringList(owner.pendingItems);
  if (pending.length === 0) return null;
  return `Para seguir com ${owner.name}, ainda preciso de: ${pending.join(", ")}.`;
}

function buildLeadPendingSuggestion(lead: { name: string; pendingItems?: unknown }) {
  const pending = asStringList(lead.pendingItems);
  if (pending.length === 0) return null;
  return `Para seguir com ${lead.name}, ainda preciso de: ${pending.join(", ")}.`;
}

function buildPropertyPendingSuggestion(property: { id?: string; address?: string | null; pendingItems?: unknown }) {
  const pending = asStringList(property.pendingItems);
  if (pending.length === 0) return null;
  return `Para seguir com ${property.address ?? property.id ?? "este imóvel"}, ainda preciso de: ${pending.join(", ")}.`;
}

type DomainGuidanceIntent =
  | "capture_guidance"
  | "qualification_guidance"
  | "documents_by_phase"
  | "document_preparation"
  | "follow_up_preparation"
  | "case_resume_preparation"
  | "approval_preparation"
  | "specialist_handoff"
  | "when_involve_legal"
  | "when_involve_finance"
  | "resume_after_visit"
  | "resume_negotiation"
  | "sensitive_closing";

function resolveDomainGuidanceIntent(message: string): DomainGuidanceIntent | null {
  const normalized = normalizeImobCrmText(message);
  const asksHow = normalized.includes("como");
  const asksWhat = normalized.includes("quais") || normalized.includes("o que") || /\bqual\b/.test(normalized);
  const asksNeed = normalized.includes("preciso");
  const asksPreparation =
    normalized.includes("preparar")
    || normalized.includes("prepara ")
    || normalized.includes("organizar")
    || normalized.includes("organiza ")
    || normalized.includes("resumir")
    || normalized.includes("resumo")
    || normalized.includes("retomar")
    || normalized.includes("quero");
  const asksGuidance = asksHow || asksWhat || asksNeed || asksPreparation;

  if (
    asksGuidance
    && (
      normalized.includes("captacao")
      || normalized.includes("captação")
      || normalized.includes("captar imovel")
      || normalized.includes("captar imóvel")
      || normalized.includes("lead captado")
    )
  ) {
    return "capture_guidance";
  }

  if (
    asksGuidance
    && (
      (normalized.includes("qualificar") && normalized.includes("lead"))
      || normalized.includes("qualificacao")
      || normalized.includes("qualificação")
      || normalized.includes("triar lead")
    )
    && !normalized.includes("deste caso")
    && !normalized.includes("desse caso")
  ) {
    return "qualification_guidance";
  }

  if (
    asksGuidance
    && (
    normalized.includes("quais documentos normalmente faltam")
    || normalized.includes("quais documentos faltam normalmente")
    || normalized.includes("documentos normalmente faltam")
    || normalized.includes("quais documentos preciso")
    || normalized.includes("documentos necessarios")
    || normalized.includes("documentos necessários")
    )
  ) {
    return "documents_by_phase";
  }

  if (
    asksGuidance
    && (
      normalized.includes("checklist documental")
      || normalized.includes("preparar documentacao")
      || normalized.includes("prepara documentacao")
      || normalized.includes("preparar documentação")
      || normalized.includes("preparar a documentacao")
      || normalized.includes("prepara a documentacao")
      || normalized.includes("organizar documentos")
      || normalized.includes("triar pendencias documentais")
      || normalized.includes("triar pendências documentais")
    )
  ) {
    return "document_preparation";
  }

  if (
    asksGuidance
    && (
      normalized.includes("preparar follow up")
      || normalized.includes("prepara follow up")
      || normalized.includes("preparar follow-up")
      || normalized.includes("prepara follow-up")
      || normalized.includes("organizar follow up")
      || normalized.includes("organizar follow-up")
      || normalized.includes("monta mensagem")
      || normalized.includes("prepara mensagem")
      || normalized.includes("o que mando")
    )
  ) {
    return "follow_up_preparation";
  }

  if (
    asksGuidance
    && (
      normalized.includes("resumir caso")
      || normalized.includes("resumo do caso")
      || normalized.includes("retomar caso antigo")
      || normalized.includes("retomar contexto")
      || normalized.includes("retomar esse caso")
      || normalized.includes("retomar este caso")
    )
  ) {
    return "case_resume_preparation";
  }

  if (
    asksGuidance
    && (
      normalized.includes("preparar approval")
      || normalized.includes("prepara approval")
      || normalized.includes("preparar aprovacao")
      || normalized.includes("prepara aprovacao")
      || normalized.includes("preparar aprovação")
      || normalized.includes("o que preciso para approval")
      || normalized.includes("o que preciso para aprovacao")
      || normalized.includes("o que preciso para aprovação")
    )
  ) {
    return "approval_preparation";
  }

  if (
    asksGuidance
    && (
      normalized.includes("qual specialist")
      || normalized.includes("que specialist")
      || normalized.includes("quem entra nesse caso")
      || normalized.includes("quem entra neste caso")
      || normalized.includes("juridico ou financeiro")
      || normalized.includes("jurídico ou financeiro")
      || normalized.includes("qual apoio entra")
    )
  ) {
    return "specialist_handoff";
  }

  if (
    normalized.includes("quando envolver juridico")
    || normalized.includes("quando envolver jurídico")
    || normalized.includes("preciso envolver juridico")
    || normalized.includes("preciso envolver jurídico")
  ) {
    return "when_involve_legal";
  }

  if (
    normalized.includes("quando envolver financeiro")
    || normalized.includes("preciso envolver financeiro")
    || normalized.includes("quando chamar financeiro")
  ) {
    return "when_involve_finance";
  }

  if (
    (normalized.includes("pos visita") || normalized.includes("pós visita") || normalized.includes("depois da visita"))
    && (normalized.includes("retomar") || normalized.includes("sem retorno") || normalized.includes("sumiu") || normalized.includes("cliente sumiu"))
  ) {
    return "resume_after_visit";
  }

  if (
    asksGuidance
    && (
    normalized.includes("retomar negociacao")
    || normalized.includes("retomar negociação")
    || normalized.includes("como retomar negociacao")
    || normalized.includes("como retomar negociação")
    || normalized.includes("avancar negociacao")
    || normalized.includes("avançar negociação")
    )
  ) {
    return "resume_negotiation";
  }

  if (
    asksGuidance
    && (normalized.includes("fechamento") || normalized.includes("assinatura") || normalized.includes("caso sensivel") || normalized.includes("caso sensível"))
    && (normalized.includes("sensivel") || normalized.includes("sensível") || normalized.includes("risco") || normalized.includes("approval") || normalized.includes("evidence"))
  ) {
    return "sensitive_closing";
  }

  return null;
}

function buildDomainGuidanceResponse(intent: DomainGuidanceIntent, threadState: ImobCrmConversationState | null | undefined) {
  function buildGenericPreparedFollowUp(params: {
    objective: string;
    trigger: string;
    recipientRole: "lead" | "owner" | "broker" | "legal" | "finance" | "internal";
    directText: string;
    consultiveText: string;
    expectedReply: string;
  }): ImobPreparedFollowUp {
    return {
      objective: params.objective,
      recipientRole: params.recipientRole,
      trigger: params.trigger,
      expectedReply: params.expectedReply,
      escalationHint: "Se não houver retorno, reclassifique blocker, waitingOn e decida a próxima cadência de contato.",
      variants: [
        { id: "follow-up-direct", label: "Mensagem curta", tone: "direct", text: params.directText },
        { id: "follow-up-consultive", label: "Mensagem consultiva", tone: "consultive", text: params.consultiveText },
      ],
    };
  }

  const responses: Record<DomainGuidanceIntent, any> = {
    capture_guidance: {
      text: [
        "Na captação, o IMOB deve responder primeiro com leitura operacional e só depois puxar cadastro completo.",
        "Leitura operacional: o objetivo é validar ativo real, proprietário identificável e dados mínimos para seguir.",
        "Próximo passo seguro: confirmar imóvel, urgência do proprietário e readiness documental básica antes de aprofundar intake.",
      ].join("\n"),
      nextStep: "Se quiser, eu organizo a captação em checklist ou abro o cadastro do imóvel.",
      card: {
        title: "Captação operacional",
        lines: [
          "Validar imóvel, proprietário e urgência real.",
          "Separar dado mínimo de dado complementar.",
          "Só aprofundar cadastro depois que a captação fizer sentido.",
        ],
      },
    },
    qualification_guidance: {
      text: [
        "Na qualificação, o foco não é só completar campo: é entender aderência, urgência e chance real de avanço.",
        "Leitura operacional: o waitingOn mais comum é lead ou broker, dependendo do que ainda falta confirmar.",
        "Próximo passo seguro: confirmar objetivo, cidade, orçamento e prontidão antes de empurrar visita ou proposta.",
      ].join("\n"),
      nextStep: "Se quiser, eu aplico essa leitura ao caso atual ou abro a qualificação do lead.",
      card: {
        title: "Qualificação do lead",
        lines: [
          "Objetivo do lead.",
          "Cidade e orçamento.",
          "Prontidão para visita ou avanço comercial.",
        ],
      },
    },
    documents_by_phase: {
      text: [
        "Na etapa documental, os itens que mais travam são matrícula atualizada, documento pessoal das partes, autorização de venda e comprovações financeiras quando o negócio depende de crédito.",
        "Leitura operacional: o waitingOn mais comum nessa fase é owner, legal ou finance.",
        "Próximo passo seguro: confirmar qual fase do caso você está e cobrar primeiro o documento que impede a próxima validação.",
      ].join("\n"),
      nextStep: "Se quiser, eu aplico esse checklist ao caso específico e aponto o blocker real.",
      card: {
        title: "Checklist operacional por etapa",
        lines: [
          "Captação: dados mínimos do proprietário e do imóvel.",
          "Proposta/negociação: comprovação básica da contraparte e condições da oferta.",
          "Documentação/fechamento: matrícula, documentos pessoais, autorização e pendências financeiras.",
        ],
      },
    },
    document_preparation: {
      text: [
        "Posso organizar o trabalho documental sem abrir fluxo sensível agora.",
        "Leitura operacional: primeiro separar checklist por fase, depois identificar blocker, waitingOn e owner da cobrança.",
        "Próximo passo seguro: montar um pacote mínimo com documento crítico, responsável atual e pendência que libera a próxima validação.",
      ].join("\n"),
      nextStep: "Se quiser, eu aplico essa preparação ao caso específico e organizo a cobrança documental.",
      actionableChecklist: {
        title: "Checklist acionável documental",
        items: [
          { id: "doc-critical", title: "Cobrar o documento que libera a próxima validação", criticality: "critical", owner: "proprietário", unlocks: "destravar a revisão documental", urgency: "high" },
          { id: "doc-owner", title: "Explicitar waitingOn e owner da cobrança", criticality: "supporting", owner: "corretor", unlocks: "evitar repasse manual difuso", urgency: "medium" },
          { id: "doc-review", title: "Separar o que precisa de revisão do J_360", criticality: "supporting", owner: "jurídico/documentação", unlocks: "encaminhar o handoff certo", urgency: "medium" },
        ],
      },
      card: {
        title: "Preparação documental",
        lines: [
          "Separar documento crítico do complementar.",
          "Explicitar waitingOn e owner da cobrança.",
          "Cobrar primeiro o item que libera a próxima validação.",
        ],
      },
    },
    follow_up_preparation: {
      text: [
        "Posso preparar o follow-up antes de abrir qualquer execução.",
        "Leitura operacional: follow-up útil resume contexto, explicita blocker ou objetivo e pede um único próximo movimento.",
        "Próximo passo seguro: dizer o que mudou desde o último contato, a objeção principal e a ação esperada da outra parte.",
      ].join("\n"),
      nextStep: "Se quiser, eu monto a mensagem de follow-up e depois aplico ao caso atual.",
      preparedFollowUp: buildGenericPreparedFollowUp({
        objective: "Retomar o caso sem reabrir intake e pedir uma única resposta objetiva.",
        trigger: "O caso precisa de uma confirmação para avançar.",
        recipientRole: "lead",
        directText: "Olá. Estou retomando este atendimento porque preciso confirmar o próximo passo com você. Hoje o ponto principal é alinhar a objeção atual e decidir um único movimento para avançarmos. Consegue me responder ainda hoje?",
        consultiveText: "Oi. Voltei a olhar este caso para não deixarmos o atendimento esfriar. Quero confirmar a objeção principal e entender qual é o melhor próximo movimento agora. Se você me responder com o que está te travando hoje, eu organizo a próxima ação sem te fazer repetir todo o contexto.",
        expectedReply: "Confirmar a objeção principal e autorizar um único próximo movimento.",
      }),
      card: {
        title: "Preparação de follow-up",
        lines: [
          "Resumo curto do contexto atual.",
          "Objeção ou blocker principal.",
          "Pedido de uma ação única no próximo contato.",
        ],
      },
    },
    case_resume_preparation: {
      text: [
        "Posso resumir o caso como leitura operacional antes de qualquer execução.",
        "Leitura mínima útil: fase, objetivo da fase, blocker, waitingOn, owner da ação e próximo passo seguro.",
        "Próximo passo seguro: usar esse resumo para retomar contexto rápido, handoff ou priorização da carteira.",
      ].join("\n"),
      nextStep: "Se quiser, eu monto esse resumo no caso atual e preparo a retomada.",
      card: {
        title: "Resumo estruturado do caso",
        lines: [
          "Fase atual e objetivo da etapa.",
          "Blocker e waitingOn atuais.",
          "Owner da ação e próximo movimento seguro.",
        ],
      },
    },
    approval_preparation: {
      text: [
        "Posso preparar o approval sem executar a decisão agora.",
        "Leitura operacional: approval forte precisa de blocker claro, reasonCode, specialist contextual e evidência mínima quando a policy exigir.",
        "Próximo passo seguro: separar pendência operacional simples de transição sensível antes de pedir aprovação humana.",
      ].join("\n"),
      nextStep: "Se quiser, eu verifico se o caso atual já está pronto para approval ou se ainda falta evidência.",
      card: {
        title: "Preparação de approval",
        lines: [
          "Confirmar reasonCode e risco real da transição.",
          "Explicitar specialist contextual e ownership do caso.",
          "Validar se approval e evidence são exigidos pela policy.",
        ],
      },
    },
    specialist_handoff: {
      text: [
        "O IMOB_CRM continua dono do caso. Specialists entram como apoio contextual e não assumem ownership.",
        "J_360 entra quando o blocker é documental, contratual ou jurídico. fin-nexus entra quando o bloqueio é financeiro, de repasse, comissão ou pagamento. guardian entra quando a transição exige approval, evidence ou trilha auditável.",
        "I_BC apoia priorização comercial e negociação. Diarias apoia follow-up, rotina diária e backlog acionável.",
        "Próximo passo seguro: identificar blocker, waitingOn e risco antes de acionar o specialist.",
      ].join("\n"),
      nextStep: "Se quiser, eu aplico essa leitura ao caso atual e digo qual specialist entra por motivo real.",
      handoffPack: {
        targetArea: "Jurídico/Financeiro/Specialist contextual",
        reason: "O caso já tem blocker ou risco suficiente para justificar apoio contextual.",
        summary: "O chat deve preparar o handoff com blocker, motivo da escalada e ownership preservado no IMOB_CRM.",
        blocker: "validar o tipo de blocker antes de passar o caso",
        needsValidation: [
          "Motivo real do handoff",
          "Qual documento ou condição precisa de validação",
          "O que continua com o corretor",
        ],
        remainsWithBroker: [
          "Manter o ownership do caso no IMOB_CRM.",
          "Atualizar o cliente e coordenar o próximo passo após o retorno da área.",
        ],
        urgency: "medium",
        ownershipBoundary: "Specialist apoia o caso e não assume ownership.",
      },
      card: {
        title: "Handoff de specialists",
        lines: [
          "IMOB_CRM mantém ownership do caso.",
          "Specialist entra por blocker, risco ou reasonCode.",
          "Handoff não substitui a leitura operacional do caso.",
        ],
      },
    },
    when_involve_legal: {
      text: [
        "Envolva jurídico/documentação quando houver matrícula inconsistente, exigência contratual fora do padrão, pendência de titularidade, minuta sensível ou risco de assinatura sem validação.",
        "Leitura operacional: nesses casos o waitingOn tende a migrar para legal.",
        "Próximo passo seguro: separar o blocker documental, anexar evidência mínima e só depois seguir para fechamento.",
      ].join("\n"),
      nextStep: "Se quiser, eu verifico se o caso atual já pede jurídico ou se ainda é bloqueio comercial/documental simples.",
      card: {
        title: "Quando envolver jurídico",
        lines: [
          "Matrícula ou titularidade inconsistente.",
          "Minuta, cláusula ou condição fora do padrão.",
          "Fechamento sensível com exigência de validação final.",
        ],
      },
    },
    when_involve_finance: {
      text: [
        "Envolva financeiro quando houver sinal, repasse, comissão, crédito/financiamento incerto ou condicionante de pagamento que possa travar o avanço.",
        "Leitura operacional: nesses cenários o waitingOn tende a ser finance.",
        "Próximo passo seguro: confirmar a pendência financeira real antes de prometer fechamento ou liberação.",
      ].join("\n"),
      nextStep: "Se quiser, eu classifico o caso atual entre blocker comercial e blocker financeiro.",
      card: {
        title: "Quando envolver financeiro",
        lines: [
          "Sinal ou repasse pendente.",
          "Comissão e liquidação do negócio.",
          "Financiamento, crédito ou condição de pagamento sem validação.",
        ],
      },
    },
    resume_after_visit: {
      text: [
        "Num pós-visita sem retorno, a leitura operacional padrão é follow-up risk em alta e waitingOn=lead.",
        "O corretor deve retomar com mensagem curta, referência objetiva ao que o cliente viu e proposta de próximo movimento, em vez de reabrir o caso pelo cadastro.",
        "Próximo passo seguro: confirmar feedback da visita, objeção principal e janela para novo contato.",
      ].join("\n"),
      nextStep: "Se quiser, eu monto a retomada comercial e depois aplico ao caso específico.",
      card: {
        title: "Retomada pós-visita",
        lines: [
          "1. Resumir o interesse percebido.",
          "2. Perguntar a objeção principal.",
          "3. Propor um próximo passo único: retorno, nova visita ou proposta.",
        ],
      },
    },
    resume_negotiation: {
      text: [
        "Para retomar negociação, o IMOB deve primeiro identificar fase, blocker, waitingOn e owner da ação antes de pedir complemento cadastral.",
        "Leitura operacional padrão: negociação parada costuma travar em preço, condição de pagamento ou silêncio de uma das partes.",
        "Próximo passo seguro: confirmar quem está segurando o avanço e conduzir uma única ação comercial objetiva.",
      ].join("\n"),
      nextStep: "Se quiser, eu preparo a abordagem de retomada e depois aplico ao caso atual.",
      card: {
        title: "Retomada de negociação",
        lines: [
          "Checar se o waitingOn está em lead, owner ou broker.",
          "Explicitar a objeção principal da negociação.",
          "Definir uma ação única: cobrar retorno, ajustar condição ou formalizar proposta.",
        ],
      },
    },
    sensitive_closing: {
      text: [
        "Em fechamento sensível, o IMOB deve separar pendência de dado, blocker documental e transição governada.",
        "Leitura operacional: o waitingOn tende a migrar para legal ou finance, e pode haver necessidade de approval ou evidence conforme o risco.",
        "Próximo passo seguro: confirmar o blocker real antes de liberar assinatura, repasse ou fechamento final.",
      ].join("\n"),
      nextStep: "Se quiser, eu verifico se o caso atual já pede approval, evidence ou handoff especializado.",
      card: {
        title: "Fechamento sensível",
        lines: [
          "Confirmar blocker documental ou financeiro.",
          "Separar pendência operacional de transição sensível.",
          "Só avançar assinatura ou repasse com validação suficiente.",
        ],
      },
    },
  };

  const presentation = responses[intent];
  return {
    mode: "consult",
    action: "crm.domain_guidance",
    threadLabel: "IMOB Ops",
    conversationState: threadState ?? createEmptyThreadState(),
    presentation: {
      ...presentation,
      owner: "Corretor",
      dedupeKey: `crm.domain_guidance:${intent}`,
    },
  };
}

export async function resolveImobCrmOperationalUpdate(params: ResolverParams) {
  const normalized = normalizeImobCrmText(params.message);
  const operational = asObject(params.threadState?.operational);
  const isMarketScanSelectionMessage =
    (asString(operational?.flow) === "property.market_scan"
      || asString(operational?.flow) === "property.create")
    && (
      normalized.includes("selecionar imovel")
      || normalized.includes("selecionar imóvel")
      || normalized.includes("usar imovel do scan")
      || normalized.includes("usar imóvel do scan")
      || normalized.includes("salvar imovel do scan")
      || normalized.includes("salvar imóvel do scan")
      || normalized.includes("confirmar selecao do scan")
      || normalized.includes("confirmar seleção do scan")
      || normalized.includes("confirmar imovel do scan")
      || normalized.includes("confirmar imóvel do scan")
      || normalized.includes("confirmar captacao do scan")
      || normalized.includes("confirmar captação do scan")
    );
  if (isMarketScanSelectionMessage) return null;
  const ownerName = extractOwnerNameFromMessage(params.message);
  const ownerExplicitName = extractOwnerExplicitNameFromMessage(params.message);
  const ownerExplicitPhone = extractOwnerExplicitPhoneFromMessage(params.message);
  const ownerExplicitEmail = extractOwnerExplicitEmailFromMessage(params.message);
  const ownerExplicitDocument = extractOwnerExplicitDocumentFromMessage(params.message);
  const leadName = extractLeadNameFromMessage(params.message);
  const document = extractDocumentFromMessage(params.message);
  const address = extractAddressFromMessage(params.message);
  const propertyRef = extractPropertyRefFromMessage(params.message);
  const leadPhone = extractLeadPhoneFromMessage(params.message);
  const leadEmail = extractLeadEmailFromMessage(params.message);
  const leadGoal = extractLeadGoalFromMessage(params.message);
  const budgetCents = extractAmountAfterKeywords(params.message, ["orcamento", "orçamento", "budget"]);
  const priceCents = extractAmountAfterKeywords(params.message, ["preco", "preço", "valor"]);
  const targetCity = extractFreeformCityAfterKeywords(params.message, ["cidade do lead", "cidade de interesse"]);
  const dedupeSelection = getOwnerDedupeSelection(params.threadState);
  const selectedOwnerId = dedupeSelection?.selectedId ?? null;

  const wantsOwnerDocument =
    normalized.includes("documento do proprietario") ||
    normalized.includes("documento do proprietário") ||
    normalized.includes("cpf do proprietario") ||
    normalized.includes("cpf do proprietário");
  if (wantsOwnerDocument && document) {
    let owner = null as any;
    if (selectedOwnerId) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { id: selectedOwnerId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      });
    }
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { ownerId: true },
      });
      if (scopedCase?.ownerId) {
        owner = await params.prisma.imobOwner.findFirst({ where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      }
    }
    if (!owner && ownerName) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, name: ownerName },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (owner) {
      const currentPending = asStringList(owner.pendingItems).filter((item) => item !== "ownerDocument" && item !== "documento do proprietário");
      const updated = await params.prisma.imobOwner.update({
        where: { id: owner.id },
        data: { document, pendingItems: currentPending, status: currentPending.length > 0 ? "pending_data" : "ready_for_review" },
      });
      return {
        mode: "consult",
        action: "crm.owner.update",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: [
            `Documento do proprietário ${updated.name} atualizado com sucesso.`,
            `Pendências atuais: ${formatImobPendingList(currentPending.map((item) => item === "ownerDocument" ? "documento do proprietário" : item))}.`,
            currentPending.length > 0 ? buildOwnerPendingSuggestion({ name: updated.name, pendingItems: currentPending }) : null,
            currentPending.length > 0 ? "Próximo passo: completar as pendências restantes do proprietário." : "Próximo passo: vincular o proprietário ao próximo imóvel ou etapa documental.",
          ].filter(Boolean).join("\n"),
          owner: "Corretor" as any,
          nextStep: currentPending.length > 0 ? "Completar as pendências restantes do proprietário." : "Vincular o proprietário ao próximo imóvel ou etapa documental.",
          pendingFieldLabels: currentPending.map((item) => item === "ownerDocument" ? "documento do proprietário" : item),
          dedupeKey: `crm.owner.update:${updated.id}:document`,
        },
      } as any;
    }
  }

  const asksOwnerEdit = normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar");
  const ownerCrudId = extractOwnerCrudIdFromMessage(params.message);
  const wantsOwnerUpdate =
    normalized.includes("proprietario") ||
    normalized.includes("proprietário") ||
    normalized.includes("dono") ||
    Boolean(ownerName) ||
    Boolean(ownerExplicitName) ||
    Boolean(ownerExplicitPhone) ||
    Boolean(ownerExplicitEmail) ||
    Boolean(ownerExplicitDocument);
  if (wantsOwnerUpdate && asksOwnerEdit) {
    let owner = null as any;
    if (ownerCrudId) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { id: ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      });
    }
    if (!owner && selectedOwnerId) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { id: selectedOwnerId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      });
    }
    if (!owner && params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { ownerId: true },
      });
      if (scopedCase?.ownerId) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
        });
      }
    }
    if (!owner) {
      const conditions = [
        ownerExplicitDocument ? { document: ownerExplicitDocument } : null,
        ownerExplicitPhone ? { phone: ownerExplicitPhone } : null,
        ownerExplicitEmail ? { email: ownerExplicitEmail } : null,
        ownerName ? { name: ownerName } : null,
        dedupeSelection?.selectedRef ? { document: dedupeSelection.selectedRef } : null,
        dedupeSelection?.selectedRef ? { phone: dedupeSelection.selectedRef } : null,
        dedupeSelection?.selectedRef ? { email: dedupeSelection.selectedRef } : null,
        dedupeSelection?.selectedName ? { name: dedupeSelection.selectedName } : null,
      ].filter(Boolean) as Array<Record<string, string>>;
      if (conditions.length > 0) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, OR: conditions },
          orderBy: { updatedAt: "desc" },
        });
      }
    }
    if (owner) {
      const patch: Record<string, unknown> = {};
      if (ownerExplicitName) patch.name = ownerExplicitName;
      if (ownerExplicitPhone) patch.phone = ownerExplicitPhone;
      if (ownerExplicitEmail) patch.email = ownerExplicitEmail;
      if (ownerExplicitDocument) patch.document = ownerExplicitDocument;
      if (ownerExplicitDocument) {
        const nextPending = asStringList(owner.pendingItems).filter((item) => item !== "ownerDocument" && item !== "documento do proprietário");
        patch.pendingItems = nextPending;
        patch.status = nextPending.length > 0 ? "pending_data" : "ready_for_review";
      }
      if (Object.keys(patch).length === 0) {
        return {
          mode: "consult",
          action: "crm.owner.update",
          threadLabel: "Proprietário",
          conversationState: params.threadState ?? createEmptyThreadState(),
          presentation: {
            text: "",
            form: buildOwnerUpdateForm(owner),
            dedupeKey: `crm.owner.update.form:${owner.id}`,
            card: {
              title: sanitizeOwnerName(owner.name),
              lines: [],
              ctas: [
                { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${sanitizeOwnerName(owner.name)}` },
                { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${sanitizeOwnerName(owner.name)}` },
                { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
              ],
              actionsLayout: "inline",
            },
          },
        } as any;
      }
      const updated = await params.prisma.imobOwner.update({ where: { id: owner.id }, data: patch });
      const ownerForCard = {
        ...owner,
        ...updated,
        _count: owner._count ?? { properties: 0, cases: 0 },
      };
      const currentPending = asStringList(ownerForCard.pendingItems).map((item) => item === "ownerDocument" ? "documento do proprietário" : item);
      return {
        mode: "consult",
        action: "crm.owner.update",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Cadastro do proprietário atualizado com sucesso.",
          owner: "Corretor" as any,
          nextStep: currentPending.length > 0 ? "Completar as pendências restantes do proprietário." : "Vincular o proprietário ao próximo imóvel ou etapa documental.",
          pendingFieldLabels: currentPending,
          dedupeKey: `crm.owner.update:${updated.id}:profile`,
          card: {
            title: sanitizeOwnerName(ownerForCard.name),
            lines: [
              ownerForCard.phone ? `Telefone: ${ownerForCard.phone}` : null,
              ownerForCard.email ? `E-mail: ${ownerForCard.email}` : null,
              ownerForCard.document ? `Documento: ${ownerForCard.document}` : null,
              `Status: ${formatImobStatusLabel(ownerForCard.status)}`,
              `Pendências: ${formatImobPendingList(currentPending)}`,
              `Imóveis: ${ownerForCard._count?.properties ?? 0}`,
              `Casos: ${ownerForCard._count?.cases ?? 0}`,
            ].filter(Boolean) as string[],
            ctas: [
              { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${sanitizeOwnerName(ownerForCard.name)}` },
              { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${sanitizeOwnerName(ownerForCard.name)}` },
              { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
            ],
            actionsLayout: "inline",
          },
        },
      } as any;
    }
  }

  const wantsLeadUpdate = normalized.includes("lead") || normalized.includes("cliente") || normalized.includes("comprador") || normalized.includes("locatario");
  if (wantsLeadUpdate && (targetCity || budgetCents !== null || leadPhone || leadEmail || leadGoal)) {
    let lead = null as any;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { leadId: true },
      });
      if (scopedCase?.leadId) {
        lead = await params.prisma.imobLead.findFirst({ where: { id: scopedCase.leadId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      }
    }
    if (!lead) {
      const conditions = [leadPhone ? { phone: leadPhone } : null, leadEmail ? { email: leadEmail } : null, leadName ? { name: leadName } : null].filter(Boolean) as Array<Record<string, string> | null> as Array<Record<string, string>>;
      if (conditions.length > 0) {
        lead = await params.prisma.imobLead.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, OR: conditions },
          orderBy: { updatedAt: "desc" },
        });
      }
    }
    if (lead) {
      const nextPending = asStringList(lead.pendingItems)
        .filter((item) => !(item === "cidade de interesse" && targetCity))
        .filter((item) => !(item === "faixa de orçamento" && budgetCents !== null))
        .filter((item) => !(item === "budgetMax" && budgetCents !== null))
        .filter((item) => !(item === "telefone do lead" && leadPhone))
        .filter((item) => !(item === "leadPhone" && leadPhone))
        .filter((item) => !(item === "objetivo do lead" && leadGoal))
        .filter((item) => !(item === "desiredGoal" && leadGoal));
      const updated = await params.prisma.imobLead.update({
        where: { id: lead.id },
        data: {
          goal: leadGoal ?? lead.goal,
          targetCity: targetCity ?? lead.targetCity,
          budgetMaxCents: budgetCents ?? lead.budgetMaxCents,
          phone: leadPhone ?? lead.phone,
          email: leadEmail ?? lead.email,
          pendingItems: nextPending,
          stage: nextPending.length > 0 ? (lead.stage ?? "pending_data") : "qualified",
        },
      });
      return {
        mode: "consult",
        action: "crm.lead.update",
        threadLabel: "Lead",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: [
            `Cadastro do lead ${updated.name} atualizado com sucesso.`,
            `Pendências atuais: ${formatImobPendingList(nextPending)}.`,
            nextPending.length > 0 ? buildLeadPendingSuggestion({ name: updated.name, pendingItems: nextPending }) : null,
            nextPending.length > 0 ? "Próximo passo: completar as pendências restantes do lead." : "Próximo passo: vincular o lead ao próximo imóvel ou etapa comercial.",
          ].filter(Boolean).join("\n"),
          owner: "Corretor" as any,
          nextStep: nextPending.length > 0 ? "Completar as pendências restantes do lead." : "Vincular o lead ao próximo imóvel ou etapa comercial.",
          pendingFieldLabels: nextPending,
          dedupeKey: `crm.lead.update:${updated.id}`,
        },
      } as any;
    }
  }

  const wantsPropertyUpdate = normalized.includes("imovel") || normalized.includes("apartamento") || normalized.includes("casa") || normalized.includes("sala") || normalized.includes("terreno");
  const wantsPriceUpdate = normalized.includes("preco") || normalized.includes("valor");
  if (wantsPropertyUpdate && wantsPriceUpdate && priceCents) {
    let property = null as any;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { propertyId: true },
      });
      if (scopedCase?.propertyId) {
        property = await params.prisma.imobProperty.findFirst({ where: { id: scopedCase.propertyId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      }
    }
    if (!property && propertyRef) {
      property = await params.prisma.imobProperty.findFirst({ where: { id: propertyRef, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } } });
    }
    if (!property && address) {
      property = await params.prisma.imobProperty.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, address: { contains: address ?? "" } },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (property) {
      const nextPending = asStringList(property.pendingItems).filter((item) => item !== "askingPrice" && item !== "preço do imóvel" && item !== "valor do imóvel" && item !== "propertyPrice");
      const updated = await params.prisma.imobProperty.update({
        where: { id: property.id },
        data: { askingPriceCents: priceCents, pendingItems: nextPending, status: nextPending.length > 0 ? "pending_data" : "ready_for_review" },
      });
      return {
        mode: "consult",
        action: "crm.property.update",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: [
            `Preço do imóvel ${formatPropertyLookupLabel(updated)} atualizado com sucesso.`,
            `Pendências atuais: ${formatImobPendingList(nextPending)}.`,
            nextPending.length > 0 ? buildPropertyPendingSuggestion({ id: updated.id, address: updated.address, pendingItems: nextPending }) : null,
            nextPending.length > 0 ? "Próximo passo: completar as pendências restantes do imóvel." : "Próximo passo: vincular o imóvel ao próximo lead ou etapa comercial.",
          ].filter(Boolean).join("\n"),
          owner: "Corretor" as any,
          nextStep: nextPending.length > 0 ? "Completar as pendências restantes do imóvel." : "Vincular o imóvel ao próximo lead ou etapa comercial.",
          pendingFieldLabels: nextPending,
          dedupeKey: `crm.property.update:${updated.id}:price`,
        },
      } as any;
    }
  }

  return null;
}

export async function resolveImobCrmOperationalConsult(params: ResolverParams) {
  const normalized = normalizeImobCrmText(params.message);
  const ownerNameHint = extractOwnerNameFromMessage(params.message);
  const propertyRefHint = extractPropertyRefFromMessage(params.message);
  const addressHint = extractAddressFromMessage(params.message);
  const wantsLead = normalized.includes("lead");
  const wantsOwner = normalized.includes("proprietario") || normalized.includes("proprietarios") || normalized.includes("dono") || normalized.includes("owner") || Boolean(ownerNameHint);
  const wantsProperty = normalized.includes("imovel") || normalized.includes("imoveis") || normalized.includes("apartamento") || normalized.includes("apto") || normalized.includes("casa") || normalized.includes("studio") || normalized.includes("terreno") || normalized.includes("galpao") || normalized.includes("sala") || Boolean(propertyRefHint) || Boolean(addressHint);
  const asksLeadList = wantsLead && (normalized.includes("listar leads") || normalized.includes("quais leads estao cadastrados") || normalized.includes("leads cadastrados"));
  const asksOwnerList = wantsOwner && (normalized.includes("listar proprietarios") || normalized.includes("quais proprietarios estao cadastrados") || normalized.includes("proprietarios cadastrados"));
  const asksPropertyList = wantsProperty && (normalized.includes("listar imoveis") || normalized.includes("quais imoveis estao cadastrados") || normalized.includes("imoveis cadastrados"));
  const asksPendingOnly = normalized.includes("com pendencias");
  const asksQualifiedOnly = normalized.includes("qualificados") || normalized.includes("qualificado");
  const asksReadyForReview = normalized.includes("prontos para revisao") || normalized.includes("pronto para revisao");
  const asksGoalRent = normalized.includes("locacao");
  const asksGoalSale = normalized.includes("venda") || normalized.includes("compra");
  const listCityFilter = extractListCityFilter(params.message);
  const businessReadIntent = resolveBusinessReadIntent(params.message);
  const wantsCase = normalized.includes("caso");
  const asksRecentCase = normalized.includes("caso mais recente") || normalized.includes("caso recente") || normalized.includes("ultimo caso");
  const asksLeadCases = normalized.includes("casos do lead") || normalized.includes("quais casos do lead");
  const asksCurrentCase = normalized.includes("nesse caso") || normalized.includes("desse caso") || normalized.includes("deste caso") || asksRecentCase;
  const asksCaseStatus = normalized.includes("status desse caso") || normalized.includes("status deste caso") || normalized.includes("status do caso");
  const asksMissing = normalized.includes("o que falta") || normalized.includes("pendencia");
  const asksShow = normalized.includes("mostrar") || normalized.includes("ver") || normalized.includes("consultar") || normalized.includes("quais") || normalized.includes("abrir") || asksRecentCase;
  const asksEdit = normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar");
  const asksDelete = normalized.includes("excluir") || normalized.includes("deletar") || normalized.includes("remover") || normalized.includes("apagar") || normalized.includes("arquivar");
  const ownerCrudId = extractOwnerCrudIdFromMessage(params.message);
  const propertyCrudId = extractPropertyCrudIdFromMessage(params.message);
  const domainGuidanceIntent = resolveDomainGuidanceIntent(params.message);

  if (domainGuidanceIntent && !params.caseId) {
    return buildDomainGuidanceResponse(domainGuidanceIntent, params.threadState);
  }

  if (businessReadIntent) {
    const item = params.caseId
      ? await params.prisma.imobCase.findFirst({
          where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true, address: true, goal: true, askingPriceCents: true } },
            lead: { select: { id: true, name: true, phone: true, email: true, goal: true, targetCity: true, budgetMaxCents: true } },
            _count: { select: { events: true } },
          },
        })
      : await params.prisma.imobCase.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true, address: true, goal: true, askingPriceCents: true } },
            lead: { select: { id: true, name: true, phone: true, email: true, goal: true, targetCity: true, budgetMaxCents: true } },
            _count: { select: { events: true } },
          },
        });

    if (!item) {
      return {
        mode: "consult",
        action: `crm.case.${businessReadIntent}`,
        threadLabel: "Caso",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei um caso IMOB para fazer essa leitura comercial.",
          suggestedNextAction: "Abra ou retome um caso IMOB antes de consultar status, bloqueios ou próxima ação.",
          card: {
            title: "Caso não encontrado",
            lines: ["Vincule esta conversa a um caso ou abra um caso recente no IMOB para consultar pipeline, bloqueios e próximo passo."],
          },
        },
      } as any;
    }

    const caseContext = buildCaseContextFromRecord(item);
    const presentation = legacyBusinessRead.buildImobBusinessReadPresentation({
      intent: businessReadIntent,
      caseContext,
      caseSelectionNote: params.caseId ? null : "Usei o caso IMOB mais recente deste workspace para esta leitura.",
    }) as any;
    if (
      businessReadIntent === "blocked_run_resolution"
      && typeof presentation?.nextStep === "string"
      && normalizeImobCrmText(presentation.nextStep).includes("mostrar bloqueios do caso")
    ) {
      presentation.nextStep = "consultar caso";
      if (typeof presentation.text === "string") {
        presentation.text = presentation.text.replace(/Para destravar:\s*mostrar bloqueios do caso\.?/i, "Para destravar: consultar caso.");
      }
    }
    return {
      mode: "consult",
      action: `crm.case.${businessReadIntent}`,
      threadLabel: formatCaseFlowLabel(item.flow),
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext,
      presentation,
    } as any;
  }

  if (asksLeadList) {
    const allLeads = await params.prisma.imobLead.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const leads = allLeads
      .filter((item) => !asksPendingOnly || (Array.isArray(item.pendingItems) && item.pendingItems.filter((pending) => !(pending === "faixa de orçamento" && item.budgetMaxCents !== null && item.budgetMaxCents !== undefined)).length > 0))
      .filter((item) => !asksQualifiedOnly || item.stage === "qualified")
      .filter((item) => asksGoalRent ? item.goal === "locacao" : asksGoalSale ? item.goal === "venda" || item.goal === "compra" : true)
      .slice(0, 8);
    const listTitle = asksPendingOnly ? "Leads com pendências" : asksQualifiedOnly ? "Leads qualificados" : asksGoalRent ? "Leads de locação" : asksGoalSale ? "Leads de compra e venda" : "Leads cadastrados";
    return {
      mode: "consult",
      action: "crm.lead.list",
      threadLabel: "Lead",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          leads.length > 0 ? `Encontrei ${leads.length} lead(s) no CRM operacional do IMOB.` : asksPendingOnly ? "Não encontrei leads com pendências no CRM operacional do IMOB." : asksQualifiedOnly ? "Não encontrei leads qualificados no CRM operacional do IMOB." : asksGoalRent ? "Não encontrei leads de locação no CRM operacional do IMOB." : asksGoalSale ? "Não encontrei leads de compra e venda no CRM operacional do IMOB." : "Não encontrei leads cadastrados no CRM operacional do IMOB.",
          leads.length > 0 ? `Resumo atual: ${leads.map((item) => `${item.name} (${formatImobStatusLabel(item.stage)})`).join(" | ")}.` : null,
          leads.length > 0 ? "Próximo passo: abrir um lead para revisar pendências, qualificação e próximos vínculos comerciais." : null,
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as any,
        nextStep: leads.length > 0 ? "Abrir um lead para revisar pendências, qualificação e próximos vínculos comerciais." : "Cadastrar o primeiro lead para iniciar a qualificação comercial.",
        dedupeKey: `crm.lead.list:${asksPendingOnly ? "pending" : asksQualifiedOnly ? "qualified" : asksGoalRent ? "rent" : asksGoalSale ? "sale" : "all"}`,
        card: {
          title: listTitle,
          lines: leads.length > 0
            ? leads.map((item) => {
                const pendingItems = Array.isArray(item.pendingItems) ? item.pendingItems.filter((pending) => !(pending === "faixa de orçamento" && item.budgetMaxCents !== null && item.budgetMaxCents !== undefined)) : item.pendingItems;
                return `${item.name} | ${formatImobStatusLabel(item.stage)} | Objetivo: ${item.goal ?? "não informado"} | Pendências: ${formatImobPendingList(pendingItems)}`;
              })
            : [asksPendingOnly ? "Nenhum lead com pendências no momento." : asksQualifiedOnly ? "Nenhum lead qualificado no momento." : "Nenhum lead cadastrado até o momento."],
        },
      },
    } as any;
  }

  if (asksOwnerList) {
    const allOwners = await params.prisma.imobOwner.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { _count: { select: { properties: true, cases: true } } },
    });
    const owners = allOwners.filter((item) => !asksPendingOnly || (Array.isArray(item.pendingItems) && item.pendingItems.length > 0)).slice(0, 8);
    return {
      mode: "consult",
      action: "crm.owner.list",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          owners.length > 0 ? `Encontrei ${owners.length} proprietário(s) no CRM operacional do IMOB.` : asksPendingOnly ? "Não encontrei proprietários com pendências no CRM operacional do IMOB." : "Não encontrei proprietários cadastrados no CRM operacional do IMOB.",
          owners.length > 0 ? `Resumo atual: ${owners.map((item) => `${item.name} (${formatImobStatusLabel(item.status)})`).join(" | ")}.` : null,
          owners.length > 0 ? "Próximo passo: abrir um proprietário para revisar pendências ou vincular um novo imóvel." : null,
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as any,
        nextStep: owners.length > 0 ? "Abrir um proprietário para revisar pendências ou vincular um novo imóvel." : "Cadastrar o primeiro proprietário para iniciar a operação.",
        dedupeKey: asksPendingOnly ? "crm.owner.list:pending" : "crm.owner.list",
        card: {
          title: asksPendingOnly ? "Proprietários com pendências" : "Proprietários cadastrados",
          lines: owners.length > 0
            ? owners.map((item) => `${item.name} | ${formatImobStatusLabel(item.status)} | Pendências: ${formatImobPendingList(Array.isArray(item.pendingItems) ? item.pendingItems.map((pending) => pending === "ownerDocument" ? "documento do proprietário" : pending) : item.pendingItems)} | Imóveis: ${item._count?.properties ?? 0}`)
            : [asksPendingOnly ? "Nenhum proprietário com pendências no momento." : "Nenhum proprietário cadastrado até o momento."],
          ctas: owners.slice(0, 3).map((item) => ({
            id: `owner-open-${item.id}`,
            label: `Consultar ${item.name}`,
            kind: "secondary" as const,
            action: "send_suggested_message" as const,
            nextMessage: `consultar proprietário ${item.name}`,
          })),
        },
      },
    } as any;
  }

  if (asksPropertyList) {
    const allProperties = await params.prisma.imobProperty.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { owner: { select: { name: true } }, _count: { select: { cases: true } } },
    });
    const properties = allProperties
      .filter((item) => !asksReadyForReview || item.status === "ready_for_review")
      .filter((item) => !listCityFilter || normalizeImobCrmText(item.city ?? "") === listCityFilter)
      .slice(0, 8);
    return {
      mode: "consult",
      action: "crm.property.list",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          properties.length > 0 ? `Encontrei ${properties.length} imóvel(is) no CRM operacional do IMOB.` : asksReadyForReview ? "Não encontrei imóveis prontos para revisão no CRM operacional do IMOB." : listCityFilter ? `Não encontrei imóveis cadastrados em ${titleCaseWords(listCityFilter)} no CRM operacional do IMOB.` : "Não encontrei imóveis cadastrados no CRM operacional do IMOB.",
          properties.length > 0 ? `Resumo atual: ${properties.map((item) => `${formatPropertyLookupLabel(item)} (${formatImobStatusLabel(item.status)})`).join(" | ")}.` : null,
          properties.length > 0 ? "Próximo passo: abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : null,
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as any,
        nextStep: properties.length > 0 ? "Abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : "Cadastrar o primeiro imóvel para iniciar a operação comercial.",
        dedupeKey: asksReadyForReview ? "crm.property.list:review" : listCityFilter ? `crm.property.list:${listCityFilter}` : "crm.property.list",
        card: {
          title: asksReadyForReview ? "Imóveis prontos para revisão" : listCityFilter ? `Imóveis em ${titleCaseWords(listCityFilter)}` : "Imóveis cadastrados",
          lines: properties.length > 0
            ? properties.map((item) => `${formatPropertyLookupLabel(item)} | ${item.goal ?? "sem finalidade"} | ${item.city ?? "sem cidade"} | ${formatImobStatusLabel(item.status)} | Proprietário: ${item.owner?.name ?? "não vinculado"}`)
            : [asksReadyForReview ? "Nenhum imóvel pronto para revisão no momento." : listCityFilter ? `Nenhum imóvel cadastrado em ${titleCaseWords(listCityFilter)}.` : "Nenhum imóvel cadastrado até o momento."],
          ctas: properties.slice(0, 3).map((item) => ({
            id: `property-open-${item.id}`,
            label: `Consultar ${formatPropertyLookupLabel(item)}`,
            kind: "secondary" as const,
            action: "send_suggested_message" as const,
            nextMessage: `consultar imóvel ${item.id}`,
          })),
        },
      },
    } as any;
  }

  if (wantsOwner && (asksEdit || asksDelete)) {
    let owner = null as any;
    if (ownerCrudId) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { id: ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
        include: { _count: { select: { properties: true, cases: true } } },
      });
    }
    if (!owner && params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { ownerId: true },
      });
      if (scopedCase?.ownerId) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
    }
    if (!owner) {
      const name = extractOwnerNameFromMessage(params.message);
      const email = extractLeadEmailFromMessage(params.message);
      const phone = extractLeadPhoneFromMessage(params.message);
      const document = extractDocumentFromMessage(params.message);
      const conditions = [document ? { document } : null, phone ? { phone } : null, email ? { email } : null, name ? { name } : null].filter(Boolean) as Array<Record<string, string> | null> as Array<Record<string, string>>;
      if (conditions.length > 0) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, OR: conditions },
          orderBy: { updatedAt: "desc" },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
    }

    if (!owner) {
      return {
        mode: "consult",
        action: asksDelete ? "crm.owner.delete" : "crm.owner.update",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: asksDelete ? "Não encontrei esse proprietário para confirmar o arquivamento." : "Não encontrei esse proprietário para editar o cadastro.",
          suggestedNextAction: "Use nome, telefone, e-mail, documento ou o caso ativo para localizar o proprietário correto.",
        },
      } as any;
    }

    if (asksDelete) {
      return {
        mode: "consult",
        action: "crm.owner.delete",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: `Confirme o arquivamento do proprietário ${owner.name}.`,
          dedupeKey: `crm.owner.delete.confirm:${owner.id}`,
          card: {
            title: `Excluir proprietário ${owner.name}`,
            lines: ["Essa ação arquiva o cadastro e remove o proprietário das consultas operacionais padrão."],
            ctas: [
              { id: `owner-delete-confirm-${owner.id}`, label: "Confirmar arquivamento", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar arquivamento do proprietário ${owner.id}` },
            ],
          },
        },
      } as any;
    }

    return {
      mode: "consult",
      action: "crm.owner.update",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: "",
        form: buildOwnerUpdateForm(owner),
        dedupeKey: `crm.owner.update.form:${owner.id}`,
        card: {
          title: sanitizeOwnerName(owner.name),
          lines: [],
          ctas: [
            { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${sanitizeOwnerName(owner.name)}` },
            { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${sanitizeOwnerName(owner.name)}` },
            { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
          ],
          actionsLayout: "inline",
        },
      },
    } as any;
  }

  if (wantsProperty && (asksEdit || asksDelete)) {
    let property = null as any;
    if (propertyCrudId) {
      property = await params.prisma.imobProperty.findFirst({
        where: { id: propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
        include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
      });
    }
    if (!property && params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { propertyId: true },
      });
      if (scopedCase?.propertyId) {
        property = await params.prisma.imobProperty.findFirst({
          where: { id: scopedCase.propertyId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
    }
    if (!property) {
      const address = extractAddressFromMessage(params.message);
      if (propertyCrudId || propertyRefHint) {
        property = await params.prisma.imobProperty.findFirst({
          where: { id: (propertyCrudId ?? propertyRefHint) ?? "", tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
      if (!property && address) {
        property = await params.prisma.imobProperty.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, address: { contains: address ?? "" } },
          orderBy: { updatedAt: "desc" },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
    }

    if (!property) {
      return {
        mode: "consult",
        action: asksDelete ? "crm.property.delete" : "crm.property.update",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: asksDelete ? "Não encontrei esse imóvel para confirmar o arquivamento." : "Não encontrei esse imóvel para editar o cadastro.",
          suggestedNextAction: "Use o identificador, endereço ou o caso ativo para localizar o imóvel correto.",
        },
      } as any;
    }

    if (asksDelete) {
      return {
        mode: "consult",
        action: "crm.property.delete",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: `Confirme a exclusão do imóvel ${formatPropertyLookupLabel(property)}.`,
          dedupeKey: `crm.property.delete.confirm:${property.id}`,
          card: {
            title: `Excluir imóvel ${formatPropertyLookupLabel(property)}`,
            lines: ["Essa ação arquiva o cadastro e remove o imóvel das consultas operacionais padrão."],
            ctas: [
              { id: `property-delete-confirm-${property.id}`, label: "Confirmar arquivamento", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar arquivamento do imóvel ${property.id}` },
            ],
          },
        },
      } as any;
    }

    return {
      mode: "consult",
      action: "crm.property.update",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: "",
        form: buildPropertyUpdateForm(property),
        dedupeKey: `crm.property.update.form:${property.id}`,
        card: {
          title: formatPropertyLookupLabel(property),
          lines: [],
          ctas: [
            { id: `property-edit-${property.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar imóvel ${property.id}` },
            { id: `property-delete-${property.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir imóvel ${property.id}` },
            { id: `property-print-${property.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
          ],
          actionsLayout: "inline",
        },
      },
    } as any;
  }

  if (wantsOwner && (asksMissing || asksShow)) {
    let owner = null as any;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { ownerId: true },
      });
      if (scopedCase?.ownerId) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
    }
    if (!owner) {
      const name = extractOwnerNameFromMessage(params.message);
      const email = extractLeadEmailFromMessage(params.message);
      const phone = extractLeadPhoneFromMessage(params.message);
      const document = extractDocumentFromMessage(params.message);
      const conditions = [document ? { document } : null, phone ? { phone } : null, email ? { email } : null, name ? { name } : null].filter(Boolean) as Array<Record<string, string> | null> as Array<Record<string, string>>;
      if (conditions.length > 0) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, OR: conditions },
          orderBy: { updatedAt: "desc" },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
    }
    if (!owner) {
      return {
        mode: "consult",
        action: "crm.owner.lookup",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei esse proprietário no CRM operacional do IMOB.",
          suggestedNextAction: "Cadastre ou atualize o proprietário antes de consultar o histórico dele.",
          card: {
            title: "Proprietário não encontrado",
            lines: ["Use nome, telefone, e-mail ou documento do proprietário para localizar o cadastro operacional."],
          },
        },
      } as any;
    }

    const ownerCases = await params.prisma.imobCase.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, flow: true, status: true, nextStep: true, ownerResponsible: true, updatedAt: true },
    });
    const latestCase = ownerCases[0] ?? null;
    return {
      mode: "consult",
      action: "crm.owner.lookup",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: latestCase ? buildCaseContextFromRecord({ ...latestCase, stage: latestCase.status, pendingItems: [], blockers: [] }) : undefined,
      presentation: {
        text: "",
        owner: "Corretor" as any,
        nextStep: "Vincular o proprietário ao próximo imóvel ou etapa documental.",
        pendingFieldLabels: Array.isArray(owner.pendingItems) ? owner.pendingItems.map((item: string) => item === "ownerDocument" ? "documento do proprietário" : item) : [],
        dedupeKey: `crm.owner.lookup:${owner.id}`,
        card: {
          title: sanitizeOwnerName(owner.name),
          lines: [
            owner.phone ? `Telefone: ${owner.phone}` : null,
            owner.email ? `E-mail: ${owner.email}` : null,
            owner.document ? `Documento: ${owner.document}` : null,
            `Status: ${formatImobStatusLabel(owner.status)}`,
            `Pendências: ${formatImobPendingList(Array.isArray(owner.pendingItems) ? owner.pendingItems.map((item: string) => item === "ownerDocument" ? "documento do proprietário" : item) : owner.pendingItems)}`,
            `Imóveis: ${owner._count?.properties ?? 0}`,
            `Casos: ${owner._count?.cases ?? 0}`,
          ].filter(Boolean) as string[],
          ctas: [
            { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${sanitizeOwnerName(owner.name)}` },
            { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${sanitizeOwnerName(owner.name)}` },
            { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
          ],
          actionsLayout: "inline",
        },
      },
    } as any;
  }

  if (wantsProperty && (asksMissing || asksShow)) {
    let property = null as any;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { propertyId: true },
      });
      if (scopedCase?.propertyId) {
        property = await params.prisma.imobProperty.findFirst({
          where: { id: scopedCase.propertyId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
    }
    if (!property) {
      const address = extractAddressFromMessage(params.message);
      if (propertyRefHint) {
        property = await params.prisma.imobProperty.findFirst({
          where: { id: propertyRefHint, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
      if (!property && address) {
        property = await params.prisma.imobProperty.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, address: { contains: address ?? "" } },
          orderBy: { updatedAt: "desc" },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
      }
    }
    if (!property) {
      return {
        mode: "consult",
        action: "crm.property.lookup",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei esse imóvel no CRM operacional do IMOB.",
          suggestedNextAction: "Use o identificador, endereço ou o caso ativo para localizar o imóvel.",
          card: {
            title: "Imóvel não encontrado",
            lines: ["Use o número do imóvel, endereço ou o caso ativo para consultar a ficha operacional."],
          },
        },
      } as any;
    }
    const propertyCases = await params.prisma.imobCase.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, propertyId: property.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, flow: true, stage: true, status: true, nextStep: true, pendingItems: true, ownerResponsible: true, blockers: true, threadId: true, updatedAt: true },
    });
    const latestCase = propertyCases[0] ?? null;
    return {
      mode: "consult",
      action: "crm.property.lookup",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: latestCase ? buildCaseContextFromRecord(latestCase) : undefined,
      presentation: {
        text: [
          `${formatPropertyLookupLabel(property)} localizado no CRM operacional.`,
          `Pendências atuais: ${formatImobPendingList(property.pendingItems)}.`,
          buildPropertyPendingSuggestion({ id: property.id, address: property.address, pendingItems: property.pendingItems }),
          "Próximo passo: vincular o imóvel ao próximo lead ou etapa comercial/documental.",
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as any,
        nextStep: "Vincular o imóvel ao próximo lead ou etapa comercial/documental.",
        pendingFieldLabels: Array.isArray(property.pendingItems) ? property.pendingItems : [],
        dedupeKey: `crm.property.lookup:${property.id}`,
        card: {
          title: formatPropertyLookupLabel(property),
          lines: [
            property.propertyType ? `Tipo: ${property.propertyType}` : null,
            property.goal ? `Finalidade: ${property.goal}` : null,
            property.city ? `Cidade: ${property.city}` : null,
            property.neighborhood ? `Bairro: ${property.neighborhood}` : null,
            property.address ? `Endereço: ${property.address}` : null,
            property.owner?.name ? `Proprietário: ${property.owner.name}` : null,
            typeof property.askingPriceCents === "number" ? `Valor: ${formatBudgetCentsForImob(property.askingPriceCents)}` : null,
            `Status: ${formatImobStatusLabel(property.status)}`,
            `Pendências: ${formatImobPendingList(property.pendingItems)}`,
            `Casos: ${property._count?.cases ?? 0}`,
          ].filter(Boolean) as string[],
          ctas: [
            { id: `property-edit-${property.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar imóvel ${property.id}` },
            { id: `property-delete-${property.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir imóvel ${property.id}` },
            { id: `property-print-${property.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
          ],
          actionsLayout: "inline",
        },
      },
    } as any;
  }

  const scopedCaseId = params.caseId ?? extractCaseIdFromMessage(params.message);
  if (!asksLeadCases && (scopedCaseId || (wantsCase && (asksCurrentCase || asksCaseStatus || asksMissing || asksShow)))) {
    if (!scopedCaseId && !asksCurrentCase && !asksCaseStatus && !asksMissing) {
      return {
        mode: "consult",
        action: "crm.case.lookup",
        threadLabel: "Caso",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Qual caso você quer consultar?",
          suggestedNextAction: "Digite `consultar caso <código do caso>` para eu abrir no chat.",
          card: {
            title: "Consultar caso",
            lines: ["Informe o código do caso para abrir os detalhes deste atendimento."],
          },
        },
      } as any;
    }

    const item = scopedCaseId
      ? await params.prisma.imobCase.findFirst({
          where: { id: scopedCaseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
            lead: { select: { id: true, name: true, phone: true, email: true } },
            _count: { select: { events: true } },
          },
        })
      : await params.prisma.imobCase.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
            lead: { select: { id: true, name: true, phone: true, email: true } },
            _count: { select: { events: true } },
          },
        });

    if (!item) {
      return {
        mode: "consult",
        action: "crm.case.lookup",
        threadLabel: "Caso",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei um caso operacional vinculado a esta conversa.",
          suggestedNextAction: "Cadastre ou retome um caso IMOB antes de consultar pendências e próximos passos.",
          card: {
            title: "Caso não encontrado",
            lines: ["Nenhum caso IMOB recente foi encontrado neste workspace para usar como contexto comercial."],
          },
        },
      } as any;
    }

    const blocker = Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null;
    return {
      mode: "consult",
      action: "crm.case.lookup",
      threadLabel: formatCaseFlowLabel(item.flow),
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: buildCaseContextFromRecord(item),
      presentation: {
        text: buildChatSafeCaseLookupText({
          scopedCaseId,
          flow: item.flow,
          pendingItems: item.pendingItems,
          nextStep: item.nextStep,
          blocker,
        }),
        owner: item.ownerResponsible ?? undefined,
        nextStep: item.nextStep ?? undefined,
        blocker,
        pendingFieldLabels: Array.isArray(item.pendingItems) ? item.pendingItems : [],
        dedupeKey: `crm.case.lookup:${item.id}`,
        card: {
          title: `Caso ${formatCaseFlowLabel(item.flow)}`,
          lines: [
            `Stage: ${item.stage}`,
            `Status: ${formatImobStatusLabel(item.status)}`,
            item.lead?.name ? `Lead: ${item.lead.name}` : null,
            item.property?.id ? `Imóvel: ${item.property.id}` : null,
            `Pendências: ${formatImobPendingList(item.pendingItems)}`,
            item.nextStep ? `Próximo passo: ${item.nextStep}` : null,
            `Evidências: ${item._count?.events ?? 0}`,
          ].filter(Boolean) as string[],
        },
      },
    } as any;
  }

  if (wantsLead && (asksLeadCases || asksMissing || asksShow)) {
    let lead = null as any;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        include: { lead: true },
      });
      lead = scopedCase?.lead ?? null;
    }
    if (!lead) {
      const name = extractLeadNameFromMessage(params.message);
      const email = extractLeadEmailFromMessage(params.message);
      const phone = extractLeadPhoneFromMessage(params.message);
      const conditions = [phone ? { phone } : null, email ? { email } : null, name ? { name } : null].filter(Boolean) as Array<Record<string, string> | null> as Array<Record<string, string>>;
      if (conditions.length > 0) {
        lead = await params.prisma.imobLead.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, OR: conditions },
          orderBy: { updatedAt: "desc" },
        });
      }
    }
    if (!lead) {
      return {
        mode: "consult",
        action: "crm.lead.lookup",
        threadLabel: "Lead",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei esse lead no CRM operacional do IMOB.",
          suggestedNextAction: "Cadastre ou qualifique o lead antes de consultar o histórico dele.",
          card: {
            title: "Lead não encontrado",
            lines: ["Use nome, telefone ou e-mail do lead para localizar o cadastro operacional."],
          },
        },
      } as any;
    }

    const leadCases = await params.prisma.imobCase.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, leadId: lead.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, flow: true, stage: true, status: true, nextStep: true, pendingItems: true, ownerResponsible: true, updatedAt: true },
    });
    const latestCase = leadCases[0] ?? null;
    return {
      mode: "consult",
      action: "crm.lead.lookup",
      threadLabel: "Lead",
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: latestCase ? buildCaseContextFromRecord(latestCase) : undefined,
      presentation: asksLeadCases
        ? {
            text: [
              `Lead ${lead.name} possui ${leadCases.length} caso(s) no CRM operacional.`,
              leadCases.length > 0 ? `Casos atuais: ${leadCases.map((item: any) => `${formatCaseFlowLabel(item.flow)} (${formatImobStatusLabel(item.status)})`).join(" | ")}.` : "Casos atuais: nenhum caso vinculado.",
              latestCase?.nextStep ? `Próximo passo mais recente: ${latestCase.nextStep}` : null,
            ].filter(Boolean).join("\n"),
            owner: (latestCase?.ownerResponsible ?? "Corretor") as any,
            nextStep: latestCase?.nextStep ?? "Vincular o lead ao próximo imóvel ou etapa comercial.",
            pendingFieldLabels: Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item: string) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : [],
            dedupeKey: `crm.lead.lookup:${lead.id}:cases`,
            card: {
              title: `Casos do lead ${lead.name}`,
              lines: leadCases.length > 0
                ? leadCases.map((item: any) => `${formatCaseFlowLabel(item.flow)} | ${formatImobStatusLabel(item.status)} | ${item.nextStep ?? "Sem próximo passo definido"}`)
                : ["Nenhum caso vinculado a este lead."],
            },
          }
        : {
            text: [
              `Lead ${lead.name} localizado no CRM operacional.`,
              `Pendências atuais: ${formatImobPendingList(Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item: string) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems)}.`,
              buildLeadPendingSuggestion({ name: lead.name, pendingItems: Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item: string) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems }),
              "Próximo passo: vincular o lead ao próximo imóvel ou etapa comercial.",
            ].filter(Boolean).join("\n"),
            owner: "Corretor" as any,
            nextStep: "Vincular o lead ao próximo imóvel ou etapa comercial.",
            pendingFieldLabels: Array.isArray(lead.pendingItems) ? lead.pendingItems : [],
            dedupeKey: `crm.lead.lookup:${lead.id}`,
            card: {
              title: `Lead ${lead.name}`,
              lines: [
                lead.phone ? `Telefone: ${lead.phone}` : null,
                lead.email ? `E-mail: ${lead.email}` : null,
                lead.goal ? `Objetivo: ${lead.goal}` : null,
                lead.targetCity ? `Cidade: ${lead.targetCity}` : null,
                lead.budgetMaxCents ? `Orçamento: ${formatBudgetCentsForImob(lead.budgetMaxCents)}` : null,
                `Stage: ${lead.stage ?? "novo"}`,
                `Temperatura: ${lead.temperature ?? "n/a"}`,
                `Pendências: ${formatImobPendingList(Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item: string) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems)}`,
                leadCases.length > 0 ? `Casos: ${leadCases.length}` : "Casos: nenhum caso vinculado",
              ].filter(Boolean) as string[],
            },
          },
    } as any;
  }

  return null;
}
