export type JsonObject = Record<string, unknown>;

/** Permissão de etapa do IMOB (`canWorkspaceOperateImobStage` já aplicada às permissões da pessoa do turno). */
export type ImobStageGate = (stage: string | null | undefined) => boolean;

/**
 * Leitor de casos com a permissão de etapa aplicada (P12). Sem gate, delega ao Prisma como antes. Com gate:
 * - caso por id: devolve o caso só se a etapa for permitida (senão null, como "não encontrado": sem dado e sem oráculo);
 * - seleção implícita ("o mais recente", com `orderBy`): o mais recente ENTRE os de etapa permitida (janela de 25); nenhum => null.
 * Nunca devolve dados de um caso cuja etapa a pessoa não opera.
 */
export function scopedImobCases(prisma: any, canOperateStage?: ImobStageGate) {
  return {
    async findFirst(args: any): Promise<any> {
      if (!canOperateStage) return prisma.imobCase.findFirst(args);
      if (args?.orderBy) {
        const candidates = await prisma.imobCase.findMany({ ...args, take: 25 });
        return candidates.find((candidate: any) => canOperateStage(candidate?.stage)) ?? null;
      }
      const found = await prisma.imobCase.findFirst(args);
      return found && canOperateStage(found.stage) ? found : null;
    },
  };
}

/**
 * Escopo de etapa para as demais entidades do IMOB lidas pelos resolvedores (P12.2). A "etapa" de cada entidade é o campo
 * que o domínio já usa para ela: caso e lead => `stage`; owner e imóvel => `status`. A decisão é a mesma `canOperateStage`
 * (permissões `imob.stage.*` da pessoa do turno). Só leituras (`findFirst`/`findMany`/`findUnique`) são filtradas; nada
 * de etapa não permitida é devolvido, seja por id, por critério ou por seleção implícita ("o mais recente").
 */
const IMOB_STAGE_FIELD_BY_DELEGATE: Readonly<Record<string, string>> = {
  imobCase: "stage",
  imobOwner: "status",
  imobProperty: "status",
  imobLead: "stage",
};
const IMOB_STAGE_SCAN_WINDOW = 25;
// Etapa improvável: se o gate a permite, a pessoa opera todas as etapas (curinga) e nada precisa ser filtrado.
const IMOB_STAGE_UNRESTRICTED_PROBE = "__p12_unrestricted_probe__";

function withStageField(args: any, field: string) {
  if (args?.select && typeof args.select === "object" && !args.select[field]) {
    return { args: { ...args, select: { ...args.select, [field]: true } }, added: true };
  }
  return { args, added: false };
}

function stripStageField(row: any, field: string, added: boolean) {
  if (!added || !row || typeof row !== "object") return row;
  const { [field]: _omitted, ...rest } = row;
  return rest;
}

function scopedDelegate(delegate: any, field: string, gate: ImobStageGate) {
  const allowed = (row: any) => gate(row?.[field]);
  return new Proxy(delegate, {
    get(target, prop) {
      if (prop === "findFirst") {
        return async (args: any) => {
          const { args: scoped, added } = withStageField(args, field);
          if (typeof target.findMany === "function") {
            const rows = await target.findMany({ ...scoped, take: IMOB_STAGE_SCAN_WINDOW });
            const found = rows.find(allowed);
            return found ? stripStageField(found, field, added) : null;
          }
          const found = await target.findFirst(scoped);
          return found && allowed(found) ? stripStageField(found, field, added) : null;
        };
      }
      if (prop === "findMany") {
        return async (args: any) => {
          const { args: scoped, added } = withStageField(args, field);
          const rows = await target.findMany(scoped);
          return rows.filter(allowed).map((row: any) => stripStageField(row, field, added));
        };
      }
      if (prop === "findUnique") {
        return async (args: any) => {
          const { args: scoped, added } = withStageField(args, field);
          const found = await target.findUnique(scoped);
          return found && allowed(found) ? stripStageField(found, field, added) : null;
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function scopeImobPrismaToStage<T>(prisma: T, canOperateStage?: ImobStageGate): T {
  if (!prisma || typeof prisma !== "object" || typeof canOperateStage !== "function") return prisma;
  if (canOperateStage(IMOB_STAGE_UNRESTRICTED_PROBE)) return prisma;
  const delegates = new Map<string, unknown>();
  return new Proxy(prisma as object, {
    get(target, prop) {
      if (typeof prop === "string" && prop in IMOB_STAGE_FIELD_BY_DELEGATE) {
        if (!delegates.has(prop)) {
          const delegate = Reflect.get(target, prop);
          delegates.set(prop, delegate ? scopedDelegate(delegate, IMOB_STAGE_FIELD_BY_DELEGATE[prop], canOperateStage) : delegate);
        }
        return delegates.get(prop);
      }
      if (prop === "$transaction") {
        return (work: unknown, options?: unknown) => (typeof work === "function"
          ? (target as any).$transaction((tx: unknown) => (work as (tx: unknown) => unknown)(scopeImobPrismaToStage(tx, canOperateStage)), options)
          : (target as any).$transaction(work, options));
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

/** Aplica o escopo de etapa ao `prisma` dos parâmetros do resolvedor; sem gate (ou com curinga) devolve os mesmos parâmetros. */
export function withStageScopedPrisma<T extends { prisma?: unknown; canOperateStage?: ImobStageGate }>(params: T): T {
  const scoped = scopeImobPrismaToStage(params.prisma, params.canOperateStage);
  return scoped === params.prisma ? params : { ...params, prisma: scoped };
}
export type OperationalResolution = Record<string, unknown>;
export type LookupCondition = Partial<Record<"document" | "phone" | "email" | "name", string>>;
export type ThreadStateLike = Record<string, unknown> | null | undefined;
export type CountSummary = { properties?: number; cases?: number; events?: number };

export type OwnerSummary = {
  id: string;
  name: string;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
  pendingItems?: unknown;
  metadata?: unknown;
  _count?: CountSummary;
};

export type LeadSummary = {
  id: string;
  name?: string | null;
  stage?: string | null;
  goal?: string | null;
  phone?: string | null;
  email?: string | null;
  targetCity?: string | null;
  budgetMaxCents?: number | null;
  temperature?: string | null;
  pendingItems?: unknown;
};

export type PropertySummary = {
  id: string;
  status?: string | null;
  propertyType?: string | null;
  goal?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  askingPriceCents?: number | null;
  pendingItems?: unknown;
  metadata?: unknown;
  owner?: { id?: string; name?: string | null } | null;
  _count?: CountSummary;
};

export type CaseSummary = {
  id: string;
  flow: string;
  ownerId?: string | null;
  propertyId?: string | null;
  leadId?: string | null;
  stage?: string | null;
  status?: string | null;
  nextStep?: string | null;
  pendingItems?: unknown;
  blockers?: unknown;
  ownerResponsible?: string | null;
  threadId?: string | null;
  updatedAt?: unknown;
  lead?: { id?: string; name?: string | null; phone?: string | null; email?: string | null } | null;
  owner?: { id?: string; name?: string | null } | null;
  property?: { id?: string; propertyType?: string | null; city?: string | null; neighborhood?: string | null } | null;
  _count?: CountSummary;
};

export type PrismaLike = {
  imobOwner: {
    findFirst(args: JsonObject): Promise<OwnerSummary | null>;
    findMany(args: JsonObject): Promise<OwnerSummary[]>;
    update(args: JsonObject): Promise<OwnerSummary>;
    count(args: JsonObject): Promise<number>;
  };
  imobLead: {
    findFirst(args: JsonObject): Promise<LeadSummary | null>;
    findMany(args: JsonObject): Promise<LeadSummary[]>;
    update(args: JsonObject): Promise<LeadSummary>;
  };
  imobProperty: {
    findFirst(args: JsonObject): Promise<PropertySummary | null>;
    findMany(args: JsonObject): Promise<PropertySummary[]>;
    update(args: JsonObject): Promise<PropertySummary>;
    count(args: JsonObject): Promise<number>;
  };
  imobCase: {
    findFirst(args: JsonObject): Promise<CaseSummary | null>;
    findMany(args: JsonObject): Promise<CaseSummary[]>;
    count(args: JsonObject): Promise<number>;
  };
};

export type ImobOperationalResolverParams = {
  prisma: PrismaLike;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  message: string;
  caseId?: string | null;
  threadState: ThreadStateLike;
  /** P12: permissão de ETAPA da pessoa do turno; toda leitura de caso (explícita ou "o mais recente") só vale em etapa permitida. */
  canOperateStage?: ImobStageGate;
};

export type ResolverHelpers = {
  auditAgentId: string;
  resolveImobCrmOperationalUpdate: (params: any) => Promise<OperationalResolution | null>;
  resolveImobCrmOperationalConsult: (params: any) => Promise<OperationalResolution | null>;
  normalizeImobRouteText: (value: string) => string;
  extractOwnerNameFromMessage: (message: string) => string | null;
  extractOwnerExplicitNameFromMessage: (message: string) => string | null;
  extractOwnerExplicitPhoneFromMessage: (message: string) => string | null;
  extractOwnerExplicitEmailFromMessage: (message: string) => string | null;
  extractOwnerExplicitDocumentFromMessage: (message: string) => string | null;
  extractLeadNameFromMessage: (message: string) => string | null;
  extractDocumentFromMessage: (message: string) => string | null;
  extractAddressFromMessage: (message: string) => string | null;
  extractExplicitAddressFieldFromMessage: (message: string) => string | null;
  extractPropertyRefFromMessage: (message: string) => string | null;
  extractLeadPhoneFromMessage: (message: string) => string | null;
  extractLeadEmailFromMessage: (message: string) => string | null;
  extractLeadGoalFromMessage: (message: string) => string | null;
  extractAmountAfterKeywords: (message: string, keywords: string[]) => number | null;
  extractFreeformCityAfterKeywords: (message: string, keywords: string[]) => string | null;
  extractOwnerCrudIdFromMessage: (message: string) => string | null;
  extractPropertyCrudIdFromMessage: (message: string) => string | null;
  extractPropertyTypeFromMessage: (message: string) => string | null;
  extractPropertyGoalFromMessage: (message: string) => string | null;
  extractPropertyCityFromMessage: (message: string) => string | null;
  resolveOwnerDisplayName: (params: any) => Promise<string>;
  recordImobCrmAuditEvent: (params: any) => Promise<void>;
  resolveOwnerDocumentForDisplay: (owner: OwnerSummary) => string | null;
  formatImobStatusLabel: (status: string | null | undefined) => string;
  formatImobPendingList: (items: string[] | null | undefined) => string;
  createEmptyThreadState: () => ThreadStateLike;
  formatBudgetCentsForImob: (value: number | null | undefined) => string | null;
  formatPropertyLookupLabel: (item: PropertySummary) => string;
  isOwnerDeleteConfirmationMessage: (message: string) => boolean;
  isPropertyDeleteConfirmationMessage: (message: string) => boolean;
  asObject: (value: unknown) => JsonObject | null;
  asString: (value: unknown) => string | null;
  asStringList: (value: unknown) => string[];
  buildOwnerPendingSuggestion: (owner: { name: string; pendingItems?: unknown }) => string | null;
  buildLeadPendingSuggestion: (lead: { name: string; pendingItems?: unknown }) => string | null;
  buildPropertyPendingSuggestion: (property: { id?: string; address?: string | null; pendingItems?: unknown }) => string | null;
  extractListCityFilter: (message: string) => string | null;
  resolveImobBusinessReadIntent: (message: string) => string | null;
  buildCaseContextFromRecord: (item: CaseSummary) => any;
  formatImobCaseFlowLabel: (flow: string) => string;
  buildImobBusinessReadPresentation: (params: any) => OperationalResolution;
  /**
   * Disponibilidade REAL dos especialistas de apoio (agents.ts), no escopo do tenant e do workspace.
   * Ausente ou com falha => os especialistas ficam "unverified" e nenhuma ação é apresentada (fail-closed).
   */
  readBackingSpecialistAvailability?: (params: { prisma: unknown; tenantId: string; workspaceId: string }) => Promise<Record<string, unknown> | null | undefined>;
  /**
   * Descoberta somente leitura das capacidades transversais que o caso declara (domínio + capacidade). Ausente ou com
   * falha => nenhum cartão transversal é apresentado.
   */
  readTransversalCapabilities?: (params: { prisma: unknown; tenantId: string; workspaceId: string; userId?: string | null; caseContext: unknown; operational: unknown }) => Promise<unknown[] | null | undefined>;
  isBulkPropertyOnboardingQuestion: (normalized: string) => boolean;
  buildBulkPropertyOnboardingConsult: (params: { threadState: ThreadStateLike }) => OperationalResolution;
  isImobRecentRegistrationReadRequest: (normalized: string) => boolean;
  buildImobRecentRegistrationConsult: (params: any) => Promise<OperationalResolution>;
  titleCaseRouteWords: (value: string) => string;
  findOwnerIdByAuditName: (params: any) => Promise<string | null>;
  buildOwnerUpdateForm: (owner: OwnerSummary, displayName?: string | null) => OperationalResolution;
  buildPropertyUpdateForm: (property: PropertySummary) => OperationalResolution;
};

export const OWNER_DOCUMENT_PENDING_KEYS = new Set(["ownerDocument", "documento do proprietário"]);
export const OWNER_NAME_PENDING_KEYS = new Set(["ownerName", "nome do proprietário"]);
export const OWNER_PHONE_PENDING_KEYS = new Set(["ownerPhone", "telefone do proprietário"]);
export const OWNER_EMAIL_PENDING_KEYS = new Set(["ownerEmail", "e-mail do proprietário", "email do proprietário"]);

export function asPendingItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function mapOwnerPendingLabels(items: unknown): string[] {
  return asPendingItems(items).map((item) => {
    if (OWNER_NAME_PENDING_KEYS.has(item)) return "nome do proprietário";
    if (OWNER_PHONE_PENDING_KEYS.has(item)) return "telefone do proprietário";
    if (OWNER_EMAIL_PENDING_KEYS.has(item)) return "e-mail do proprietário";
    if (OWNER_DOCUMENT_PENDING_KEYS.has(item)) return "documento do proprietário";
    return item;
  });
}

export function removeResolvedOwnerPendingItems(
  items: unknown,
  resolved: {
    ownerName?: boolean;
    ownerPhone?: boolean;
    ownerEmail?: boolean;
    ownerDocument?: boolean;
  },
) {
  return asPendingItems(items).filter((item) => {
    if (resolved.ownerName && OWNER_NAME_PENDING_KEYS.has(item)) return false;
    if (resolved.ownerPhone && OWNER_PHONE_PENDING_KEYS.has(item)) return false;
    if (resolved.ownerEmail && OWNER_EMAIL_PENDING_KEYS.has(item)) return false;
    if (resolved.ownerDocument && OWNER_DOCUMENT_PENDING_KEYS.has(item)) return false;
    return true;
  });
}

export function filterResolvedLeadPendingItems(lead: Pick<LeadSummary, "pendingItems" | "budgetMaxCents">) {
  return asPendingItems(lead.pendingItems).filter((item) => !(item === "faixa de orçamento" && lead.budgetMaxCents !== null && lead.budgetMaxCents !== undefined));
}

export function buildLookupConditions(conditions: Array<LookupCondition | null>): LookupCondition[] {
  return conditions.filter((condition): condition is LookupCondition => Boolean(condition));
}

export function hasStringId(value: { id?: string } | null | undefined): value is { id: string } {
  return typeof value?.id === "string" && value.id.length > 0;
}

export type ImobOperationalUpdateContext = {
  intentVersion?: string;
  intentSignals?: string[];
  normalized: string;
  ownerName: string | null;
  ownerExplicitName: string | null;
  ownerExplicitPhone: string | null;
  ownerExplicitEmail: string | null;
  ownerExplicitDocument: string | null;
  leadName: string | null;
  document: string | null;
  address: string | null;
  explicitAddress: string | null;
  propertyRef: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadGoal: string | null;
  budgetCents: number | null;
  priceCents: number | null;
  targetCity: string | null;
  asksEdit: boolean;
  asksDelete: boolean;
  ownerCrudId: string | null;
  propertyCrudId: string | null;
  propertyType: string | null;
  propertyGoal: string | null;
  propertyCity: string | null;
  asksLinkOwner: boolean;
};

export type ImobOperationalConsultContext = {
  intentVersion?: string;
  intentSignals?: string[];
  normalized: string;
  ownerNameHint: string | null;
  propertyRefHint: string | null;
  addressHint: string | null;
  wantsLead: boolean;
  wantsCase: boolean;
  wantsOwner: boolean;
  wantsProperty: boolean;
  asksLeadCases: boolean;
  asksCurrentCase: boolean;
  asksCaseStatus: boolean;
  asksMissing: boolean;
  asksShow: boolean;
  asksLeadList: boolean;
  asksOwnerList: boolean;
  asksPropertyList: boolean;
  asksPendingOnly: boolean;
  asksQualifiedOnly: boolean;
  asksReadyForReview: boolean;
  asksEdit: boolean;
  asksDelete: boolean;
  ownerCrudId: string | null;
  propertyCrudId: string | null;
  asksGoalRent: boolean;
  asksGoalSale: boolean;
  listCityFilter: string | null;
  businessReadIntent: string | null;
  hasOperationalTarget?: boolean;
  hasOperationalAction?: boolean;
};
