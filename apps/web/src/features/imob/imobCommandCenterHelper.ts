import type { ImobCase } from "@/lib/api";

function imobCaseAgeHours(updatedAt: string) {
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, (Date.now() - parsed) / 36e5);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildImobCaseRiskLabel(item: ImobCase) {
  const blockers = asStringArray(item.blockers);
  if (blockers.length > 0) return blockers.slice(0, 2).join(", ");
  const pending = asStringArray(item.pendingItems);
  if (pending.length > 0) return pending.slice(0, 2).join(", ");
  return item.stage || "—";
}

function formatImobJourneyTypeLabel(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Qualificação";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "commission") return "Comissão";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

export function buildImobCasePriority(item: ImobCase) {
  const blocked = asStringArray(item.canonical?.blockedActions).length;
  const missing = asStringArray(item.canonical?.missingContext).length;
  const recommended = item.canonical?.recommendedActions?.length ?? 0;
  const ageHours = imobCaseAgeHours(item.updatedAt);
  const score =
    blocked * 5 + missing * 3 + Math.min(4, Math.floor(ageHours / 12)) + (recommended === 0 ? 2 : 0);
  const label = blocked > 0 ? "alta" : missing > 0 || ageHours >= 24 ? "média" : "normal";
  return { score, label };
}

export function buildImobCaseFallbackActions(
  item: ImobCase,
): Array<{ id: string; label: string; inputHint: string }> {
  const pending = asStringArray(item.pendingItems).map((entry) => entry.toLowerCase());
  const flow = (item.flow ?? "").trim().toLowerCase();
  const joined = pending.join(" ");
  const actions: Array<{ id: string; label: string; inputHint: string }> = [];
  const addAction = (id: string, label: string, inputHint: string) => {
    if (actions.some((current) => current.id === id)) return;
    actions.push({ id, label, inputHint });
  };

  if (flow.includes("owner.create") || joined.includes("propriet")) {
    addAction("owner.register", "Cadastrar proprietário", "cadastrar proprietário deste caso");
  }
  if (flow.includes("property.create") || joined.includes("imóvel") || joined.includes("imovel")) {
    addAction("property.create", "Cadastrar imóvel", "cadastrar imóvel deste caso");
  }
  if (joined.includes("document") || flow.includes("documents.collect")) {
    addAction("documents.review", "Revisar documentos", "revisar documentos deste caso");
  }
  if (flow.includes("lead.qualify") || joined.includes("lead")) {
    addAction("lead.qualify", "Qualificar lead", "qualificar lead deste caso");
  }
  addAction("case.consult", "Consultar caso", "consultar caso deste atendimento");

  return actions.slice(0, 4);
}

export function mapImobStatusFilterToCaseStatus(filter: string): string | undefined {
  if (filter === "all") return undefined;
  if (filter === "pending_data") return "pending_data";
  if (filter === "ready_for_review") return "ready_for_review";
  if (filter === "blocked") return "blocked";
  if (filter === "done") return "done";
  return "__none__";
}

export function formatImobProcessLabel(flow: string | null | undefined) {
  if (flow === "owner.create") return "Proprietário";
  if (flow === "property.create") return "Captação";
  if (flow === "listing.activate") return "Captação";
  if (flow === "lead.qualify") return "Lead";
  if (flow === "visit.schedule") return "Visita";
  if (flow === "documents.collect") return "Documentação";
  if (flow === "proposal.create") return "Proposta";
  if (flow === "deal.review") return "Negociação";
  if (flow === "contract.prepare") return "Contrato";
  if (flow === "commission.settle") return "Comissão";
  if (flow === "rules.configure") return "Regras de temporada";
  return "Caso";
}

export function formatImobCaseStatusLabel(status: string) {
  if (status === "pending_data") return "pendente de dados";
  if (status === "ready_for_review") return "pronto para revisão";
  if (status === "blocked") return "bloqueado";
  if (status === "done") return "concluído";
  return status || "—";
}

export function buildImobChatRoute(base: {
  conversationId?: string | null;
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
  returnTo?: string | null;
}) {
  const params = new URLSearchParams();
  if (base.conversationId) params.set("conversationId", base.conversationId);
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  if (base.returnTo) params.set("returnTo", base.returnTo);
  const query = params.toString();
  return `/app/imob/chat${query ? `?${query}` : ""}`;
}

export type ImobCommandCenterCaseRow = {
  processId: string;
  processLabel: string;
  context: string;
  caseId: string;
  threadId: string | null;
  status: string;
  riskLabel: string;
  ageHours: number;
  updatedAt: string;
  priorityLabel: string;
  priorityScore: number;
  nextAction: string;
  journeyLabel: string;
  ownerResponsible: string | null;
  eventCount: number;
  // TODO(backend): add waitingOn when apiListImobCases exposes ?waitingOn= filter param
  // Context: WaitingOnBoard uses a dedicated grouping endpoint with all cases; CC uses
  // apiListImobCases (max 12, status-filtered) — the two datasets don't overlap, making
  // client-side waitingOn filtering return 0 results. Fix requires backend to accept
  // waitingOn as a query param on GET /imob/cases.
};

export function buildImobCaseList(
  items: ImobCase[],
  reasonFilter: string,
  statusFilter: string
): ImobCommandCenterCaseRow[] {
  const targetStatus = mapImobStatusFilterToCaseStatus(statusFilter);
  if (targetStatus === "__none__") return [];

  return items
    .map((item) => {
      const riskLabel = buildImobCaseRiskLabel(item);
      const priority = buildImobCasePriority(item);
      const primaryAction = item.canonical?.recommendedActions?.[0] ?? null;
      const context = item.lead?.name || item.owner?.name || item.property?.city || "";
      return {
        processId: item.id,
        processLabel: formatImobProcessLabel(item.flow),
        context,
        caseId: item.id,
        threadId: item.threadId,
        status: item.status,
        riskLabel,
        ageHours: Number(imobCaseAgeHours(item.updatedAt).toFixed(1)),
        updatedAt: item.updatedAt,
        priorityLabel: priority.label,
        priorityScore: priority.score,
        nextAction: primaryAction?.label ?? item.nextStep ?? "Revisar caso",
        journeyLabel: formatImobJourneyTypeLabel(item.canonical?.journeyType),
        ownerResponsible: item.ownerResponsible ?? null,
        eventCount: item._count?.events ?? 0,
      };
    })
    .filter((item) => !targetStatus || item.status === targetStatus)
    .filter((item) => reasonFilter === "all" || item.riskLabel.includes(reasonFilter))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.ageHours - a.ageHours)
    .slice(0, 12);
}
