import type { LogisticaContextAccess, OraculoPreparationRecordV1 } from "@eiah/contracts";

/**
 * Engine do Front Door para a continuidade da jornada logística (E4-4).
 * Resolve, a partir de uma referência EXPLÍCITA de caso (`?case=`), o que o Front Door mostra. A referência vinda do cliente
 * é só um ponteiro: nada é exibido sem que o servidor confirme o acesso ao contexto (`LogisticaContextAccess`) e devolva o
 * caso no escopo autenticado (tenant/workspace/permissões). Não reconhece linguagem natural, não escreve, não autoriza.
 * O componente de tela apenas renderiza o resultado já resolvido.
 */

export const LOGISTICA_CASE_PARAM = "case";
/** Identificador opaco (cuid/UUID). Apenas formato; a existência e a permissão são decididas pelo servidor. */
const CASE_REF = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidLogisticaCaseRef(value: unknown): value is string {
  return typeof value === "string" && CASE_REF.test(value);
}

/** Lê `?case=` da query; qualquer valor fora do formato é descartado (nunca repassado ao servidor ou à tela). */
export function parseLogisticaCaseRef(search: string): string | null {
  const value = new URLSearchParams(search).get(LOGISTICA_CASE_PARAM);
  return isValidLogisticaCaseRef(value) ? value : null;
}

export function logisticaCockpitHref(caseId?: string | null): string {
  return isValidLogisticaCaseRef(caseId) ? `/app/logistica?${LOGISTICA_CASE_PARAM}=${encodeURIComponent(caseId)}` : "/app/logistica";
}

export function logisticaFrontDoorHref(caseId?: string | null): string {
  const base = "/app/chat?domain=logistica";
  return isValidLogisticaCaseRef(caseId) ? `${base}&${LOGISTICA_CASE_PARAM}=${encodeURIComponent(caseId)}` : base;
}

export const LOGISTICA_ACCESS_MESSAGES: Record<LogisticaContextAccess["reason"], string> = {
  available: "Contexto disponível.",
  installation_missing: "Logística ainda não foi ativada neste workspace.",
  installation_inactive: "A instalação de Logística está inativa.",
  approval_required: "A liberação de Logística precisa de aprovação.",
  revoked: "O acesso foi revogado. Consulte o responsável pelo workspace.",
  membership_required: "É necessário um vínculo ativo com este workspace.",
  policy_denied: "A permissão de consulta de Logística ainda não foi concedida.",
  unavailable: "Não foi possível validar o acesso. Tente novamente.",
};

const FIELD_LABELS = { port: "Porto", depot: "Depósito", flow: "Fluxo pretendido" } as const;
const REVIEW_OUTCOMES: Record<string, string> = {
  consistent_in_checked_fields: "consistente nos campos conferidos",
  divergent: "com divergência",
  indeterminate: "indeterminada",
};

export type LogisticaCaseSummary = {
  caseId: string;
  shortId: string;
  revision: number;
  updatedAt: string;
  pending: string[];
  needsReview: string[];
  evidenceCount: number;
  lastReview: { outcome: string; documentId: string } | null;
};

export type LogisticaCta = { id: "open_cockpit" | "open_front_door_core"; label: string; href: string };

export type LogisticaFrontDoorContext =
  | { status: "no_access"; reason: LogisticaContextAccess["reason"]; title: string; message: string; ctas: LogisticaCta[] }
  | { status: "no_case"; usage: "full" | "read_only"; title: string; message: string; recent: LogisticaCaseSummary | null; ctas: LogisticaCta[] }
  | { status: "case"; usage: "full" | "read_only"; title: string; message: string; summary: LogisticaCaseSummary; ctas: LogisticaCta[] }
  | { status: "case_unavailable"; kind: "not_found" | "forbidden" | "session" | "integrity" | "unavailable"; title: string; message: string; ctas: LogisticaCta[] };

const TITLE = "Logística & Comex";
const OPEN_COCKPIT = (caseId?: string | null): LogisticaCta => ({ id: "open_cockpit", label: caseId ? "Continuar este caso no cockpit" : "Abrir cockpit de Logística", href: logisticaCockpitHref(caseId) });
const SCOPE_NOTE = "Preparação e acompanhamento da devolução de contêiner vazio. Salvar ou conferir não autoriza execução nem transmissão externa.";

export function summarizeLogisticaCase(record: OraculoPreparationRecordV1): LogisticaCaseSummary {
  const pending: string[] = [];
  const needsReview: string[] = [];
  for (const key of Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>) {
    const status = record.context[key].status;
    if (status === "not_informed" || status === "to_confirm") pending.push(FIELD_LABELS[key]);
    if (status === "not_applicable") needsReview.push(FIELD_LABELS[key]);
  }
  const reviews = record.contentReviews ?? [];
  const last = reviews[reviews.length - 1];
  return {
    caseId: record.caseId,
    shortId: record.caseId.slice(0, 8),
    revision: record.revision,
    updatedAt: record.updatedAt,
    pending,
    needsReview,
    evidenceCount: record.evidences?.length ?? 0,
    lastReview: last ? { outcome: REVIEW_OUTCOMES[last.outcome] ?? "registrada", documentId: last.documentId } : null,
  };
}

type Deps = {
  /** Consulta ao servidor (`GET /session/context?domain=logistica`): devolve o acesso ou null se não foi possível confirmar. */
  getAccess: () => Promise<LogisticaContextAccess | null | undefined>;
  caseRef: string | null;
  getCase: (caseId: string) => Promise<{ data: OraculoPreparationRecordV1 }>;
  listCases: () => Promise<{ data: { items: OraculoPreparationRecordV1[] } }>;
};

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

function unavailable(kind: Extract<LogisticaFrontDoorContext, { status: "case_unavailable" }>["kind"], message: string): LogisticaFrontDoorContext {
  return { status: "case_unavailable", kind, title: TITLE, message, ctas: [OPEN_COCKPIT()] };
}

/** Fail-closed: sem acesso confirmado pelo servidor, nenhuma consulta de caso é feita e nenhum dado é mostrado. */
export async function resolveLogisticaFrontDoorContext(deps: Deps): Promise<LogisticaFrontDoorContext> {
  const access = await deps.getAccess().catch(() => null);
  if (!access || !access.allowed || access.usage === "blocked") {
    const reason = access?.reason ?? "unavailable";
    return {
      status: "no_access", reason, title: TITLE, message: LOGISTICA_ACCESS_MESSAGES[reason],
      ctas: [{ id: "open_front_door_core", label: "Consultar liberação ou ativar Logística", href: "/app/chat?domain=core" }],
    };
  }
  const usage = access.usage;
  try {
    if (deps.caseRef) {
      const { data } = await deps.getCase(deps.caseRef);
      // O servidor deve devolver exatamente o caso pedido; qualquer divergência é tratada como indisponível.
      if (!data || data.caseId !== deps.caseRef) return unavailable("unavailable", "Não foi possível confirmar o caso informado.");
      const summary = summarizeLogisticaCase(data);
      return {
        status: "case", usage, title: TITLE, summary, ctas: [OPEN_COCKPIT(summary.caseId)],
        message: usage === "read_only" ? `Caso aberto em modo somente leitura. ${SCOPE_NOTE}` : SCOPE_NOTE,
      };
    }
    const { data } = await deps.listCases();
    const recent = data.items[0] ? summarizeLogisticaCase(data.items[0]) : null;
    return {
      status: "no_case", usage, title: TITLE, recent,
      message: recent ? `Há um caso recente neste workspace. ${SCOPE_NOTE}` : `Nenhum caso aberto neste workspace. ${SCOPE_NOTE}`,
      ctas: [OPEN_COCKPIT(recent?.caseId ?? null)],
    };
  } catch (error) {
    const status = statusOf(error);
    if (status === 404) return unavailable("not_found", "Esse caso não foi encontrado neste workspace.");
    if (status === 403) return unavailable("forbidden", "Você não tem permissão para consultar Logística neste workspace.");
    if (status === 401) return unavailable("session", "Sua sessão expirou. Entre novamente para continuar.");
    if (status === 409) return unavailable("integrity", "O registro do caso falhou na verificação de integridade e foi bloqueado.");
    return unavailable("unavailable", "Não foi possível consultar o caso agora. Tente novamente.");
  }
}
