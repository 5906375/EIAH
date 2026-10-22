/**
 * FD-SINGLE-ENTRY-001 — a gestão operacional do IMOB (aprovações, fila de prioridades, "aguardando", gargalos, carga dos especialistas,
 * índice de resgate, funil e casos) abre NA conversa do Front Door, como cartão renderizado pelo launcher. O engine só reconhece o pedido
 * (vocabulário controlado) e marca o snapshot; os dados e as ações continuam nos endpoints existentes do IMOB, que o servidor autoriza.
 * Reconhecer NÃO concede acesso: sem permissão a API devolve 403 e o cartão mostra o bloqueio, sem dados.
 */
const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

const OBJECTS =
  "(?:painel(?: operacional)?(?: de gestao)?|central operacional|command center|gestao operacional|aprovacoes pendentes|fila de prioridades|gargalos|funil(?: de vendas)?|carga dos especialistas|indice de resgate)";
const REQUEST = new RegExp(
  `^(?:(?:quero|preciso|gostaria de|vamos) )?(?:ver|abrir|consultar|mostrar|mostre|exibir|acompanhar) (?:(?:o|a|os|as|meu|minha|meus|minhas|todo|toda) )*${OBJECTS}(?: d[oae]s? (?:imob|imobiliari[oa]))?$`,
);
const FORBIDDEN = /siscomex|portal unico|pre duimp|logistica|conteiner|container/;

export function isImobManagementRequest(input: string): boolean {
  const spoken = normalize(input);
  const text = spoken.replace(/[.!]+$/, "").trim();
  if (!text || spoken.endsWith("?") || FORBIDDEN.test(text)) return false;
  return REQUEST.test(text);
}

export const IMOB_MANAGEMENT_ENTRY_PROMPT = "ver painel de gestão do IMOB";
export const IMOB_MANAGEMENT_CARD_TITLE = "Gestão IMOB";

export function attachImobManagementCardToSnapshot<S extends { imobManagementCard?: boolean | null }>(
  snapshot: S,
  decision: { imobManagementCard?: boolean } | null | undefined,
): S {
  return decision?.imobManagementCard ? { ...snapshot, imobManagementCard: true } : snapshot;
}
