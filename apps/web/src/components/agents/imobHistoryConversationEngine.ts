/**
 * FD-IMOB-PERSISTENCE-001 — o histórico persistido do IMOB (conversas, threads, estado de entrevista) abre NA conversa do Front Door
 * como cartão renderizado pelo launcher. O engine só reconhece o pedido (vocabulário controlado) e marca o snapshot; os dados vêm dos
 * endpoints existentes do chat IMOB e o servidor autoriza (tenant/workspace). Reconhecer não concede acesso.
 */
const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

const OBJECTS = "(?:historico|conversas|threads|conversas anteriores|conversas salvas)";
const REQUEST = new RegExp(
  `^(?:(?:quero|preciso|gostaria de|vamos) )?(?:ver|abrir|consultar|mostrar|mostre|exibir|retomar|recuperar) (?:(?:o|a|os|as|meu|minha|meus|minhas|todo|toda) )*${OBJECTS}(?: d[oae]s? (?:imob|imobiliari[oa])| do chat imob)?$`,
);
const FORBIDDEN = /siscomex|portal unico|pre duimp|logistica|conteiner|container/;

export function isImobHistoryRequest(input: string): boolean {
  const spoken = normalize(input);
  const text = spoken.replace(/[.!]+$/, "").trim();
  if (!text || spoken.endsWith("?") || FORBIDDEN.test(text)) return false;
  // "histórico"/"conversas" soltos são ambíguos: só valem com o IMOB nomeado ou com "ver/abrir/retomar…" + objeto completo.
  return REQUEST.test(text) && /imob|imobiliari/.test(text);
}

export const IMOB_HISTORY_ENTRY_PROMPT = "ver histórico do IMOB";
export const IMOB_HISTORY_CARD_TITLE = "Histórico IMOB";

export function attachImobHistoryCardToSnapshot<S extends { imobHistoryCard?: boolean | null }>(
  snapshot: S,
  decision: { imobHistoryCard?: boolean } | null | undefined,
): S {
  return decision?.imobHistoryCard ? { ...snapshot, imobHistoryCard: true } : snapshot;
}
