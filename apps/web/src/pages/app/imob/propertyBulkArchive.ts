import type { ImobPresentationForm, ImobProperty } from "@/lib/api";
import { IMOB_PROPERTY_TYPE_OPTIONS } from "@/features/imob/propertyTypes";

/**
 * "Arquivar imóvel(is)" do chat IMOB: o usuário escolhe explicitamente um ou mais imóveis, revisa o lote exato e confirma.
 * Cada arquivamento reaproveita `DELETE /imob/properties/:id` (guardrails, tenant/workspace e auditoria do servidor).
 * Este módulo só decide apresentação e sequência; a elegibilidade definitiva é sempre do servidor, no momento da escrita.
 * Não há atomicidade nem rollback: o que já foi arquivado permanece arquivado.
 */

export const PROPERTY_BULK_ARCHIVE_SUBMIT_TARGET = "imob.properties.archive_batch" as const;

/** A listagem do servidor devolve no máximo este número de imóveis (ver `ImobCrmRepository.listProperties`). */
export const IMOB_PROPERTY_LIST_SERVER_CAP = 200;

export const NO_OWNER_LABEL = "Sem proprietário vinculado";

export function isPropertyBulkArchiveForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === PROPERTY_BULK_ARCHIVE_SUBMIT_TARGET;
}

/** O painel próprio desenha campos e botões; o formulário apenas marca o tipo da mensagem. */
export function buildPropertyBulkArchiveForm(): ImobPresentationForm {
  return {
    entity: "imovel",
    action: "archive_batch",
    submitTarget: PROPERTY_BULK_ARCHIVE_SUBMIT_TARGET,
    label: "Arquivar imóveis",
    description: "O imóvel sai das listas; o histórico fica guardado. Imóvel com locação ou caso ligado não pode ser arquivado.",
    fields: [],
    actions: [],
  };
}

export type BulkArchiveCandidate = {
  id: string;
  /** Identificação da unidade (`metadata.externalPropertyRef`), quando existe. */
  unit: string | null;
  typeLabel: string;
  ownerId: string | null;
  ownerName: string | null;
  address: string;
};

export type BulkArchiveStage = "loading" | "select" | "review" | "running" | "result" | "error" | "stale";

export type BulkArchiveOutcome = "archived" | "blocked" | "not_found" | "denied" | "failed" | "not_processed";

export type BulkArchiveEligibility = "unknown" | "case_linked" | "no_case_known";

export type PropertyBulkArchiveState = {
  stage: BulkArchiveStage;
  candidates: BulkArchiveCandidate[];
  /** A listagem do servidor foi cortada no limite: pode haver imóveis não exibidos. */
  truncated: boolean;
  selectedIds: string[];
  query: string;
  /** Lote exato apresentado na revisão; a confirmação só age sobre ele. */
  reviewedIds: string[];
  eligibility: Record<string, BulkArchiveEligibility>;
  eligibilityChecked: boolean;
  /** Acumulado entre tentativas: um item arquivado nunca volta a ser tentado. */
  outcomes: Record<string, BulkArchiveOutcome>;
  /** Rótulos congelados para o resultado (a lista pode ser recarregada). */
  labels: Record<string, string>;
  notice: string | null;
  round: number;
};

/** O painel só emite eventos; quem decide e executa é o handler do runtime. */
export type BulkArchiveEvent =
  | { type: "toggle"; propertyId: string }
  | { type: "query"; value: string }
  | { type: "select_visible" }
  | { type: "clear" }
  | { type: "review" }
  | { type: "back" }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "retry_pending" }
  | { type: "reload" }
  | { type: "close" };

export function initialBulkArchiveState(): PropertyBulkArchiveState {
  return {
    stage: "loading",
    candidates: [],
    truncated: false,
    selectedIds: [],
    query: "",
    reviewedIds: [],
    eligibility: {},
    eligibilityChecked: false,
    outcomes: {},
    labels: {},
    notice: null,
    round: 0,
  };
}

const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export function candidateTitle(candidate: BulkArchiveCandidate) {
  return candidate.unit || candidate.typeLabel;
}

/** Proprietário só vem do vínculo `ownerId`; nunca é inferido pelo endereço. */
export function describeCandidateOwner(candidate: BulkArchiveCandidate) {
  if (candidate.ownerName) return candidate.ownerName;
  return candidate.ownerId ? "Proprietário não identificado" : NO_OWNER_LABEL;
}

export function describeCandidate(candidate: BulkArchiveCandidate) {
  return [candidateTitle(candidate), candidate.address].filter(Boolean).join(" — ");
}

/** Imóveis ativos como linhas de seleção. Arquivados nunca entram. */
export function toBulkArchiveCandidates(items: ImobProperty[]): BulkArchiveCandidate[] {
  return items
    .filter((item) => item.status !== "archived")
    .map((item) => {
      const metadata = asRecord(item.metadata);
      const unit = typeof metadata.externalPropertyRef === "string" ? metadata.externalPropertyRef.trim() : "";
      const typeLabel = IMOB_PROPERTY_TYPE_OPTIONS.find((option) => option.value === item.propertyType)?.label
        ?? (item.propertyType ? item.propertyType.replace(/_/g, " ") : "Imóvel");
      return {
        id: item.id,
        unit: unit || null,
        typeLabel,
        ownerId: item.ownerId ?? null,
        ownerName: item.owner?.name?.trim() || null,
        address: [item.address, item.city].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => describeCandidate(a).localeCompare(describeCandidate(b), "pt-BR", { numeric: true }));
}

export function filterBulkArchiveCandidates(candidates: BulkArchiveCandidate[], query: string) {
  const needle = fold(query);
  if (!needle) return candidates;
  return candidates.filter((candidate) =>
    fold([candidate.unit ?? "", candidate.typeLabel, describeCandidateOwner(candidate), candidate.address].join(" ")).includes(needle),
  );
}

export function loadedBulkArchiveState(
  previous: PropertyBulkArchiveState,
  items: ImobProperty[],
  options: { preselect?: string[]; notice?: string | null } = {},
): PropertyBulkArchiveState {
  const candidates = toBulkArchiveCandidates(items);
  const known = new Set(candidates.map((candidate) => candidate.id));
  return {
    ...previous,
    stage: "select",
    candidates,
    truncated: items.length >= IMOB_PROPERTY_LIST_SERVER_CAP,
    // Seleção anterior só sobrevive se o imóvel continua existindo e ativo nesta carga.
    selectedIds: (options.preselect ?? previous.selectedIds).filter((id) => known.has(id)),
    reviewedIds: [],
    eligibility: {},
    eligibilityChecked: false,
    notice: options.notice ?? null,
  };
}

export function toggleBulkArchiveSelection(state: PropertyBulkArchiveState, propertyId: string): PropertyBulkArchiveState {
  if (state.stage !== "select" || !state.candidates.some((candidate) => candidate.id === propertyId)) return state;
  const selected = new Set(state.selectedIds);
  if (selected.has(propertyId)) selected.delete(propertyId);
  else selected.add(propertyId);
  return { ...state, selectedIds: orderedByCandidates(state.candidates, selected) };
}

/** "Selecionar todos" age só sobre o que o filtro atual está exibindo. */
export function selectVisibleBulkArchive(state: PropertyBulkArchiveState): PropertyBulkArchiveState {
  if (state.stage !== "select") return state;
  const selected = new Set(state.selectedIds);
  for (const candidate of filterBulkArchiveCandidates(state.candidates, state.query)) selected.add(candidate.id);
  return { ...state, selectedIds: orderedByCandidates(state.candidates, selected) };
}

export function clearBulkArchiveSelection(state: PropertyBulkArchiveState): PropertyBulkArchiveState {
  return state.stage === "select" ? { ...state, selectedIds: [] } : state;
}

export function setBulkArchiveQuery(state: PropertyBulkArchiveState, query: string): PropertyBulkArchiveState {
  return state.stage === "select" ? { ...state, query: query.slice(0, 120) } : state;
}

function orderedByCandidates(candidates: BulkArchiveCandidate[], selected: Set<string>) {
  return candidates.filter((candidate) => selected.has(candidate.id)).map((candidate) => candidate.id);
}

export function summarizeBulkArchiveSelection(state: PropertyBulkArchiveState) {
  const visible = new Set(filterBulkArchiveCandidates(state.candidates, state.query).map((candidate) => candidate.id));
  const hiddenSelected = state.selectedIds.filter((id) => !visible.has(id)).length;
  return { selected: state.selectedIds.length, visible: visible.size, hiddenSelected };
}

/** Segunda etapa: congela o lote exato. Não escreve nada. */
export function enterBulkArchiveReview(state: PropertyBulkArchiveState): PropertyBulkArchiveState {
  if (state.stage !== "select" || state.selectedIds.length === 0) return state;
  return {
    ...state,
    stage: "review",
    reviewedIds: [...state.selectedIds],
    eligibility: {},
    eligibilityChecked: false,
    notice: null,
  };
}

export function backToBulkArchiveSelection(state: PropertyBulkArchiveState): PropertyBulkArchiveState {
  if (state.stage !== "review") return state;
  return { ...state, stage: "select", reviewedIds: [], eligibility: {}, eligibilityChecked: false, notice: null };
}

/** Verificação preliminar e informativa: `null` quando não foi possível consultar. A autoridade é o servidor. */
export function applyBulkArchiveEligibility(
  state: PropertyBulkArchiveState,
  caseLinkedPropertyIds: ReadonlySet<string> | null,
): PropertyBulkArchiveState {
  if (state.stage !== "review") return state;
  const eligibility: Record<string, BulkArchiveEligibility> = {};
  for (const id of state.reviewedIds) {
    eligibility[id] = caseLinkedPropertyIds === null ? "unknown" : caseLinkedPropertyIds.has(id) ? "case_linked" : "no_case_known";
  }
  return { ...state, eligibility, eligibilityChecked: caseLinkedPropertyIds !== null };
}

export function bulkArchiveConfirmLabel(count: number) {
  return `Confirmar arquivamento de ${count} ${count === 1 ? "imóvel" : "imóveis"}`;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

/** Classifica a falha de um `DELETE`. `fatal` interrompe o restante do lote (causa provavelmente comum). */
export function classifyBulkArchiveFailure(failure: { status: number; code?: string | null }): { outcome: BulkArchiveOutcome; fatal: boolean } {
  if (failure.status === 409 && failure.code === "PROPERTY_DELETE_BLOCKED") return { outcome: "blocked", fatal: false };
  if (failure.status === 404) return { outcome: "not_found", fatal: false };
  if (failure.status === 403) return { outcome: "denied", fatal: false };
  const clientError = failure.status >= 400 && failure.status < 500 && failure.status !== 401 && failure.status !== 429;
  return { outcome: "failed", fatal: !clientError };
}

export type BulkArchiveRunOptions = {
  ids: string[];
  /** Uma chamada por imóvel; lança com `status`/`code` quando o servidor recusa. */
  archive: (propertyId: string) => Promise<unknown>;
  failureOf: (error: unknown) => { status: number; code?: string | null };
  /** Consultado antes de CADA escrita: sessão/contexto mudou, formulário encerrado ou interrupção pedida. */
  canContinue: () => boolean;
  onOutcome?: (propertyId: string, outcome: BulkArchiveOutcome) => void;
};

/**
 * Executa sequencialmente (um pedido em voo por vez). Um item já em voo não é desfeito; depois dele nada novo é escrito
 * quando o contexto deixa de valer. Itens não tentados ficam `not_processed`.
 */
export async function runBulkArchive(options: BulkArchiveRunOptions): Promise<Record<string, BulkArchiveOutcome>> {
  const outcomes: Record<string, BulkArchiveOutcome> = {};
  const record = (id: string, outcome: BulkArchiveOutcome) => {
    outcomes[id] = outcome;
    options.onOutcome?.(id, outcome);
  };
  let halted = false;
  for (const id of [...new Set(options.ids)]) {
    if (halted || !options.canContinue()) {
      record(id, "not_processed");
      halted = true;
      continue;
    }
    try {
      await options.archive(id);
      record(id, "archived");
    } catch (error) {
      const { outcome, fatal } = classifyBulkArchiveFailure(options.failureOf(error));
      record(id, outcome);
      if (fatal) halted = true;
    }
  }
  return outcomes;
}

export function startBulkArchiveRun(state: PropertyBulkArchiveState): PropertyBulkArchiveState {
  if (state.stage !== "review" || state.reviewedIds.length === 0) return state;
  const labels = { ...state.labels };
  for (const candidate of state.candidates) if (state.reviewedIds.includes(candidate.id)) labels[candidate.id] = candidateTitle(candidate);
  return { ...state, stage: "running", labels, notice: null, round: state.round + 1 };
}

export function recordBulkArchiveOutcome(state: PropertyBulkArchiveState, propertyId: string, outcome: BulkArchiveOutcome): PropertyBulkArchiveState {
  // Um arquivado não é sobrescrito por resultado posterior.
  if (state.outcomes[propertyId] === "archived") return state;
  return { ...state, outcomes: { ...state.outcomes, [propertyId]: outcome } };
}

export function finishBulkArchiveRun(state: PropertyBulkArchiveState, notice: string | null = null): PropertyBulkArchiveState {
  return { ...state, stage: "result", notice };
}

/** Itens do último lote que ainda podem ser tentados de novo (falha operacional ou não processados). */
export function pendingBulkArchiveIds(state: PropertyBulkArchiveState) {
  return state.reviewedIds.filter((id) => state.outcomes[id] === "failed" || state.outcomes[id] === "not_processed");
}

/**
 * Retomada: só os pendentes que continuam existindo e ativos na lista recarregada voltam à seleção.
 * Quem sumiu da lista vira `not_found`. Sempre retorna à revisão/confirmação explícita; nunca executa.
 */
export function prepareBulkArchiveRetry(state: PropertyBulkArchiveState, freshItems: ImobProperty[]): PropertyBulkArchiveState {
  const pending = pendingBulkArchiveIds(state);
  const reloaded = loadedBulkArchiveState(state, freshItems, { preselect: pending });
  const stillThere = new Set(reloaded.selectedIds);
  const outcomes = { ...state.outcomes };
  for (const id of pending) if (!stillThere.has(id)) outcomes[id] = "not_found";
  const base = { ...reloaded, outcomes };
  if (reloaded.selectedIds.length === 0) return { ...base, stage: "result", notice: "Nenhum item pendente continua disponível para arquivar." };
  return enterBulkArchiveReview(base);
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

const OUTCOME_LABEL: Record<BulkArchiveOutcome, string> = {
  archived: "arquivado",
  blocked: "bloqueado por dependência (locação ou caso ligado)",
  not_found: "não encontrado ou já arquivado",
  denied: "sem acesso",
  failed: "falha operacional",
  not_processed: "não processado",
};

export function bulkArchiveOutcomeLabel(outcome: BulkArchiveOutcome) {
  return OUTCOME_LABEL[outcome];
}

export function summarizeBulkArchiveOutcomes(outcomes: Record<string, BulkArchiveOutcome>, ids: string[]) {
  const totals: Record<BulkArchiveOutcome, number> = { archived: 0, blocked: 0, not_found: 0, denied: 0, failed: 0, not_processed: 0 };
  for (const id of ids) totals[outcomes[id] ?? "not_processed"] += 1;
  return totals;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** `N arquivados · N bloqueados · N não processados` (+ categorias extras só quando existem). */
export function formatBulkArchiveSummary(totals: Record<BulkArchiveOutcome, number>) {
  return [
    plural(totals.archived, "arquivado", "arquivados"),
    plural(totals.blocked, "bloqueado", "bloqueados"),
    plural(totals.not_processed, "não processado", "não processados"),
    totals.failed ? plural(totals.failed, "com falha", "com falha") : null,
    totals.denied ? plural(totals.denied, "sem acesso", "sem acesso") : null,
    totals.not_found ? plural(totals.not_found, "não encontrado", "não encontrados") : null,
  ].filter(Boolean).join(" · ");
}

export function bulkArchiveResultLines(state: PropertyBulkArchiveState) {
  const ids = Object.keys(state.outcomes);
  const order = new Map(state.candidates.map((candidate, index) => [candidate.id, index]));
  return ids
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
    .map((id) => `${state.labels[id] ?? "Imóvel"} — ${OUTCOME_LABEL[state.outcomes[id]]}`);
}

/** Texto persistido na conversa: sem nomes de pessoas, só unidades e totais. */
export function buildBulkArchiveResultText(state: PropertyBulkArchiveState) {
  const ids = Object.keys(state.outcomes);
  const totals = summarizeBulkArchiveOutcomes(state.outcomes, ids);
  return `Arquivamento de imóveis: ${formatBulkArchiveSummary(totals)}.`;
}
