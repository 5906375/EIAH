import type { LogisticaContextAccess } from "@eiah/contracts";

/**
 * Engine do Front Door para a continuidade da jornada logística (E4-4; FD-CHAT-ONLY-001).
 * Helpers da referência opaca do caso (`?case=`), da memória da sessão e das mensagens de acesso. A referência vinda do cliente
 * é só um ponteiro: o servidor confirma o acesso ao contexto e devolve o caso no escopo autenticado. Não reconhece linguagem
 * natural, não escreve, não autoriza. Todo o resumo/andamento do caso é apresentado pelo cartão da jornada NA conversa.
 */

export const LOGISTICA_CASE_PARAM = "case";
/** Evento de janela: o cartão da jornada avisa que o caso mudou (resumo e pendências do Front Door se atualizam). */
export const LOGISTICA_CASE_CHANGED_EVENT = "eiah:logistica-case-changed";
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

/**
 * Continuidade da conversa: a referência opaca do caso aberto é lembrada por sessão do navegador (mesma vida do histórico da conversa),
 * isolada por tenant, workspace e usuário. É só uma dica de retomada: o servidor decide a existência e a permissão a cada abertura,
 * e a referência nunca é tratada como autorização. Nenhum documento, credencial ou identificador sensível é guardado.
 */
export type LogisticaCaseMemoryStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LogisticaCaseMemoryScope = { tenantId: string; workspaceId: string; userId?: string | null };

export function logisticaCaseMemoryKey(scope: LogisticaCaseMemoryScope): string {
  return `eiah.logistica.case.v1:${scope.tenantId}:${scope.workspaceId}:${scope.userId}`;
}

export function readRememberedLogisticaCase(store: LogisticaCaseMemoryStore | null | undefined, scope: LogisticaCaseMemoryScope): string | null {
  try {
    if (!scope.userId) return null; // sem identidade da sessão não há retomada
    const value = store?.getItem(logisticaCaseMemoryKey(scope));
    return isValidLogisticaCaseRef(value) ? value : null;
  } catch { return null; }
}

export function rememberLogisticaCase(store: LogisticaCaseMemoryStore | null | undefined, scope: LogisticaCaseMemoryScope, caseId: string | null): void {
  try {
    if (!scope.userId) return;
    const key = logisticaCaseMemoryKey(scope);
    if (isValidLogisticaCaseRef(caseId)) store?.setItem(key, caseId); else store?.removeItem(key);
  } catch { /* armazenamento indisponível: a conversa segue sem retomada automática */ }
}

/** A URL (`?case=`) tem prioridade; sem ela, retoma o último caso desta sessão e deste escopo. */
export function resolveLogisticaCaseToResume(search: string, store: LogisticaCaseMemoryStore | null | undefined, scope: LogisticaCaseMemoryScope): string | null {
  return parseLogisticaCaseRef(search) ?? readRememberedLogisticaCase(store, scope);
}

export type LogisticaServerCase = { status: "resolved" | "unavailable"; caseRef: string };

/**
 * Qual referência o cartão abre ao montar. A URL e a memória da sessão são mais atuais que o snapshot (a conversa pode ter sido
 * restaurada depois de o usuário trocar de caso), então o veredito do servidor só decide em dois casos: recusou a MESMA referência
 * que o cliente tem (esquecer e abrir preparação nova) ou confirmou uma referência quando o cliente não tem mais nada.
 */
export function resolveLogisticaCaseForCard(input: { urlRef: string | null; memoryRef: string | null; serverCase?: LogisticaServerCase | null }): { caseRef: string | null; forget: boolean } {
  const local = input.urlRef ?? input.memoryRef;
  const server = input.serverCase;
  if (server && isValidLogisticaCaseRef(server.caseRef)) {
    if (server.status === "unavailable" && local === server.caseRef) return { caseRef: null, forget: true };
    if (server.status === "resolved" && !local) return { caseRef: server.caseRef, forget: false };
  }
  return { caseRef: local, forget: false };
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

/** Entrada do Pré-DUIMP no Front Door (menu e redirecionamento legado): abre o cartão na conversa; o acesso é decidido pelo servidor. */
export const PRE_DUIMP_FRONT_DOOR_HREF = "/app/chat?entry=pre_duimp";
