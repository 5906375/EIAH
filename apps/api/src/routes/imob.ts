import { Router, type Response } from "express";
import crypto from "node:crypto";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { generateContractPreview } from "../services/contracts/contractGenerator";
import type { ContractType } from "../services/contracts/types";
import { createRunRecord } from "../services/runs";
import { emitRunEvent } from "../services/runEventEmitter";
import { WorkspaceAgentAssignmentError } from "../services/workspaceAgentAssignments";
import { searchImobKnowledge } from "../services/imob/imobKnowledgeSearch";
import { readImobDriveSyncSnapshot } from "../services/imob/imobDriveSync";
import { searchImobInventory } from "../services/imob/imobInventoryProvider";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";
import { matchImobConversationalIntents } from "../services/imob/imobIntentCatalog";
import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";
import { buildImobConversationSnapshot } from "../services/imob/imobCaseSnapshotService";
import { buildImobBusinessExport } from "../services/imob/imobCaseExportService";
import { lookupImobCep } from "../services/imob/imobCepLookup";
import {
  IMOB_CHAT_TELEMETRY_KEY,
  recordImobResolveTurnSemanticTelemetry,
} from "../services/imob/imobTelemetry";
import {
  resolveImobCrmOperationalConsult as resolveImobCrmOperationalConsultLegacy,
  resolveImobCrmOperationalUpdate as resolveImobCrmOperationalUpdateLegacy,
} from "../services/imob/crm/imobCrmResolver";
import {
  buildOwnerUpdateForm,
  buildPropertyUpdateForm,
  extractExplicitAddressFieldFromMessage,
  extractLeadGoalFromMessage,
  extractOwnerCrudIdFromMessage,
  extractOwnerExplicitDocumentFromMessage,
  extractOwnerExplicitEmailFromMessage,
  extractOwnerExplicitNameFromMessage,
  extractOwnerExplicitPhoneFromMessage,
  extractPropertyCityFromMessage,
  extractPropertyCrudIdFromMessage,
  extractPropertyGoalFromMessage,
  extractPropertyTypeFromMessage,
  findOwnerIdByAuditName,
  formatPropertyLookupLabel,
  isOwnerDeleteConfirmationMessage,
  isPropertyDeleteConfirmationMessage,
  recordImobCrmAuditEvent,
  resolveOwnerDisplayName,
  resolveOwnerDocumentForDisplay,
} from "../services/imob/crm/imobCrmRouteCrudHelpers";
import {
  hydrateThreadStateWithPersistedLead as hydrateImobCrmThreadStateWithPersistedLead,
  injectResolvedPendingSuggestion as injectImobCrmResolvedPendingSuggestion,
} from "../services/imob/crm/imobCrmTurnContinuity";
import { applyExistingRegistrationResolution as applyImobCrmExistingRegistrationResolution } from "../services/imob/crm/imobCrmTurnRegistration";
import { createEmptyImobCrmThreadState } from "../services/imob/crm/imobCrmTurnState";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import {
  type ImobOperationalResolverParams,
  resolveImobOperationalConsultImpl,
  resolveImobOperationalUpdateImpl,
} from "../services/imob/crm/imobCrmOperationalResolvers";
import { buildImobCrmBusinessReadHelpers } from "../services/imob/crm/imobCrmBusinessRead";
import { resolveImobRecipeMissionContext } from "../services/imob/crm/imobRecipeMissionConfig";
import { resolveImobTenantRecipeForWorkspace } from "../services/imob/crm/imobTenantRecipeContext";
import { buildOwnerPendingSuggestion } from "../services/imob/crm/imobOwnerPendingSuggestion";
import {
  getLegacyCrmFallbackConfigFromEnv,
  resolveLegacyCrmFallbackDecision,
  type LegacyCrmFallbackDecision,
} from "../services/imob/crm/imobCrmLegacyFallbackPolicy";
import { resolveImobCrmTurnEngine } from "../services/imob/crm/imobCrmTurnEngine";
import { resolveImobCrmActionDispatch } from "../services/imob/crm/imobCrmActionDispatcher";
import { registerImobCrmRoutes } from "./imobCrmRouter";
import {
  imobApprovalActionSchema,
  imobAttachmentCrmSuggestionApplySchema,
  imobAttachmentResolveSchema,
  imobCaseAssignOwnerSchema,
  imobCaseCreateSchema,
  imobCaseEventInputSchema,
  imobCaseUpdateSchema,
  imobFollowUpRunSchema,
  imobLeadCreateSchema,
  imobLeadUpdateSchema,
  imobOwnerCreateSchema,
  imobOwnerUpdateSchema,
  imobPropertyCreateSchema,
  imobPropertyUpdateSchema,
} from "./imobCrmSchemas";
import {
  resolveImobInstallationStatus,
  sendImobAccessDenied,
} from "../services/imob/imobAccessGate";
import { canWorkspaceOperateImobStage, hasWorkspacePermission, readWorkspaceResponsibleProfile } from "../services/workspaceResponsibility";
import { buildImobCrmContinuityCoherenceReadModel } from "../services/imob/orchestrator/imobCrmContinuityCoherenceReadModel";
import {
  asStringList,
  buildImobCanonicalCase,
  type ImobCanonicalCase,
} from "../services/imob/imobCanonical";
import multer from "multer";
import { extractTextFromDocxBuffer } from "../services/imob/intake/imobDocxAdapter";
import { maskContractPii } from "../services/imob/intake/imobContractPiiMasker";
import { extractLeaseContractFromText } from "../services/imob/intake/imobLeaseExtractor";
import { classifyImobContract } from "../services/imob/intake/imobContractClassifier";
import {
  createDraft,
  getDraft,
  deleteDraft,
  DRAFT_TTL_MS,
} from "../services/imob/intake/imobContractDraftService";
import { persistBuffer } from "../services/storage";
import { createUploadedDocument } from "../services/uploads";
import { IMOB_DISPATCHER_ACTION_IDS } from "../services/imob/crm/imobCrmActionDispatcher";
import {
  buildExportHash,
  scanIntakeDataForPii,
  renderIntakeHtml,
  renderIntakeDocx,
  type IntakeExportData,
} from "../services/imob/intake/imobContractIntakeRenderer";

export const imobRouter = Router();
imobRouter.use(enforceTenant);

function parseWindowStart(windowRaw: unknown) {
  const normalized = typeof windowRaw === "string" ? windowRaw : "7d";
  const now = Date.now();
  if (normalized === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractReasonCodes(payload: unknown): string[] {
  const obj = asObject(payload);
  if (!obj) return [];
  const candidates = [
    obj.reasonCodes,
    obj.reasons,
    asObject(obj.guard)?.reasonCodes,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const values = candidate.filter((item) => typeof item === "string") as string[];
    if (values.length > 0) return values;
  }
  return [];
}

type ImobPresentationFormField = {
  name?: string;
  value?: unknown;
} & Record<string, unknown>;

type ImobPresentationForm = {
  fields?: ImobPresentationFormField[];
} & Record<string, unknown>;

function extractAction(run: unknown) {
  const request = asObject(asObject(run)?.request);
  const metadata = asObject(request?.metadata);
  const action = metadata?.action;
  if (typeof action === "string") return action;
  const protocolAction = metadata?.protocolAction;
  if (typeof protocolAction === "string") return protocolAction;
  return null;
}

function isImobRun(run: unknown) {
  const action = extractAction(run);
  if (action && action.startsWith("realestate.")) return true;
  const request = asObject(asObject(run)?.request);
  const metadata = asObject(request?.metadata);
  return metadata?.domain === "imob";
}

function countUxActions(
  rows: Array<{ metadata: unknown }>,
  actions: string[],
) {
  const allowed = new Set(actions);
  return rows.reduce((acc, row) => {
    const metadata = asObject(row.metadata);
    const action = asString(metadata?.action);
    if (action && allowed.has(action)) return acc + 1;
    return acc;
  }, 0);
}

function ageHours(dateRaw: unknown) {
  if (!dateRaw) return 0;
  const parsed = new Date(String(dateRaw));
  if (Number.isNaN(parsed.getTime())) return 0;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
}

const IMOB_CHAT_AGENT_ID = "imob-chat";
const IMOB_CHAT_AUDIT_AGENT_ID = "imob-chat-audit";
const CHAT_KEY_CONVERSATION_CREATED = "conversation.created";
const CHAT_KEY_MESSAGE = "conversation.message";
const CHAT_KEY_TELEMETRY = IMOB_CHAT_TELEMETRY_KEY;
const CHAT_KEY_CONTRACT_INTERVIEW_STATE = "conversation.contract_interview_state";
const CHAT_KEY_CONTRACT_PREVIEW = "conversation.contract_preview";
const RUN_EVENT_CHAT_AUDIT_STARTED = "conversation.audit.started";
const RUN_EVENT_CHAT_MESSAGE_RECORDED = "conversation.message.recorded";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function digitsOnlyRoute(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

const imobCrmBusinessRead = buildImobCrmBusinessReadHelpers({
  asObject,
  asString,
  asStringList,
  normalizeImobRouteText,
  formatBudgetCentsForImob,
  formatImobStatusLabel,
  formatImobPendingList,
  formatImobCaseFlowLabel,
  titleCaseRouteWords,
  createEmptyThreadState,
  resolveImobBackingSpecialists,
  buildImobCanonicalCase,
  resolveBusinessReadIntent(message: string) {
    const match = matchImobConversationalIntents(message).find((intent) =>
      intent.intentId === "pipeline_status" ||
      intent.intentId === "blocked_run_resolution" ||
      intent.intentId === "next_best_action",
    );
    if (match?.intentId) {
      return match.intentId as "pipeline_status" | "blocked_run_resolution" | "next_best_action";
    }
    const normalized = normalizeImobRouteText(message);
    if (
      normalized.includes("piloto")
      && (
        normalized.includes("status")
        || normalized.includes("situacao")
        || normalized.includes("situação")
        || normalized.includes("estado")
        || normalized.includes("approval")
        || normalized.includes("aprovacao")
        || normalized.includes("aprovação")
        || normalized.includes("rollout")
        || normalized.includes("shadow")
      )
    ) {
      return "pipeline_status";
    }
    return null;
  },
});

function withImobCanonicalCase<T extends {
  flow: string | null | undefined;
  stage: string | null | undefined;
  status: string | null | undefined;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
}>(item: T): T & { canonical: ImobCanonicalCase } {
  return {
    ...item,
    canonical: buildImobCanonicalCase(item),
  };
}

function normalizeImobRouteText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function titleCaseRouteWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function isCaseReferenceRouteText(value: string) {
  return /\b(?:este|esse|deste|desse|nesse)\s+caso\b/.test(value);
}

function isInvalidOperationalEntityCandidateRoute(value: string) {
  return [
    "null",
    "undefined",
    "none",
    "existente",
    "novo",
    "cadastro",
    "caso",
    "do caso",
    "do lead do",
    "a um imovel",
    "um imovel",
    "imovel",
  ].includes(value) || isCaseReferenceRouteText(value);
}

function extractLeadEmailFromMessage(raw: string) {
  const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extractLeadPhoneFromMessage(raw: string) {
  const match = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  if (!match) return null;
  return match[0].replace(/\s+/g, " ").trim();
}

function trimLeadNameCandidate(value: string) {
  const trimmed = value
    .replace(/^(?:chamado|chamada|nomeado|nomeada)\s+/i, "")
    .replace(/\b(no|na)\s+(imovel|imóvel|apartamento|apto|casa)\b.*$/i, "")
    .replace(/\b(com|por)\s+(oferta|proposta|valor)\b.*$/i, "")
    .replace(/\b(email|telefone|cpf|cnpj|documento|whatsapp)\b.*$/i, "")
    .trim();
  const normalized = normalizeImobRouteText(trimmed);
  if (!trimmed || isInvalidOperationalEntityCandidateRoute(normalized)) return "";
  return trimmed;
}

function extractLeadNameFromMessage(message: string) {
  const normalized = normalizeImobRouteText(message);
  if (isCaseReferenceRouteText(normalized)) return null;
  if (normalized.includes("vincular") && normalized.includes("lead") && normalized.includes("imovel")) return null;
  const patterns = [
    /(?:lead|cliente|comprador|locatario)\s+(?:chamado|chamada|nomeado|nomeada)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
    /(?:lead|cliente|comprador|locatario)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
    /(?:qualificar|atender|agendar visita para|gerar proposta para)\s+(?:um\s+)?(?:lead\s+|cliente\s+)?(?:chamado|chamada|nomeado|nomeada)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
    /(?:qualificar|atender|agendar visita para|gerar proposta para)\s+(?:um\s+)?(?:lead\s+|cliente\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1] ? trimLeadNameCandidate(match[1]) : null;
    if (candidate) return titleCaseRouteWords(candidate);
  }
  return null;
}

function extractOwnerNameFromMessage(message: string) {
  const normalized = normalizeImobRouteText(message);
  if (isCaseReferenceRouteText(normalized)) return null;
  const patterns = [
    /(?:proprietario|proprietária|proprietaria|dono)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
    /(?:captar|cadastrar|mostrar|consultar|ver|abrir|editar|atualizar|alterar|excluir|deletar|remover)\s+(?:proprietario\s+|proprietária\s+|proprietaria\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1] ? trimLeadNameCandidate(match[1]) : null;
    if (candidate) return titleCaseRouteWords(candidate);
  }
  return null;
}

function extractPropertyRefFromMessage(message: string) {
  const match = message.match(/(?:imovel|imóvel|apartamento|apto|casa|studio|terreno|galpao|galpão|sala)\s*#?\s*(\d{2,})/i);
  return match?.[1] ?? null;
}

function extractAddressFromMessage(raw: string) {
  const explicitMatch = raw.match(new RegExp('(?:endereco|endereço)(?: do imovel| do imóvel)?\\s*:?\\s*([^,.;\\n]+(?:,[^.;\\n]+)?)', 'i'));
  if (explicitMatch?.[1]) return explicitMatch[1].trim();
  const looseMatch = normalizeImobRouteText(raw).match(/((?:rua|r\.|avenida|av\.|alameda|travessa|estrada|rodovia)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,4}(?:,\s*[a-z0-9-]+)?)/i);
  return looseMatch?.[1] ? titleCaseRouteWords(looseMatch[1].replace(/\s+,/g, ',')) : null;
}

function extractDocumentFromMessage(raw: string) {
  const match = raw.match(new RegExp('\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b|\\b\\d{11}\\b|\\b\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}\\b|\\b\\d{14}\\b'));
  return match?.[0] ?? null;
}

function extractAmountAfterKeywords(raw: string, keywords: string[]) {
  const lower = raw.toLowerCase();
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword.toLowerCase());
    if (idx === -1) continue;
    const slice = raw.slice(idx + keyword.length);
    const match = slice.match(/([0-9.]+(?:,[0-9]{1,2})?)/);
    if (!match?.[1]) continue;
    const normalized = match[1].replace(/\./g, "").replace(/,/g, ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) continue;
    return Math.round(value * 100);
  }
  return null;
}

function extractFreeformCityAfterKeywords(raw: string, keywords: string[]) {
  const lower = raw.toLowerCase();
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword.toLowerCase());
    if (idx === -1) continue;
    const slice = raw.slice(idx + keyword.length);
    const match = slice.match(/([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2})/);
    const candidate = match?.[1]?.trim();
    const normalizedCandidate = normalizeImobRouteText(candidate ?? "");
    if (candidate && !isInvalidOperationalEntityCandidateRoute(normalizedCandidate)) return candidate;
  }
  return null;
}

function detectOperationalHydrationFlow(message: string, threadLabel?: string | null, operationalFlow?: string | null) {
  if (
    operationalFlow === "proposal.create"
    || operationalFlow === "visit.schedule"
    || operationalFlow === "lead.qualify"
    || operationalFlow === "documents.collect"
  ) return operationalFlow;
  const normalizedThread = normalizeImobRouteText(threadLabel ?? "");
  if (normalizedThread.includes("proposta")) return "proposal.create";
  if (normalizedThread.includes("visita")) return "visit.schedule";
  if (normalizedThread.includes("document")) return "documents.collect";
  if (normalizedThread.includes("lead")) return "lead.qualify";
  const normalizedMessage = normalizeImobRouteText(message);
  if (normalizedMessage.includes("proposta") || normalizedMessage.includes("oferta")) return "proposal.create";
  if (normalizedMessage.includes("visita") || normalizedMessage.includes("agendar") || normalizedMessage.includes("reuniao") || normalizedMessage.includes("reunião")) return "visit.schedule";
  if (
    normalizedMessage.includes("revisar documentos")
    || normalizedMessage.includes("coletar documentos")
    || normalizedMessage.includes("validar documento")
    || normalizedMessage.includes("documentacao")
  ) return "documents.collect";
  if (normalizedMessage.includes("qualificar lead") || normalizedMessage.includes("cadastro de lead") || normalizedMessage.includes("cadastrar lead")) return "lead.qualify";
  return null;
}

function createEmptyThreadState() {
  return createEmptyImobCrmThreadState();
}

function cloneImobResolvedTurn<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function setImobFormFieldValues(form: ImobPresentationForm | null | undefined, values: Record<string, unknown>) {
  if (!form || !Array.isArray(form.fields)) return form;
  return {
    ...form,
    fields: form.fields.map((field) => (
      typeof field.name === "string" && Object.prototype.hasOwnProperty.call(values, field.name)
        ? { ...field, value: values[field.name] ?? "" }
        : field
    )),
  };
}

async function applyExistingRegistrationResolution(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  message?: string | null;
  resolved: any;
}) {
  return applyImobCrmExistingRegistrationResolution({
    ...params,
    helpers: {
      asObject,
      asString,
      normalizeImobRouteText,
      cloneImobResolvedTurn,
      setImobFormFieldValues,
      createEmptyThreadState,
    },
  });
}

async function hydrateThreadStateWithPersistedLead(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  message: string;
  caseId?: string | null;
  threadLabel?: string | null;
  threadState: any;
}) {
  return hydrateImobCrmThreadStateWithPersistedLead({
    ...params,
    helpers: {
      asObject,
      asString,
      asStringList,
      createEmptyThreadState,
      cloneImobResolvedTurn,
      detectOperationalHydrationFlow,
      extractLeadNameFromMessage,
      extractLeadEmailFromMessage,
      extractLeadPhoneFromMessage,
      buildOwnerPendingSuggestion,
      buildPropertyPendingSuggestion,
      buildLeadPendingSuggestion,
    },
  });
}

function formatBudgetCentsForImob(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value / 100);
}

function formatImobCaseFlowLabel(flow: string) {
  const labels: Record<string, string> = {
    "lead.qualify": "Lead",
    "proposal.create": "Proposta",
    "visit.schedule": "Visita",
    "contract.prepare": "Contrato",
    "commission.settle": "Comissão",
    "documents.collect": "Documentos",
    "listing.activate": "Listing",
    "owner.create": "Proprietário",
    "property.create": "Imóvel",
    "deal.review": "Deal review",
    "rules.configure": "Regras de temporada",
  };
  return labels[flow] ?? flow;
}

function formatImobPendingList(items: string[] | null | undefined) {
  if (!items || items.length === 0) return "sem pendências";
  return items.join(", ");
}


function buildLeadPendingSuggestion(lead: { name: string; pendingItems?: unknown }) {
  const pendingItems = asStringList(lead.pendingItems);
  if (pendingItems.includes("cidade de interesse")) {
    return `Envie assim: cidade de interesse do lead ${lead.name} Itapema`;
  }
  if (pendingItems.includes("faixa de orçamento") || pendingItems.includes("budgetMax")) {
    return `Envie assim: orçamento do lead ${lead.name} 750000`;
  }
  if (pendingItems.includes("telefone do lead") || pendingItems.includes("leadPhone")) {
    return `Envie assim: telefone do lead ${lead.name} 47999998888`;
  }
  return null;
}

function buildPropertyPendingSuggestion(property: { id?: string; address?: string | null; pendingItems?: unknown }) {
  const pendingItems = asStringList(property.pendingItems);
  const ref = property.address?.trim() || property.id || "imóvel";
  if (pendingItems.includes("askingPrice") || pendingItems.includes("preço do imóvel") || pendingItems.includes("valor do imóvel") || pendingItems.includes("propertyPrice")) {
    return `Envie assim: preço do imóvel ${ref} 950000`;
  }
  return null;
}

function formatImobStatusLabel(status: string | null | undefined) {
  const normalized = asString(status)?.toLowerCase() ?? null;
  if (normalized === "pending_data") return "pendente de dados";
  if (normalized === "ready_for_review") return "pronto para revisão";
  if (normalized === "qualified") return "qualificado";
  if (normalized === "new") return "novo";
  if (normalized === "warm") return "quente";
  if (normalized === "cold") return "frio";
  return status ?? "n/a";
}


function injectResolvedPendingSuggestion(resolved: any) {
  return injectImobCrmResolvedPendingSuggestion(resolved, {
    asObject,
    asString,
    asStringList,
    createEmptyThreadState,
    cloneImobResolvedTurn,
    detectOperationalHydrationFlow,
    extractLeadNameFromMessage,
    extractLeadEmailFromMessage,
    extractLeadPhoneFromMessage,
    buildOwnerPendingSuggestion,
    buildPropertyPendingSuggestion,
    buildLeadPendingSuggestion,
  });
}

async function resolveImobOperationalUpdate(params: ImobOperationalResolverParams) {
  const resolved = await resolveImobOperationalUpdateImpl(params, {
    auditAgentId: IMOB_CHAT_AUDIT_AGENT_ID,
    resolveImobCrmOperationalUpdate: async () => null,
    resolveImobCrmOperationalConsult: async () => null,
    normalizeImobRouteText,
    extractOwnerNameFromMessage,
    extractOwnerExplicitNameFromMessage,
    extractOwnerExplicitPhoneFromMessage,
    extractOwnerExplicitEmailFromMessage,
    extractOwnerExplicitDocumentFromMessage,
    extractLeadNameFromMessage,
    extractDocumentFromMessage,
    extractAddressFromMessage,
    extractExplicitAddressFieldFromMessage,
    extractPropertyRefFromMessage,
    extractLeadPhoneFromMessage,
    extractLeadEmailFromMessage,
    extractLeadGoalFromMessage,
    extractAmountAfterKeywords,
    extractFreeformCityAfterKeywords,
    extractOwnerCrudIdFromMessage,
    extractPropertyCrudIdFromMessage,
    extractPropertyTypeFromMessage,
    extractPropertyGoalFromMessage,
    extractPropertyCityFromMessage,
    resolveOwnerDisplayName,
    recordImobCrmAuditEvent,
    resolveOwnerDocumentForDisplay,
    formatImobStatusLabel,
    formatImobPendingList,
    createEmptyThreadState,
    formatBudgetCentsForImob,
    formatPropertyLookupLabel,
    isOwnerDeleteConfirmationMessage,
    isPropertyDeleteConfirmationMessage,
    asObject,
    asString,
    asStringList,
    buildOwnerPendingSuggestion,
    buildLeadPendingSuggestion,
    buildPropertyPendingSuggestion,
    extractListCityFilter: imobCrmBusinessRead.extractListCityFilter,
    resolveImobBusinessReadIntent: imobCrmBusinessRead.resolveImobBusinessReadIntent,
    buildCaseContextFromRecord: imobCrmBusinessRead.buildCaseContextFromRecord,
    formatImobCaseFlowLabel,
    buildImobBusinessReadPresentation: imobCrmBusinessRead.buildImobBusinessReadPresentation,
    isBulkPropertyOnboardingQuestion: imobCrmBusinessRead.isBulkPropertyOnboardingQuestion,
    buildBulkPropertyOnboardingConsult: imobCrmBusinessRead.buildBulkPropertyOnboardingConsult,
    isImobRecentRegistrationReadRequest: imobCrmBusinessRead.isImobRecentRegistrationReadRequest,
    buildImobRecentRegistrationConsult: imobCrmBusinessRead.buildImobRecentRegistrationConsult,
    titleCaseRouteWords,
    findOwnerIdByAuditName,
    buildOwnerUpdateForm,
    buildPropertyUpdateForm,
  });

  if (resolved) return resolved;
  const fallbackDecision = resolveLegacyCrmFallbackDecision(params, "update", IMOB_CRM_LEGACY_FALLBACK_CONFIG);
  if (!fallbackDecision.allowed) {
    if (fallbackDecision.eligible) {
      await recordLegacyCrmFallbackTelemetry({
        prisma: params.prisma as NonNullable<TenantAwareRequest["prisma"]>,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        caseId: params.caseId,
        kind: "update",
        message: params.message,
        decision: fallbackDecision,
        event: "crm_legacy_fallback_suppressed",
      });
    }
    return null;
  }
  await recordLegacyCrmFallbackTelemetry({
    prisma: params.prisma as NonNullable<TenantAwareRequest["prisma"]>,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    caseId: params.caseId,
    kind: "update",
    message: params.message,
    decision: fallbackDecision,
    event: "crm_legacy_fallback_invoked",
  });
  return resolveImobCrmOperationalUpdateLegacy(params as any);
}

async function resolveImobOperationalConsult(params: ImobOperationalResolverParams) {
  const resolved = await resolveImobOperationalConsultImpl(params, {
    auditAgentId: IMOB_CHAT_AUDIT_AGENT_ID,
    resolveImobCrmOperationalUpdate: async () => null,
    resolveImobCrmOperationalConsult: async () => null,
    normalizeImobRouteText,
    extractOwnerNameFromMessage,
    extractOwnerExplicitNameFromMessage,
    extractOwnerExplicitPhoneFromMessage,
    extractOwnerExplicitEmailFromMessage,
    extractOwnerExplicitDocumentFromMessage,
    extractLeadNameFromMessage,
    extractDocumentFromMessage,
    extractAddressFromMessage,
    extractExplicitAddressFieldFromMessage,
    extractPropertyRefFromMessage,
    extractLeadPhoneFromMessage,
    extractLeadEmailFromMessage,
    extractLeadGoalFromMessage,
    extractAmountAfterKeywords,
    extractFreeformCityAfterKeywords,
    extractOwnerCrudIdFromMessage,
    extractPropertyCrudIdFromMessage,
    extractPropertyTypeFromMessage,
    extractPropertyGoalFromMessage,
    extractPropertyCityFromMessage,
    resolveOwnerDisplayName,
    recordImobCrmAuditEvent,
    resolveOwnerDocumentForDisplay,
    formatImobStatusLabel,
    formatImobPendingList,
    createEmptyThreadState,
    formatBudgetCentsForImob,
    formatPropertyLookupLabel,
    isOwnerDeleteConfirmationMessage,
    isPropertyDeleteConfirmationMessage,
    asObject,
    asString,
    asStringList,
    buildOwnerPendingSuggestion,
    buildLeadPendingSuggestion,
    buildPropertyPendingSuggestion,
    extractListCityFilter: imobCrmBusinessRead.extractListCityFilter,
    resolveImobBusinessReadIntent: imobCrmBusinessRead.resolveImobBusinessReadIntent,
    buildCaseContextFromRecord: imobCrmBusinessRead.buildCaseContextFromRecord,
    formatImobCaseFlowLabel,
    buildImobBusinessReadPresentation: imobCrmBusinessRead.buildImobBusinessReadPresentation,
    isBulkPropertyOnboardingQuestion: imobCrmBusinessRead.isBulkPropertyOnboardingQuestion,
    buildBulkPropertyOnboardingConsult: imobCrmBusinessRead.buildBulkPropertyOnboardingConsult,
    isImobRecentRegistrationReadRequest: imobCrmBusinessRead.isImobRecentRegistrationReadRequest,
    buildImobRecentRegistrationConsult: imobCrmBusinessRead.buildImobRecentRegistrationConsult,
    titleCaseRouteWords,
    findOwnerIdByAuditName,
    buildOwnerUpdateForm,
    buildPropertyUpdateForm,
  });

  if (resolved) return resolved;
  const fallbackDecision = resolveLegacyCrmFallbackDecision(params, "consult", IMOB_CRM_LEGACY_FALLBACK_CONFIG);
  if (!fallbackDecision.allowed) {
    if (fallbackDecision.eligible) {
      await recordLegacyCrmFallbackTelemetry({
        prisma: params.prisma as NonNullable<TenantAwareRequest["prisma"]>,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        caseId: params.caseId,
        kind: "consult",
        message: params.message,
        decision: fallbackDecision,
        event: "crm_legacy_fallback_suppressed",
      });
    }
    return null;
  }
  await recordLegacyCrmFallbackTelemetry({
    prisma: params.prisma as NonNullable<TenantAwareRequest["prisma"]>,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    caseId: params.caseId,
    kind: "consult",
    message: params.message,
    decision: fallbackDecision,
    event: "crm_legacy_fallback_invoked",
  });
  return resolveImobCrmOperationalConsultLegacy(params as any);
}

const IMOB_CRM_LEGACY_FALLBACK_CONFIG = getLegacyCrmFallbackConfigFromEnv();

function getConversationIdFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.conversationId);
}

function getRoleFromMetadata(metadata: unknown): "user" | "assistant" | "system" {
  const obj = asObject(metadata);
  const role = asString(obj?.role);
  if (role === "assistant" || role === "system" || role === "user") return role;
  return "assistant";
}

function getThreadIdFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.threadId);
}

function getThreadLabelFromMetadata(metadata: unknown): string | null {
  const obj = asObject(metadata);
  return asString(obj?.threadLabel);
}

type ImobThreadStatus = "active" | "waiting" | "done" | "blocked";

function getThreadStatusFromMetadata(metadata: unknown): ImobThreadStatus | null {
  const obj = asObject(metadata);
  const status = asString(obj?.threadStatus);
  if (status === "active" || status === "waiting" || status === "done" || status === "blocked") return status;
  return null;
}

type ConversationThreadSummary = {
  threadId: string;
  label: string;
  status: ImobThreadStatus;
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
};

function normalizeSingleActiveThread(items: ConversationThreadSummary[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
  let hasActive = false;
  return sorted.map((item) => {
    if (item.status !== "active") return item;
    if (!hasActive) {
      hasActive = true;
      return item;
    }
    return { ...item, status: "waiting" as const };
  });
}

function normalizeSnapshotThreadStatus(status: ImobThreadStatus | null) {
  if (status === "waiting") return "active" as const;
  return status;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseNumericTelemetryValue(content: string | null | undefined) {
  const source = typeof content === "string" ? content : "";
  const chunks = source.split(":");
  const maybeValue = Number(chunks[chunks.length - 1]);
  return Number.isFinite(maybeValue) ? maybeValue : null;
}

function toSha256(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function recordLegacyCrmFallbackTelemetry(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  kind: "update" | "consult";
  message: string;
  event: "crm_legacy_fallback_invoked" | "crm_legacy_fallback_suppressed";
  decision: LegacyCrmFallbackDecision;
}) {
  await params.prisma.memoryEvent.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_TELEMETRY,
      content: `${params.event}:1`,
      metadata: {
        event: params.event,
        value: 1,
        fallbackKind: params.kind,
        caseId: params.caseId ?? null,
        messagePreview: params.message.slice(0, 160),
        fallbackReason: params.decision.reason,
        operationalFlow: params.decision.operationalFlow,
        conversationalIntentId: params.decision.conversationalIntentId,
        threadStateShape: params.decision.threadStateShape,
        scenarioKey: params.decision.scenarioKey,
        fallbackMode: IMOB_CRM_LEGACY_FALLBACK_CONFIG.mode,
      },
    },
  });
}

async function validateScopedRunId(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  runId: string | null | undefined;
}) {
  const runId = asString(params.runId);
  if (!runId) return null;
  const run = await params.prisma.run.findFirst({
    where: {
      id: runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    select: { id: true },
  });
  return run?.id ?? null;
}

type ImobScopedRunMetadata = {
  id: string;
  caseId: string | null;
  threadId: string | null;
  status: string;
  txId: string | null;
  criticalHash: string | null;
  createdAt: Date;
  requestConversationId: string | null;
  requestThreadId: string | null;
  txIdRequired: boolean;
};

function toScopedRunMetadata(run: {
  id: string;
  caseId: string | null;
  threadId: string | null;
  status: string;
  txId: string | null;
  criticalHash: string | null;
  createdAt: Date;
  request: unknown;
}): ImobScopedRunMetadata {
  const request = asObject(run.request);
  const metadata = asObject(request?.metadata);
  return {
    id: run.id,
    caseId: run.caseId ?? null,
    threadId: run.threadId ?? null,
    status: run.status,
    txId: run.txId ?? null,
    criticalHash: run.criticalHash ?? null,
    createdAt: run.createdAt,
    requestConversationId: asString(metadata?.conversationId),
    requestThreadId: asString(metadata?.threadId),
    txIdRequired: metadata?.txIdRequired === true,
  };
}

async function findScopedRunForMessage(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  runId: string | null | undefined;
}) {
  const runId = asString(params.runId);
  if (!runId) return null;
  const run = await params.prisma.run.findFirst({
    where: {
      id: runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    select: {
      id: true,
      caseId: true,
      threadId: true,
      status: true,
      txId: true,
      criticalHash: true,
      createdAt: true,
      request: true,
    },
  });
  return run ? toScopedRunMetadata(run) : null;
}

function resolveCompletionStateFromMessage(params: {
  role: "user" | "assistant" | "system";
  bodyCompletionState: string | null;
  linkedRun: ImobScopedRunMetadata | null;
  txId: string | null;
  receiptPath: string | null;
  bundlePath: string | null;
}) {
  const requested = params.bodyCompletionState;
  const inferredFull = Boolean(params.txId && params.receiptPath && params.bundlePath);
  const requiresProof = params.linkedRun?.txIdRequired === true;
  const isAssistantRunConclusion = params.role === "assistant"
    && params.linkedRun !== null
    && params.linkedRun.status === "success";
  if (!isAssistantRunConclusion) {
    if (requested === "success_full" || requested === "success_partial") return requested;
    return null;
  }
  if (requested === "success_full" && !inferredFull) return "success_partial";
  if (requested === "success_partial") return "success_partial";
  if (inferredFull) return "success_full";
  if (requiresProof) return "success_partial";
  return null;
}

function resolveProofStateFromMessage(params: {
  linkedRun: ImobScopedRunMetadata | null;
  txId: string | null;
  receiptPath: string | null;
  bundlePath: string | null;
}) {
  const proofRequired = params.linkedRun?.txIdRequired === true;
  const proofReady = Boolean(params.txId && params.receiptPath && params.bundlePath);
  if (!params.linkedRun) {
    return {
      proofRequired: false,
      proofReady: false,
      proofState: null as "proof_pending" | "proof_ready" | "proof_not_required" | null,
    };
  }
  if (!proofRequired) {
    return {
      proofRequired: false,
      proofReady,
      proofState: proofReady ? "proof_ready" as const : "proof_not_required" as const,
    };
  }
  return {
    proofRequired: true,
    proofReady,
    proofState: proofReady ? "proof_ready" as const : "proof_pending" as const,
  };
}

function buildImobProofSurfaceFromMessage(params: {
  linkedRun: ImobScopedRunMetadata | null;
  runId: string | null;
  txId: string | null;
  receiptPath: string | null;
  bundlePath: string | null;
}) {
  const resolved = resolveProofStateFromMessage({
    linkedRun: params.linkedRun,
    txId: params.txId,
    receiptPath: params.receiptPath,
    bundlePath: params.bundlePath,
  });
  const hasSurfaceSignals = Boolean(
    params.runId
      || params.txId
      || params.receiptPath
      || params.bundlePath
      || params.linkedRun
  );
  if (!hasSurfaceSignals) return null;
  return {
    required: resolved.proofRequired,
    ready: resolved.proofReady,
    state: resolved.proofRequired
      ? (resolved.proofReady ? "ready" : "pending")
      : (resolved.proofReady ? "ready" : "not_required"),
    runId: params.runId,
    txId: params.txId,
    receiptPath: params.receiptPath,
    bundlePath: params.bundlePath,
    verifyUrl: params.receiptPath,
  } as const;
}

async function findConversationCreatedEvent(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  conversationId: string;
}) {
  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    rows
      .map((row) => ({ row, metadata: asObject(row.metadata) }))
      .find((entry) => getConversationIdFromMetadata(entry.metadata) === params.conversationId) ?? null
  );
}

async function resolveConversationAuditRunId(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  conversationId: string;
  title?: string | null;
  minCreatedAt?: Date | null;
}) {
  const ensureAuditAgentAssignment = async () => {
    const existingAssignment = await params.prisma.workspaceAgentAssignment.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentKey: IMOB_CHAT_AUDIT_AGENT_ID,
      },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        agentVersion: true,
        enabled: true,
      },
    });

    if (existingAssignment?.enabled) return;

    if (existingAssignment) {
      await params.prisma.workspaceAgentAssignment.update({
        where: { id: existingAssignment.id },
        data: {
          enabled: true,
          signatureRef: existingAssignment.enabled ? undefined : "imob-chat-audit-bootstrap",
          signedAt: new Date(),
        },
      });
      return;
    }

    await params.prisma.workspaceAgentAssignment.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentKey: IMOB_CHAT_AUDIT_AGENT_ID,
        agentVersion: "1.0.0",
        enabled: true,
        signedAt: new Date(),
        signatureRef: "imob-chat-audit-bootstrap",
        metadata: {
          source: "imob-chat-audit-bootstrap",
          systemInternal: true,
        },
      },
    });
  };

  const isValidAuditRunForConversation = async (runId: string | null | undefined) => {
    const scopedRunId = await validateScopedRunId({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId,
    });
    if (!scopedRunId) return null;
    const run = await params.prisma.run.findFirst({
      where: {
        id: scopedRunId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agent: IMOB_CHAT_AUDIT_AGENT_ID,
      },
      select: {
        id: true,
        createdAt: true,
        request: true,
      },
    });
    if (!run) return null;
    const request = asObject(run.request);
    const metadata = asObject(request?.metadata);
    if (getConversationIdFromMetadata(metadata) !== params.conversationId) return null;
    if (params.minCreatedAt && run.createdAt < params.minCreatedAt) return null;
    return run.id;
  };

  const conversationCreated = await findConversationCreatedEvent({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
  });

  const persistedAuditRunId = await isValidAuditRunForConversation(
    asString(conversationCreated?.metadata?.auditRunId)
  );
  if (persistedAuditRunId) return persistedAuditRunId;

  const existingAuditRuns = await params.prisma.run.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agent: IMOB_CHAT_AUDIT_AGENT_ID,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const matchedRun = existingAuditRuns.find((run) => {
    if (params.minCreatedAt && run.createdAt < params.minCreatedAt) return false;
    const request = asObject(run.request);
    const metadata = asObject(request?.metadata);
    return getConversationIdFromMetadata(metadata) === params.conversationId;
  });

  let auditRun = matchedRun;
  if (!auditRun) {
    try {
      auditRun = await createRunRecord({
        prisma: params.prisma,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        agent: IMOB_CHAT_AUDIT_AGENT_ID,
        status: "success",
        request: {
          prompt: `Audit transcript for conversation ${params.conversationId}`,
          metadata: {
            domain: "imob",
            kind: "conversation_audit",
            conversationId: params.conversationId,
            title: params.title ?? null,
          },
        },
        response: {
          status: "audit_initialized",
          conversationId: params.conversationId,
        },
      });
    } catch (error) {
      if (error instanceof WorkspaceAgentAssignmentError) {
        await ensureAuditAgentAssignment();
        auditRun = await createRunRecord({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          userId: params.userId,
          agent: IMOB_CHAT_AUDIT_AGENT_ID,
          status: "success",
          request: {
            prompt: `Audit transcript for conversation ${params.conversationId}`,
            metadata: {
              domain: "imob",
              kind: "conversation_audit",
              conversationId: params.conversationId,
              title: params.title ?? null,
            },
          },
          response: {
            status: "audit_initialized",
            conversationId: params.conversationId,
          },
        });
      } else {
        throw error;
      }
    }
  }
  if (!auditRun) return null;

  if (!matchedRun) {
    await emitRunEvent({
      prisma: params.prisma,
      runId: auditRun.id,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: RUN_EVENT_CHAT_AUDIT_STARTED,
      payload: {
        conversationId: params.conversationId,
        title: params.title ?? null,
      },
    });
  }

  if (conversationCreated && !asString(conversationCreated.metadata?.auditRunId)) {
    await params.prisma.memoryEvent.update({
      where: { id: conversationCreated.row.id },
      data: {
        metadata: {
          ...(conversationCreated.metadata ?? {}),
          auditRunId: auditRun.id,
        } as any,
      },
    });
  }

  return auditRun.id;
}

async function recordConversationMessageProof(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  auditRunId: string;
  conversationId: string;
  messageId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  threadId: string | null;
  threadLabel: string | null;
  threadStatus: ImobThreadStatus | null;
  messageRunId: string | null;
  txId: string | null;
}) {
  const latestMessageEvent = await params.prisma.runEvent.findFirst({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.auditRunId,
      type: RUN_EVENT_CHAT_MESSAGE_RECORDED,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  });

  const latestPayload = asObject(latestMessageEvent?.payload);
  const previousHash = asString(latestPayload?.entryHash);
  const previousSequence = Number(latestPayload?.sequence);
  const sequence = Number.isFinite(previousSequence) ? previousSequence + 1 : 1;
  const contentHash = crypto.createHash("sha256").update(params.content).digest("hex");
  const payloadBase = {
    conversationId: params.conversationId,
    messageId: params.messageId,
    sequence,
    role: params.role,
    createdAt: toIso(params.createdAt),
    contentHash,
    contentLength: params.content.length,
    threadId: params.threadId,
    threadLabel: params.threadLabel,
    threadStatus: params.threadStatus,
    runId: params.messageRunId,
    txId: params.txId,
    prevHash: previousHash,
  };
  const entryHash = toSha256(payloadBase);
  const payload = {
    ...payloadBase,
    entryHash,
    contentPreview: params.content.slice(0, 180),
  };

  await emitRunEvent({
    prisma: params.prisma,
    runId: params.auditRunId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: RUN_EVENT_CHAT_MESSAGE_RECORDED,
    payload,
  });

  return {
    sequence,
    entryHash,
    prevHash: previousHash,
    contentHash,
  };
}

function isContractInterviewStatus(value: unknown): value is "collecting" | "review" | "generating" | "generated" {
  return value === "collecting" || value === "review" || value === "generating" || value === "generated";
}

function isContractType(value: unknown): value is ContractType {
  return value === "locacao" || value === "compra_venda" || value === "administracao" || value === "temporada";
}

async function upsertImobCaseFromResolvedTurn(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  threadId?: string | null;
  threadLabel?: string | null;
  resolved: ReturnType<typeof resolveImobTurn>;
}) {
  const persisted = await new ImobCrmMutationService(params.prisma).upsertCaseFromResolvedTurn({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  }, {
    caseId: params.caseId,
    threadId: params.threadId,
    threadLabel: params.threadLabel,
    resolved: params.resolved,
  });
  if (!persisted) return null;

  return {
    ...persisted,
    canonical: buildImobCanonicalCase({
      flow: persisted.flow,
      stage: persisted.stage,
      status: persisted.status,
      ownerResponsible: persisted.ownerResponsible,
      nextStep: persisted.nextStep,
      blockers: persisted.blockers,
      pendingItems: persisted.pendingItems,
      lead: persisted.lead ?? null,
      property: persisted.property ?? null,
      owner: persisted.owner ?? null,
    }),
  };
}

async function resolveImobEntitlements(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
}) {
  const [realEstatePolicies, productInstallations] = await Promise.all([
    params.prisma.tenantActionPolicy.findMany({
      where: {
        tenantId: params.tenantId,
        OR: [{ workspaceId: params.workspaceId }, { workspaceId: null }],
        actionName: {
          in: [
            "realestate.apply_adjustment",
            "action.realestate.apply_adjustment",
            "realestate.register_property",
            "realestate.create_contract",
            "realestate.configure_property_rules",
            "realestate.release_commission",
            "realestate.search_knowledge_base",
          ],
        },
        allowed: true,
      },
      select: { id: true },
      take: 1,
    }),
    params.prisma
      .$queryRaw<Array<{ product: string; status: string }>>`
        SELECT product, status
        FROM tenant_product_installations
        WHERE tenant_id = ${params.tenantId}
          AND workspace_id = ${params.workspaceId}
      `
      .catch(() => []),
  ]);

  const installationStatus = resolveImobInstallationStatus(productInstallations);
  const hasImobInstallation = installationStatus === "active";
  const realEstateCore = hasImobInstallation || realEstatePolicies.length > 0;
  return {
    REAL_ESTATE_CORE: realEstateCore,
    IMOB_INSTALLED: hasImobInstallation,
    IMOB_INSTALLATION_STATUS: installationStatus,
  };
}

async function readImobWorkspaceAccessProfile(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  authContext: NonNullable<TenantAwareRequest["authContext"]>;
}) {
  if (!params.authContext.userId) {
    return {
      responsibleLabel: "Corretor",
      permissions: ["imob.chat.use", "imob.stage.*"],
    };
  }
  return readWorkspaceResponsibleProfile({
    prisma: params.prisma,
    tenantId: params.authContext.tenantId,
    workspaceId: params.authContext.workspaceId,
    userId: params.authContext.userId,
  });
}

function sendImobPermissionDenied(
  req: TenantAwareRequest | undefined,
  res: Response,
  params: { code: string; message: string; stage?: string | null; capability?: "CENTRAL_OPERACIONAL" | "KNOWLEDGE_SYNC_STATUS" | "KNOWLEDGE_SEARCH" }
) {
  return sendImobAccessDenied(res, {
    req,
    code: params.code,
    reasonCode: "IMOB_PERMISSION_DENIED",
    capability: params.capability ?? "CENTRAL_OPERACIONAL",
    tenantId: req?.authContext?.tenantId ?? "",
    workspaceId: req?.authContext?.workspaceId ?? "",
    installationStatus: "active",
    stage: params.stage ?? undefined,
    message: params.message,
  });
}

function ensureImobWorkspacePermission(
  reqOrRes: TenantAwareRequest | Response,
  resOrPermissions: Response | string[],
  permissionsOrPermission: string[] | string,
  permissionOrMessage: string,
  messageOrCapability?: string,
  capability?: "CENTRAL_OPERACIONAL" | "KNOWLEDGE_SYNC_STATUS" | "KNOWLEDGE_SEARCH"
) {
  const hasExplicitRequest = Array.isArray(permissionsOrPermission);
  const req = hasExplicitRequest ? (reqOrRes as TenantAwareRequest) : undefined;
  const res = hasExplicitRequest ? resOrPermissions : reqOrRes;
  const permissions = (hasExplicitRequest ? permissionsOrPermission : resOrPermissions) as string[];
  const permission = hasExplicitRequest ? permissionOrMessage : (permissionsOrPermission as string);
  const message = (hasExplicitRequest ? messageOrCapability : permissionOrMessage) as string;
  const resolvedCapability = hasExplicitRequest ? capability : undefined;
  if (hasWorkspacePermission(permissions, permission)) return true;
  sendImobPermissionDenied(req, res as Response, {
    code: "IMOB_WORKSPACE_PERMISSION_FORBIDDEN",
    message,
    capability: resolvedCapability,
  });
  return false;
}

function ensureImobStagePermission(
  reqOrRes: TenantAwareRequest | Response,
  resOrPermissions: Response | string[],
  permissionsOrStage: string[] | string | null | undefined,
  stageOrMessage: string | null | undefined,
  message?: string
) {
  const hasExplicitRequest = Array.isArray(permissionsOrStage);
  const req = hasExplicitRequest ? (reqOrRes as TenantAwareRequest) : undefined;
  const res = hasExplicitRequest ? resOrPermissions : reqOrRes;
  const permissions = (hasExplicitRequest ? permissionsOrStage : resOrPermissions) as string[];
  const stage = hasExplicitRequest ? stageOrMessage : permissionsOrStage;
  const resolvedMessage = (hasExplicitRequest ? message : stageOrMessage) as string;
  if (canWorkspaceOperateImobStage(permissions, stage)) return true;
  sendImobPermissionDenied(req, res as Response, {
    code: "IMOB_STAGE_FORBIDDEN",
    message: resolvedMessage,
    stage: stage ?? null,
  });
  return false;
}

registerImobCrmRoutes({
  router: imobRouter,
  readImobWorkspaceAccessProfile,
  ensureImobWorkspacePermission,
  ensureImobStagePermission,
  withImobCanonicalCase,
  withRouteCanonicalCaseContext: imobCrmBusinessRead.withRouteCanonicalCaseContext,
  schemas: {
    imobAttachmentResolveSchema,
    imobAttachmentCrmSuggestionApplySchema,
    imobOwnerCreateSchema,
    imobOwnerUpdateSchema,
    imobPropertyCreateSchema,
    imobPropertyUpdateSchema,
    imobLeadCreateSchema,
    imobLeadUpdateSchema,
    imobCaseCreateSchema,
    imobCaseUpdateSchema,
    imobCaseAssignOwnerSchema,
    imobFollowUpRunSchema,
    imobApprovalActionSchema,
  },
});

imobRouter.get("/knowledge/sync-status", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(req as TenantAwareRequest, res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.", "KNOWLEDGE_SYNC_STATUS")) {
    return;
  }

  const entitlements = await resolveImobEntitlements({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!entitlements.REAL_ESTATE_CORE) {
    return sendImobAccessDenied(res, {
      req: req as TenantAwareRequest,
      code: "ENTITLEMENT_MISSING",
      reasonCode:
        entitlements.IMOB_INSTALLATION_STATUS === "inactive"
          ? "IMOB_INSTALLATION_INACTIVE"
          : "IMOB_ENTITLEMENT_MISSING",
      capability: "KNOWLEDGE_SYNC_STATUS",
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      installationStatus: entitlements.IMOB_INSTALLATION_STATUS,
    });
  }

  const snapshot = await readImobDriveSyncSnapshot();
  const workspaceSummary =
    snapshot?.totalsByWorkspace.find(
      (item) => item.tenantId === authContext.tenantId && item.workspaceId === authContext.workspaceId
    ) ?? null;

  return res.json({
    ok: true,
    data: {
      syncedAt: snapshot?.syncedAt ?? null,
      sourcePath: snapshot?.sourcePath ?? null,
      totalDocuments: workspaceSummary?.totalDocuments ?? 0,
      syncVersion: snapshot?.syncVersion ?? null,
    },
  });
});

imobRouter.post("/knowledge/search", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const query = asString(body.query);
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", message: "query is required" },
    });
  }

  const workspaceId = authContext.workspaceId;
  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(req as TenantAwareRequest, res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.", "KNOWLEDGE_SEARCH")) {
    return;
  }
  const entitlements = await resolveImobEntitlements({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId,
  });

  if (!entitlements.REAL_ESTATE_CORE) {
    return sendImobAccessDenied(res, {
      req: req as TenantAwareRequest,
      code: "ENTITLEMENT_MISSING",
      reasonCode:
        entitlements.IMOB_INSTALLATION_STATUS === "inactive"
          ? "IMOB_INSTALLATION_INACTIVE"
          : "IMOB_ENTITLEMENT_MISSING",
      capability: "KNOWLEDGE_SEARCH",
      tenantId: authContext.tenantId,
      workspaceId,
      installationStatus: entitlements.IMOB_INSTALLATION_STATUS,
    });
  }

  const filters = asObject(body.filters) ?? {};
  const region = asString(filters.region);
  const segmentRaw = asString(filters.segment);
  const segment =
    segmentRaw === "locacao" || segmentRaw === "venda" || segmentRaw === "ambos" ? segmentRaw : null;
  const documentType = asString(filters.documentType);
  const operationType = asString(filters.operationType);
  const tags = Array.isArray(filters.tags)
    ? filters.tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const sourceTypes = Array.isArray(filters.sourceTypes)
    ? filters.sourceTypes.filter(
        (item): item is "drive" | "upload" | "web" | "internal_doc" =>
          item === "drive" || item === "upload" || item === "web" || item === "internal_doc"
      )
    : [];

  const result = await searchImobKnowledge({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId,
    query,
    filters: {
      region,
      segment,
      documentType,
      operationType,
      tags,
      sourceTypes,
    },
  });

  return res.json({
    ok: true,
    data: {
      ...result,
      tenantId: authContext.tenantId,
      workspaceId,
      entitlements,
    },
  });
});

imobRouter.post("/chat/resolve-turn", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const message = asString(body.message);
  const requestedCaseId = asString(body.caseId);
  const requestedThreadId = asString(body.threadId);
  const requestedRecipeId = asString(body.recipeId);
  const requestedActionId = asString(body.actionId);
  if (!message) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_MESSAGE", message: "message is required" },
    });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const existingScopedCase = requestedCaseId
    ? await prisma.imobCase.findFirst({
        where: { id: requestedCaseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
        select: { id: true, stage: true },
      })
    : requestedThreadId
      ? await prisma.imobCase.findFirst({
          where: { threadId: requestedThreadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, stage: true },
        })
      : null;
  if (
    existingScopedCase &&
    !ensureImobStagePermission(
      res,
      workspaceAccess.permissions,
      existingScopedCase.stage,
      `Sua função atual não pode operar a etapa ${existingScopedCase.stage} neste workspace.`
    )
  ) {
    return;
  }

  const entitlements = await resolveImobEntitlements({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  const tenantRecipe = await resolveImobTenantRecipeForWorkspace({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    recipeId: requestedRecipeId,
  });
  if (requestedRecipeId && !tenantRecipe) {
    return res.status(403).json({
      ok: false,
      error: {
        code: "IMOB_RECIPE_NOT_AVAILABLE",
        message: "Recipe não homologada ou não liberada para este workspace.",
      },
    });
  }
  const recipeMissionContext = resolveImobRecipeMissionContext(tenantRecipe ? {
    recipeId: tenantRecipe.id,
    agentId: tenantRecipe.agentId,
    status: tenantRecipe.status,
    tags: tenantRecipe.tags,
  } : null);
  if (requestedRecipeId && !recipeMissionContext) {
    return res.status(422).json({
      ok: false,
      error: {
        code: "IMOB_RECIPE_WITHOUT_SUPPORTED_MISSION",
        message: "Recipe homologada não define uma missão IMOB suportada para este chat.",
      },
    });
  }
  // ActionId dispatch: validate action against canonical.recommendedActions and short-circuit
  // before the engine when a concrete operational action is requested from the Command Center.
  if (requestedActionId) {
    if (!requestedCaseId) {
      return res.json({
        ok: true,
        data: {
          mode: "blocked",
          action: "crm.action.blocked",
          threadLabel: "IMOB CRM",
          conversationState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null },
          presentation: {
            text: "É necessário informar o caso para executar uma ação direcionada.",
            metadata: { workflowReasonCode: "ACTION_NOT_ALLOWED_FOR_CASE" },
          },
        },
      });
    }
    const caseWithCanonical = await (prisma as any).imobCase.findFirst({
      where: {
        id: requestedCaseId,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      select: { id: true, flow: true, status: true, canonical: true },
    }) as { id: string; flow: string | null; status: string | null; canonical: unknown } | null;
    if (!caseWithCanonical) {
      return res.json({
        ok: true,
        data: {
          mode: "blocked",
          action: "crm.action.blocked",
          threadLabel: "IMOB CRM",
          conversationState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null },
          presentation: {
            text: "Caso não encontrado ou não pertence a este workspace.",
            metadata: { workflowReasonCode: "ACTION_NOT_ALLOWED_FOR_CASE" },
          },
        },
      });
    }
    const canonical = asObject(caseWithCanonical.canonical);
    const dispatchResult = resolveImobCrmActionDispatch({
      actionId: requestedActionId,
      caseId: requestedCaseId,
      canonical,
      message: message ?? "",
      timestamp: new Date().toISOString(),
    });
    if (dispatchResult !== null) {
      return res.json({ ok: true, data: dispatchResult });
    }
    // null = consultive or unmapped action → fall through to engine
  }

  const engineBody = recipeMissionContext
    ? { ...body, recipeId: requestedRecipeId, recipeMissionContext }
    : body;
  const data = await resolveImobCrmTurnEngine({
    prisma,
    authContext,
    body: engineBody,
    workspaceResponsibleLabel: workspaceAccess.responsibleLabel,
    entitlements,
    helpers: {
      asString,
      hydrateThreadStateWithPersistedLead,
      resolveImobOperationalUpdate,
      resolveImobOperationalConsult,
      applyCanonicalJourneyToResolvedData: imobCrmBusinessRead.applyCanonicalJourneyToResolvedData as (data: any, caseContext?: unknown) => any,
      applyExistingRegistrationResolution,
      injectResolvedPendingSuggestion,
      upsertImobCaseFromResolvedTurn,
      normalizeImobRouteText,
      formatImobCaseFlowLabel,
    },
  });

  await recordImobResolveTurnSemanticTelemetry({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: IMOB_CHAT_AGENT_ID,
    message,
    resolved: asObject(data) ?? {},
    caseId: requestedCaseId,
    threadId: requestedThreadId,
  });

  return res.json({
    ok: true,
    data,
  });
});

imobRouter.get("/lookup/cep/:cep", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const resolved = await lookupImobCep(req.params.cep ?? "");
  if (!resolved) {
    return res.status(404).json({
      ok: false,
      error: { code: "CEP_NOT_FOUND", message: "CEP não encontrado" },
    });
  }

  return res.json({
    ok: true,
    data: resolved,
  });
});

imobRouter.get("/cases/:caseId/events", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const caseItem = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    select: { id: true, stage: true },
  });
  if (!caseItem) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, caseItem.stage, `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`)) {
    return;
  }

  const items = await prisma.imobCaseEvent.findMany({
    where: { caseId: caseItem.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return res.json({ ok: true, data: { items } });
});

imobRouter.get("/cases/:caseId/dossier", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const caseItem = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, document: true, status: true, pendingItems: true } },
      property: { select: { id: true, propertyType: true, city: true, neighborhood: true, goal: true, address: true, status: true, pendingItems: true } },
      lead: { select: { id: true, name: true, phone: true, email: true, targetCity: true, targetNeighborhood: true, budgetMaxCents: true, stage: true, temperature: true, pendingItems: true } },
      _count: { select: { events: true } },
    },
  });
  if (!caseItem) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, caseItem.stage, `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`)) {
    return;
  }

  const events = await prisma.imobCaseEvent.findMany({
    where: { caseId: caseItem.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const payload = {
    ok: true,
    data: {
      specVersion: "imob.dossier.v1",
      generatedAt: new Date().toISOString(),
      case: {
        id: caseItem.id,
        flow: caseItem.flow,
        stage: caseItem.stage,
        status: caseItem.status,
        ownerResponsible: caseItem.ownerResponsible,
        nextStep: caseItem.nextStep,
        blockers: caseItem.blockers,
        pendingItems: caseItem.pendingItems,
        metadata: caseItem.metadata,
        createdAt: caseItem.createdAt,
        updatedAt: caseItem.updatedAt,
        evidenceCount: caseItem._count?.events ?? events.length,
        canonical: buildImobCanonicalCase(caseItem),
      },
      entities: {
        owner: caseItem.owner,
        property: caseItem.property,
        lead: caseItem.lead,
      },
      events: events.map((item) => ({
        id: item.id,
        type: item.type,
        actorType: item.actorType,
        actorRef: item.actorRef,
        runId: item.runId,
        summary: item.summary,
        evidenceRef: item.evidenceRef,
        payload: item.payload,
        createdAt: item.createdAt,
      })),
    },
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="imob-case-${caseItem.id}-dossier.json"`);
  return res.status(200).send(JSON.stringify(payload, null, 2));
});

imobRouter.get("/cases/:caseId/receipt", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const caseItem = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    select: {
      id: true,
      flow: true,
      stage: true,
      status: true,
      ownerResponsible: true,
      nextStep: true,
      blockers: true,
      pendingItems: true,
      updatedAt: true,
      createdAt: true,
      owner: { select: { id: true, name: true } },
      property: { select: { id: true, propertyType: true, city: true, neighborhood: true, goal: true, address: true } },
      lead: { select: { id: true, name: true } },
      _count: { select: { events: true } },
    },
  });
  if (!caseItem) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, caseItem.stage, `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`)) {
    return;
  }

  const latestEvent = await prisma.imobCaseEvent.findFirst({
    where: { caseId: caseItem.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, summary: true, createdAt: true },
  });

  const payload = {
    ok: true,
    data: {
      specVersion: "imob.receipt.v1",
      generatedAt: new Date().toISOString(),
      caseId: caseItem.id,
      flow: caseItem.flow,
      stage: caseItem.stage,
      status: caseItem.status,
      ownerResponsible: caseItem.ownerResponsible,
      nextStep: caseItem.nextStep,
      blockers: caseItem.blockers,
      pendingItems: caseItem.pendingItems,
      canonical: buildImobCanonicalCase(caseItem),
      owner: caseItem.owner,
      property: caseItem.property,
      lead: caseItem.lead,
      evidenceCount: caseItem._count?.events ?? 0,
      latestEvent,
      createdAt: caseItem.createdAt,
      updatedAt: caseItem.updatedAt,
    },
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="imob-case-${caseItem.id}-receipt.json"`);
  return res.status(200).send(JSON.stringify(payload, null, 2));
});

imobRouter.post("/cases/:caseId/events", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const caseItem = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    select: { id: true, stage: true },
  });
  if (!caseItem) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, caseItem.stage, `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`)) {
    return;
  }

  const parsed = imobCaseEventInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  if (parsed.data.runId) {
    const run = await prisma.run.findFirst({
      where: { id: parsed.data.runId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      select: { id: true },
    });
    if (!run) {
      return res.status(404).json({ ok: false, error: { code: "RUN_NOT_FOUND", message: "Run not found for case event" } });
    }
  }

  const created = await prisma.imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: caseItem.id } },
      tenant: { connect: { id: authContext.tenantId } },
      workspace: { connect: { id: authContext.workspaceId } },
      ...(parsed.data.runId ? { run: { connect: { id: parsed.data.runId } } } : {}),
      type: parsed.data.type,
      actorType: parsed.data.actorType,
      actorRef: parsed.data.actorRef ?? null,
      summary: parsed.data.summary,
      evidenceRef: parsed.data.evidenceRef ?? null,
      payload: parsed.data.payload as any,
    },
  });

  return res.status(201).json({ ok: true, data: created });
});

imobRouter.post("/search/inventory", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const query = asString(body.query);
  if (!query) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", message: "query is required" },
    });
  }

  const entitlements = await resolveImobEntitlements({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  const slotsRaw = asObject(body.slots);
  const segmentRaw = asString(body.segment);
  const data = searchImobInventory({
    query,
    region: asString(body.region),
    segment: segmentRaw === "locacao" || segmentRaw === "venda" || segmentRaw === "ambos" ? segmentRaw : null,
    slots: slotsRaw
      ? {
          goal: asString(slotsRaw.goal) === "locacao" || asString(slotsRaw.goal) === "venda" ? asString(slotsRaw.goal) : null,
          city: asString(slotsRaw.city),
          region: asString(slotsRaw.region),
          neighborhood: asString(slotsRaw.neighborhood),
          budgetMax: Number.isFinite(Number(slotsRaw.budgetMax)) ? Number(slotsRaw.budgetMax) : null,
          bedrooms: Number.isFinite(Number(slotsRaw.bedrooms)) ? Number(slotsRaw.bedrooms) : null,
          bathrooms: Number.isFinite(Number(slotsRaw.bathrooms)) ? Number(slotsRaw.bathrooms) : null,
          propertyType: asString(slotsRaw.propertyType),
        } as any
      : null,
    offset: Number.isFinite(Number(body.offset)) ? Number(body.offset) : 0,
    limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : 2,
  });

  return res.json({
    ok: true,
    data: {
      ...data,
      tenantId: authContext.tenantId,
      entitlements,
    },
  });
});

imobRouter.get("/command-center/funnel-health", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.workspaceId ?? authContext.workspaceId);
  const window = req.query.window === "30d" ? "30d" : "7d";
  const since = parseWindowStart(window);

  const cases = await prisma.imobCase.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId,
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const reasonCount = new Map<string, number>();
  for (const item of cases) {
    const blockers = asStringList(item.blockers);
    const pending = asStringList(item.pendingItems);
    const reasons = [...blockers, ...pending];
    for (const code of reasons) {
      reasonCount.set(code, (reasonCount.get(code) ?? 0) + 1);
    }
  }

  const blockedCases = cases.filter((item) => item.status === "blocked");
  const pendingReviewCases = cases.filter((item) => item.status === "ready_for_review");
  const pendingDataCases = cases.filter((item) => item.status === "pending_data");
  const partialSettlementCases = cases.filter((item) => item.flow === "commission.settlement" && item.status !== "done");
  const pendingLegalCases = cases.filter((item) => item.flow.startsWith("contract.") && item.status !== "done");

  const distinctStatuses = Array.from(new Set(cases.map((item) => item.status)));
  const byStatus = distinctStatuses
    .map((status) => {
      const items = cases.filter((item) => item.status === status);
      const buckets = { h24: 0, h48: 0, h72: 0, gt72: 0 };
      for (const item of items) {
        const hours = ageHours(item.updatedAt);
        if (hours <= 24) buckets.h24 += 1;
        else if (hours <= 48) buckets.h48 += 1;
        else if (hours <= 72) buckets.h72 += 1;
        else buckets.gt72 += 1;
      }
      return { status, count: items.length, ageBuckets: buckets };
    })
    .filter((entry) => entry.count > 0);

  const byReasonCode = Array.from(reasonCount.entries())
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      severity: reasonCode.toLowerCase().includes("document") || reasonCode.toLowerCase().includes("contrato") ? "CRITICAL" : "BLOCK",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topBlockedRuns = blockedCases
    .map((item) => ({
      runId: item.id,
      status: item.status,
      reasonCodes: [...asStringList(item.blockers), ...asStringList(item.pendingItems)].slice(0, 4),
      ageHours: Number(ageHours(item.updatedAt).toFixed(1)),
      lastUpdatedAt: item.updatedAt.toISOString(),
      txId: null,
      criticalHash: null,
      proof: {
        txId: null,
        bundleHash: null,
        receiptPath: null,
        bundlePath: null,
        verifyUrl: null,
      },
    }))
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, 20);

  return res.json({
    ok: true,
    data: {
      workspaceId,
      module: "imob",
      window,
      generatedAt: new Date().toISOString(),
      summary: {
        blockedTotal: blockedCases.length,
        pendingApprovals: pendingReviewCases.length,
        pendingLegal: pendingLegalCases.length,
        salesKitPendingReview: pendingReviewCases.length,
        partialSettlements: partialSettlementCases.length,
      },
      byStatus,
      byReasonCode,
      topBlockedRuns,
      actions: [
        { actionId: "OPEN_APPROVAL_QUEUE", label: "Abrir aprovacoes", enabled: true },
        { actionId: "OPEN_BLOCKED_RUNS", label: "Abrir bloqueios", enabled: true },
      ],
    },
  });
});

imobRouter.get("/command-center/blocked-runs", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.workspaceId ?? authContext.workspaceId);
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "blocked";
  const reasonCode = typeof req.query.reasonCode === "string" ? req.query.reasonCode : null;
  const minAgeHours = Number(req.query.minAgeHours ?? "0");
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? "50")));

  const runs = await prisma.run.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId,
      status: statusFilter as any,
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const scopedRuns = runs.filter(isImobRun);
  const runIds = scopedRuns.map((run) => run.id);
  const events = runIds.length
    ? await prisma.runEvent.findMany({
        where: {
          tenantId: authContext.tenantId,
          workspaceId,
          runId: { in: runIds },
        },
        orderBy: { createdAt: "desc" },
        take: 3000,
      })
    : [];

  const items = scopedRuns
    .map((run) => {
      const reasons = events
        .filter((event) => event.runId === run.id)
        .flatMap((event) => extractReasonCodes(event.payload));
      return {
        runId: run.id,
        status: run.status,
        reasonCodes: Array.from(new Set(reasons)).slice(0, 6),
        ageHours: Number(ageHours(run.updatedAt ?? run.createdAt).toFixed(1)),
        bundleHash: run.criticalHash ?? null,
        txId: run.txId ?? null,
        updatedAt: (run.updatedAt ?? run.createdAt).toISOString(),
        proof: {
          txId: run.txId ?? null,
          bundleHash: run.criticalHash ?? null,
          receiptPath: run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null,
          bundlePath: run.criticalHash ? `/api/runs/${encodeURIComponent(run.id)}/bundle` : null,
          verifyUrl: run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null,
        },
      };
    })
    .filter((item) => item.ageHours >= (Number.isFinite(minAgeHours) ? minAgeHours : 0))
    .filter((item) => (reasonCode ? item.reasonCodes.includes(reasonCode) : true))
    .slice(0, limit);

  return res.json({
    ok: true,
    data: {
      items,
      page: { nextCursor: null, hasMore: false },
      meta: {
        generatedAt: new Date().toISOString(),
        snapshotVersion: "commandcenter@v1",
        proofExport: {
          bundleEndpointTemplate: "/api/runs/:runId/bundle",
          ledgerEndpointTemplate: "/api/ledger/:txId",
        },
      },
    },
  });
});

imobRouter.get("/command-center/continuity-coherence", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const workspaceId = String(req.query.workspaceId ?? authContext.workspaceId);
  const data = buildImobCrmContinuityCoherenceReadModel({
    workspaceId,
    generatedAt: new Date().toISOString(),
  });

  return res.json({
    ok: true,
    data,
  });
});

imobRouter.post("/contracts/generate", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const contractType = body.contractType;
  const answers = asObject(body.answers);
  const conversationId = asString(body.conversationId);
  const legalVersion = asString(body.legalVersion);

  if (!isContractType(contractType) || !answers) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "contractType (locacao|compra_venda|administracao|temporada) and answers object are required",
      },
    });
  }

  const preview = generateContractPreview({
    contractType,
    answers,
    legalVersion,
  });

  const memory = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_CONTRACT_PREVIEW,
      content: `contract_preview:${contractType}`,
      metadata: {
        conversationId,
        contractType,
        schemaVersion: preview.schemaVersion,
        legalVersion: preview.legalVersion,
        hash: preview.hash,
        clauseCount: preview.clauses.length,
        review: preview.review,
      } as any,
    },
  });

  return res.json({
    ok: true,
    data: {
      contractType,
      schemaVersion: preview.schemaVersion,
      legalVersion: preview.legalVersion,
      legalBase: preview.legalBase,
      review: preview.review,
      hash: preview.hash,
      clauses: preview.clauses,
      contractText: preview.contractText,
      evidence: {
        eventId: memory.id,
        createdAt: toIso(memory.createdAt),
      },
    },
  });
});

imobRouter.get("/chat/conversations", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const limitRaw = Number(req.query.limit ?? "30");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 30;

  const createdRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const messageRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "desc" },
    take: 1200,
  });

  const conversationMap = new Map<
    string,
    {
      conversationId: string;
      title: string;
      status: "active" | "archived";
      createdAt: string;
      updatedAt: string;
      lastMessagePreview: string | null;
      lastMessageAt: string | null;
      lastMessageRole: "user" | "assistant" | "system" | null;
      lastRunId: string | null;
      lastTxId: string | null;
      auditRunId: string | null;
    }
  >();

  for (const row of createdRows) {
    const metadata = asObject(row.metadata);
    const conversationId = getConversationIdFromMetadata(metadata);
    if (!conversationId) continue;
    if (conversationMap.has(conversationId)) continue;

    conversationMap.set(conversationId, {
      conversationId,
      title: asString(metadata?.title) ?? "Nova conversa IMOB",
      status: asString(metadata?.status) === "archived" ? "archived" : "active",
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.createdAt),
      lastMessagePreview: null,
      lastMessageAt: null,
      lastMessageRole: null,
      lastRunId: null,
      lastTxId: null,
      auditRunId: asString(metadata?.auditRunId),
    });
  }

  for (const row of messageRows) {
    const metadata = asObject(row.metadata);
    const conversationId = getConversationIdFromMetadata(metadata);
    if (!conversationId) continue;
    if (!conversationMap.has(conversationId)) {
      conversationMap.set(conversationId, {
        conversationId,
        title: "Conversa IMOB",
        status: "active",
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.createdAt),
        lastMessagePreview: null,
        lastMessageAt: null,
        lastMessageRole: null,
        lastRunId: null,
        lastTxId: null,
        auditRunId: null,
      });
    }
    const convo = conversationMap.get(conversationId)!;
    const role = getRoleFromMetadata(metadata);
    const runId = row.runId ?? asString(metadata?.runId);
    const txId = asString(metadata?.txId);
    const rowTime = new Date(row.createdAt).getTime();
    const updatedTime = new Date(convo.updatedAt).getTime();
    if (rowTime >= updatedTime) {
      convo.updatedAt = toIso(row.createdAt);
      convo.lastMessageAt = toIso(row.createdAt);
      convo.lastMessagePreview = row.content.slice(0, 180);
      convo.lastMessageRole = role;
      convo.lastRunId = runId;
      convo.lastTxId = txId;
      convo.auditRunId = asString(metadata?.auditRunId) ?? convo.auditRunId;
    }
  }

  const items = Array.from(conversationMap.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  return res.json({ ok: true, items });
});

imobRouter.post("/chat/conversations", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const title = asString(body.title) ?? "Nova conversa IMOB";
  const conversationId = `conv_${crypto.randomBytes(8).toString("hex")}`;
  const metadata = asObject(body.metadata) ?? {};

  const created = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_CONVERSATION_CREATED,
      content: title,
      metadata: {
        ...metadata,
        conversationId,
        title,
        status: "active",
      },
    },
  });

  const auditRunId = await resolveConversationAuditRunId({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    conversationId,
    title,
  });

  return res.status(201).json({
    ok: true,
    conversation: {
      conversationId,
      title,
      status: "active",
      createdAt: toIso(created.createdAt),
      updatedAt: toIso(created.createdAt),
      lastMessagePreview: null,
      lastMessageAt: null,
      lastMessageRole: null,
      lastRunId: null,
      lastTxId: null,
      auditRunId,
    },
  });
});

imobRouter.get("/chat/conversations/:conversationId/messages", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const limitRaw = Number(req.query.limit ?? "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 3000,
  });

  const items = rows
    .filter((row) => getConversationIdFromMetadata(row.metadata) === conversationId)
    .slice(-limit)
    .map((row) => {
      const metadata = asObject(row.metadata);
      const proof =
        (asObject(metadata?.proof) as Record<string, unknown> | null)
        ?? buildImobProofSurfaceFromMessage({
          linkedRun: null,
          runId: row.runId ?? asString(metadata?.runId),
          txId: asString(metadata?.txId),
          receiptPath: asString(metadata?.receiptPath),
          bundlePath: asString(metadata?.bundlePath),
        });
      return {
        id: row.id,
        conversationId,
        role: getRoleFromMetadata(metadata),
        content: row.content,
        intent: asString(metadata?.intent),
        action: asString(metadata?.action),
        threadId: getThreadIdFromMetadata(metadata),
        threadLabel: getThreadLabelFromMetadata(metadata),
        threadStatus: getThreadStatusFromMetadata(metadata),
        runId: row.runId ?? asString(metadata?.runId),
        txId: asString(metadata?.txId),
        receiptPath: asString(metadata?.receiptPath),
        bundlePath: asString(metadata?.bundlePath),
        proof,
        auditRunId: asString(metadata?.auditRunId),
        transcriptProof: asObject(metadata?.transcriptProof),
        metadata,
        createdAt: toIso(row.createdAt),
      };
    });

  return res.json({ ok: true, items });
});

imobRouter.get("/chat/conversations/:conversationId/threads", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 6000,
  });

  const threadMap = new Map<string, ConversationThreadSummary>();

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (getConversationIdFromMetadata(metadata) !== conversationId) continue;
    const threadId = getThreadIdFromMetadata(metadata);
    if (!threadId) continue;
    const label = getThreadLabelFromMetadata(metadata) ?? "Operação";
    const status = getThreadStatusFromMetadata(metadata) ?? "active";
    const createdAt = toIso(row.createdAt);
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, {
        threadId,
        label,
        status,
        firstMessageAt: createdAt,
        lastMessageAt: createdAt,
        messageCount: 1,
      });
      continue;
    }
    const existing = threadMap.get(threadId)!;
    existing.lastMessageAt = createdAt;
    existing.label = label;
    existing.status = status;
    existing.messageCount += 1;
  }

  const items = normalizeSingleActiveThread(Array.from(threadMap.values()));

  return res.json({ ok: true, items });
});

imobRouter.post("/chat/conversations/:conversationId/messages", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const body = asObject(req.body) ?? {};
  const role = asString(body.role);
  const content = asString(body.content);
  if (!content) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "content is required" },
    });
  }
  if (role !== "assistant" && role !== "user" && role !== "system") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "role must be user|assistant|system" },
    });
  }

  const metadata = asObject(body.metadata) ?? {};
  const requestedRunId = asString(body.runId);
  const linkedRun = await findScopedRunForMessage({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    runId: requestedRunId,
  });

  if (requestedRunId && !linkedRun) {
    return res.status(404).json({
      ok: false,
      error: { code: "RUN_NOT_FOUND", message: "Run not found for message correlation" },
    });
  }

  if (linkedRun?.requestConversationId && linkedRun.requestConversationId !== conversationId) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "RUN_CONVERSATION_MISMATCH",
        message: "runId does not belong to this conversation context",
      },
    });
  }

  const requestedThreadId = asString(body.threadId) ?? asString(metadata.threadId);
  if (requestedThreadId && linkedRun?.requestThreadId && requestedThreadId !== linkedRun.requestThreadId) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "RUN_THREAD_MISMATCH",
        message: "threadId does not match the run context",
      },
    });
  }

  const threadId = requestedThreadId ?? linkedRun?.requestThreadId ?? linkedRun?.threadId ?? null;
  const threadLabel = asString(body.threadLabel) ?? asString(metadata.threadLabel);
  const threadStatusRaw = asString(body.threadStatus) ?? asString(metadata.threadStatus);
  const requestedThreadStatus =
    threadStatusRaw === "active" || threadStatusRaw === "waiting" || threadStatusRaw === "done" || threadStatusRaw === "blocked"
      ? threadStatusRaw
      : null;
  const runId = linkedRun?.id ?? null;
  const txId = asString(body.txId) ?? linkedRun?.txId ?? null;
  const bundlePath = asString(body.bundlePath)
    ?? (linkedRun?.criticalHash ? `/api/runs/${encodeURIComponent(linkedRun.id)}/bundle` : null);
  const receiptPath = asString(body.receiptPath)
    ?? (txId ? `/api/ledger/${encodeURIComponent(txId)}` : null);
  const completionState = resolveCompletionStateFromMessage({
    role: role as "user" | "assistant" | "system",
    bodyCompletionState: asString(body.completionState),
    linkedRun,
    txId,
    receiptPath,
    bundlePath,
  });
  const proofState = resolveProofStateFromMessage({
    linkedRun,
    txId,
    receiptPath,
    bundlePath,
  });
  const proof = buildImobProofSurfaceFromMessage({
    linkedRun,
    runId,
    txId,
    receiptPath,
    bundlePath,
  });
  const threadStatus =
    requestedThreadStatus === "done" && proofState.proofRequired && !proofState.proofReady
      ? "waiting"
      : requestedThreadStatus;

  const message = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId,
      key: CHAT_KEY_MESSAGE,
      content,
      metadata: {
        ...metadata,
        conversationId,
        role,
        intent: asString(body.intent),
        action: asString(body.action),
        threadId,
        threadLabel,
        threadStatus,
        runId: requestedRunId ?? undefined,
        txId,
        receiptPath,
        bundlePath,
        proof,
        completionState,
        proofRequired: proofState.proofRequired,
        proofReady: proofState.proofReady,
        proofState: proofState.proofState,
        completionContractVersion: "imob.chat.completion.v1",
        runCorrelation: {
          runId,
          caseId: linkedRun?.caseId ?? null,
          threadId,
          conversationId,
        },
      },
    },
  });

  const auditRunId = await resolveConversationAuditRunId({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    conversationId,
    title: null,
    minCreatedAt: linkedRun?.createdAt ?? null,
  });
  if (!auditRunId) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUDIT_RUN_MISSING", message: "Audit run could not be resolved" },
    });
  }

  const transcriptProof = await recordConversationMessageProof({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    auditRunId,
    conversationId,
    messageId: message.id,
    role,
    content: message.content,
    createdAt: message.createdAt,
    threadId,
    threadLabel,
    threadStatus,
    messageRunId: message.runId ?? requestedRunId,
    txId,
  });

  const messageMetadata: Record<string, unknown> = {
    ...(asObject(message.metadata) ?? {}),
    auditRunId,
    transcriptProof: {
      sequence: transcriptProof.sequence,
      entryHash: transcriptProof.entryHash,
      prevHash: transcriptProof.prevHash,
      contentHash: transcriptProof.contentHash,
    },
  };

  await prisma.memoryEvent.update({
    where: { id: message.id },
    data: {
      metadata: messageMetadata as any,
    },
  });

  return res.status(201).json({
    ok: true,
    message: {
      id: message.id,
      conversationId,
      role,
      content: message.content,
      intent: asString(messageMetadata?.intent),
      action: asString(messageMetadata?.action),
      threadId: getThreadIdFromMetadata(messageMetadata),
      threadLabel: getThreadLabelFromMetadata(messageMetadata),
      threadStatus: getThreadStatusFromMetadata(messageMetadata),
      runId: message.runId ?? asString(messageMetadata?.runId),
      txId: asString(messageMetadata?.txId),
      receiptPath: asString(messageMetadata?.receiptPath),
      bundlePath: asString(messageMetadata?.bundlePath),
      proof: (asObject(messageMetadata?.proof) as Record<string, unknown> | null)
        ?? buildImobProofSurfaceFromMessage({
          linkedRun: null,
          runId: message.runId ?? asString(messageMetadata?.runId),
          txId: asString(messageMetadata?.txId),
          receiptPath: asString(messageMetadata?.receiptPath),
          bundlePath: asString(messageMetadata?.bundlePath),
        }),
      auditRunId: asString(messageMetadata?.auditRunId),
      transcriptProof: asObject(messageMetadata?.transcriptProof),
      metadata: messageMetadata,
      createdAt: toIso(message.createdAt),
    },
  });
});

imobRouter.get("/chat/conversations/:conversationId/interview-state", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONTRACT_INTERVIEW_STATE,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const row = rows.find((item) => getConversationIdFromMetadata(item.metadata) === conversationId) ?? null;
  if (!row) {
    return res.json({ ok: true, state: null, updatedAt: null });
  }

  const metadata = asObject(row.metadata);
  const state = asObject(metadata?.state);
  return res.json({
    ok: true,
    state: state ?? null,
    updatedAt: toIso(row.createdAt),
  });
});

imobRouter.put("/chat/conversations/:conversationId/interview-state", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const body = asObject(req.body) ?? {};
  const state = asObject(body.state);
  if (!state || !isContractInterviewStatus(state.status)) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "state with valid status is required" },
    });
  }

  const created = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: asString(state.runId),
      key: CHAT_KEY_CONTRACT_INTERVIEW_STATE,
      content: `state:${String(state.status)}`,
      metadata: {
        conversationId,
        state: state as any,
      },
    },
  });

  return res.status(201).json({
    ok: true,
    state,
    updatedAt: toIso(created.createdAt),
  });
});

imobRouter.post("/chat/telemetry", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const body = asObject(req.body) ?? {};
  const conversationId = asString(body.conversationId);
  const event = asString(body.event);
  const valueRaw = Number(body.value);
  const metadata = asObject(body.metadata) ?? {};
  const allowedEvents = new Set([
    "message_to_plan_ms",
    "plan_to_execute_ms",
    "chat_to_run_link_coverage",
    "message_persist_success_rate",
    "ux_interaction",
  ]);

  if (!conversationId || !event || !Number.isFinite(valueRaw) || !allowedEvents.has(event)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "conversationId, event and numeric value are required",
      },
    });
  }

  const telemetry = await prisma.memoryEvent.create({
    data: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      runId: null,
      key: CHAT_KEY_TELEMETRY,
      content: `${event}:${valueRaw}`,
      metadata: {
        conversationId,
        event,
        value: valueRaw,
        ...metadata,
      },
    },
  });

  return res.status(201).json({
    ok: true,
    telemetry: {
      id: telemetry.id,
      createdAt: toIso(telemetry.createdAt),
    },
  });
});

imobRouter.get("/chat/telemetry/summary", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const windowRaw = Number(req.query.windowHours ?? "24");
  const windowHours = Number.isFinite(windowRaw) ? Math.max(1, Math.min(24 * 30, windowRaw)) : 24;
  const conversationId = asString(req.query.conversationId);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_TELEMETRY,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 4000,
  });

  const scopedRows = rows.filter((row) => {
    if (!conversationId) return true;
    const metadata = asObject(row.metadata);
    return getConversationIdFromMetadata(metadata) === conversationId;
  });

  const grouped = new Map<string, number[]>();
  const byJourney = new Map<string, { events: number; stages: Set<string>; actions: Set<string> }>();
  const byReasonCode = new Map<string, number>();
  const bySpecialist = new Map<string, number>();
  for (const row of scopedRows) {
    const metadata = asObject(row.metadata);
    const event = asString(metadata?.event) ?? "unknown";
    const value =
      Number.isFinite(Number(metadata?.value))
        ? Number(metadata?.value)
        : parseNumericTelemetryValue(row.content);
    if (value === null || !Number.isFinite(value)) continue;
    const bucket = grouped.get(event) ?? [];
    bucket.push(value);
    grouped.set(event, bucket);

    const journeyType = asString(metadata?.journeyType) ?? "unknown";
    const stage = asString(metadata?.stage) ?? "unknown";
    const action = asString(metadata?.action) ?? asString(metadata?.recommendedActionId) ?? "unknown";
    const currentJourney = byJourney.get(journeyType) ?? { events: 0, stages: new Set<string>(), actions: new Set<string>() };
    currentJourney.events += 1;
    if (stage !== "unknown") currentJourney.stages.add(stage);
    if (action !== "unknown") currentJourney.actions.add(action);
    byJourney.set(journeyType, currentJourney);

    const reasonCode = asString(metadata?.reasonCode);
    if (reasonCode) {
      byReasonCode.set(reasonCode, (byReasonCode.get(reasonCode) ?? 0) + 1);
    }

    const specialistId = asString(metadata?.specialistId);
    if (specialistId) {
      bySpecialist.set(specialistId, (bySpecialist.get(specialistId) ?? 0) + 1);
    }
  }

  const aggregates = Array.from(grouped.entries()).map(([event, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, item) => acc + item, 0);
    const avg = values.length > 0 ? sum / values.length : 0;
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    return {
      event,
      count: values.length,
      avg,
      p95,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  });

  const metricsByEvent = Object.fromEntries(aggregates.map((item) => [item.event, item])) as Record<
    string,
    { event: string; count: number; avg: number; p95: number; min: number; max: number }
  >;

  const coverage = metricsByEvent.chat_to_run_link_coverage?.avg ?? 0;
  const persistRate = metricsByEvent.message_persist_success_rate?.avg ?? 0;
  const uxRows = scopedRows.filter((row) => {
    const metadata = asObject(row.metadata);
    return asString(metadata?.event) === "ux_interaction";
  });
  const commercial = {
    recommendedActionSelections: countUxActions(uxRows, ["recommended_action_selected"]),
    widgetActionSelections: countUxActions(uxRows, ["widget_action_selected"]),
    businessExports: countUxActions(uxRows, ["conversation_exported_business_pdf", "conversation_exported_business_json"]),
    caseRecoveries: countUxActions(uxRows, ["case_recovery_started"]),
    attachmentReads: countUxActions(uxRows, ["attachment_uploaded", "attachment_validated"]),
  };

  return res.json({
    ok: true,
    data: {
      conversationId: conversationId ?? null,
      windowHours,
      generatedAt: new Date().toISOString(),
      totals: {
        events: scopedRows.length,
        messageToPlanAvgMs: metricsByEvent.message_to_plan_ms?.avg ?? null,
        planToExecuteAvgMs: metricsByEvent.plan_to_execute_ms?.avg ?? null,
        chatToRunCoveragePct: Number((coverage * 100).toFixed(2)),
        persistSuccessRatePct: Number((persistRate * 100).toFixed(2)),
      },
      metrics: aggregates,
      commercial,
      byJourney: Array.from(byJourney.entries()).map(([journeyType, value]) => ({
        journeyType,
        events: value.events,
        stages: Array.from(value.stages),
        actions: Array.from(value.actions),
      })),
      byReasonCode: Array.from(byReasonCode.entries()).map(([reasonCode, events]) => ({
        reasonCode,
        events,
      })),
      bySpecialist: Array.from(bySpecialist.entries()).map(([specialistId, events]) => ({
        specialistId,
        events,
      })),
    },
  });
});

imobRouter.get("/chat/conversations/:conversationId/snapshot", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const conversationRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const conversationRecord = conversationRows
    .map((row) => ({ row, metadata: asObject(row.metadata) }))
    .find((entry) => getConversationIdFromMetadata(entry.metadata) === conversationId);

  const messageRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 6000,
  });

  const messages = messageRows
    .filter((row) => getConversationIdFromMetadata(row.metadata) === conversationId)
    .map((row) => {
      const metadata = asObject(row.metadata);
      return {
        id: row.id,
        role: getRoleFromMetadata(metadata),
        content: row.content,
        threadId: getThreadIdFromMetadata(metadata),
        threadLabel: getThreadLabelFromMetadata(metadata),
        threadStatus: normalizeSnapshotThreadStatus(getThreadStatusFromMetadata(metadata)),
        runId: row.runId ?? asString(metadata?.runId),
        txId: asString(metadata?.txId),
        receiptPath: asString(metadata?.receiptPath),
        bundlePath: asString(metadata?.bundlePath),
        proof: (asObject(metadata?.proof) as Record<string, unknown> | null)
          ?? buildImobProofSurfaceFromMessage({
            linkedRun: null,
            runId: row.runId ?? asString(metadata?.runId),
            txId: asString(metadata?.txId),
            receiptPath: asString(metadata?.receiptPath),
            bundlePath: asString(metadata?.bundlePath),
          }),
        createdAt: toIso(row.createdAt),
        metadata,
      };
    });

  const snapshot = buildImobConversationSnapshot({
    conversationId,
    title: asString(conversationRecord?.metadata?.title) ?? "Conversa IMOB",
    status: asString(conversationRecord?.metadata?.status) ?? "active",
    createdAt: toIso(conversationRecord?.row.createdAt),
    messages,
  });

  return res.json({
    ok: true,
    snapshot,
  });
});

imobRouter.get("/chat/conversations/:conversationId/export", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const conversationId = asString(req.params.conversationId);
  if (!conversationId) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_CONVERSATION_ID", message: "conversationId is required" },
    });
  }

  const conversationRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_CONVERSATION_CREATED,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const conversationRecord = conversationRows
    .map((row) => ({ row, metadata: asObject(row.metadata) }))
    .find((entry) => getConversationIdFromMetadata(entry.metadata) === conversationId);

  const messageRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_MESSAGE,
    },
    orderBy: { createdAt: "asc" },
    take: 6000,
  });

  const messages = messageRows
    .filter((row) => getConversationIdFromMetadata(row.metadata) === conversationId)
    .map((row) => {
      const metadata = asObject(row.metadata);
      const runId = row.runId ?? asString(metadata?.runId);
      const txId = asString(metadata?.txId);
      const receiptPath = asString(metadata?.receiptPath);
      const bundlePath = asString(metadata?.bundlePath);
      return {
        id: row.id,
        role: getRoleFromMetadata(metadata),
        content: row.content,
        intent: asString(metadata?.intent),
        action: asString(metadata?.action),
        threadId: getThreadIdFromMetadata(metadata),
        threadLabel: getThreadLabelFromMetadata(metadata),
        threadStatus: normalizeSnapshotThreadStatus(getThreadStatusFromMetadata(metadata)),
        runId,
        txId,
        receiptPath,
        bundlePath,
        proof: (asObject(metadata?.proof) as Record<string, unknown> | null)
          ?? buildImobProofSurfaceFromMessage({
            linkedRun: null,
            runId,
            txId,
            receiptPath,
            bundlePath,
          }),
        auditRunId: asString(metadata?.auditRunId),
        transcriptProof: asObject(metadata?.transcriptProof),
        metadata,
        createdAt: toIso(row.createdAt),
      };
    });

  const threadMap = new Map<string, ConversationThreadSummary>();
  for (const message of messages) {
    if (!message.threadId) continue;
    const label = message.threadLabel ?? "Operação";
    const status =
      message.threadStatus === "done" || message.threadStatus === "blocked" || message.threadStatus === "waiting"
        ? message.threadStatus
        : "active";
    if (!threadMap.has(message.threadId)) {
      threadMap.set(message.threadId, {
        threadId: message.threadId,
        label,
        status,
        firstMessageAt: message.createdAt,
        lastMessageAt: message.createdAt,
        messageCount: 1,
      });
      continue;
    }
    const existing = threadMap.get(message.threadId)!;
    existing.lastMessageAt = message.createdAt;
    existing.label = label;
    existing.status = status;
    existing.messageCount += 1;
  }
  const threads = normalizeSingleActiveThread(Array.from(threadMap.values()));

  const telemetryRows = await prisma.memoryEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: IMOB_CHAT_AGENT_ID,
      key: CHAT_KEY_TELEMETRY,
    },
    orderBy: { createdAt: "desc" },
    take: 4000,
  });

  const scopedTelemetry = telemetryRows.filter((row) => {
    const metadata = asObject(row.metadata);
    return getConversationIdFromMetadata(metadata) === conversationId;
  });

  const grouped = new Map<string, number[]>();
  const byJourney = new Map<string, { events: number; stages: Set<string>; actions: Set<string> }>();
  for (const row of scopedTelemetry) {
    const metadata = asObject(row.metadata);
    const event = asString(metadata?.event) ?? "unknown";
    const value =
      Number.isFinite(Number(metadata?.value))
        ? Number(metadata?.value)
        : parseNumericTelemetryValue(row.content);
    if (value === null || !Number.isFinite(value)) continue;
    const bucket = grouped.get(event) ?? [];
    bucket.push(value);
    grouped.set(event, bucket);

    const journeyType = asString(metadata?.journeyType) ?? "unknown";
    const stage = asString(metadata?.stage) ?? "unknown";
    const action = asString(metadata?.action) ?? asString(metadata?.recommendedActionId) ?? "unknown";
    const currentJourney = byJourney.get(journeyType) ?? { events: 0, stages: new Set<string>(), actions: new Set<string>() };
    currentJourney.events += 1;
    if (stage !== "unknown") currentJourney.stages.add(stage);
    if (action !== "unknown") currentJourney.actions.add(action);
    byJourney.set(journeyType, currentJourney);
  }
  const telemetryMetrics = Array.from(grouped.entries()).map(([event, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, item) => acc + item, 0);
    return {
      event,
      count: values.length,
      avg: values.length ? sum / values.length : 0,
      p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  });

  const coverageMetric = telemetryMetrics.find((item) => item.event === "chat_to_run_link_coverage");
  const persistMetric = telemetryMetrics.find((item) => item.event === "message_persist_success_rate");
  const msgPlanMetric = telemetryMetrics.find((item) => item.event === "message_to_plan_ms");
  const planExecMetric = telemetryMetrics.find((item) => item.event === "plan_to_execute_ms");
  const snapshot = buildImobConversationSnapshot({
    conversationId,
    title: asString(conversationRecord?.metadata?.title) ?? "Conversa IMOB",
    status: asString(conversationRecord?.metadata?.status) ?? "active",
    createdAt: toIso(conversationRecord?.row.createdAt),
    messages,
  });
  const business = buildImobBusinessExport(snapshot);
  const uxRows = scopedTelemetry.filter((row) => {
    const metadata = asObject(row.metadata);
    return asString(metadata?.event) === "ux_interaction";
  });
  const commercial = {
    recommendedActionSelections: countUxActions(uxRows, ["recommended_action_selected"]),
    widgetActionSelections: countUxActions(uxRows, ["widget_action_selected"]),
    businessExports: countUxActions(uxRows, ["conversation_exported_business_pdf", "conversation_exported_business_json"]),
    caseRecoveries: countUxActions(uxRows, ["case_recovery_started"]),
    attachmentReads: countUxActions(uxRows, ["attachment_uploaded", "attachment_validated"]),
  };

  const exported = {
    generatedAt: new Date().toISOString(),
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    conversation: {
      conversationId,
      title: asString(conversationRecord?.metadata?.title) ?? "Conversa IMOB",
      status: asString(conversationRecord?.metadata?.status) ?? "active",
      createdAt: toIso(conversationRecord?.row.createdAt),
      messageCount: messages.length,
    },
    links: {
      runsBase: "/app/runs?domain=imob",
      ledgerBase: "/api/ledger/:txId",
    },
    audit: {
      runId:
        asString(conversationRecord?.metadata?.auditRunId) ??
        (messages.find((item) => asString(item.auditRunId))?.auditRunId ?? null),
      eventType: RUN_EVENT_CHAT_MESSAGE_RECORDED,
      hashAlgorithm: "sha256",
      messageProofCoveragePct:
        messages.length > 0
          ? Number(
              (
                (messages.filter((item) => item.transcriptProof && asString(item.auditRunId)).length / messages.length) *
                100
              ).toFixed(2)
            )
          : 0,
    },
    threads,
    messages: messages.map(({ metadata, ...message }) => message),
    snapshot,
    business,
    telemetry: {
      totals: {
        messageToPlanAvgMs: msgPlanMetric?.avg ?? null,
        planToExecuteAvgMs: planExecMetric?.avg ?? null,
        chatToRunCoveragePct: Number(((coverageMetric?.avg ?? 0) * 100).toFixed(2)),
        persistSuccessRatePct: Number(((persistMetric?.avg ?? 0) * 100).toFixed(2)),
      },
      metrics: telemetryMetrics,
      commercial,
      byJourney: Array.from(byJourney.entries()).map(([journeyType, value]) => ({
        journeyType,
        events: value.events,
        stages: Array.from(value.stages),
        actions: Array.from(value.actions),
      })),
    },
  };

  const digest = crypto.createHash("sha256").update(JSON.stringify(exported)).digest("hex");
  const exportPayload = {
    ...exported,
    audit: {
      hash: digest,
      hashAlgo: "sha256",
    },
  };
  return res.json({
    ok: true,
    export: exportPayload,
    exported: exportPayload,
  });
});

// ─── IMOB Chat Document Intake — Phase 1B ─────────────────────────────────────

const INTAKE_FILE_MAX_BYTES = Number(process.env.IMOB_INTAKE_FILE_MAX_BYTES ?? 10 * 1024 * 1024); // 10 MB
const INTAKE_ALLOWED_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const intakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INTAKE_FILE_MAX_BYTES, files: 1 },
});

function computeDocumentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// POST /api/imob/chat/intake/upload
// Accepts a single .docx file, extracts + masks + classifies, returns draft.
// Does NOT mutate ImobCase. No PII in response.
imobRouter.post("/chat/intake/upload", intakeUpload.single("file"), async (req: TenantAwareRequest, res: Response) => {
  const auth = req.authContext;
  if (!auth) {
    return res.status(403).json({ ok: false, reasonCode: "UNAUTHORIZED", message: "Auth context ausente" });
  }

  const { tenantId, workspaceId } = auth;

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ ok: false, reasonCode: "FILE_MISSING", message: "Arquivo .docx obrigatório" });
  }

  if (file.mimetype !== INTAKE_ALLOWED_MIME) {
    return res.status(415).json({
      ok: false,
      reasonCode: "UNSUPPORTED_DOCUMENT_TYPE",
      message: `Tipo de arquivo não suportado: ${file.mimetype}. Envie um arquivo .docx`,
    });
  }

  if (file.size > INTAKE_FILE_MAX_BYTES) {
    return res.status(413).json({
      ok: false,
      reasonCode: "FILE_TOO_LARGE",
      message: `Arquivo excede o limite de ${INTAKE_FILE_MAX_BYTES / 1024 / 1024}MB`,
    });
  }

  const documentHash = computeDocumentHash(file.buffer);

  // Persist file to storage (storageKey for audit)
  let storageRef: string | undefined;
  try {
    const client = req.prisma;
    if (client) {
      const persisted = await persistBuffer(file.buffer, file.originalname);
      const record = await createUploadedDocument({
        prisma: client,
        tenantId,
        workspaceId,
        agentSlug: "imob-intake",
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: persisted.storageKey,
      });
      storageRef = record.id;
    }
  } catch {
    // Non-fatal: storage failure doesn't block draft creation
  }

  // Extract text from .docx
  const docxResult = await extractTextFromDocxBuffer(file.buffer);
  if (!docxResult.ok) {
    return res.status(422).json({
      ok: false,
      reasonCode: "DOCX_EXTRACTION_FAILED",
      message: "Não foi possível extrair texto do arquivo .docx",
      details: docxResult.messages,
    });
  }

  // PII masking — must happen before any response or log
  const { maskedText } = maskContractPii(docxResult.text);

  // Extract lease fields
  const extraction = extractLeaseContractFromText(maskedText);
  const classification = classifyImobContract(extraction.lease, maskedText);

  // Build draft
  const draft = createDraft({
    tenantId,
    workspaceId,
    extractedLease: extraction.lease,
    classification,
    evidenceDrafts: [
      {
        documentHash,
        documentKind: classification.documentType === "lease_contract" ? "lease_contract" : "other",
        ...(storageRef ? { storageRef } : {}),
        piiMasked: true,
      },
    ],
    pendingItems: extraction.pendingItems,
    riskFlags: extraction.riskFlags,
  });

  return res.status(201).json({
    ok: true,
    draft,
    extractionOk: extraction.ok,
    parserVersion: extraction.parserVersion,
  });
});

// POST /api/imob/chat/intake/confirm/:draftId
// Validates draft, creates run, returns runId.
// Governed block if actionId not in registry or agent not assigned.
imobRouter.post("/chat/intake/confirm/:draftId", async (req: TenantAwareRequest, res: Response) => {
  const auth = req.authContext;
  if (!auth) {
    return res.status(403).json({ ok: false, reasonCode: "UNAUTHORIZED", message: "Auth context ausente" });
  }

  const { tenantId, workspaceId } = auth;
  const { draftId } = req.params;

  if (!draftId) {
    return res.status(400).json({ ok: false, reasonCode: "DRAFT_ID_MISSING", message: "draftId obrigatório" });
  }

  const draft = getDraft(draftId);
  if (!draft) {
    return res.status(409).json({ ok: false, reasonCode: "DRAFT_EXPIRED", message: "Draft expirado ou não encontrado" });
  }

  // Validate scope — draft must belong to same tenant/workspace
  if (draft.tenantId !== tenantId || draft.workspaceId !== workspaceId) {
    return res.status(403).json({
      ok: false,
      reasonCode: "DRAFT_SCOPE_MISMATCH",
      message: "Draft não pertence a este tenant/workspace",
    });
  }

  // Validate actionId is in dispatcher registry
  const actionId = draft.actionId;
  const isInRegistry = (IMOB_DISPATCHER_ACTION_IDS as readonly string[]).includes(actionId);
  if (!isInRegistry) {
    return res.status(200).json({
      ok: false,
      reasonCode: "ACTION_NOT_IN_REGISTRY",
      blocked: true,
      message: `Ação '${actionId}' ainda não está disponível no registry`,
    });
  }

  // Create run record
  let run: { id: string; status: string } | null = null;
  try {
    const runRecord = await createRunRecord({
      prisma: req.prisma,
      tenantId,
      workspaceId,
      agent: "EIAH",
      status: "queued" as any,
      request: {
        actionId,
        source: "chat-imob",
        draftId,
        documentHash: draft.evidenceDrafts[0]?.documentHash ?? null,
        documentKind: draft.evidenceDrafts[0]?.documentKind ?? "other",
        pendingItems: draft.pendingItems,
        riskFlags: draft.riskFlags,
        metadata: {
          domain: "imob",
          action: actionId,
          executionInput: { actionId },
        },
      },
    });
    run = { id: runRecord.id, status: runRecord.status };
  } catch (err) {
    const isAssignmentError =
      err instanceof Error &&
      (err.constructor.name === "WorkspaceAgentAssignmentError" ||
        err.message.includes("not enabled") ||
        err.message.includes("not assigned"));

    if (isAssignmentError) {
      return res.status(200).json({
        ok: false,
        reasonCode: "AGENT_NOT_ASSIGNED",
        blocked: true,
        message: "Agente IMOB não está habilitado para este workspace",
      });
    }
    return res.status(500).json({
      ok: false,
      reasonCode: "RUN_CREATION_FAILED",
      message: "Falha ao criar run",
    });
  }

  // Draft consumed — delete after successful run creation
  deleteDraft(draftId);

  return res.status(201).json({
    ok: true,
    runId: run.id,
    runStatus: run.status,
    actionId,
    source: "chat-imob",
    message: "Run criado. Mutação do caso será processada pelo worker.",
  });
});

// GET /api/imob/runs/:runId/intake/export?format=html|docx|pdf
// Builds and streams the intake export from persisted run/case/event — never from draft.
// Guards: tenantId+workspaceId scope, piiMasked=true, anti-PII scan.
// PDF is delegated to the frontend (jspdf/browser print) — returns guidance JSON.
imobRouter.get("/runs/:runId/intake/export", async (req: TenantAwareRequest, res: Response) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(403).json({ ok: false, reasonCode: "UNAUTHORIZED", message: "Auth context ausente" });
  }

  const { tenantId, workspaceId } = authContext;
  const { runId } = req.params;
  const format = String(req.query.format ?? "");

  const ALLOWED_FORMATS = ["html", "docx", "pdf"] as const;
  if (!ALLOWED_FORMATS.includes(format as (typeof ALLOWED_FORMATS)[number])) {
    return res.status(400).json({
      ok: false,
      reasonCode: "INVALID_FORMAT",
      message: `Parâmetro format inválido: "${format}". Use html, docx ou pdf.`,
    });
  }

  // PDF is a client-side pattern in this project (jspdf in apps/web).
  // Return guidance so the caller knows how to proceed.
  if (format === "pdf") {
    return res.status(200).json({
      ok: false,
      reasonCode: "PDF_DELEGATED_TO_FRONTEND",
      strategy: "client-side-jspdf-or-browser-print",
      htmlExportUrl: `/api/imob/runs/${encodeURIComponent(runId)}/intake/export?format=html`,
      message:
        "PDF não é gerado server-side neste projeto. Use o HTML exportado com jspdf ou a impressão do navegador.",
    });
  }

  // Load run — validate scope
  const run = await (prisma as any).run.findFirst({
    where: { id: runId, tenantId, workspaceId },
    select: { id: true, request: true, status: true },
  });
  if (!run) {
    return res.status(404).json({ ok: false, reasonCode: "RUN_NOT_FOUND", message: "Run não encontrado" });
  }

  const request = (run.request as Record<string, unknown>) ?? {};
  if (request.actionId !== "imob.contract.intake") {
    return res.status(400).json({
      ok: false,
      reasonCode: "NOT_INTAKE_RUN",
      message: "Este run não é um run de intake de contrato",
    });
  }

  // Load the intake evidence event — idempotency anchor by documentHash
  const evidenceEvent = await (prisma as any).imobCaseEvent.findFirst({
    where: { runId, tenantId, workspaceId, type: "case.document.intake" },
    select: { id: true, caseId: true, payload: true, evidenceRef: true },
  });
  if (!evidenceEvent) {
    return res.status(404).json({
      ok: false,
      reasonCode: "EVIDENCE_NOT_FOUND",
      message: "Evento de evidência de intake não encontrado. O worker pode ainda não ter processado o run.",
    });
  }

  // Guard: piiMasked must be true in the persisted event payload
  const eventPayload = (evidenceEvent.payload as Record<string, unknown>) ?? {};
  if (eventPayload.piiMasked !== true) {
    return res.status(403).json({
      ok: false,
      reasonCode: "EXPORT_PII_NOT_MASKED",
      message: "Export bloqueado: payload do evento não contém piiMasked=true",
    });
  }

  // Load case — validate scope again through case ownership
  const imobCase = await (prisma as any).imobCase.findFirst({
    where: { id: evidenceEvent.caseId, tenantId, workspaceId },
    select: { id: true, stage: true, status: true, nextStep: true, pendingItems: true, metadata: true },
  });
  if (!imobCase) {
    return res.status(404).json({
      ok: false,
      reasonCode: "CASE_NOT_FOUND",
      message: "Caso IMOB não encontrado ou não pertence a este tenant/workspace",
    });
  }

  const caseMeta = (imobCase.metadata as Record<string, unknown>) ?? {};
  const riskFlags = Array.isArray(caseMeta.riskFlags) ? (caseMeta.riskFlags as string[]) : [];
  const pendingItems = Array.isArray(imobCase.pendingItems) ? (imobCase.pendingItems as string[]) : [];
  const documentHash = String(evidenceEvent.evidenceRef ?? eventPayload.documentHash ?? "");
  const documentKind =
    String(eventPayload.documentKind ?? "lease_contract") === "lease_contract" ? "lease_contract" : ("other" as const);

  const generatedAt = new Date().toISOString();

  const exportDataWithoutHash: Omit<IntakeExportData, "exportHash"> = {
    caseId: imobCase.id,
    runId,
    documentHash,
    documentKind,
    stage: imobCase.stage,
    status: imobCase.status,
    nextStep: typeof imobCase.nextStep === "string" ? imobCase.nextStep : null,
    pendingItems,
    riskFlags,
    generatedAt,
    piiMasked: true,
  };

  const exportHash = buildExportHash(exportDataWithoutHash);
  const exportData: IntakeExportData = { ...exportDataWithoutHash, exportHash };

  // Anti-PII scan on human-readable fields before generating the file
  const piiScan = scanIntakeDataForPii(exportData);
  if (piiScan.hasPii) {
    return res.status(200).json({
      ok: false,
      partial: true,
      reasonCode: "EXPORT_GENERATION_FAILED",
      detail: "PII residue detected in assembled export data",
      fields: piiScan.fields,
    });
  }

  try {
    if (format === "html") {
      const html = renderIntakeHtml(exportData);
      return res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="intake-${runId}.html"`)
        .set("X-Export-Hash", exportHash)
        .set("X-Generated-At", generatedAt)
        .send(html);
    }

    if (format === "docx") {
      const docxBuffer = await renderIntakeDocx(exportData);
      return res
        .status(200)
        .set(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        .set("Content-Disposition", `attachment; filename="intake-${runId}.docx"`)
        .set("X-Export-Hash", exportHash)
        .set("X-Generated-At", generatedAt)
        .send(docxBuffer);
    }
  } catch {
    return res.status(200).json({
      ok: false,
      partial: true,
      reasonCode: "EXPORT_GENERATION_FAILED",
      message: "Falha na geração do arquivo de exportação",
    });
  }
});
