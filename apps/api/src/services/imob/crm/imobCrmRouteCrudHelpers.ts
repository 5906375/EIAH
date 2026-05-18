import type { PrismaClient } from "@repo/db";
import { IMOB_CRM_PROPERTY_GOAL_OPTIONS, normalizeImobCrmPropertyGoal } from "./imobCrmPropertyGoals";
import {
  findImobCrmPropertyTypeInText,
  getImobCrmPropertyTypeKeywordPattern,
  getImobCrmPropertyTypeLabel,
  IMOB_CRM_PROPERTY_TYPE_OPTIONS,
  normalizeImobCrmPropertyType,
} from "./imobCrmPropertyTypes";

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

function digitsOnly(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

export function extractPropertyTypeFromMessage(raw: string) {
  const match = raw.match(/(?:tipo do imovel|tipo do imóvel)\s*:?\s*([^,.;\n]+)/i);
  const explicitValue = match?.[1]?.trim() ?? null;
  return normalizeImobCrmPropertyType(explicitValue) ?? findImobCrmPropertyTypeInText(explicitValue) ?? findImobCrmPropertyTypeInText(raw);
}

export function extractPropertyGoalFromMessage(raw: string) {
  const match = raw.match(/(?:finalidade do imovel|finalidade do imóvel)\s*:?\s*([^,.;\n]+)/i);
  return normalizeImobCrmPropertyGoal(match?.[1]?.trim() ?? null);
}

export function extractLeadGoalFromMessage(raw: string) {
  const match = raw.match(
    /(?:(?:objetivo|finalidade) do (?:lead|cliente|comprador|compradora|locatario|locatário|locataria|locatária))\s*:?\s*([^,.;\n]+)/i,
  );
  return normalizeImobCrmPropertyGoal(match?.[1]?.trim() ?? null);
}

export function extractPropertyCityFromMessage(raw: string) {
  const match = raw.match(/(?:cidade do imovel|cidade do imóvel)\s*:?\s*([^,.;\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

export function extractOwnerExplicitNameFromMessage(raw: string) {
  const match = raw.match(new RegExp("(?:nome do (?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))\\s*:?\\s*([^,.;\\n]+)", "i"));
  const candidate = match?.[1]
    ? match[1]
      .split(/\b(?:telefone|e-mail|email|documento|cpf|cnpj)\b/i)[0]
      .trim()
    : null;
  return candidate ? sanitizeOwnerDisplayName(titleCaseWords(candidate), "") || null : null;
}

export function extractOwnerExplicitPhoneFromMessage(raw: string) {
  const match = raw.match(/(?:telefone do (?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const phoneMatch = match[1].match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  return phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : null;
}

export function extractOwnerExplicitEmailFromMessage(raw: string) {
  const match = raw.match(/(?:e-mail do (?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador)|email do (?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\s,;]+)/i);
  return match?.[1] ? match[1].trim().toLowerCase() : null;
}

export function extractOwnerExplicitDocumentFromMessage(raw: string) {
  const match = raw.match(/(?:(?:documento|cpf|cnpj) do (?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))\s*:?\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const candidate = match[1].match(/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b|\b\d{11}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}\b|\b\d{14}\b/);
  return candidate?.[0] ?? null;
}

export function extractExplicitAddressFieldFromMessage(raw: string) {
  const match = raw.match(new RegExp("(?:endereco|endereço)(?: do imovel| do imóvel)?\\s*:?\\s*([^,.;\\n]+(?:,[^.;\\n]+)?)", "i"));
  return match?.[1]?.trim() ?? null;
}

export function extractOwnerCrudIdFromMessage(raw: string) {
  const normalized = normalizeImobCrmText(raw);
  const match = normalized.match(/(?:atualizar|editar|alterar|confirmar exclusao do|confirmo exclusao do|confirmar exclusao de|confirmo exclusao de|confirmar arquivamento do|confirmo arquivamento do|confirmar arquivamento de|confirmo arquivamento de|arquivar)\s+(?:proprietario|proprietaria|dono|vendedor|locador)\s+([a-z0-9]{20,})/i);
  return match?.[1] ?? null;
}

export function extractPropertyCrudIdFromMessage(raw: string) {
  const normalized = normalizeImobCrmText(raw);
  const propertyKeywordPattern = getImobCrmPropertyTypeKeywordPattern();
  const match = normalized.match(new RegExp(`(?:atualizar|editar|alterar|confirmar exclusao do|confirmo exclusao do|confirmar exclusao de|confirmo exclusao de|confirmar arquivamento do|confirmo arquivamento do|confirmar arquivamento de|confirmo arquivamento de|arquivar)\\s+(?:imovel|${propertyKeywordPattern})\\s+([a-z0-9]{20,})`, "i"));
  return match?.[1] ?? null;
}

export function isOwnerDeleteConfirmationMessage(raw: string) {
  const normalized = normalizeImobCrmText(raw);
  return /((confirmar exclusao d[oe]|confirmo exclusao d[oe])\s+(proprietario|proprietaria|dono|vendedor|locador)|(confirmar arquivamento d[oe]|confirmo arquivamento d[oe]|arquivar)\s+(proprietario|proprietaria|dono|vendedor|locador))/.test(normalized);
}

export function isPropertyDeleteConfirmationMessage(raw: string) {
  const normalized = normalizeImobCrmText(raw);
  const propertyKeywordPattern = getImobCrmPropertyTypeKeywordPattern();
  return new RegExp(`((confirmar exclusao d[oe]|confirmo exclusao d[oe])\\s+(imovel|${propertyKeywordPattern})|(confirmar arquivamento d[oe]|confirmo arquivamento d[oe]|arquivar)\\s+(imovel|${propertyKeywordPattern}))`, "i").test(normalized);
}

export async function recordImobCrmAuditEvent(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  agentId: string;
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
      agentId: params.agentId,
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
  const normalized = normalizeImobCrmText(trimmed);
  if (normalized === "null" || normalized === "undefined" || normalized === "none") return true;
  return /^cmn[a-z0-9]*$/i.test(trimmed);
}

export function sanitizeOwnerDisplayName(value: string | null | undefined, fallback = "Proprietário") {
  return isSuspiciousOwnerDisplayName(value) ? fallback : (value?.trim() || fallback);
}

export function resolveOwnerDocumentForDisplay(owner: { document?: string | null; phone?: string | null; pendingItems?: unknown }) {
  const document = asString(owner.document);
  if (!document) return null;
  const sameAsPhone = digitsOnly(document) && digitsOnly(document) === digitsOnly(owner.phone);
  const stillPendingDocument = asStringList(owner.pendingItems).includes("ownerDocument") || asStringList(owner.pendingItems).includes("documento do proprietário");
  if (sameAsPhone && stillPendingDocument) return null;
  return document;
}

export async function resolveOwnerDisplayName(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  owner: { id: string; name?: string | null };
}) {
  if (!isSuspiciousOwnerDisplayName(params.owner.name)) {
    return sanitizeOwnerDisplayName(params.owner.name);
  }

  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: "crm.audit",
      agentId: params.agentId,
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

  return sanitizeOwnerDisplayName(params.owner.name);
}

export async function findOwnerIdByAuditName(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  name: string;
}) {
  const target = normalizeImobCrmText(params.name);
  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: "crm.audit",
      agentId: params.agentId,
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
      if (typeof candidate === "string" && normalizeImobCrmText(candidate) === target) {
        return subjectId;
      }
    }
  }

  return null;
}

export function buildOwnerUpdateForm(owner: any, displayName?: string | null) {
  const resolvedName = sanitizeOwnerDisplayName(displayName ?? owner.name, "");
  const resolvedDocument = resolveOwnerDocumentForDisplay(owner) ?? "";
  return {
    entity: "proprietario",
    action: "update",
    title: "Editar proprietário",
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

export function buildPropertyUpdateForm(property: any) {
  const normalizedPropertyType = normalizeImobCrmPropertyType(property.propertyType) ?? null;
  const propertyMetadata = asObject(property.metadata);
  const propertyCep = asString(propertyMetadata?.cep) ?? "";
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
        required: true,
        placeholder: "",
        value: normalizedPropertyType ?? "",
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
        required: true,
        placeholder: "",
        value: normalizeImobCrmPropertyGoal(property.goal) ?? "",
        options: IMOB_CRM_PROPERTY_GOAL_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
      {
        name: "cep",
        label: "CEP",
        type: "text",
        inputMode: "numeric",
        maxLength: 9,
        value: propertyCep,
        lookup: {
          kind: "cep",
          autoFillTargets: {
            city: "city",
            address: "address",
          },
        },
      },
      { name: "city", label: "Cidade", type: "text", required: true, placeholder: "", value: property.city ?? "" },
      { name: "address", label: "Endereço", type: "text", required: true, placeholder: "", value: property.address ?? "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  } as any;
}

export function formatPropertyLookupLabel(item: { id: string; metadata?: unknown; propertyType?: string | null; address?: string | null }) {
  const metadata = asObject(item.metadata);
  const externalRef = asString(metadata?.externalPropertyRef);
  if (externalRef) return `Imóvel ${externalRef}`;
  if (item.address) return item.address;
  if (item.propertyType) return `Imóvel ${getImobCrmPropertyTypeLabel(item.propertyType)}`;
  return "Imóvel cadastrado";
}
