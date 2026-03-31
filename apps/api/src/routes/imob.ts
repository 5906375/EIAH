import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { generateContractPreview } from "../services/contracts/contractGenerator";
import type { ContractType } from "../services/contracts/types";
import { createRunRecord } from "../services/runs";
import { emitRunEvent } from "../services/runEventEmitter";
import { searchImobKnowledge } from "../services/imob/imobKnowledgeSearch";
import { readImobDriveSyncSnapshot } from "../services/imob/imobDriveSync";
import { searchImobInventory } from "../services/imob/imobInventoryProvider";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";
import { resolveImobSemanticIntent } from "../services/imob/imobSemanticIntentResolver";
import { validateImobIdentityAttachmentAgainstCase } from "../services/imob/imobAttachmentValidation";
import {
  resolveImobInstallationStatus,
  sendImobAccessDenied,
} from "../services/imob/imobAccessGate";
import { canWorkspaceOperateImobStage, hasWorkspacePermission, readWorkspaceResponsibleProfile } from "../services/workspaceResponsibility";

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

function extractAction(run: any) {
  const request = asObject(run?.request);
  const metadata = asObject(request?.metadata);
  const action = metadata?.action;
  if (typeof action === "string") return action;
  const protocolAction = metadata?.protocolAction;
  if (typeof protocolAction === "string") return protocolAction;
  return null;
}

function isImobRun(run: any) {
  const action = extractAction(run);
  if (action && action.startsWith("realestate.")) return true;
  const request = asObject(run?.request);
  const metadata = asObject(request?.metadata);
  return metadata?.domain === "imob";
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
const CHAT_KEY_TELEMETRY = "conversation.telemetry";
const CHAT_KEY_CONTRACT_INTERVIEW_STATE = "conversation.contract_interview_state";
const CHAT_KEY_CONTRACT_PREVIEW = "conversation.contract_preview";
const RUN_EVENT_CHAT_AUDIT_STARTED = "conversation.audit.started";
const RUN_EVENT_CHAT_MESSAGE_RECORDED = "conversation.message.recorded";

const optionalShortString = (max: number) => z.union([z.string().trim().min(1).max(max), z.null()]).optional();
const optionalStringArraySchema = z.array(z.string().trim().min(1).max(160)).max(100).optional();

const imobOwnerCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  document: optionalShortString(60),
  email: z.union([z.string().trim().email().max(160), z.null()]).optional(),
  phone: optionalShortString(40),
  personType: optionalShortString(40),
  status: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

const imobOwnerUpdateSchema = imobOwnerCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

const imobPropertyCreateSchema = z.object({
  ownerId: optionalShortString(80),
  propertyType: optionalShortString(60),
  goal: optionalShortString(40),
  address: optionalShortString(240),
  city: optionalShortString(120),
  neighborhood: optionalShortString(120),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  areaM2: z.number().int().min(0).max(100000).optional(),
  garageSpots: z.number().int().min(0).max(100).optional(),
  askingPriceCents: z.number().int().min(0).max(1_000_000_000).optional(),
  description: optionalShortString(4000),
  status: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

const imobPropertyUpdateSchema = imobPropertyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

const imobLeadCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  document: optionalShortString(60),
  email: z.union([z.string().trim().email().max(160), z.null()]).optional(),
  phone: optionalShortString(40),
  goal: optionalShortString(40),
  targetCity: optionalShortString(120),
  targetNeighborhood: optionalShortString(120),
  budgetMaxCents: z.number().int().min(0).max(1_000_000_000).optional(),
  stage: optionalShortString(80),
  temperature: optionalShortString(80),
  pendingItems: optionalStringArraySchema,
  metadata: z.unknown().optional(),
});

const imobLeadUpdateSchema = imobLeadCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

const imobCaseEventInputSchema = z.object({
  type: z.string().trim().min(1).max(120),
  actorType: z.string().trim().min(1).max(80),
  actorRef: optionalShortString(120),
  summary: z.string().trim().min(1).max(1000),
  evidenceRef: optionalShortString(160),
  payload: z.unknown().optional(),
  runId: optionalShortString(80),
});

const imobCaseCreateSchema = z.object({
  threadId: optionalShortString(120),
  flow: z.string().trim().min(1).max(120),
  stage: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(120),
  ownerResponsible: optionalShortString(80),
  nextStep: optionalShortString(1000),
  blockers: optionalStringArraySchema,
  pendingItems: optionalStringArraySchema,
  ownerId: optionalShortString(80),
  propertyId: optionalShortString(80),
  leadId: optionalShortString(80),
  externalDealId: optionalShortString(120),
  metadata: z.unknown().optional(),
  initialEvent: imobCaseEventInputSchema.optional(),
});

const imobAttachmentResolveSchema = z.object({
  caseId: optionalShortString(80),
  threadId: optionalShortString(120),
  documentIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
});

const imobAttachmentCrmSuggestionApplySchema = z.object({
  caseId: optionalShortString(80),
  threadId: optionalShortString(120),
  documentIds: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  mode: z.enum(["include", "edit", "discard"]),
});

const imobCaseUpdateSchema = z.object({
  threadId: optionalShortString(120),
  flow: optionalShortString(120),
  stage: optionalShortString(120),
  status: optionalShortString(120),
  ownerResponsible: optionalShortString(80),
  nextStep: optionalShortString(1000),
  blockers: optionalStringArraySchema,
  pendingItems: optionalStringArraySchema,
  ownerId: optionalShortString(80),
  propertyId: optionalShortString(80),
  leadId: optionalShortString(80),
  externalDealId: optionalShortString(120),
  metadata: z.unknown().optional(),
  eventSummary: optionalShortString(1000),
  eventType: optionalShortString(120),
  eventPayload: z.unknown().optional(),
  eventRunId: optionalShortString(80),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required",
});

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function digitsOnlyRoute(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
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
  return value
    .replace(/\b(no|na)\s+(imovel|imóvel|apartamento|apto|casa)\b.*$/i, "")
    .replace(/\b(com|por)\s+(oferta|proposta|valor)\b.*$/i, "")
    .replace(/\b(email|telefone|cpf|cnpj|documento|whatsapp)\b.*$/i, "")
    .trim();
}

function extractLeadNameFromMessage(message: string) {
  const normalized = normalizeImobRouteText(message);
  const patterns = [
    /(?:lead|cliente|comprador|locatario)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
    /(?:qualificar|atender|agendar visita para|gerar proposta para)\s+(?:lead\s+|cliente\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
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
  const explicitMatch = raw.match(new RegExp('(?:endereco|endereço)\s*:?\s*([^,.;\n]+(?:,[^.;\n]+)?)', 'i'));
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
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractPropertyTypeFromMessage(raw: string) {
  const match = raw.match(/(?:tipo do imovel|tipo do imóvel)\s*:?\s*([^,.;\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function extractPropertyGoalFromMessage(raw: string) {
  const match = raw.match(/(?:finalidade do imovel|finalidade do imóvel)\s*:?\s*([^,.;\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function extractPropertyCityFromMessage(raw: string) {
  const match = raw.match(/(?:cidade do imovel|cidade do imóvel)\s*:?\s*([^,.;\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

function extractOwnerExplicitNameFromMessage(raw: string) {
  const match = raw.match(new RegExp('(?:nome do (?:proprietario|proprietária|proprietaria|vendedor|locador))\\s*:?\\s*([^,.;\\n]+)', 'i'));
  return match?.[1] ? titleCaseRouteWords(match[1].trim()) : null;
}

function extractOwnerExplicitPhoneFromMessage(raw: string) {
  const match = raw.match(/(?:telefone do (?:proprietario|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const phoneMatch = match[1].match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  return phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : null;
}

function extractOwnerExplicitEmailFromMessage(raw: string) {
  const match = raw.match(/(?:e-mail do (?:proprietario|proprietária|proprietaria|vendedor|locador)|email do (?:proprietario|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\s,;]+)/i);
  return match?.[1] ? match[1].trim().toLowerCase() : null;
}

function extractOwnerExplicitDocumentFromMessage(raw: string) {
  const match = raw.match(/(?:(?:documento|cpf|cnpj) do (?:proprietario|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const candidate = match[1].match(/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b|\b\d{11}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}\b|\b\d{14}\b/);
  return candidate?.[0] ?? null;
}

function extractExplicitAddressFieldFromMessage(raw: string) {
  const match = raw.match(new RegExp('(?:endereco|endereço)\\s*:?\\s*([^,.;\\n]+(?:,[^.;\\n]+)?)', 'i'));
  return match?.[1]?.trim() ?? null;
}

function extractOwnerCrudIdFromMessage(raw: string) {
  const normalized = normalizeImobRouteText(raw);
  const match = normalized.match(/(?:atualizar|editar|alterar|confirmar exclusao do|confirmo exclusao do|confirmar exclusao de|confirmo exclusao de)\s+(?:proprietario|proprietaria|dono|vendedor|locador)\s+([a-z0-9]{20,})/i);
  return match?.[1] ?? null;
}

function extractPropertyCrudIdFromMessage(raw: string) {
  const normalized = normalizeImobRouteText(raw);
  const match = normalized.match(/(?:atualizar|editar|alterar|confirmar exclusao do|confirmo exclusao do|confirmar exclusao de|confirmo exclusao de)\s+(?:imovel|imovel|apartamento|apto|casa|studio|terreno|galpao|galpao|sala)\s+([a-z0-9]{20,})/i);
  return match?.[1] ?? null;
}

function isOwnerDeleteConfirmationMessage(raw: string) {
  const normalized = normalizeImobRouteText(raw);
  return /(confirmar exclusao d[oe]|confirmo exclusao d[oe])\s+(proprietario|proprietaria|dono|vendedor|locador)/.test(normalized);
}

function isPropertyDeleteConfirmationMessage(raw: string) {
  const normalized = normalizeImobRouteText(raw);
  return /(confirmar exclusao d[oe]|confirmo exclusao d[oe])\s+(imovel|apartamento|apto|casa|studio|terreno|galpao|sala)/.test(normalized);
}

async function recordImobCrmAuditEvent(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  subjectType: "owner" | "property";
  subjectId: string;
  action: "created" | "updated" | "deleted";
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await params.prisma.memoryEvent.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: IMOB_CHAT_AUDIT_AGENT_ID,
      runId: null,
      key: "crm.audit",
      content: params.summary,
      metadata: {
        domain: "imob",
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        action: params.action,
        userId: params.userId ?? null,
        before: params.before ?? null,
        after: params.after ?? null,
        ...params.metadata,
      },
    },
  });
}

function isSuspiciousOwnerDisplayName(value: string | null | undefined) {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = normalizeImobRouteText(trimmed);
  if (normalized === "null" || normalized === "undefined" || normalized === "none") return true;
  return /^cmn[a-z0-9]*$/i.test(trimmed);
}

function resolveOwnerDocumentForDisplay(owner: { document?: string | null; phone?: string | null; pendingItems?: unknown }) {
  const document = asString(owner.document);
  if (!document) return null;
  const sameAsPhone = digitsOnlyRoute(document) && digitsOnlyRoute(document) === digitsOnlyRoute(owner.phone);
  const stillPendingDocument = asStringList(owner.pendingItems).includes("ownerDocument") || asStringList(owner.pendingItems).includes("documento do proprietário");
  if (sameAsPhone && stillPendingDocument) return null;
  return document;
}

async function resolveOwnerDisplayName(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  owner: { id: string; name?: string | null };
}) {
  if (!isSuspiciousOwnerDisplayName(params.owner.name)) {
    return params.owner.name?.trim() ?? "Proprietário";
  }

  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: "crm.audit",
      agentId: IMOB_CHAT_AUDIT_AGENT_ID,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { metadata: true },
  });

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (!metadata || metadata.subjectType !== "owner" || metadata.subjectId !== params.owner.id) continue;
    const after = asObject(metadata.after);
    const before = asObject(metadata.before);
    const candidates = [after?.name, before?.name];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && !isSuspiciousOwnerDisplayName(candidate)) {
        return candidate.trim();
      }
    }
  }

  return isSuspiciousOwnerDisplayName(params.owner.name) ? "Proprietário" : (params.owner.name?.trim() || "Proprietário");
}

async function findOwnerIdByAuditName(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  name: string;
}) {
  const target = normalizeImobRouteText(params.name);
  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: "crm.audit",
      agentId: IMOB_CHAT_AUDIT_AGENT_ID,
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { metadata: true },
  });

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (!metadata || metadata.subjectType !== "owner") continue;
    const subjectId = typeof metadata.subjectId === "string" ? metadata.subjectId : null;
    if (!subjectId) continue;
    const after = asObject(metadata.after);
    const before = asObject(metadata.before);
    const candidates = [after?.name, before?.name];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && normalizeImobRouteText(candidate) === target) {
        return subjectId;
      }
    }
  }

  return null;
}

function buildOwnerUpdateForm(owner: any, displayName?: string | null) {
  const resolvedName = displayName?.trim() || owner.name || "";
  const resolvedDocument = resolveOwnerDocumentForDisplay(owner) ?? "";
  return {
    entity: "proprietario",
    action: "update",
    label: "Editar cadastro",
    description: "Atualize os dados abaixo.",
    subjectId: owner.id,
    fields: [
      { name: "ownerName", label: "Nome completo", type: "text", required: true, placeholder: "Ex.: João da Silva", value: resolvedName },
      { name: "ownerPhone", label: "Telefone", type: "tel", placeholder: "Ex.: (11) 99999-9999", value: owner.phone ?? "" },
      { name: "ownerEmail", label: "E-mail", type: "email", placeholder: "Ex.: joao@email.com", value: owner.email ?? "" },
      { name: "ownerDocument", label: "Documento", type: "text", placeholder: "Ex.: CPF ou CNPJ", value: resolvedDocument, allowAttachment: true, attachmentLabel: "Anexar documento" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  } as any;
}

function buildPropertyUpdateForm(property: any) {
  return {
    entity: "imovel",
    action: "update",
    label: "Editar imóvel",
    description: "Atualize os dados abaixo para editar o cadastro do imóvel.",
    subjectId: property.id,
    fields: [
      { name: "propertyType", label: "Tipo do imóvel", type: "text", required: true, placeholder: "Ex.: apartamento, casa, terreno", value: property.propertyType ?? "" },
      { name: "goal", label: "Finalidade do imóvel", type: "text", required: true, placeholder: "Ex.: venda ou locação", value: property.goal ?? "" },
      { name: "city", label: "Cidade do imóvel", type: "text", required: true, placeholder: "Ex.: Itapema", value: property.city ?? "" },
      { name: "address", label: "Endereço do imóvel", type: "text", required: true, placeholder: "Ex.: Rua 1000, 123", value: property.address ?? "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  } as any;
}

function formatPropertyLookupLabel(item: { id: string; metadata?: unknown; propertyType?: string | null; address?: string | null }) {
  const metadata = asObject(item.metadata);
  const externalRef = asString(metadata?.externalPropertyRef);
  if (externalRef) return `Imóvel ${externalRef}`;
  if (item.address) return item.address;
  if (item.propertyType) return `Imóvel ${item.propertyType}`;
  return `Imóvel ${item.id}`;
}
function detectOperationalHydrationFlow(message: string, threadLabel?: string | null, operationalFlow?: string | null) {
  if (operationalFlow === "proposal.create" || operationalFlow === "visit.schedule") return operationalFlow;
  const normalizedThread = normalizeImobRouteText(threadLabel ?? "");
  if (normalizedThread.includes("proposta")) return "proposal.create";
  if (normalizedThread.includes("visita")) return "visit.schedule";
  const normalizedMessage = normalizeImobRouteText(message);
  if (normalizedMessage.includes("proposta") || normalizedMessage.includes("oferta")) return "proposal.create";
  if (normalizedMessage.includes("visita") || normalizedMessage.includes("agendar") || normalizedMessage.includes("reuniao") || normalizedMessage.includes("reunião")) return "visit.schedule";
  return null;
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
  } as any;
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
  const currentOperational = asObject(params.threadState?.operational);
  const targetFlow = detectOperationalHydrationFlow(
    params.message,
    params.threadLabel,
    asString(currentOperational?.flow)
  );
  if (targetFlow !== "proposal.create" && targetFlow !== "visit.schedule") {
    return params.threadState;
  }

  let persistedLead: any | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { leadId: true },
    });
    if (scopedCase?.leadId) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: { id: scopedCase.leadId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      });
    }
  }

  if (!persistedLead) {
    const proposalDraft = asObject(currentOperational?.proposalDraft);
    const visitDraft = asObject(currentOperational?.visitDraft);
    const name =
      asString(targetFlow === "proposal.create" ? proposalDraft?.buyerName : visitDraft?.visitorName) ??
      extractLeadNameFromMessage(params.message);
    const email =
      asString(targetFlow === "proposal.create" ? proposalDraft?.buyerEmail : null) ??
      extractLeadEmailFromMessage(params.message);
    const phone =
      asString(targetFlow === "proposal.create" ? proposalDraft?.buyerPhone : visitDraft?.visitorPhone) ??
      extractLeadPhoneFromMessage(params.message);

    const conditions = [
      phone ? { phone } : null,
      email ? { email } : null,
      name ? { name } : null,
    ].filter(Boolean) as Array<Record<string, string>>;

    if (conditions.length > 0) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          OR: conditions,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!persistedLead && name) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          name,
        },
        orderBy: { updatedAt: "desc" },
      });
    }
  }

  if (!persistedLead) return params.threadState;

  const nextState = params.threadState
    ? JSON.parse(JSON.stringify(params.threadState))
    : createEmptyThreadState();
  const nextOperational = asObject(nextState.operational) ?? {};

  if (targetFlow === "proposal.create") {
    const proposalDraft = asObject(nextOperational.proposalDraft) ?? {};
    nextState.operational = {
      ...nextOperational,
      flow: "proposal.create",
      status: asString(nextOperational.status) === "ready_for_review" ? "ready_for_review" : "collecting",
      pendingFields: Array.isArray(nextOperational.pendingFields)
        ? nextOperational.pendingFields.filter((item) => typeof item === "string")
        : [],
      proposalDraft: {
        buyerName: asString(proposalDraft.buyerName) ?? persistedLead.name ?? null,
        buyerEmail: asString(proposalDraft.buyerEmail) ?? persistedLead.email ?? null,
        buyerPhone: asString(proposalDraft.buyerPhone) ?? persistedLead.phone ?? null,
        propertyId: asString(proposalDraft.propertyId),
        offerAmount: Number.isFinite(Number(proposalDraft.offerAmount)) ? Number(proposalDraft.offerAmount) : null,
        contractType:
          asString(proposalDraft.contractType) === "rent" ||
          asString(proposalDraft.contractType) === "sale" ||
          asString(proposalDraft.contractType) === "management"
            ? asString(proposalDraft.contractType)
            : null,
      },
    };
    return nextState;
  }

  const visitDraft = asObject(nextOperational.visitDraft) ?? {};
  nextState.operational = {
    ...nextOperational,
    flow: "visit.schedule",
    status: asString(nextOperational.status) === "ready_for_review" ? "ready_for_review" : "collecting",
    pendingFields: Array.isArray(nextOperational.pendingFields)
      ? nextOperational.pendingFields.filter((item) => typeof item === "string")
      : [],
    visitDraft: {
      propertyId: asString(visitDraft.propertyId),
      visitorName: asString(visitDraft.visitorName) ?? persistedLead.name ?? null,
      visitorPhone: asString(visitDraft.visitorPhone) ?? persistedLead.phone ?? null,
      preferredDate: asString(visitDraft.preferredDate),
      preferredWindow:
        asString(visitDraft.preferredWindow) === "manha" ||
        asString(visitDraft.preferredWindow) === "tarde" ||
        asString(visitDraft.preferredWindow) === "noite"
          ? asString(visitDraft.preferredWindow)
          : null,
    },
  };
  return nextState;
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
  };
  return labels[flow] ?? flow;
}

function formatImobPendingList(items: string[] | null | undefined) {
  if (!items || items.length === 0) return "sem pendências";
  return items.join(", ");
}


function buildOwnerPendingSuggestion(owner: { name: string; pendingItems?: unknown }) {
  const pendingItems = asStringList(owner.pendingItems);
  if (pendingItems.includes("ownerDocument") || pendingItems.includes("documento do proprietário")) {
    return `Envie assim: documento do proprietário ${owner.name} 12345678901
Ou envie o documento como anexo nesta conversa.`;
  }
  return null;
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

function extractListCityFilter(message: string) {
  const normalized = normalizeImobRouteText(message);
  const match = normalized.match(/\bem\s+([a-z]+(?:\s+[a-z]+){0,2})/);
  return match?.[1] ?? null;
}

function buildCaseContextFromRecord(item: any) {
  return {
    caseId: item.id,
    flow: item.flow,
    stage: item.stage,
    status: item.status,
    ownerResponsible: item.ownerResponsible ?? null,
    nextStep: item.nextStep ?? null,
    blocker: Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null,
    pendingItems: Array.isArray(item.pendingItems) ? item.pendingItems : [],
    threadId: item.threadId ?? null,
    updatedAt: item.updatedAt?.toISOString?.() ?? null,
  } as any;
}

function injectResponsibleLabelIntoText(text: string, responsibleLabel: string) {
  void responsibleLabel;
  if (text.trim().length === 0) return text;
  return text
    .split("\n")
    .filter((line) => line.trim().indexOf("Responsável agora:") !== 0)
    .join("\n")
    .trim();
}

function applyResponsibleLabelToResolvedTurn<T extends { presentation?: Record<string, any> | null }>(
  data: T,
  responsibleLabel: string
): T {
  if (!data.presentation) return data;
  const currentOwner = asString(data.presentation.owner);
  const nextOwner = !currentOwner || currentOwner === "Corretor" ? responsibleLabel : currentOwner;
  return {
    ...data,
    presentation: {
      ...data.presentation,
      owner: nextOwner,
      text: injectResponsibleLabelIntoText(String(data.presentation.text ?? ""), nextOwner),
    },
  };
}

function normalizeBatchOperationalLine(raw: string) {
  return raw.trim().replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "").trim();
}

function isBatchOperationalLine(raw: string) {
  const normalized = normalizeImobRouteText(normalizeBatchOperationalLine(raw));
  return (
    normalized.startsWith("captar proprietario") ||
    normalized.startsWith("cadastrar imovel") ||
    normalized.startsWith("cadastrar lead")
  );
}

function extractImobOperationalBatches(message: string) {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of message.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    if (/^\d+\./.test(trimmed) && !isBatchOperationalLine(trimmed)) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    if (!isBatchOperationalLine(trimmed)) continue;
    current.push(normalizeBatchOperationalLine(trimmed));
  }
  if (current.length > 0) groups.push(current);
  return groups.filter((group) => group.length > 0);
}

function firstOperationalLine(text: string | null | undefined) {
  return (text ?? "").split(/\n+/).map((item) => item.trim()).find(Boolean) ?? "";
}

function formatBatchLineSummary(resolved: any, fallbackLine: string) {
  const operational = asObject(resolved?.conversationState?.operational);
  const operationalFlow = asString(operational?.flow);
  const label = operationalFlow ? formatImobCaseFlowLabel(operationalFlow) : asString(resolved?.threadLabel) ?? fallbackLine;
  const pendingLabels = Array.isArray(asObject(resolved?.presentation)?.pendingFieldLabels)
    ? (asObject(resolved?.presentation)?.pendingFieldLabels as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : Array.isArray(operational?.pendingFields)
      ? (operational?.pendingFields as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  if (operationalFlow === "owner.create") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do proprietário ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Proprietário cadastrado com sucesso.`;
  }
  if (operationalFlow === "property.create") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do imóvel ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Imóvel cadastrado com sucesso.`;
  }
  if (operationalFlow === "lead.qualify") {
    return pendingLabels.length > 0
      ? `${label} | O cadastro do lead ainda precisa de complementos: ${pendingLabels.join(", ")}.`
      : `${label} | Lead cadastrado e qualificado com sucesso.`;
  }

  const summary = firstOperationalLine(asString(asObject(resolved?.presentation)?.text) ?? "Operação processada.");
  return `${label} | ${summary}`;
}


function buildResolvedPendingSuggestion(resolved: any) {
  const operational = asObject(resolved?.conversationState?.operational);
  const operationalFlow = asString(operational?.flow);
  const presentation = asObject(resolved?.presentation);
  const pendingFieldLabels = asStringList(presentation?.pendingFieldLabels);
  if (pendingFieldLabels.length === 0) return null;

  if (operationalFlow === "owner.create") {
    const ownerDraft = asObject(operational?.ownerDraft);
    return buildOwnerPendingSuggestion({
      name: asString(ownerDraft?.ownerName) ?? "proprietário",
      pendingItems: pendingFieldLabels,
    });
  }

  if (operationalFlow === "property.create") {
    const propertyDraft = asObject(operational?.propertyDraft);
    return buildPropertyPendingSuggestion({
      id: asString(propertyDraft?.propertyId) ?? undefined,
      address: asString(propertyDraft?.address),
      pendingItems: pendingFieldLabels,
    });
  }

  if (operationalFlow === "lead.qualify") {
    const leadDraft = asObject(operational?.leadDraft);
    return buildLeadPendingSuggestion({
      name: asString(leadDraft?.leadName) ?? "lead",
      pendingItems: pendingFieldLabels,
    });
  }

  return null;
}

function injectResolvedPendingSuggestion(resolved: any) {
  const suggestion = buildResolvedPendingSuggestion(resolved);
  if (!suggestion) return resolved;
  const presentation = asObject(resolved?.presentation);
  const currentText = asString(presentation?.text) ?? "";
  const currentSuggestedNextAction = asString(presentation?.suggestedNextAction);
  if (currentText.includes(suggestion) && currentSuggestedNextAction === suggestion) return resolved;

  return {
    ...resolved,
    presentation: {
      ...presentation,
      text: currentText.includes(suggestion) ? currentText : [currentText, suggestion].filter(Boolean).join("\n"),
      suggestedNextAction: suggestion,
    },
  };
}

async function resolveImobOperationalUpdate(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  message: string;
  caseId?: string | null;
  threadState: any;
}) {
  const normalized = normalizeImobRouteText(params.message);
  const ownerName = extractOwnerNameFromMessage(params.message);
  const ownerExplicitName = extractOwnerExplicitNameFromMessage(params.message);
  const ownerExplicitPhone = extractOwnerExplicitPhoneFromMessage(params.message);
  const ownerExplicitEmail = extractOwnerExplicitEmailFromMessage(params.message);
  const ownerExplicitDocument = extractOwnerExplicitDocumentFromMessage(params.message);
  const leadName = extractLeadNameFromMessage(params.message);
  const document = extractDocumentFromMessage(params.message);
  const address = extractAddressFromMessage(params.message);
  const explicitAddress = extractExplicitAddressFieldFromMessage(params.message);
  const propertyRef = extractPropertyRefFromMessage(params.message);
  const leadPhone = extractLeadPhoneFromMessage(params.message);
  const leadEmail = extractLeadEmailFromMessage(params.message);
  const budgetCents = extractAmountAfterKeywords(params.message, ["orcamento", "orçamento", "budget"]);
  const priceCents = extractAmountAfterKeywords(params.message, ["preco", "preço", "valor"]);
  const targetCity = extractFreeformCityAfterKeywords(params.message, ["cidade do lead", "cidade de interesse"]);

  const asksEdit = normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar");
  const asksDelete = normalized.includes("excluir") || normalized.includes("deletar") || normalized.includes("remover") || normalized.includes("apagar");
  const ownerCrudId = extractOwnerCrudIdFromMessage(params.message);
  const propertyCrudId = extractPropertyCrudIdFromMessage(params.message);
  const propertyType = extractPropertyTypeFromMessage(params.message);
  const propertyGoal = extractPropertyGoalFromMessage(params.message);
  const propertyCity = extractPropertyCityFromMessage(params.message);

  if (asksEdit && ownerCrudId) {
    const owner = await params.prisma.imobOwner.findFirst({
      where: { id: ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    });
    if (owner) {
      const patch: Record<string, unknown> = {};
      if (ownerExplicitName) patch.name = ownerExplicitName;
      if (ownerExplicitPhone) patch.phone = ownerExplicitPhone;
      if (ownerExplicitEmail) patch.email = ownerExplicitEmail;
      if (ownerExplicitDocument) {
        patch.document = ownerExplicitDocument;
        const nextPending = asStringList(owner.pendingItems).filter((item) => item !== "ownerDocument" && item !== "documento do proprietário");
        patch.pendingItems = nextPending;
        patch.status = nextPending.length > 0 ? "pending_data" : "ready_for_review";
      }
      if (Object.keys(patch).length > 0) {
        const updated = await params.prisma.imobOwner.update({ where: { id: owner.id }, data: patch });
        const updatedProfile = await params.prisma.imobOwner.findFirst({
          where: { id: owner.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: { _count: { select: { properties: true, cases: true } } },
        });
        const updatedDisplayName = ownerExplicitName || (await resolveOwnerDisplayName({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          owner: updatedProfile ?? updated,
        }));
        await recordImobCrmAuditEvent({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          userId: params.userId ?? null,
          subjectType: "owner",
          subjectId: owner.id,
          action: "updated",
          summary: `Owner ${updatedDisplayName} updated from chat`,
          before: owner,
          after: updatedProfile ?? updated,
          metadata: { source: "imob-chat" },
        });
        const ownerForCard = updatedProfile ?? updated;
        return {
          mode: "consult",
          action: "crm.owner.update",
          threadLabel: "Proprietário",
          conversationState: params.threadState ?? createEmptyThreadState(),
          presentation: {
            text: "Cadastro atualizado. Como podemos seguir?",
            pendingFieldLabels: asStringList(ownerForCard.pendingItems).map((item) => item === "ownerDocument" ? "documento do proprietário" : item),
            dedupeKey: `crm.owner.update:${updated.id}:profile`,
            card: {
              title: `Proprietário ${updatedDisplayName}`,
              lines: [
                ownerForCard.phone ? `Telefone: ${ownerForCard.phone}` : null,
                ownerForCard.email ? `E-mail: ${ownerForCard.email}` : null,
                resolveOwnerDocumentForDisplay(ownerForCard) ? `Documento: ${resolveOwnerDocumentForDisplay(ownerForCard)}` : null,
                `Status: ${formatImobStatusLabel(ownerForCard.status)}`,
                `Pendências: ${formatImobPendingList(asStringList(ownerForCard.pendingItems).map((item) => item === "ownerDocument" ? "documento do proprietário" : item))}`,
                `Imóveis: ${ownerForCard._count?.properties ?? 0}`,
                `Casos: ${ownerForCard._count?.cases ?? 0}`,
              ].filter(Boolean) as string[],
              ctas: [
                { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${updatedDisplayName}` },
                { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${updatedDisplayName}` },
                { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
              ],
              actionsLayout: "inline",
            },
          },
        } as any;
      }
    }
  }

  if (asksEdit && propertyCrudId) {
    const property = await params.prisma.imobProperty.findFirst({
      where: { id: propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (property) {
      const patch: Record<string, unknown> = {};
      if (propertyType) patch.propertyType = propertyType;
      if (propertyGoal) patch.goal = propertyGoal;
      if (propertyCity) patch.city = propertyCity;
      if (explicitAddress) patch.address = explicitAddress;
      if (Object.keys(patch).length > 0) {
        const updated = await params.prisma.imobProperty.update({
          where: { id: property.id },
          data: patch,
          include: { owner: { select: { id: true, name: true } } },
        });
        const updatedProfile = await params.prisma.imobProperty.findFirst({
          where: { id: property.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
        await recordImobCrmAuditEvent({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          userId: params.userId ?? null,
          subjectType: "property",
          subjectId: property.id,
          action: "updated",
          summary: `Property ${formatPropertyLookupLabel(updatedProfile ?? updated)} updated from chat`,
          before: property,
          after: updatedProfile ?? updated,
          metadata: { source: "imob-chat" },
        });
        const propertyForCard = updatedProfile ?? updated;
        return {
          mode: "consult",
          action: "crm.property.update",
          threadLabel: "Imóvel",
          conversationState: params.threadState ?? createEmptyThreadState(),
          presentation: {
            text: "Cadastro atualizado. Como podemos seguir?",
            pendingFieldLabels: Array.isArray(propertyForCard.pendingItems) ? propertyForCard.pendingItems : [],
            dedupeKey: `crm.property.update:${updated.id}:profile`,
            card: {
              title: formatPropertyLookupLabel(propertyForCard),
              lines: [
                propertyForCard.propertyType ? `Tipo: ${propertyForCard.propertyType}` : null,
                propertyForCard.goal ? `Finalidade: ${propertyForCard.goal}` : null,
                propertyForCard.city ? `Cidade: ${propertyForCard.city}` : null,
                propertyForCard.neighborhood ? `Bairro: ${propertyForCard.neighborhood}` : null,
                propertyForCard.address ? `Endereço: ${propertyForCard.address}` : null,
                propertyForCard.owner?.name ? `Proprietário: ${propertyForCard.owner.name}` : null,
                typeof propertyForCard.askingPriceCents === "number" ? `Valor: ${formatBudgetCentsForImob(propertyForCard.askingPriceCents)}` : null,
                `Status: ${formatImobStatusLabel(propertyForCard.status)}`,
                `Pendências: ${formatImobPendingList(Array.isArray(propertyForCard.pendingItems) ? propertyForCard.pendingItems : propertyForCard.pendingItems)}`,
                `Casos: ${propertyForCard._count?.cases ?? 0}`,
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
    }
  }

  if (asksDelete && isOwnerDeleteConfirmationMessage(params.message) && ownerCrudId) {
    const owner = await params.prisma.imobOwner.findFirst({
      where: { id: ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    });
    if (owner) {
      const activePropertiesCount = await params.prisma.imobProperty.count({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id, status: { not: "archived" } },
      });
      const activeCasesCount = await params.prisma.imobCase.count({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id },
      });
      if (activePropertiesCount > 0 || activeCasesCount > 0) {
        return {
          mode: "consult",
          action: "crm.owner.delete",
          threadLabel: "Proprietário",
          conversationState: params.threadState ?? createEmptyThreadState(),
          presentation: {
            text: `Não posso excluir o proprietário ${owner.name} porque ainda existem imóveis ou casos ativos vinculados a esse cadastro.`,
            blocker: "Excluir ou desvincular os registros ativos antes de arquivar o proprietário.",
            dedupeKey: `crm.owner.delete.blocked:${owner.id}`,
          },
        } as any;
      }
      const metadata = asObject(owner.metadata) ?? {};
      const archived = await params.prisma.imobOwner.update({
        where: { id: owner.id },
        data: { status: "archived", metadata: { ...metadata, archivedAt: new Date().toISOString(), archivedByUserId: null, source: "imob-chat" } as any },
      });
      await recordImobCrmAuditEvent({
        prisma: params.prisma,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        subjectType: "owner",
        subjectId: owner.id,
        action: "deleted",
        summary: `Owner ${owner.name} archived from chat`,
        before: owner,
        after: archived,
        metadata: { source: "imob-chat" },
      });
      return {
        mode: "consult",
        action: "crm.owner.delete",
        threadLabel: "Proprietário",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: `Cadastro do proprietário ${owner.name} arquivado com sucesso.`,
          nextStep: "O cadastro não aparecerá mais nas consultas operacionais padrão.",
          dedupeKey: `crm.owner.delete:${owner.id}`,
        },
      } as any;
    }
  }

  if (asksDelete && isPropertyDeleteConfirmationMessage(params.message) && propertyCrudId) {
    const property = await params.prisma.imobProperty.findFirst({
      where: { id: propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (property) {
      const activeCasesCount = await params.prisma.imobCase.count({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, propertyId: property.id },
      });
      if (activeCasesCount > 0) {
        return {
          mode: "consult",
          action: "crm.property.delete",
          threadLabel: "Imóvel",
          conversationState: params.threadState ?? createEmptyThreadState(),
          presentation: {
            text: `Não posso excluir o imóvel ${formatPropertyLookupLabel(property)} porque ainda existem casos ativos vinculados a esse cadastro.`,
            blocker: "Excluir ou encerrar os casos ativos antes de arquivar o imóvel.",
            dedupeKey: `crm.property.delete.blocked:${property.id}`,
          },
        } as any;
      }
      const metadata = asObject(property.metadata) ?? {};
      const archived = await params.prisma.imobProperty.update({
        where: { id: property.id },
        data: { status: "archived", metadata: { ...metadata, archivedAt: new Date().toISOString(), archivedByUserId: null, source: "imob-chat" } as any },
        include: { owner: { select: { id: true, name: true } } },
      });
      await recordImobCrmAuditEvent({
        prisma: params.prisma,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        subjectType: "property",
        subjectId: property.id,
        action: "deleted",
        summary: `Property ${formatPropertyLookupLabel(property)} archived from chat`,
        before: property,
        after: archived,
        metadata: { source: "imob-chat" },
      });
      return {
        mode: "consult",
        action: "crm.property.delete",
        threadLabel: "Imóvel",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: `Cadastro do imóvel ${formatPropertyLookupLabel(property)} arquivado com sucesso.`,
          nextStep: "O cadastro não aparecerá mais nas consultas operacionais padrão.",
          dedupeKey: `crm.property.delete:${property.id}`,
        },
      } as any;
    }
  }

  const wantsOwnerDocument = normalized.includes("documento do proprietario") || normalized.includes("documento do proprietário") || normalized.includes("cpf do proprietario") || normalized.includes("cpf do proprietário");
  if (wantsOwnerDocument && document) {
    let owner = null as any;
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
      const status = currentPending.length > 0 ? "pending_data" : "ready_for_review";
      const updated = await params.prisma.imobOwner.update({
        where: { id: owner.id },
        data: { document, pendingItems: currentPending, status },
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
          ].join("\n"),
          owner: "Corretor" as any,
          nextStep: currentPending.length > 0 ? "Completar as pendências restantes do proprietário." : "Vincular o proprietário ao próximo imóvel ou etapa documental.",
          pendingFieldLabels: currentPending.map((item) => item === "ownerDocument" ? "documento do proprietário" : item),
          dedupeKey: `crm.owner.update:${updated.id}:document`,
        },
      } as any;
    }
  }

  const wantsLeadUpdate = normalized.includes("lead") || normalized.includes("cliente") || normalized.includes("comprador") || normalized.includes("locatario") || normalized.includes("locatário");
  if (wantsLeadUpdate && (targetCity || budgetCents || leadPhone || leadEmail)) {
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
      const conditions = [leadPhone ? { phone: leadPhone } : null, leadEmail ? { email: leadEmail } : null, leadName ? { name: leadName } : null].filter(Boolean) as Array<Record<string, string>>;
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
        .filter((item) => !(item === "leadPhone" && leadPhone));
      const updated = await params.prisma.imobLead.update({
        where: { id: lead.id },
        data: {
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
          ].join("\n"),
          owner: "Corretor" as any,
          nextStep: nextPending.length > 0 ? "Completar as pendências restantes do lead." : "Vincular o lead ao próximo imóvel ou etapa comercial.",
          pendingFieldLabels: nextPending,
          dedupeKey: `crm.lead.update:${updated.id}`,
        },
      } as any;
    }
  }

  const wantsPropertyUpdate = normalized.includes("imovel") || normalized.includes("imóvel") || normalized.includes("apartamento") || normalized.includes("casa") || normalized.includes("sala") || normalized.includes("terreno");
  const wantsPriceUpdate = normalized.includes("preco") || normalized.includes("preço") || normalized.includes("valor");
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
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, address: { contains: address } },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (property) {
      const nextPending = asStringList(property.pendingItems).filter((item) => item !== "askingPrice" && item !== "preço do imóvel" && item !== "valor do imóvel" && item !== "propertyPrice");
      const updated = await params.prisma.imobProperty.update({
        where: { id: property.id },
        data: {
          askingPriceCents: priceCents,
          pendingItems: nextPending,
          status: nextPending.length > 0 ? "pending_data" : "ready_for_review",
        },
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
          ].join("\n"),
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

async function resolveImobOperationalConsult(params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  message: string;
  caseId?: string | null;
  threadState: any;
}) {
  const normalized = normalizeImobRouteText(params.message);
  const ownerNameHint = extractOwnerNameFromMessage(params.message);
  const propertyRefHint = extractPropertyRefFromMessage(params.message);
  const addressHint = extractAddressFromMessage(params.message);
  const wantsLead = normalized.includes("lead");
  const wantsCase = normalized.includes("caso");
  const wantsOwner = normalized.includes("proprietario") || normalized.includes("proprietária") || normalized.includes("proprietaria") || normalized.includes("proprietarios") || normalized.includes("proprietários") || normalized.includes("dono") || normalized.includes("owner") || Boolean(ownerNameHint);
  const wantsProperty = normalized.includes("imovel") || normalized.includes("imóvel") || normalized.includes("imoveis") || normalized.includes("imóveis") || normalized.includes("apartamento") || normalized.includes("apto") || normalized.includes("casa") || normalized.includes("studio") || normalized.includes("terreno") || normalized.includes("galpao") || normalized.includes("galpão") || normalized.includes("sala") || Boolean(propertyRefHint) || Boolean(addressHint);
  const asksLeadCases = normalized.includes("casos do lead") || normalized.includes("quais casos do lead");
  const asksCurrentCase = normalized.includes("nesse caso") || normalized.includes("deste caso");
  const asksMissing = normalized.includes("o que falta") || normalized.includes("pendencia") || normalized.includes("pendência");
  const asksShow = normalized.includes("mostrar") || normalized.includes("ver") || normalized.includes("consultar") || normalized.includes("quais") || normalized.includes("abrir");
  const asksLeadList = wantsLead && (normalized.includes("listar leads") || normalized.includes("quais leads estao cadastrados") || normalized.includes("quais leads estão cadastrados") || normalized.includes("leads cadastrados"));
  const asksOwnerList = wantsOwner && (normalized.includes("listar proprietarios") || normalized.includes("listar proprietários") || normalized.includes("quais proprietarios estao cadastrados") || normalized.includes("quais proprietários estão cadastrados") || normalized.includes("proprietarios cadastrados") || normalized.includes("proprietários cadastrados"));
  const asksPropertyList = wantsProperty && (normalized.includes("listar imoveis") || normalized.includes("listar imóveis") || normalized.includes("quais imoveis estao cadastrados") || normalized.includes("quais imóveis estão cadastrados") || normalized.includes("imoveis cadastrados") || normalized.includes("imóveis cadastrados"));
  const asksPendingOnly = normalized.includes("com pendencias") || normalized.includes("com pendências");
  const asksQualifiedOnly = normalized.includes("qualificados") || normalized.includes("qualificado");
  const asksReadyForReview = normalized.includes("prontos para revisao") || normalized.includes("prontos para revisão") || normalized.includes("pronto para revisao") || normalized.includes("pronto para revisão");
  const asksEdit = normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar");
  const asksDelete = normalized.includes("excluir") || normalized.includes("deletar") || normalized.includes("remover") || normalized.includes("apagar");
  const ownerCrudId = extractOwnerCrudIdFromMessage(params.message);
  const propertyCrudId = extractPropertyCrudIdFromMessage(params.message);
  const asksGoalRent = normalized.includes("locacao") || normalized.includes("locação");
  const asksGoalSale = normalized.includes("venda") || normalized.includes("compra");
  const listCityFilter = extractListCityFilter(params.message);

  if (!(wantsLead || wantsCase || wantsOwner || wantsProperty) || !(asksLeadCases || asksCurrentCase || asksMissing || asksShow || asksEdit || asksDelete || asksLeadList || asksOwnerList || asksPropertyList)) {
    return null;
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
      .filter((item) => {
        if (asksGoalRent) return item.goal === "locacao";
        if (asksGoalSale) return item.goal === "venda" || item.goal === "compra";
        return true;
      })
      .slice(0, 8);
    const listTitle = asksPendingOnly
      ? "Leads com pendências"
      : asksQualifiedOnly
        ? "Leads qualificados"
        : asksGoalRent
          ? "Leads de locação"
          : asksGoalSale
            ? "Leads de compra e venda"
            : "Leads cadastrados";
    return {
      mode: "consult",
      action: "crm.lead.list",
      threadLabel: "Lead",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          leads.length > 0
            ? `Encontrei ${leads.length} lead(s) no CRM operacional do IMOB.`
            : asksPendingOnly
              ? "Não encontrei leads com pendências no CRM operacional do IMOB."
              : asksQualifiedOnly
                ? "Não encontrei leads qualificados no CRM operacional do IMOB."
                : asksGoalRent
                  ? "Não encontrei leads de locação no CRM operacional do IMOB."
                  : asksGoalSale
                    ? "Não encontrei leads de compra e venda no CRM operacional do IMOB."
                    : "Não encontrei leads cadastrados no CRM operacional do IMOB.",
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
                const pendingItems = Array.isArray(item.pendingItems)
                  ? item.pendingItems.filter((pending) => !(pending === "faixa de orçamento" && item.budgetMaxCents !== null && item.budgetMaxCents !== undefined))
                  : item.pendingItems;
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
    const owners = allOwners
      .filter((item) => !asksPendingOnly || (Array.isArray(item.pendingItems) && item.pendingItems.length > 0))
      .slice(0, 8);
    return {
      mode: "consult",
      action: "crm.owner.list",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          owners.length > 0
            ? `Encontrei ${owners.length} proprietário(s) no CRM operacional do IMOB.`
            : asksPendingOnly
              ? "Não encontrei proprietários com pendências no CRM operacional do IMOB."
              : "Não encontrei proprietários cadastrados no CRM operacional do IMOB.",
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
      .filter((item) => !listCityFilter || normalizeImobRouteText(item.city ?? "") == listCityFilter)
      .slice(0, 8);
    return {
      mode: "consult",
      action: "crm.property.list",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: [
          properties.length > 0
            ? `Encontrei ${properties.length} imóvel(is) no CRM operacional do IMOB.`
            : asksReadyForReview
              ? "Não encontrei imóveis prontos para revisão no CRM operacional do IMOB."
              : listCityFilter
                ? `Não encontrei imóveis cadastrados em ${titleCaseRouteWords(listCityFilter)} no CRM operacional do IMOB.`
                : "Não encontrei imóveis cadastrados no CRM operacional do IMOB.",
          properties.length > 0 ? `Resumo atual: ${properties.map((item) => `${formatPropertyLookupLabel(item)} (${formatImobStatusLabel(item.status)})`).join(" | ")}.` : null,
          properties.length > 0 ? "Próximo passo: abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : null,
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as any,
        nextStep: properties.length > 0 ? "Abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : "Cadastrar o primeiro imóvel para iniciar a operação comercial.",
        dedupeKey: asksReadyForReview ? "crm.property.list:review" : listCityFilter ? `crm.property.list:${listCityFilter}` : "crm.property.list",
        card: {
          title: asksReadyForReview ? "Imóveis prontos para revisão" : listCityFilter ? `Imóveis em ${titleCaseRouteWords(listCityFilter)}` : "Imóveis cadastrados",
          lines: properties.length > 0
            ? properties.map((item) => `${formatPropertyLookupLabel(item)} | ${item.goal ?? "sem finalidade"} | ${item.city ?? "sem cidade"} | ${formatImobStatusLabel(item.status)} | Proprietário: ${item.owner?.name ?? "não vinculado"}`)
            : [asksReadyForReview ? "Nenhum imóvel pronto para revisão no momento." : listCityFilter ? `Nenhum imóvel cadastrado em ${titleCaseRouteWords(listCityFilter)}.` : "Nenhum imóvel cadastrado até o momento."],
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
      const conditions = [document ? { document } : null, phone ? { phone } : null, email ? { email } : null, name ? { name } : null].filter(Boolean) as Array<Record<string, string>>;
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
          text: asksDelete ? "Não encontrei esse proprietário para confirmar a exclusão." : "Não encontrei esse proprietário para editar o cadastro.",
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
          text: `Confirme a exclusão do proprietário ${owner.name} para arquivar esse cadastro.`,
          dedupeKey: `crm.owner.delete.confirm:${owner.id}`,
          card: {
            title: `Excluir proprietário ${owner.name}`,
            lines: ["Essa ação arquiva o cadastro e remove o proprietário das consultas operacionais padrão."],
            ctas: [
              { id: `owner-delete-confirm-${owner.id}`, label: "Confirmar exclusão", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar exclusão do proprietário ${owner.id}` },
            ],
          },
        },
      } as any;
    }

    const ownerDisplayName = await resolveOwnerDisplayName({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      owner,
    });
    return {
      mode: "consult",
      action: "crm.owner.update",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? createEmptyThreadState(),
      presentation: {
        text: "",
        form: buildOwnerUpdateForm(owner, ownerDisplayName),
        dedupeKey: `crm.owner.update.form:${owner.id}`,
        card: {
          title: `Proprietário ${ownerDisplayName}`,
          lines: [],
          ctas: [
            { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${ownerDisplayName}` },
            { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${ownerDisplayName}` },
            { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
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
      const conditions = [
        document ? { document } : null,
        phone ? { phone } : null,
        email ? { email } : null,
        name ? { name } : null,
      ].filter(Boolean) as Array<Record<string, string>>;
      if (conditions.length > 0) {
        owner = await params.prisma.imobOwner.findFirst({
          where: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            status: { not: "archived" },
            OR: conditions,
          },
          orderBy: { updatedAt: "desc" },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
      if (!owner && name) {
        const ownerIdFromAudit = await findOwnerIdByAuditName({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          name,
        });
        if (ownerIdFromAudit) {
          owner = await params.prisma.imobOwner.findFirst({
            where: {
              id: ownerIdFromAudit,
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
              status: { not: "archived" },
            },
            include: { _count: { select: { properties: true, cases: true } } },
          });
        }
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
    const ownerDisplayName = await resolveOwnerDisplayName({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      owner,
    });
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
        pendingFieldLabels: Array.isArray(owner.pendingItems) ? owner.pendingItems.map((item) => item === "ownerDocument" ? "documento do proprietário" : item) : [],
        dedupeKey: `crm.owner.lookup:${owner.id}`,
        card: {
          title: `Proprietário ${ownerDisplayName}`,
          lines: [
            owner.phone ? `Telefone: ${owner.phone}` : null,
            owner.email ? `E-mail: ${owner.email}` : null,
            resolveOwnerDocumentForDisplay(owner) ? `Documento: ${resolveOwnerDocumentForDisplay(owner)}` : null,
            `Status: ${formatImobStatusLabel(owner.status)}`,
            `Pendências: ${formatImobPendingList(Array.isArray(owner.pendingItems) ? owner.pendingItems.map((item) => item === "ownerDocument" ? "documento do proprietário" : item) : owner.pendingItems)}`,
            `Imóveis: ${owner._count?.properties ?? 0}`,
            `Casos: ${owner._count?.cases ?? 0}`,
          ].filter(Boolean) as string[],
          ctas: [
            { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${ownerDisplayName}` },
            { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${ownerDisplayName}` },
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
      const propertyRef = extractPropertyRefFromMessage(params.message);
      const address = extractAddressFromMessage(params.message);
      if (propertyRef) {
        const recentProperties = await params.prisma.imobProperty.findMany({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          orderBy: { updatedAt: "desc" },
          take: 200,
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
        property = recentProperties.find((item) => {
          const metadata = asObject(item.metadata);
          const externalRef = asString(metadata?.externalPropertyRef);
          return item.id === propertyRef || externalRef === propertyRef;
        }) ?? null;
      }
      if (!property && address) {
        property = await params.prisma.imobProperty.findFirst({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, address: { contains: address } },
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
          text: asksDelete ? "Não encontrei esse imóvel para confirmar a exclusão." : "Não encontrei esse imóvel para editar o cadastro.",
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
          text: `Confirme a exclusão do imóvel ${formatPropertyLookupLabel(property)} para arquivar esse cadastro.`,
          dedupeKey: `crm.property.delete.confirm:${property.id}`,
          card: {
            title: `Excluir imóvel ${formatPropertyLookupLabel(property)}`,
            lines: ["Essa ação arquiva o cadastro e remove o imóvel das consultas operacionais padrão."],
            ctas: [
              { id: `property-delete-confirm-${property.id}`, label: "Confirmar exclusão", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar exclusão do imóvel ${property.id}` },
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
      const propertyRef = extractPropertyRefFromMessage(params.message);
      const address = extractAddressFromMessage(params.message);
      if (propertyRef) {
        const recentProperties = await params.prisma.imobProperty.findMany({
          where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
          orderBy: { updatedAt: "desc" },
          take: 200,
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
        property = recentProperties.find((item) => {
          const metadata = asObject(item.metadata);
          const externalRef = asString(metadata?.externalPropertyRef);
          return item.id === propertyRef || externalRef === propertyRef;
        }) ?? null;
      }
      if (!property && address) {
        property = await params.prisma.imobProperty.findFirst({
          where: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            status: { not: "archived" },
            address: { contains: address },
          },
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
      select: {
        id: true,
        flow: true,
        stage: true,
        status: true,
        nextStep: true,
        pendingItems: true,
        ownerResponsible: true,
        blockers: true,
        threadId: true,
        updatedAt: true,
      },
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
          `Pendências atuais: ${formatImobPendingList(Array.isArray(property.pendingItems) ? property.pendingItems : property.pendingItems)}.`,
          buildPropertyPendingSuggestion({ id: property.id, address: property.address, pendingItems: Array.isArray(property.pendingItems) ? property.pendingItems : property.pendingItems }),
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
            `Pendências: ${formatImobPendingList(Array.isArray(property.pendingItems) ? property.pendingItems : property.pendingItems)}`,
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

  if (!asksLeadCases && wantsCase && (asksCurrentCase || asksMissing || asksShow)) {
    const item = params.caseId
      ? await params.prisma.imobCase.findFirst({
          where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: {
            owner: { select: { id: true, name: true } },
            property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
            lead: { select: { id: true, name: true, phone: true, email: true } },
            _count: { select: { events: true } },
          },
        })
      : null;

    if (!item) {
      return {
        mode: "consult",
        action: "crm.case.lookup",
        threadLabel: "Caso",
        conversationState: params.threadState ?? createEmptyThreadState(),
        presentation: {
          text: "Não encontrei um caso operacional vinculado a esta conversa.",
          suggestedNextAction: "Abra ou retome um caso antes de consultar pendências deste caso.",
          card: {
            title: "Caso não encontrado",
            lines: ["Vincule esta conversa a um caso IMOB para consultar pendências e próximos passos."],
          },
        },
      } as any;
    }

    const blocker = Array.isArray(item.blockers) && item.blockers.length > 0 ? item.blockers[0] : null;
    return {
      mode: "consult",
      action: "crm.case.lookup",
      threadLabel: formatImobCaseFlowLabel(item.flow),
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: buildCaseContextFromRecord(item),
      presentation: {
        text: [
          `Caso ${formatImobCaseFlowLabel(item.flow)} localizado.`,
          `Pendências atuais: ${formatImobPendingList(item.pendingItems)}.`,
          item.nextStep ? `Próximo passo: ${item.nextStep}` : null,
          blocker ? `Bloqueio atual: ${blocker}` : null,
        ].filter(Boolean).join("\n"),
        owner: item.ownerResponsible ?? undefined,
        nextStep: item.nextStep ?? undefined,
        blocker,
        pendingFieldLabels: Array.isArray(item.pendingItems) ? item.pendingItems : [],
        dedupeKey: `crm.case.lookup:${item.id}`,
        card: {
          title: `Caso ${formatImobCaseFlowLabel(item.flow)}`,
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
      const conditions = [phone ? { phone } : null, email ? { email } : null, name ? { name } : null].filter(Boolean) as Array<Record<string, string>>;
      if (conditions.length > 0) {
        lead = await params.prisma.imobLead.findFirst({
          where: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            OR: conditions,
          },
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
      select: {
        id: true,
        flow: true,
        stage: true,
        status: true,
        nextStep: true,
        pendingItems: true,
        ownerResponsible: true,
        updatedAt: true,
      },
    });
    const latestCase = leadCases[0] ?? null;
    if (asksLeadCases) {
      return {
        mode: "consult",
        action: "crm.lead.lookup",
        threadLabel: "Lead",
        conversationState: params.threadState ?? createEmptyThreadState(),
        caseContext: latestCase ? buildCaseContextFromRecord(latestCase) : undefined,
        presentation: {
          text: [
            `Lead ${lead.name} possui ${leadCases.length} caso(s) no CRM operacional.`,
            leadCases.length > 0 ? `Casos atuais: ${leadCases.map((item) => `${formatImobCaseFlowLabel(item.flow)} (${formatImobStatusLabel(item.status)})`).join(" | ")}.` : "Casos atuais: nenhum caso vinculado.",
            latestCase?.nextStep ? `Próximo passo mais recente: ${latestCase.nextStep}` : null,
          ].filter(Boolean).join("\n"),
          owner: (latestCase?.ownerResponsible ?? "Corretor") as any,
          nextStep: latestCase?.nextStep ?? "Vincular o lead ao próximo imóvel ou etapa comercial.",
          pendingFieldLabels: Array.isArray(lead.pendingItems)
            ? lead.pendingItems.filter((item) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined))
            : [],
          dedupeKey: `crm.lead.lookup:${lead.id}:cases`,
          card: {
            title: `Casos do lead ${lead.name}`,
            lines: leadCases.length > 0
              ? leadCases.map((item) => `${formatImobCaseFlowLabel(item.flow)} | ${formatImobStatusLabel(item.status)} | ${item.nextStep ?? "Sem próximo passo definido"}`)
              : ["Nenhum caso vinculado a este lead."],
          },
        },
      } as any;
    }

    return {
      mode: "consult",
      action: "crm.lead.lookup",
      threadLabel: "Lead",
      conversationState: params.threadState ?? createEmptyThreadState(),
      caseContext: latestCase ? buildCaseContextFromRecord(latestCase) : undefined,
      presentation: {
        text: [
          `Lead ${lead.name} localizado no CRM operacional.`,
          `Pendências atuais: ${formatImobPendingList(Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems)}.`,
          buildLeadPendingSuggestion({ name: lead.name, pendingItems: Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems }),
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
            `Pendências: ${formatImobPendingList(Array.isArray(lead.pendingItems) ? lead.pendingItems.filter((item) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined)) : lead.pendingItems)}`,
            leadCases.length > 0 ? `Casos: ${leadCases.length}` : "Casos: nenhum caso vinculado",
          ].filter(Boolean) as string[],
        },
      },
    } as any;
  }

  return null;
}

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

function getThreadStatusFromMetadata(metadata: unknown): "active" | "done" | "blocked" | null {
  const obj = asObject(metadata);
  const status = asString(obj?.threadStatus);
  if (status === "active" || status === "done" || status === "blocked") return status;
  return null;
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
}) {
  const conversationCreated = await findConversationCreatedEvent({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
  });

  const persistedAuditRunId = await validateScopedRunId({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: asString(conversationCreated?.metadata?.auditRunId),
  });
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
    const request = asObject(run.request);
    const metadata = asObject(request?.metadata);
    return getConversationIdFromMetadata(metadata) === params.conversationId;
  });

  const auditRun =
    matchedRun ??
    (await createRunRecord({
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
    }));

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
  threadStatus: "active" | "done" | "blocked" | null;
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

function mapOperationalCaseStatus(operationalStatus: string) {
  if (operationalStatus === "ready_for_review") return "ready_for_review";
  return "pending_data";
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
  const operational = params.resolved.conversationState.operational;
  if (!operational || params.resolved.mode !== "execute") return null;

  const nowIso = new Date().toISOString();
  const pendingItems = params.resolved.presentation.pendingFieldLabels ?? operational.pendingFields;
  const blockers = params.resolved.presentation.blocker ? [params.resolved.presentation.blocker] : [];

  const ownerDraft = operational.ownerDraft;
  const propertyDraft = operational.propertyDraft;
  const leadDraft = operational.leadDraft;
  const proposalDraft = operational.proposalDraft;
  const visitDraft = operational.visitDraft;
  const contractDraft = operational.contractDraft;
  const commissionDraft = operational.commissionDraft;

  const scopedCase = params.caseId
    ? await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { id: true, leadId: true, ownerId: true, propertyId: true },
      })
    : null;

  let persistedLeadId: string | null = scopedCase?.leadId ?? null;
  let persistedOwnerId: string | null = scopedCase?.ownerId ?? null;
  let persistedPropertyId: string | null = scopedCase?.propertyId ?? null;
  const upsertLeadDraft = async (draft: {
    leadName: string | null;
    leadEmail?: string | null;
    leadPhone?: string | null;
    desiredGoal?: "locacao" | "venda" | null;
    desiredCity?: string | null;
    budgetMax?: number | null;
  } | null | undefined, mode: "upsert" | "lookup_only") => {
    if (!draft) return null;
    const leadWhere = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      OR: [
        draft.leadPhone ? { phone: draft.leadPhone } : null,
        draft.leadEmail ? { email: draft.leadEmail } : null,
        draft.leadName ? { name: draft.leadName } : null,
      ].filter(Boolean),
    } as any;
    if (leadWhere.OR.length === 0) return null;

    const existingLead = await params.prisma.imobLead.findFirst({
      where: leadWhere,
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (mode === "lookup_only") return existingLead?.id ?? null;

    const leadData = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      name: draft.leadName ?? "Lead sem nome",
      email: draft.leadEmail ?? null,
      phone: draft.leadPhone ?? null,
      goal: draft.desiredGoal ?? null,
      targetCity: draft.desiredCity ?? null,
      budgetMaxCents: draft.budgetMax !== null && draft.budgetMax !== undefined ? Math.round(draft.budgetMax * 100) : null,
      stage: operational.status === "ready_for_review" ? "qualified" : "new",
      temperature: operational.status === "ready_for_review" ? "warm" : "cold",
      pendingItems: pendingItems.filter((item) => !(item === "faixa de orçamento" && draft.budgetMax !== null && draft.budgetMax !== undefined)).length > 0
        ? pendingItems.filter((item) => !(item === "faixa de orçamento" && draft.budgetMax !== null && draft.budgetMax !== undefined))
        : undefined,
      metadata: {
        source: "imob-chat",
        flow: operational.flow,
        dedupeKey: params.resolved.presentation.dedupeKey ?? null,
      } as any,
    };

    const persistedLead = existingLead
      ? await params.prisma.imobLead.update({
          where: { id: existingLead.id },
          data: {
            name: leadData.name,
            email: leadData.email,
            phone: leadData.phone,
            goal: leadData.goal,
            targetCity: leadData.targetCity,
            budgetMaxCents: leadData.budgetMaxCents,
            stage: leadData.stage,
            temperature: leadData.temperature,
            pendingItems: leadData.pendingItems,
            metadata: leadData.metadata,
          },
        })
      : await params.prisma.imobLead.create({ data: leadData });

    return persistedLead.id;
  };

  const upsertOwnerDraft = async (draft: {
    ownerName: string | null;
    ownerEmail?: string | null;
    ownerPhone?: string | null;
    ownerDocument?: string | null;
  } | null | undefined, mode: "upsert" | "lookup_only") => {
    if (!draft) return null;
    const ownerWhere = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      OR: [
        draft.ownerDocument ? { document: draft.ownerDocument } : null,
        draft.ownerPhone ? { phone: draft.ownerPhone } : null,
        draft.ownerEmail ? { email: draft.ownerEmail } : null,
        draft.ownerName ? { name: draft.ownerName } : null,
      ].filter(Boolean),
    } as any;
    if (ownerWhere.OR.length === 0) return null;

    const existingOwner = await params.prisma.imobOwner.findFirst({
      where: { ...ownerWhere, status: { not: "archived" } },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (mode === "lookup_only") return existingOwner?.id ?? null;

    const ownerData = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      name: draft.ownerName ?? "Proprietário sem nome",
      document: draft.ownerDocument ?? null,
      email: draft.ownerEmail ?? null,
      phone: draft.ownerPhone ?? null,
      status: operational.status === "ready_for_review" ? "qualified" : "pending_data",
      pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
      metadata: {
        source: "imob-chat",
        flow: operational.flow,
        dedupeKey: params.resolved.presentation.dedupeKey ?? null,
      } as any,
    };

    const persistedOwner = existingOwner
      ? await params.prisma.imobOwner.update({ where: { id: existingOwner.id }, data: ownerData })
      : await params.prisma.imobOwner.create({ data: ownerData });

    return persistedOwner.id;
  };

  const upsertPropertyDraft = async (draft: {
    propertyId?: string | null;
    propertyType?: string | null;
    goal?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    address?: string | null;
  } | null | undefined, mode: "upsert" | "lookup_only") => {
    if (!draft) return null;
    const externalPropertyRef = draft.propertyId ?? null;
    let existingProperty = null as { id: string } | null;
    const recentProperties = await params.prisma.imobProperty.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, address: true, metadata: true },
    });
    existingProperty = recentProperties.find((item) => {
      const metadata = asObject(item.metadata);
      const metadataRef = asString(metadata?.externalPropertyRef);
      if (externalPropertyRef && metadataRef === externalPropertyRef) return true;
      if (draft.address && item.address && item.address.trim().toLowerCase() === draft.address.trim().toLowerCase()) return true;
      return false;
    }) ?? null;
    if (mode === "lookup_only") return existingProperty?.id ?? null;

    const propertyData = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      ownerId: persistedOwnerId ?? null,
      propertyType: draft.propertyType ?? null,
      goal: draft.goal ?? null,
      city: draft.city ?? null,
      neighborhood: draft.neighborhood ?? null,
      bedrooms: draft.bedrooms ?? null,
      bathrooms: draft.bathrooms ?? null,
      address: draft.address ?? null,
      status: operational.status === "ready_for_review" ? "ready_for_review" : "pending_data",
      pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
      metadata: {
        source: "imob-chat",
        flow: operational.flow,
        externalPropertyRef,
        dedupeKey: params.resolved.presentation.dedupeKey ?? null,
      } as any,
    };

    const persistedProperty = existingProperty
      ? await params.prisma.imobProperty.update({ where: { id: existingProperty.id }, data: propertyData })
      : await params.prisma.imobProperty.create({ data: propertyData });

    return persistedProperty.id;
  };

  if (operational.flow === "owner.create" && ownerDraft) {
    persistedOwnerId = await upsertOwnerDraft(ownerDraft, "upsert");
  } else if (operational.flow === "property.create" && propertyDraft) {
    persistedPropertyId = await upsertPropertyDraft(propertyDraft, "upsert");
  } else if (operational.flow === "lead.qualify" && leadDraft) {
    persistedLeadId = await upsertLeadDraft(leadDraft, "upsert");
  } else if (operational.flow === "proposal.create" && proposalDraft) {
    persistedLeadId = await upsertLeadDraft({
      leadName: proposalDraft.buyerName,
      leadEmail: proposalDraft.buyerEmail,
      leadPhone: proposalDraft.buyerPhone,
      desiredGoal: proposalDraft.contractType === "rent" ? "locacao" : proposalDraft.contractType === "sale" ? "venda" : null,
      desiredCity: null,
      budgetMax: proposalDraft.offerAmount,
    }, "lookup_only") ?? persistedLeadId;
  } else if (operational.flow === "visit.schedule" && visitDraft) {
    persistedLeadId = await upsertLeadDraft({
      leadName: visitDraft.visitorName,
      leadPhone: visitDraft.visitorPhone,
      desiredGoal: null,
      desiredCity: null,
      budgetMax: null,
    }, "lookup_only") ?? persistedLeadId;
  }

  const baseData = {
    threadId: params.threadId ?? null,
    flow: operational.flow,
    stage: operational.status,
    status: mapOperationalCaseStatus(operational.status),
    ownerResponsible: params.resolved.presentation.owner ?? null,
    nextStep: params.resolved.presentation.nextStep ?? null,
    blockers: blockers.length > 0 ? blockers : undefined,
    pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
    ...(persistedLeadId ? { leadId: persistedLeadId } : {}),
    ...(persistedOwnerId ? { ownerId: persistedOwnerId } : {}),
    ...(persistedPropertyId ? { propertyId: persistedPropertyId } : {}),
    metadata: {
      threadLabel: params.threadLabel ?? params.resolved.threadLabel,
      action: params.resolved.action,
      mode: params.resolved.mode,
      suggestedNextAction: params.resolved.presentation.suggestedNextAction ?? null,
      dedupeKey: params.resolved.presentation.dedupeKey ?? null,
    } as any,
  };

  const item = scopedCase
    ? await params.prisma.imobCase.update({
        where: { id: scopedCase.id },
        data: {
          ...baseData,
          ...(proposalDraft?.propertyId ? { externalDealId: proposalDraft.propertyId } : {}),
        },
      })
    : await params.prisma.imobCase.create({
        data: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          ...baseData,
          ...(proposalDraft?.propertyId ? { externalDealId: proposalDraft.propertyId } : {}),
        },
      });

  await params.prisma.imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: item.id } },
      tenant: { connect: { id: params.tenantId } },
      workspace: { connect: { id: params.workspaceId } },
      type: scopedCase ? "case.turn_resolved" : "case.created_from_turn",
      actorType: "system",
      actorRef: null,
      summary: params.resolved.presentation.text,
      evidenceRef: params.resolved.presentation.dedupeKey ?? null,
      payload: {
        resolvedAt: nowIso,
        flow: operational.flow,
        operationalStatus: operational.status,
        pendingFields: operational.pendingFields,
        pendingFieldLabels: pendingItems,
        ownerDraft: ownerDraft ?? null,
        propertyDraft: propertyDraft ?? null,
        leadDraft: leadDraft ?? null,
        proposalDraft: proposalDraft ?? null,
        visitDraft: visitDraft ?? null,
        contractDraft: contractDraft ?? null,
        commissionDraft: commissionDraft ?? null,
        persistedLeadId,
        persistedOwnerId,
        persistedPropertyId,
        executionRequest: params.resolved.executionRequest ?? null,
      } as any,
    },
  });

  return {
    caseId: item.id,
    flow: operational.flow,
    stage: operational.status,
    status: mapOperationalCaseStatus(operational.status),
    ownerResponsible: params.resolved.presentation.owner ?? null,
    nextStep: params.resolved.presentation.nextStep ?? null,
    blocker: params.resolved.presentation.blocker ?? null,
    pendingItems,
    threadId: params.threadId ?? null,
    updatedAt: nowIso,
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
  res: any,
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
  reqOrRes: TenantAwareRequest | any,
  resOrPermissions: any,
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
  sendImobPermissionDenied(req, res, {
    code: "IMOB_WORKSPACE_PERMISSION_FORBIDDEN",
    message,
    capability: resolvedCapability,
  });
  return false;
}

function ensureImobStagePermission(
  reqOrRes: TenantAwareRequest | any,
  resOrPermissions: any,
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
  sendImobPermissionDenied(req, res, {
    code: "IMOB_STAGE_FORBIDDEN",
    message: resolvedMessage,
    stage: stage ?? null,
  });
  return false;
}

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

  const workspaceResponsibleLabel = workspaceAccess.responsibleLabel;

  const threadStateRaw = asObject(body.threadState);
  const threadSlotsRaw = asObject(threadStateRaw?.slots);
  const threadOperationalRaw = asObject(threadStateRaw?.operational);
  const parsedThreadState = threadStateRaw
    ? {
        mode: asString(threadStateRaw.mode) ?? "consult",
        pendingSlot: asString(threadStateRaw.pendingSlot) ?? "none",
        resultOffset: Number.isFinite(Number(threadStateRaw.resultOffset)) ? Number(threadStateRaw.resultOffset) : 0,
        slots: {
          goal: asString(threadSlotsRaw?.goal) === "locacao" || asString(threadSlotsRaw?.goal) === "venda" ? asString(threadSlotsRaw?.goal) : null,
          city: asString(threadSlotsRaw?.city),
          region: asString(threadSlotsRaw?.region),
          neighborhood: asString(threadSlotsRaw?.neighborhood),
          budgetMax: Number.isFinite(Number(threadSlotsRaw?.budgetMax)) ? Number(threadSlotsRaw?.budgetMax) : null,
          bedrooms: Number.isFinite(Number(threadSlotsRaw?.bedrooms)) ? Number(threadSlotsRaw?.bedrooms) : null,
          bathrooms: Number.isFinite(Number(threadSlotsRaw?.bathrooms)) ? Number(threadSlotsRaw?.bathrooms) : null,
          propertyType: asString(threadSlotsRaw?.propertyType),
        },
        operational: threadOperationalRaw ? (threadOperationalRaw as any) : null,
      }
    : null;

  const threadLabel = asString(body.threadLabel);

  const processSingleOperationalTurn = async (params: {
    message: string;
    caseId?: string | null;
    threadState: any;
  }) => {
    const hydratedThreadState = await hydrateThreadStateWithPersistedLead({
      prisma,
      tenantId: authContext.tenantId,
      message: params.message,
      caseId: params.caseId,
      threadLabel,
      threadState: params.threadState,
    });

    const updateData = await resolveImobOperationalUpdate({
      prisma,
      tenantId: authContext.tenantId,
      userId: authContext.userId ?? null,
      message: params.message,
      caseId: params.caseId,
      threadState: hydratedThreadState,
    });
    if (updateData) {
      const data = applyResponsibleLabelToResolvedTurn(updateData, workspaceResponsibleLabel);
      return {
        data,
        caseContext: data.caseContext ?? null,
      };
    }

    const consultData = await resolveImobOperationalConsult({
      prisma,
      tenantId: authContext.tenantId,
      userId: authContext.userId ?? null,
      message: params.message,
      caseId: params.caseId,
      threadState: hydratedThreadState,
    });
    if (consultData) {
      const data = applyResponsibleLabelToResolvedTurn(consultData, workspaceResponsibleLabel);
      return {
        data,
        caseContext: data.caseContext ?? null,
      };
    }

    const semanticIntent = await resolveImobSemanticIntent(params.message);
    const resolvedTurn = resolveImobTurn({
      message: params.message,
      semanticIntent: semanticIntent.parsedIntent,
      semanticIntentSource: semanticIntent.source,
      threadLabel,
      threadId: requestedThreadId,
      caseId: params.caseId,
      threadState: hydratedThreadState as any,
      access: {
        tenantId: authContext.tenantId,
          entitlements,
      },
    });
    const data = applyResponsibleLabelToResolvedTurn(injectResolvedPendingSuggestion(resolvedTurn), workspaceResponsibleLabel);

    const caseContext = await upsertImobCaseFromResolvedTurn({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      caseId: params.caseId,
      threadId: requestedThreadId,
      threadLabel,
      resolved: data,
    });

    return {
      data,
      caseContext: caseContext ?? data.caseContext ?? null,
    };
  };

  const batches = extractImobOperationalBatches(message);
  const totalBatchOperations = batches.reduce((count, group) => count + group.length, 0);
  if (totalBatchOperations >= 2) {
    const summaries: string[] = [];
    let latestState: any = parsedThreadState ?? createEmptyThreadState();
    let latestCaseContext: any = null;

    for (const group of batches) {
      let groupCaseId = requestedCaseId ?? null;
      for (const line of group) {
        const result = await processSingleOperationalTurn({
          message: line,
          caseId: groupCaseId,
          threadState: latestState,
        });
        latestState = result.data.conversationState ?? latestState;
        groupCaseId = result.caseContext?.caseId ?? groupCaseId;
        latestCaseContext = result.caseContext ?? latestCaseContext;
        summaries.push(formatBatchLineSummary(result.data, line));
      }
    }

    const batchData = {
      mode: "consult",
      action: "crm.batch.intake",
      threadLabel: "Lote",
      conversationState: latestState,
      caseContext: batches.length === 1 ? latestCaseContext : null,
      presentation: {
        text: [
          `Processei ${totalBatchOperations} operação(ões) deste lote no IMOB.`,
          ...summaries.map((summary, index) => `${index + 1}. ${summary}`),
        ].join("\n"),
        owner: workspaceResponsibleLabel,
        nextStep: "Revisar os cadastros processados, completar pendências e seguir para os próximos vínculos comerciais.",
        dedupeKey: `crm.batch.intake:${totalBatchOperations}`,
        card: {
          title: "Lote processado",
          lines: summaries,
        },
      },
    } as any;

    return res.json({
      ok: true,
      data: {
        ...batchData,
        entitlements,
      },
    });
  }

  const singleResult = await processSingleOperationalTurn({
    message,
    caseId: requestedCaseId,
    threadState: parsedThreadState,
  });

  return res.json({
    ok: true,
    data: {
      ...singleResult.data,
      caseContext: singleResult.caseContext ?? singleResult.data.caseContext,
      entitlements,
    },
  });
});

type AttachmentValidationResult = Awaited<ReturnType<typeof validateImobIdentityAttachmentAgainstCase>>;

function buildAttachmentCrmSuggestionLines(validation: AttachmentValidationResult) {
  if (!validation.crmSuggestion) return validation.card.lines;
  const suggestionLines = validation.crmSuggestion.fields.map((field) => {
    const details = [
      `CRM ${field.label}: sugerido ${field.suggestedValue}`,
      field.currentValue ? `atual ${field.currentValue}` : "campo vazio no cadastro",
    ];
    return details.join(" • ");
  });
  return [...validation.card.lines, ...suggestionLines];
}

function buildAttachmentCrmSuggestionCtas(validation: AttachmentValidationResult, caseId: string, threadId?: string | null) {
  if (!validation.crmSuggestion) return undefined;
  const payload = {
    caseId,
    threadId: threadId ?? null,
    documentIds: validation.crmSuggestion.documentIds,
  };
  return [
    { id: "attachment-crm-include", label: "Incluir no CRM", kind: "primary" as const, action: "apply_attachment_crm_include" as const, payload: { ...payload, mode: "include" } },
    { id: "attachment-crm-edit", label: "Editar cadastro", kind: "secondary" as const, action: "apply_attachment_crm_edit" as const, payload: { ...payload, mode: "edit" } },
    { id: "attachment-crm-discard", label: "Descartar", kind: "neutral" as const, action: "apply_attachment_crm_discard" as const, payload: { ...payload, mode: "discard" } },
  ];
}

function buildAttachmentCrmSuggestionPatch(params: {
  owner: { name: string; document?: string | null; metadata?: unknown };
  validation: AttachmentValidationResult;
  mode: "include" | "edit";
}) {
  const suggestion = params.validation.crmSuggestion;
  if (!suggestion) {
    return { data: {}, appliedFields: [] as string[] };
  }

  const metadata = asObject(params.owner.metadata) ?? {};
  const nextMetadata: Record<string, unknown> = { ...metadata };
  const data: Record<string, unknown> = {};
  const appliedFields: string[] = [];

  for (const field of suggestion.fields) {
    const shouldApply = params.mode === "edit" || !field.currentValue;
    if (!shouldApply || !field.suggestedValue) continue;
    if (field.field === "name") {
      data.name = field.suggestedValue;
      appliedFields.push("Nome");
      continue;
    }
    if (field.field === "document") {
      data.document = field.suggestedValue;
      appliedFields.push("CPF");
      continue;
    }
    if (field.field === "rg") {
      nextMetadata.rg = field.suggestedValue;
      appliedFields.push("RG");
    }
  }

  if (appliedFields.includes("RG")) {
    data.metadata = nextMetadata;
  }

  return { data, appliedFields };
}

imobRouter.post("/attachments/resolve", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const parsed = imobAttachmentResolveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const documentIds = parsed.data.documentIds;
  const docs = await prisma.uploadedDocument.findMany({
    where: {
      id: { in: documentIds },
      tenantId: authContext.tenantId,
      agentSlug: "imob",
    },
  });
  if (docs.length !== documentIds.length) {
    return res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "One or more uploaded documents were not found" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }
  const workspaceResponsibleLabel = workspaceAccess.responsibleLabel;

  const caseItem = parsed.data.caseId
    ? await prisma.imobCase.findFirst({
        where: { id: parsed.data.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
        include: { owner: true },
      })
    : parsed.data.threadId
      ? await prisma.imobCase.findFirst({
          where: { threadId: parsed.data.threadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: { owner: true },
        })
      : null;

  if (
    caseItem &&
    !ensureImobStagePermission(
      res,
      workspaceAccess.permissions,
      caseItem.stage,
      `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`
    )
  ) {
    return;
  }

  if (!caseItem || !caseItem.ownerId || !caseItem.owner) {
    return res.json({
      ok: true,
      data: {
        resolved: false,
        presentation: {
          text: "Documento anexado ao contexto desta conversa. Ainda preciso do caso ou proprietário correto para baixar a pendência automaticamente.",
          nextStep: "Abra o proprietário ou o caso correto e tente anexar novamente.",
          owner: workspaceResponsibleLabel,
        },
      },
    });
  }

  const ownerPending = asStringList(caseItem.owner.pendingItems);
  const shouldResolveOwnerDocument = caseItem.flow === "owner.create" || ownerPending.includes("ownerDocument") || ownerPending.includes("documento do proprietário");
  if (!shouldResolveOwnerDocument) {
    return res.json({
      ok: true,
      data: {
        resolved: false,
        caseContext: buildCaseContextFromRecord(caseItem),
        presentation: {
          text: "Documento anexado ao contexto desta conversa, mas ele ainda não corresponde a uma pendência documental automática deste caso.",
          nextStep: "Revise as pendências atuais do caso para vincular este anexo na etapa correta.",
          owner: workspaceResponsibleLabel,
        },
      },
    });
  }

  const validationOwnerName = caseItem.owner
    ? await resolveOwnerDisplayName({
        prisma,
        tenantId: authContext.tenantId,
          owner: caseItem.owner,
      })
    : null;
  const validation = await validateImobIdentityAttachmentAgainstCase({
    docs,
    caseItem: validationOwnerName && caseItem.owner
      ? { ...caseItem, owner: { ...caseItem.owner, name: validationOwnerName } }
      : caseItem,
  });

  const nextOwnerPending = validation.resolved
    ? ownerPending.filter((item) => item !== "ownerDocument" && item !== "documento do proprietário")
    : ownerPending;
  const nextOwnerStatus = nextOwnerPending.length > 0 ? "pending_data" : "ready_for_review";
  const nextCasePending = validation.resolved
    ? asStringList(caseItem.pendingItems).filter((item) => item !== "ownerDocument" && item !== "documento do proprietário")
    : asStringList(caseItem.pendingItems);
  const nextCaseStatus = nextCasePending.length > 0 ? "pending_data" : "ready_for_review";
  const resolvedNextStep = nextCasePending.length > 0
    ? "Completar os dados restantes do proprietário antes de avançar a captação."
    : "Vincular o proprietário ao próximo imóvel ou etapa documental.";

  const updated = await prisma.$transaction(async (tx) => {
    const owner = validation.resolved
      ? await tx.imobOwner.update({
          where: { id: caseItem.ownerId! },
          data: { status: nextOwnerStatus, pendingItems: nextOwnerPending },
        })
      : caseItem.owner!;

    const imobCase = await tx.imobCase.update({
      where: { id: caseItem.id },
      data: {
        ...(validation.resolved
          ? {
              stage: nextCaseStatus,
              status: nextCaseStatus,
              pendingItems: nextCasePending,
              nextStep: resolvedNextStep,
            }
          : {}),
        ownerResponsible: workspaceResponsibleLabel,
      },
    });

    await tx.imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: caseItem.id } },
        tenant: { connect: { id: authContext.tenantId } },
        workspace: { connect: { id: authContext.workspaceId } },
        type: validation.eventType,
        actorType: "user",
        actorRef: null,
        summary: validation.eventSummary,
        evidenceRef: validation.document?.id ?? docs[0]?.id ?? null,
        payload: {
          documentIds,
          fileNames: docs.map((item) => item.fileName),
          ownerId: caseItem.ownerId,
          validation: {
            contractId: validation.contract.id,
            decision: validation.decision,
            resolved: validation.resolved,
            fields: validation.fields,
            extracted: validation.extracted,
            crmSuggestion: validation.crmSuggestion,
            photoDocumentId: validation.photo?.id ?? null,
            primaryDocumentId: validation.document?.id ?? null,
          },
        },
      },
    });

    return { owner, imobCase };
  });

  return res.json({
    ok: true,
    data: {
      resolved: validation.resolved,
      caseContext: {
        caseId: updated.imobCase.id,
        flow: updated.imobCase.flow,
        stage: updated.imobCase.stage,
        status: updated.imobCase.status,
        ownerResponsible: updated.imobCase.ownerResponsible ?? workspaceResponsibleLabel,
        nextStep: updated.imobCase.nextStep ?? validation.nextStep,
        blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
        pendingItems: nextCasePending,
        threadId: updated.imobCase.threadId ?? null,
        updatedAt: updated.imobCase.updatedAt.toISOString(),
      },
      presentation: {
        text: [
          validation.summary,
          validation.crmSuggestion ? "Posso incluir, editar ou descartar esta sugestão de cadastro no CRM." : null,
          `Próximo passo: ${validation.resolved ? resolvedNextStep : validation.nextStep}`,
        ].filter(Boolean).join("\n"),
        card: {
          ...validation.card,
          lines: buildAttachmentCrmSuggestionLines(validation),
          ctas: buildAttachmentCrmSuggestionCtas(validation, updated.imobCase.id, updated.imobCase.threadId ?? parsed.data.threadId ?? null),
        },
        owner: updated.imobCase.ownerResponsible ?? workspaceResponsibleLabel,
        nextStep: validation.resolved ? resolvedNextStep : validation.nextStep,
        blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
        pendingFieldLabels: validation.resolved
          ? nextOwnerPending.map((item) => item === "ownerDocument" ? "documento do proprietário" : item)
          : ["revisão documental do proprietário"],
        dedupeKey: validation.dedupeKey,
      },
    },
  });
});

imobRouter.post("/attachments/crm-suggestion", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const parsed = imobAttachmentCrmSuggestionApplySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const documentIds = parsed.data.documentIds;
  const docs = await prisma.uploadedDocument.findMany({
    where: {
      id: { in: documentIds },
      tenantId: authContext.tenantId,
      agentSlug: "imob",
    },
  });
  if (docs.length !== documentIds.length) {
    return res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "One or more uploaded documents were not found" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }
  const workspaceResponsibleLabel = workspaceAccess.responsibleLabel;

  const caseItem = parsed.data.caseId
    ? await prisma.imobCase.findFirst({
        where: { id: parsed.data.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
        include: { owner: true },
      })
    : parsed.data.threadId
      ? await prisma.imobCase.findFirst({
          where: { threadId: parsed.data.threadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: { owner: true },
        })
      : null;

  if (!caseItem || !caseItem.ownerId || !caseItem.owner) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case or owner not found for CRM suggestion" } });
  }

  if (
    !ensureImobStagePermission(
      res,
      workspaceAccess.permissions,
      caseItem.stage,
      `Sua função atual não pode operar a etapa ${caseItem.stage} neste workspace.`
    )
  ) {
    return;
  }

  const validationOwnerName = caseItem.owner
    ? await resolveOwnerDisplayName({
        prisma,
        tenantId: authContext.tenantId,
          owner: caseItem.owner,
      })
    : null;
  const validation = await validateImobIdentityAttachmentAgainstCase({
    docs,
    caseItem: validationOwnerName && caseItem.owner
      ? { ...caseItem, owner: { ...caseItem.owner, name: validationOwnerName } }
      : caseItem,
  });
  if (!validation.crmSuggestion) {
    return res.json({
      ok: true,
      data: {
        applied: false,
        caseContext: buildCaseContextFromRecord(caseItem),
        presentation: {
          text: "Li o documento, mas não encontrei campos novos para sugerir no cadastro do CRM.",
          owner: workspaceResponsibleLabel,
          nextStep: "Anexe outro documento ou continue o cadastro manualmente.",
          dedupeKey: `${validation.dedupeKey}:crm-suggestion:none`,
          card: {
            title: "Sugestão de CRM",
            lines: ["Nenhum campo novo foi identificado para inclusão ou edição no CRM."],
          },
        },
      },
    });
  }

  const mode = parsed.data.mode;
  const patch = mode === "discard"
    ? { data: {}, appliedFields: [] as string[] }
    : buildAttachmentCrmSuggestionPatch({ owner: caseItem.owner, validation, mode });

  const updated = await prisma.$transaction(async (tx) => {
    const owner = mode === "discard" || Object.keys(patch.data).length === 0
      ? caseItem.owner!
      : await tx.imobOwner.update({
          where: { id: caseItem.ownerId! },
          data: patch.data as any,
        });

    const imobCase = await tx.imobCase.update({
      where: { id: caseItem.id },
      data: {
        ownerResponsible: workspaceResponsibleLabel,
      },
    });

    await tx.imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: caseItem.id } },
        tenant: { connect: { id: authContext.tenantId } },
        workspace: { connect: { id: authContext.workspaceId } },
        type: mode === "discard" ? "case.crm_suggestion_discarded" : "case.crm_suggestion_applied",
        actorType: "user",
        actorRef: null,
        summary: mode === "discard"
          ? `Sugestão de cadastro do proprietário ${validationOwnerName ?? caseItem.owner?.name ?? "proprietário"} descartada no CRM.`
          : `Sugestão de cadastro do proprietário ${validationOwnerName ?? caseItem.owner?.name ?? "proprietário"} aplicada no CRM em modo ${mode}.`,
        evidenceRef: validation.document?.id ?? docs[0]?.id ?? null,
        payload: {
          mode,
          documentIds,
          fileNames: docs.map((item) => item.fileName),
          ownerId: caseItem.ownerId,
          crmSuggestion: validation.crmSuggestion,
          extracted: validation.extracted,
          appliedFields: patch.appliedFields,
          appliedData: patch.data,
        },
      },
    });

    return { owner, imobCase };
  });

  const appliedText = mode === "discard"
    ? "Sugestão descartada. Mantive o cadastro atual do CRM sem alterações."
    : patch.appliedFields.length > 0
      ? mode === "include"
        ? `Incluí no CRM os campos vazios preenchidos pelo documento: ${patch.appliedFields.join(", ")}.`
        : `Editei no CRM os campos confirmados pelo documento: ${patch.appliedFields.join(", ")}.`
      : mode === "include"
        ? "Nenhum campo vazio precisava de inclusão no CRM."
        : "Nenhum campo precisou ser alterado no CRM com base nesta sugestão.";

  return res.json({
    ok: true,
    data: {
      applied: mode !== "discard" && patch.appliedFields.length > 0,
      caseContext: {
        caseId: updated.imobCase.id,
        flow: updated.imobCase.flow,
        stage: updated.imobCase.stage,
        status: updated.imobCase.status,
        ownerResponsible: updated.imobCase.ownerResponsible ?? workspaceResponsibleLabel,
        nextStep: updated.imobCase.nextStep ?? validation.nextStep,
        blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
        pendingItems: asStringList(updated.imobCase.pendingItems),
        threadId: updated.imobCase.threadId ?? null,
        updatedAt: updated.imobCase.updatedAt.toISOString(),
      },
      presentation: {
        text: [
          appliedText,
        ].join("\n"),
        owner: updated.imobCase.ownerResponsible ?? workspaceResponsibleLabel,
        nextStep: mode === "discard"
          ? "Continue com o cadastro manual ou descarte o documento se ele não for útil."
          : "Revise o cadastro do proprietário e siga com a próxima etapa do caso.",
        dedupeKey: `${validation.dedupeKey}:crm-suggestion:${mode}`,
        card: {
          title: mode === "discard" ? "Sugestão descartada" : mode === "include" ? "Cadastro incluído no CRM" : "Cadastro editado no CRM",
          lines: [
            appliedText,
            ...validation.crmSuggestion.fields
              .filter((field) => typeof field.suggestedValue === "string" && field.suggestedValue.trim().length > 0)
              .filter((field) => mode === "discard" || patch.appliedFields.length === 0 || patch.appliedFields.includes(field.label))
              .map((field) => `${field.label}: sugerido ${field.suggestedValue}${field.currentValue ? ` • anterior ${field.currentValue}` : ""}`),
          ],
        },
      },
    },
  });
});

imobRouter.get("/owners", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const items = await prisma.imobOwner.findMany({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return res.json({ ok: true, data: { items } });
});

imobRouter.post("/owners", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const parsed = imobOwnerCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const created = await prisma.imobOwner.create({
    data: {
      tenantId: authContext.tenantId,
      name: parsed.data.name,
      document: parsed.data.document ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      personType: parsed.data.personType ?? undefined,
      status: parsed.data.status ?? undefined,
      pendingItems: parsed.data.pendingItems ?? undefined,
      metadata: parsed.data.metadata as any,
    },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "owner",
    subjectId: created.id,
    action: "created",
    summary: `Owner ${created.name} created`,
    after: created,
  });

  return res.status(201).json({ ok: true, data: created });
});

imobRouter.get("/owners/:ownerId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const item = await prisma.imobOwner.findFirst({
    where: { id: req.params.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
  }

  return res.json({ ok: true, data: item });
});

imobRouter.patch("/owners/:ownerId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const existing = await prisma.imobOwner.findFirst({
    where: { id: req.params.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
  }

  const parsed = imobOwnerUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const previous = await prisma.imobOwner.findFirst({ where: { id: existing.id } });

  const updated = await prisma.imobOwner.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.document !== undefined ? { document: parsed.data.document } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.personType !== undefined && parsed.data.personType !== null ? { personType: parsed.data.personType } : {}),
      ...(parsed.data.status !== undefined && parsed.data.status !== null ? { status: parsed.data.status } : {}),
      ...(parsed.data.pendingItems !== undefined ? { pendingItems: parsed.data.pendingItems } : {}),
      ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata as any } : {}),
    },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "owner",
    subjectId: updated.id,
    action: "updated",
    summary: `Owner ${updated.name} updated`,
    before: previous,
    after: updated,
  });

  return res.json({ ok: true, data: updated });
});

imobRouter.delete("/owners/:ownerId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const existing = await prisma.imobOwner.findFirst({
    where: { id: req.params.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
  }

  const activePropertiesCount = await prisma.imobProperty.count({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, ownerId: existing.id, status: { not: "archived" } },
  });
  const activeCasesCount = await prisma.imobCase.count({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, ownerId: existing.id },
  });
  if (activePropertiesCount > 0 || activeCasesCount > 0) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "OWNER_DELETE_BLOCKED",
        message: "Owner still has active properties or cases linked and cannot be archived",
      },
    });
  }

  const metadata = asObject(existing.metadata) ?? {};
  const archived = await prisma.imobOwner.update({
    where: { id: existing.id },
    data: {
      status: "archived",
      metadata: {
        ...metadata,
        archivedAt: new Date().toISOString(),
        archivedByUserId: authContext.userId ?? null,
      } as any,
    },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "owner",
    subjectId: archived.id,
    action: "deleted",
    summary: `Owner ${archived.name} archived`,
    before: existing,
    after: archived,
  });

  return res.json({ ok: true, data: archived });
});

imobRouter.get("/properties", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const items = await prisma.imobProperty.findMany({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { owner: { select: { id: true, name: true } } },
  });

  return res.json({ ok: true, data: { items } });
});

imobRouter.post("/properties", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const parsed = imobPropertyCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  if (parsed.data.ownerId) {
    const owner = await prisma.imobOwner.findFirst({
      where: { id: parsed.data.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      select: { id: true },
    });
    if (!owner) {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for property" } });
    }
  }

  const created = await prisma.imobProperty.create({
    data: {
      tenantId: authContext.tenantId,
      ownerId: parsed.data.ownerId ?? null,
      propertyType: parsed.data.propertyType ?? null,
      goal: parsed.data.goal ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      neighborhood: parsed.data.neighborhood ?? null,
      bedrooms: parsed.data.bedrooms,
      bathrooms: parsed.data.bathrooms,
      areaM2: parsed.data.areaM2,
      garageSpots: parsed.data.garageSpots,
      askingPriceCents: parsed.data.askingPriceCents,
      description: parsed.data.description ?? null,
      status: parsed.data.status ?? undefined,
      pendingItems: parsed.data.pendingItems ?? undefined,
      metadata: parsed.data.metadata as any,
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "property",
    subjectId: created.id,
    action: "created",
    summary: `Property ${formatPropertyLookupLabel(created)} created`,
    after: created,
  });

  return res.status(201).json({ ok: true, data: created });
});

imobRouter.get("/properties/:propertyId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const item = await prisma.imobProperty.findFirst({
    where: { id: req.params.propertyId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    include: { owner: { select: { id: true, name: true } } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
  }

  return res.json({ ok: true, data: item });
});

imobRouter.patch("/properties/:propertyId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const existing = await prisma.imobProperty.findFirst({
    where: { id: req.params.propertyId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
  }

  const parsed = imobPropertyUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  if (parsed.data.ownerId) {
    const owner = await prisma.imobOwner.findFirst({
      where: { id: parsed.data.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      select: { id: true },
    });
    if (!owner) {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for property" } });
    }
  }

  const previous = await prisma.imobProperty.findFirst({ where: { id: existing.id }, include: { owner: { select: { id: true, name: true } } } });

  const updated = await prisma.imobProperty.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.ownerId !== undefined
        ? { owner: parsed.data.ownerId ? { connect: { id: parsed.data.ownerId } } : { disconnect: true } }
        : {}),
      ...(parsed.data.propertyType !== undefined ? { propertyType: parsed.data.propertyType } : {}),
      ...(parsed.data.goal !== undefined ? { goal: parsed.data.goal } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
      ...(parsed.data.city !== undefined ? { city: parsed.data.city } : {}),
      ...(parsed.data.neighborhood !== undefined ? { neighborhood: parsed.data.neighborhood } : {}),
      ...(parsed.data.bedrooms !== undefined ? { bedrooms: parsed.data.bedrooms } : {}),
      ...(parsed.data.bathrooms !== undefined ? { bathrooms: parsed.data.bathrooms } : {}),
      ...(parsed.data.areaM2 !== undefined ? { areaM2: parsed.data.areaM2 } : {}),
      ...(parsed.data.garageSpots !== undefined ? { garageSpots: parsed.data.garageSpots } : {}),
      ...(parsed.data.askingPriceCents !== undefined ? { askingPriceCents: parsed.data.askingPriceCents } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.status !== undefined && parsed.data.status !== null ? { status: parsed.data.status } : {}),
      ...(parsed.data.pendingItems !== undefined ? { pendingItems: parsed.data.pendingItems } : {}),
      ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata as any } : {}),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "property",
    subjectId: updated.id,
    action: "updated",
    summary: `Property ${formatPropertyLookupLabel(updated)} updated`,
    before: previous,
    after: updated,
  });

  return res.json({ ok: true, data: updated });
});

imobRouter.delete("/properties/:propertyId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const existing = await prisma.imobProperty.findFirst({
    where: { id: req.params.propertyId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
  }

  const activeCasesCount = await prisma.imobCase.count({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, propertyId: existing.id },
  });
  if (activeCasesCount > 0) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "PROPERTY_DELETE_BLOCKED",
        message: "Property still has active cases linked and cannot be archived",
      },
    });
  }

  const metadata = asObject(existing.metadata) ?? {};
  const archived = await prisma.imobProperty.update({
    where: { id: existing.id },
    data: {
      status: "archived",
      metadata: {
        ...metadata,
        archivedAt: new Date().toISOString(),
        archivedByUserId: authContext.userId ?? null,
      } as any,
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  await recordImobCrmAuditEvent({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
    subjectType: "property",
    subjectId: archived.id,
    action: "deleted",
    summary: `Property ${formatPropertyLookupLabel(archived)} archived`,
    before: existing,
    after: archived,
  });

  return res.json({ ok: true, data: archived });
});

imobRouter.get("/leads", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const items = await prisma.imobLead.findMany({
    where: { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return res.json({ ok: true, data: { items } });
});

imobRouter.post("/leads", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const parsed = imobLeadCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const created = await prisma.imobLead.create({
    data: {
      tenantId: authContext.tenantId,
      name: parsed.data.name,
      document: parsed.data.document ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      goal: parsed.data.goal ?? null,
      targetCity: parsed.data.targetCity ?? null,
      targetNeighborhood: parsed.data.targetNeighborhood ?? null,
      budgetMaxCents: parsed.data.budgetMaxCents,
      stage: parsed.data.stage ?? undefined,
      temperature: parsed.data.temperature ?? undefined,
      pendingItems: parsed.data.pendingItems ?? undefined,
      metadata: parsed.data.metadata as any,
    },
  });

  return res.status(201).json({ ok: true, data: created });
});

imobRouter.get("/leads/:leadId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const item = await prisma.imobLead.findFirst({
    where: { id: req.params.leadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
  }

  return res.json({ ok: true, data: item });
});

imobRouter.patch("/leads/:leadId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const existing = await prisma.imobLead.findFirst({
    where: { id: req.params.leadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
  }

  const parsed = imobLeadUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }

  const updated = await prisma.imobLead.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.document !== undefined ? { document: parsed.data.document } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.goal !== undefined ? { goal: parsed.data.goal } : {}),
      ...(parsed.data.targetCity !== undefined ? { targetCity: parsed.data.targetCity } : {}),
      ...(parsed.data.targetNeighborhood !== undefined ? { targetNeighborhood: parsed.data.targetNeighborhood } : {}),
      ...(parsed.data.budgetMaxCents !== undefined ? { budgetMaxCents: parsed.data.budgetMaxCents } : {}),
      ...(parsed.data.stage !== undefined && parsed.data.stage !== null ? { stage: parsed.data.stage } : {}),
      ...(parsed.data.temperature !== undefined && parsed.data.temperature !== null ? { temperature: parsed.data.temperature } : {}),
      ...(parsed.data.pendingItems !== undefined ? { pendingItems: parsed.data.pendingItems } : {}),
      ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata as any } : {}),
    },
  });

  return res.json({ ok: true, data: updated });
});

imobRouter.get("/cases", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const flow = typeof req.query.flow === "string" ? req.query.flow.trim() : null;
  const status = typeof req.query.status === "string" ? req.query.status.trim() : null;

  const items = await prisma.imobCase.findMany({
    where: {
      tenantId: authContext.tenantId,
      ...(flow ? { flow } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      owner: { select: { id: true, name: true } },
      property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
      lead: { select: { id: true, name: true } },
      _count: { select: { events: true } },
    },
  });

  const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));

  return res.json({ ok: true, data: { items: filteredItems } });
});

imobRouter.post("/cases", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const parsed = imobCaseCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, parsed.data.stage, `Sua função atual não pode operar a etapa ${parsed.data.stage} neste workspace.`)) {
    return;
  }

  if (parsed.data.ownerId) {
    const owner = await prisma.imobOwner.findFirst({ where: { id: parsed.data.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!owner) return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for case" } });
  }
  if (parsed.data.propertyId) {
    const property = await prisma.imobProperty.findFirst({ where: { id: parsed.data.propertyId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!property) return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found for case" } });
  }
  if (parsed.data.leadId) {
    const lead = await prisma.imobLead.findFirst({ where: { id: parsed.data.leadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!lead) return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found for case" } });
  }

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.imobCase.create({
      data: {
        tenantId: authContext.tenantId,
          threadId: parsed.data.threadId ?? null,
        flow: parsed.data.flow,
        stage: parsed.data.stage,
        status: parsed.data.status,
        ownerResponsible: parsed.data.ownerResponsible ?? null,
        nextStep: parsed.data.nextStep ?? null,
        blockers: parsed.data.blockers ?? undefined,
        pendingItems: parsed.data.pendingItems ?? undefined,
        ownerId: parsed.data.ownerId ?? null,
        propertyId: parsed.data.propertyId ?? null,
        leadId: parsed.data.leadId ?? null,
        externalDealId: parsed.data.externalDealId ?? null,
        metadata: parsed.data.metadata as any,
      },
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    await tx.imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: item.id } },
        tenant: { connect: { id: authContext.tenantId } },
        workspace: { connect: { id: authContext.workspaceId } },
        ...(parsed.data.initialEvent?.runId ? { run: { connect: { id: parsed.data.initialEvent.runId } } } : {}),
        type: parsed.data.initialEvent?.type ?? "case.created",
        actorType: parsed.data.initialEvent?.actorType ?? "system",
        actorRef: parsed.data.initialEvent?.actorRef ?? null,
        summary: parsed.data.initialEvent?.summary ?? `Case ${item.flow} created`,
        evidenceRef: parsed.data.initialEvent?.evidenceRef ?? null,
        payload: (parsed.data.initialEvent?.payload as any) ?? { flow: item.flow, stage: item.stage, status: item.status },
      },
    });

    return item;
  });

  return res.status(201).json({ ok: true, data: created });
});

imobRouter.get("/cases/:caseId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const item = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    include: {
      owner: true,
      property: true,
      lead: true,
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, item.stage, `Sua função atual não pode operar a etapa ${item.stage} neste workspace.`)) {
    return;
  }

  return res.json({ ok: true, data: item });
});

imobRouter.patch("/cases/:caseId", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }

  const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
  if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
    return;
  }

  const existing = await prisma.imobCase.findFirst({
    where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
    select: { id: true, flow: true, stage: true, status: true },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
  }

  const parsed = imobCaseUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  if (!ensureImobStagePermission(res, workspaceAccess.permissions, existing.stage, `Sua função atual não pode operar a etapa ${existing.stage} neste workspace.`)) {
    return;
  }
  if (parsed.data.stage && !ensureImobStagePermission(res, workspaceAccess.permissions, parsed.data.stage, `Sua função atual não pode mover o caso para a etapa ${parsed.data.stage} neste workspace.`)) {
    return;
  }

  if (parsed.data.ownerId) {
    const owner = await prisma.imobOwner.findFirst({ where: { id: parsed.data.ownerId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!owner) return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for case" } });
  }
  if (parsed.data.propertyId) {
    const property = await prisma.imobProperty.findFirst({ where: { id: parsed.data.propertyId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!property) return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found for case" } });
  }
  if (parsed.data.leadId) {
    const lead = await prisma.imobLead.findFirst({ where: { id: parsed.data.leadId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId }, select: { id: true } });
    if (!lead) return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found for case" } });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.imobCase.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.threadId !== undefined ? { threadId: parsed.data.threadId } : {}),
        ...(parsed.data.flow !== undefined && parsed.data.flow !== null ? { flow: parsed.data.flow } : {}),
        ...(parsed.data.stage !== undefined && parsed.data.stage !== null ? { stage: parsed.data.stage } : {}),
        ...(parsed.data.status !== undefined && parsed.data.status !== null ? { status: parsed.data.status } : {}),
        ...(parsed.data.ownerResponsible !== undefined ? { ownerResponsible: parsed.data.ownerResponsible } : {}),
        ...(parsed.data.nextStep !== undefined ? { nextStep: parsed.data.nextStep } : {}),
        ...(parsed.data.blockers !== undefined ? { blockers: parsed.data.blockers } : {}),
        ...(parsed.data.pendingItems !== undefined ? { pendingItems: parsed.data.pendingItems } : {}),
        ...(parsed.data.ownerId !== undefined
          ? { owner: parsed.data.ownerId ? { connect: { id: parsed.data.ownerId } } : { disconnect: true } }
          : {}),
        ...(parsed.data.propertyId !== undefined
          ? { property: parsed.data.propertyId ? { connect: { id: parsed.data.propertyId } } : { disconnect: true } }
          : {}),
        ...(parsed.data.leadId !== undefined
          ? { lead: parsed.data.leadId ? { connect: { id: parsed.data.leadId } } : { disconnect: true } }
          : {}),
        ...(parsed.data.externalDealId !== undefined ? { externalDealId: parsed.data.externalDealId } : {}),
        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata as any } : {}),
      },
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    await tx.imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: item.id } },
        tenant: { connect: { id: authContext.tenantId } },
        workspace: { connect: { id: authContext.workspaceId } },
        ...(parsed.data.eventRunId ? { run: { connect: { id: parsed.data.eventRunId } } } : {}),
        type: parsed.data.eventType ?? "case.updated",
        actorType: "system",
        actorRef: null,
        summary: parsed.data.eventSummary ?? `Case ${item.flow} updated`,
        evidenceRef: null,
        payload: (parsed.data.eventPayload as any) ?? { flow: item.flow, stage: item.stage, status: item.status },
      },
    });

    return item;
  });

  return res.json({ ok: true, data: updated });
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
      property: { select: { id: true, propertyType: true, city: true } },
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
      },
    },
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

  const threadMap = new Map<
    string,
    {
      threadId: string;
      label: string;
      status: "active" | "done" | "blocked";
      firstMessageAt: string;
      lastMessageAt: string;
      messageCount: number;
    }
  >();

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

  const items = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

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
  const threadId = asString(body.threadId) ?? asString(metadata.threadId);
  const threadLabel = asString(body.threadLabel) ?? asString(metadata.threadLabel);
  const threadStatusRaw = asString(body.threadStatus) ?? asString(metadata.threadStatus);
  const threadStatus =
    threadStatusRaw === "active" || threadStatusRaw === "done" || threadStatusRaw === "blocked"
      ? threadStatusRaw
      : null;
  const requestedRunId = asString(body.runId);
  let runId: string | null = null;
  if (requestedRunId) {
    const linkedRun = await prisma.run.findFirst({
      where: {
        id: requestedRunId,
        tenantId: authContext.tenantId,
        },
      select: { id: true },
    });
    if (linkedRun?.id) runId = linkedRun.id;
  }
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
        txId: asString(body.txId),
        receiptPath: asString(body.receiptPath),
        bundlePath: asString(body.bundlePath),
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
  });

  const proof = await recordConversationMessageProof({
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
    txId: asString(body.txId),
  });

  const messageMetadata: Record<string, unknown> = {
    ...(asObject(message.metadata) ?? {}),
    auditRunId,
    transcriptProof: {
      sequence: proof.sequence,
      entryHash: proof.entryHash,
      prevHash: proof.prevHash,
      contentHash: proof.contentHash,
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
    },
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
        threadStatus: getThreadStatusFromMetadata(metadata),
        runId,
        txId,
        receiptPath,
        bundlePath,
        auditRunId: asString(metadata?.auditRunId),
        transcriptProof: asObject(metadata?.transcriptProof),
        createdAt: toIso(row.createdAt),
      };
    });

  const threadMap = new Map<
    string,
    {
      threadId: string;
      label: string;
      status: "active" | "done" | "blocked";
      firstMessageAt: string;
      lastMessageAt: string;
      messageCount: number;
    }
  >();
  for (const message of messages) {
    if (!message.threadId) continue;
    const label = message.threadLabel ?? "Operação";
    const status =
      message.threadStatus === "done" || message.threadStatus === "blocked" ? message.threadStatus : "active";
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
  const threads = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

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
    messages,
    telemetry: {
      totals: {
        messageToPlanAvgMs: msgPlanMetric?.avg ?? null,
        planToExecuteAvgMs: planExecMetric?.avg ?? null,
        chatToRunCoveragePct: Number(((coverageMetric?.avg ?? 0) * 100).toFixed(2)),
        persistSuccessRatePct: Number(((persistMetric?.avg ?? 0) * 100).toFixed(2)),
      },
      metrics: telemetryMetrics,
    },
  };

  const digest = crypto.createHash("sha256").update(JSON.stringify(exported)).digest("hex");
  return res.json({
    ok: true,
    export: {
      ...exported,
      audit: {
        hash: digest,
        hashAlgo: "sha256",
      },
    },
  });
});
