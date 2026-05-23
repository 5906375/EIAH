import type { PrismaClient } from "@repo/db";
import {
  type ImobCrmDedupeDecision,
  type ImobCrmMatch,
  type ImobCrmRegistrationFlow,
} from "./imobCrmAgentContract";
import { ImobCrmRepository } from "./imobCrmRepository";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function propertyLabel(item: { id: string; metadata?: unknown; propertyType?: string | null; address?: string | null }) {
  const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : null;
  const externalRef = asString(metadata?.externalPropertyRef);
  if (externalRef && !/^property-[a-z0-9_-]+$/i.test(externalRef) && !/^cmn[a-z0-9]+$/i.test(externalRef)) return `Imóvel ${externalRef}`;
  if (item.address) return sanitizeAddressDisplay(item.address) ?? item.address;
  if (item.propertyType) return `Imóvel ${item.propertyType}`;
  return "imóvel cadastrado";
}

function sanitizeAddressDisplay(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/^\s*do\s+im[oó]vel\s+/i, "")
    .replace(/^\s*endere[cç]o(?:\s+do\s+im[oó]vel)?\s*:?\s*/i, "")
    .trim();
}

function buildLeadPendingFieldsFromDraft(draft: Record<string, unknown>) {
  const pending: string[] = [];
  if (!asString(draft.leadName)) pending.push("leadName");
  if (!asString(draft.leadPhone)) pending.push("leadPhone");
  if (!asString(draft.desiredGoal)) pending.push("desiredGoal");
  if (!asString(draft.desiredCity)) pending.push("desiredCity");
  if (!Number.isFinite(Number(draft.budgetMax))) pending.push("budgetMax");
  return pending;
}

function buildOwnerPendingFieldsFromDraft(draft: Record<string, unknown>) {
  const pending: string[] = [];
  if (!asString(draft.ownerName)) pending.push("ownerName");
  if (!asString(draft.ownerPhone)) pending.push("ownerPhone");
  if (!asString(draft.ownerEmail)) pending.push("ownerEmail");
  if (!asString(draft.ownerDocument)) pending.push("ownerDocument");
  return pending;
}

function buildPropertyPendingFieldsFromDraft(draft: Record<string, unknown>) {
  const pending: string[] = [];
  if (!asString(draft.propertyType)) pending.push("propertyType");
  if (!asString(draft.goal)) pending.push("goal");
  if (!asString(draft.city)) pending.push("city");
  if (!asString(draft.address)) pending.push("address");
  return pending;
}

function hydrateLeadDraftFromExisting(draft: Record<string, unknown>, lead: any) {
  return {
    ...draft,
    leadName: asString(draft.leadName) ?? asString(lead?.name) ?? null,
    leadPhone: asString(draft.leadPhone) ?? asString(lead?.phone) ?? null,
    leadEmail: asString(draft.leadEmail) ?? asString(lead?.email) ?? null,
    desiredGoal: asString(draft.desiredGoal) ?? asString(lead?.goal) ?? null,
    desiredCity: asString(draft.desiredCity) ?? asString(lead?.targetCity) ?? null,
    budgetMax: numberOrNull(draft.budgetMax) ?? (typeof lead?.budgetMaxCents === "number" ? Math.round(lead.budgetMaxCents / 100) : null),
  };
}

function hydrateOwnerDraftFromExisting(draft: Record<string, unknown>, owner: any) {
  return {
    ...draft,
    ownerName: asString(draft.ownerName) ?? asString(owner?.name) ?? null,
    ownerPhone: asString(draft.ownerPhone) ?? asString(owner?.phone) ?? null,
    ownerEmail: asString(draft.ownerEmail) ?? asString(owner?.email) ?? null,
    ownerDocument: asString(draft.ownerDocument) ?? asString(owner?.document) ?? null,
  };
}

function hydratePropertyDraftFromExisting(draft: Record<string, unknown>, property: any) {
  return {
    ...draft,
    propertyType: asString(draft.propertyType) ?? asString(property?.propertyType) ?? null,
    goal: asString(draft.goal) ?? asString(property?.goal) ?? null,
    city: asString(draft.city) ?? asString(property?.city) ?? null,
    neighborhood: asString(draft.neighborhood) ?? asString(property?.neighborhood) ?? null,
    bedrooms: numberOrNull(draft.bedrooms) ?? property?.bedrooms ?? null,
    bathrooms: numberOrNull(draft.bathrooms) ?? property?.bathrooms ?? null,
    address: asString(draft.address) ?? asString(property?.address) ?? null,
  };
}

function match(type: ImobCrmMatch["type"], id: string, label: string, confidence: number): ImobCrmMatch {
  return { type, id, label, confidence };
}

function hydrateDecision(params: {
  flow: ImobCrmRegistrationFlow;
  entity: ImobCrmMatch;
  existingLabel: string;
  draft: Record<string, unknown>;
  pendingFields: string[];
}): ImobCrmDedupeDecision {
  return { kind: "hydrate", ...params };
}

export async function resolveImobCrmRegistrationDedupe(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  flow: string | null;
  draft: Record<string, unknown>;
  caseEntityId?: string | null;
}): Promise<ImobCrmDedupeDecision> {
  const repo = new ImobCrmRepository(params.prisma);
  const scope = { tenantId: params.tenantId, workspaceId: params.workspaceId };

  if (params.flow === "lead.qualify") {
    const caseLeadId = asString(params.caseEntityId);
    if (caseLeadId) {
      const existingLead = await repo.getLead(scope, caseLeadId);
      if (existingLead) {
        const draft = hydrateLeadDraftFromExisting(params.draft, existingLead);
        return hydrateDecision({
          flow: "lead.qualify",
          entity: match("lead", existingLead.id, existingLead.name, 1),
          existingLabel: `o lead ${existingLead.name}`,
          draft,
          pendingFields: buildLeadPendingFieldsFromDraft(draft),
        });
      }
    }

    const existingLead = await repo.findLeadByStrongIdentifiers(scope, {
      phone: asString(params.draft.leadPhone),
      email: asString(params.draft.leadEmail),
    });
    if (existingLead) {
      const draft = hydrateLeadDraftFromExisting(params.draft, existingLead);
      return hydrateDecision({
        flow: "lead.qualify",
        entity: match("lead", existingLead.id, existingLead.name, 0.98),
        existingLabel: `o lead ${existingLead.name}`,
        draft,
        pendingFields: buildLeadPendingFieldsFromDraft(draft),
      });
    }

    const leadName = asString(params.draft.leadName);
    const hasStrongIdentifier = Boolean(asString(params.draft.leadPhone) || asString(params.draft.leadEmail));
    if (!leadName || hasStrongIdentifier) return { kind: "none" };

    const matches = await repo.findLeadsByName(scope, leadName);
    if (matches.length === 1) {
      const item = matches[0];
      return {
        kind: "choice",
        flow: "lead.qualify",
        title: `Lead ${item.name} já existe`,
        text: `Encontrei um lead ${item.name} já cadastrado neste workspace. Quer atualizar esse cadastro existente ou criar um novo?`,
        lines: [item.phone ? `Telefone: ${item.phone}` : null, item.email ? `E-mail: ${item.email}` : null, item.goal ? `Objetivo: ${item.goal}` : null, item.targetCity ? `Cidade: ${item.targetCity}` : null].filter(Boolean) as string[],
        nextMessages: [`atualizar lead ${item.phone ?? item.email ?? item.name}`, `criar novo lead ${leadName}`, `listar leads ${leadName}`],
        matches: [match("lead", item.id, item.name, 0.72)],
      };
    }
    if (matches.length > 1) {
      return {
        kind: "choice",
        flow: "lead.qualify",
        title: `Encontrei ${matches.length} leads com esse nome`,
        text: `Existe mais de um lead chamado ${leadName} neste workspace. Escolha qual cadastro quer usar antes de continuar.`,
        lines: matches.map((item) => `${item.name}${item.phone ? ` | ${item.phone}` : ""}${item.email ? ` | ${item.email}` : ""}`),
        nextMessages: [`listar leads ${leadName}`, `criar novo lead ${leadName}`],
        matches: matches.map((item) => match("lead", item.id, item.name, 0.55)),
      };
    }
  }

  if (params.flow === "owner.create") {
    const existingOwner = await repo.findOwnerByStrongIdentifiers(scope, {
      document: asString(params.draft.ownerDocument),
      phone: asString(params.draft.ownerPhone),
      email: asString(params.draft.ownerEmail),
    });
    if (existingOwner) {
      const draft = hydrateOwnerDraftFromExisting(params.draft, existingOwner);
      return hydrateDecision({
        flow: "owner.create",
        entity: match("owner", existingOwner.id, existingOwner.name, 0.98),
        existingLabel: `o proprietário ${existingOwner.name}`,
        draft,
        pendingFields: buildOwnerPendingFieldsFromDraft(draft),
      });
    }

    const ownerName = asString(params.draft.ownerName);
    const hasStrongIdentifier = Boolean(asString(params.draft.ownerDocument) || asString(params.draft.ownerPhone) || asString(params.draft.ownerEmail));
    if (!ownerName || hasStrongIdentifier) return { kind: "none" };

    const matches = await repo.findOwnersByName(scope, ownerName);
    if (matches.length === 1) {
      const item = matches[0];
      return {
        kind: "choice",
        flow: "owner.create",
        title: `Proprietário ${item.name} já existe`,
        text: `Encontrei um proprietário ${item.name} já cadastrado neste workspace. Quer atualizar esse cadastro existente ou criar um novo?`,
        lines: [item.phone ? `Telefone: ${item.phone}` : null, item.email ? `E-mail: ${item.email}` : null, item.document ? `Documento: ${item.document}` : null].filter(Boolean) as string[],
        nextMessages: [`editar proprietário ${item.id}`, `criar novo proprietário ${ownerName}`, `listar proprietários ${ownerName}`],
        matches: [match("owner", item.id, item.name, 0.72)],
      };
    }
    if (matches.length > 1) {
      return {
        kind: "choice",
        flow: "owner.create",
        title: `Encontrei ${matches.length} proprietários com esse nome`,
        text: `Existe mais de um proprietário chamado ${ownerName} neste workspace. Escolha qual cadastro quer usar antes de continuar.`,
        lines: matches.map((item) => `${item.name}${item.phone ? ` | ${item.phone}` : ""}${item.email ? ` | ${item.email}` : ""}`),
        nextMessages: [`listar proprietários ${ownerName}`, `criar novo proprietário ${ownerName}`],
        matches: matches.map((item) => match("owner", item.id, item.name, 0.55)),
      };
    }
  }

  if (params.flow === "property.create") {
    // Evita dedupe precoce por endereço no chat de captação.
    // A reconciliação final continua no upsert da mutation service.
    return { kind: "none" };
  }

  return { kind: "none" };
}
