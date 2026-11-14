/**
 * Ciclo de vida do acompanhamento de uma run no Front Door: estados terminais reais, identidade da execução, contexto, timeout e cancelamento.
 * Puro (sem React, sem rede): o launcher só liga SSE, polling e API a estas funções e apresenta o estado.
 *
 * Distinções que a conversa precisa fazer com clareza:
 *  - parar de aguardar (timeout ou ação local) NÃO cancela a execução no servidor;
 *  - pedido de cancelamento enviado NÃO é cancelamento confirmado (só o evento/estado `cancelled` do servidor confirma);
 *  - nada aqui promete desfazer efeitos que a execução já realizou.
 */

/** Confirmação do bloqueio por governança pelo estado persistido: o worker emite o evento ANTES de finalizar a run, então a consulta é repetida por pouco tempo. */
export const GOVERNANCE_VERIFY_ATTEMPTS = 5;
export const GOVERNANCE_VERIFY_DELAY_MS = 1500;

/** Falhas seguidas ao consultar o servidor (polling) antes de parar de aguardar. */
export const RUN_POLL_MAX_CONSECUTIVE_FAILURES = 3;

/** Tempo máximo acompanhando uma run sem estado terminal. Ao vencer, a espera local termina; a execução NÃO é cancelada. */
export const RUN_TRACKING_TIMEOUT_MS = 120_000;

export type RunTerminal = "completed" | "failed" | "cancelled" | "blocked";
export type RunSettlement = RunTerminal | "timed_out" | "interrupted_locally" | "connection_lost";

export type TrackedRunEvent = { id: string; runId?: string | null; type: string; payload?: unknown };

const TERMINAL_EVENT_TYPES: Record<string, RunTerminal> = {
  "run.completed": "completed",
  "run.failed": "failed",
  "run.cancelled": "cancelled",
};

/**
 * Eventos de bloqueio por governança. O NOME do evento não encerra nada, porque (verificado nos emissores):
 *  - `run.blocked.guardrails` (worker) também é emitido quando o modo é permissivo (`override: true`): a execução PROSSEGUE e termina normalmente.
 *    Só com `override: false` o worker finaliza a run como `blocked` (código GUARDRAILS_BLOCKED) logo em seguida, e esse é o último evento dela;
 *  - `run.trustscore.blocked` (POST /runs) nasce junto com o 403 TRUST_BLOCKED de uma run já criada como `blocked`: o chat nem chega a acompanhá-la.
 * A decisão vem do estado persistido da run (`blocked`), consultado a seguir; evento sem confirmação não encerra o acompanhamento.
 */
export const GOVERNANCE_BLOCK_EVENT_TYPES = ["run.blocked.guardrails", "run.trustscore.blocked"] as const;
const isGovernanceBlockEvent = (type: string) => (GOVERNANCE_BLOCK_EVENT_TYPES as readonly string[]).includes(type);
/** `override: true` = o worker só registrou o aviso e a execução continua. */
const continuesDespiteBlock = (payload: unknown) => Boolean(payload) && typeof payload === "object" && (payload as Record<string, unknown>).override === true;

/** Estado terminal de um evento da run, ou `null` se é progresso (ou se precisa de confirmação pelo estado persistido). */
export const terminalOfEvent = (type: string): RunTerminal | null => TERMINAL_EVENT_TYPES[type] ?? null;

/**
 * Credencial de uma sessão (usuário, sessão, tenant e workspace), guardada só em memória e comparada por igualdade exata (sem impressão/hash do token).
 * As chamadas à API usam SEMPRE a sessão atual; por isso um cancelamento só pode sair com a mesma credencial que criou a run.
 */
export type CredentialSnapshot = { token: string | null; tenantId: string | null; workspaceId: string | null; userId: string | null };
export const credentialOf = (session: { token?: string | null; tenantId?: string | null; workspaceId?: string | null; userId?: string | null }): CredentialSnapshot => ({
  token: session.token ?? null, tenantId: session.tenantId ?? null, workspaceId: session.workspaceId ?? null, userId: session.userId ?? null,
});
/** Mesma credencial. Usuário ausente → definido é hidratação (não é troca); definido → ausente ou outro usuário é troca. */
export function sameCredential(a: CredentialSnapshot, b: CredentialSnapshot): boolean {
  return a.token === b.token && a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && (a.userId === b.userId || (a.userId === null && b.userId !== null));
}

/** Desfecho de abandonar o acompanhamento (nova conversa, troca de contexto): cada estado é dito como é, sem "sucesso" antes da resposta da API. */
export type AbandonResult = "cancel_accepted" | "cancel_failed" | "cancel_already_finished" | "discarded_locally";
/** `discarded_locally` não gera aviso: o contexto atual é de outra credencial/conversa e nada foi pedido ao servidor. */
export function describeAbandonResult(result: AbandonResult): string | null {
  if (result === "cancel_accepted") return "Ao abrir uma nova conversa, pedi o cancelamento da execução da conversa anterior e o servidor aceitou o pedido. Só vale como cancelada quando o servidor confirmar; o que ela já realizou não é desfeito.";
  if (result === "cancel_failed") return "Ao abrir uma nova conversa, tentei cancelar a execução da conversa anterior, mas o pedido falhou. Ela pode continuar no servidor.";
  if (result === "cancel_already_finished") return "A execução da conversa anterior já tinha terminado; nada foi cancelado.";
  return null;
}

/** Código estruturado da run persistida (ex.: GUARDRAILS_BLOCKED); só formato seguro, nunca texto livre. */
export function reasonCodeOfRun(run: { errorCode?: string | null } | null | undefined): string | null {
  const code = run?.errorCode;
  return typeof code === "string" && SAFE_CODE.test(code) ? code : null;
}

/** Estado terminal pelo status persistido da run (rede de segurança quando um evento terminal não chegou). */
export function terminalOfRunStatus(run: { status?: string | null; errorCode?: string | null } | null | undefined): RunTerminal | null {
  if (!run) return null;
  if (run.status === "success") return "completed";
  if (run.status === "error") return "failed";
  if (run.status === "blocked") return run.errorCode === "USER_CANCELLED" ? "cancelled" : "blocked";
  return null;
}

const SAFE_CODE = /^[A-Za-z0-9_.:-]{2,64}$/;
/** Só códigos curtos e estruturados chegam à conversa; mensagens livres do servidor (podem ter detalhe interno) não. */
function safeReasonCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["reasonCode", "errorCode", "code"]) {
    const value = record[key];
    if (typeof value === "string" && SAFE_CODE.test(value)) return value;
  }
  return null;
}

export type RunEventDecision =
  | { action: "ignore"; reason: "other_run" | "stale_context" | "already_settled" }
  | { action: "progress" }
  /** Bloqueio por governança sem `override`: só o estado persistido da run confirma se ela terminou bloqueada. */
  | { action: "verify_status" }
  | { action: "settle"; terminal: RunTerminal; reasonCode: string | null };

/**
 * Acompanhamento de UMA run, preso ao contexto em que nasceu (`contextId`: a mesma chave de escopo da conversa, usuário, sessão e agente).
 * Idempotente: depois de encerrado, qualquer evento (duplicado ou tardio) é ignorado. Eventos de outra run ou de outro contexto são descartados.
 */
export function createRunTracking(params: { runId: string; contextId: string; credential?: CredentialSnapshot; startedAt?: number }) {
  let settlement: RunSettlement | null = null;
  let cancelRequested = false;
  const credential = params.credential ?? null; // só em memória: nunca serializado, persistido nem registrado
  return {
    runId: params.runId,
    contextId: params.contextId,
    /**
     * Política DESTA interface (não a autorização do servidor, que é por tenant/workspace): só a credencial capturada na criação pede o cancelamento
     * por aqui, porque as chamadas à API usam sempre a sessão atual. Sem credencial conhecida, a run é só acompanhada.
     */
    mayCancelWith(current: CredentialSnapshot): boolean { return credential !== null && sameCredential(credential, current); },
    startedAt: params.startedAt ?? Date.now(),
    get settlement() { return settlement; },
    get cancelRequested() { return cancelRequested; },
    accept(event: TrackedRunEvent, currentContextId: string): RunEventDecision {
      if (settlement) return { action: "ignore", reason: "already_settled" };
      if (event.runId && event.runId !== params.runId) return { action: "ignore", reason: "other_run" };
      if (currentContextId !== params.contextId) return { action: "ignore", reason: "stale_context" };
      const terminal = terminalOfEvent(event.type);
      if (terminal) return { action: "settle", terminal, reasonCode: safeReasonCode(event.payload) };
      if (isGovernanceBlockEvent(event.type)) return continuesDespiteBlock(event.payload) ? { action: "progress" } : { action: "verify_status" };
      return { action: "progress" };
    },
    /** Marca que o pedido foi enviado (não confirma nada). */
    markCancelRequested() { cancelRequested = true; },
    clearCancelRequested() { cancelRequested = false; },
    /** `true` só na primeira chamada: encerra o acompanhamento uma única vez. */
    settle(next: RunSettlement): boolean {
      if (settlement) return false;
      settlement = next;
      return true;
    },
  };
}
export type RunTracking = ReturnType<typeof createRunTracking>;

/** Texto da conversa para o desfecho. `null` = nada a dizer (o resultado da execução concluída aparece pelo resumo). */
export function describeRunSettlement(settlement: RunSettlement, info: { cancelRequested: boolean; reasonCode?: string | null }): string | null {
  const code = info.reasonCode ? ` (código: ${info.reasonCode})` : "";
  switch (settlement) {
    case "completed":
      return info.cancelRequested ? "A execução terminou antes de o cancelamento ser aplicado; o resultado vale." : null;
    case "failed":
      return `A execução falhou e nenhum resultado foi concluído${code}. Você pode tentar de novo.`;
    case "cancelled":
      return info.cancelRequested
        ? "O servidor confirmou o cancelamento: a execução foi interrompida. O que ela já tinha realizado antes não é desfeito."
        : "A execução foi cancelada.";
    case "blocked":
      return `A execução foi bloqueada pelas regras de governança e não foi concluída${code}. Ela não continua sozinha: a análise e um eventual novo processamento dependem de uma pessoa autorizada, fora desta conversa.`;
    case "timed_out":
      return "Ainda não recebi o resultado desta execução. Parei de aguardar aqui, mas ela pode continuar no servidor: não foi cancelada. Você pode cancelá-la ou seguir a conversa.";
    case "interrupted_locally":
      return "Parei de aguardar aqui. A execução pode continuar no servidor e não foi cancelada.";
    case "connection_lost":
      return "Perdi a conexão com o servidor para acompanhar a execução. Ela pode continuar no servidor: não foi cancelada. Você pode tentar de novo mais tarde.";
  }
}

export type CancelOutcome = "sent" | "already_finished" | "failed";
export function describeCancelOutcome(outcome: CancelOutcome): string {
  if (outcome === "sent") return "O servidor aceitou o pedido de cancelamento. Só considero a execução cancelada quando o servidor confirmar; o que ela já realizou não é desfeito.";
  if (outcome === "already_finished") return "A execução já tinha terminado; o cancelamento não foi aplicado.";
  return "Não consegui enviar o pedido de cancelamento. A execução continua e eu sigo aguardando.";
}

/** Resultado do pedido de cancelamento a partir da resposta HTTP (409 = já finalizada). */
export const cancelOutcomeOfStatus = (status: number | null): CancelOutcome => (status === 409 ? "already_finished" : status === null ? "failed" : status >= 200 && status < 300 ? "sent" : "failed");

/** Dados mínimos guardados para retomar o acompanhamento depois de recarregar a página. */
export type PersistedRunTracking = { runId: string; startedAt: number };
export function readPersistedTracking(value: unknown): PersistedRunTracking | null {
  if (!value || typeof value !== "object") return null;
  const { runId, startedAt } = value as Record<string, unknown>;
  return typeof runId === "string" && runId.trim() && typeof startedAt === "number" && Number.isFinite(startedAt) ? { runId, startedAt } : null;
}
