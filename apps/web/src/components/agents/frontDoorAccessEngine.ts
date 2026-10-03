/**
 * ADR-011 §2.7: criação de acessos dentro da conversa do front door (`/app/chat`). O pedido abre um
 * cartão "Criar acesso" na própria conversa; o cartão envia direto à API e guarda o e-mail e o link
 * só na tela (nunca no histórico). Se alguém digitar um e-mail ao pedir um acesso, o histórico guarda
 * o e-mail mascarado. O launcher só renderiza.
 */

export const FRONT_DOOR_ACCESS_PANEL_ID = "criar-acesso";

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

export function isAccessCreationRequest(input: string) {
  const text = normalize(input);
  if (/\b(convidar|convide|convite)\b/.test(text) && /\b(pessoa|usuario|colaborador|corretor|alguem|equipe|workspace|@)/.test(text)) return true;
  return /\b(criar|crie|gerar|gere|dar|de|liberar|cadastrar)\b.*\b(acesso|login|usuario)\b/.test(text) && !/\b(imovel|proprietario|locacao|locatario)\b/.test(text);
}

const EMAIL_PATTERN = /([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})/gi;

/** "maria.silva@x.com" → "ma***@x.com" (mesma regra do servidor). */
export function maskEmailsInText(text: string) {
  return text.replace(EMAIL_PATTERN, (_match, local: string, domain: string) => `${local.slice(0, 2)}***@${domain.toLowerCase()}`);
}

/** O que vai para o histórico: num pedido de acesso, o e-mail do convidado fica mascarado. */
export function maskAccessCreationInput(text: string) {
  return isAccessCreationRequest(text) ? maskEmailsInText(text) : text;
}

export function describeAccessCreationHint() {
  return [
    "Vamos criar o acesso. Preencha os dados no cartão abaixo.",
    "",
    "A pessoa recebe um link de uso único, válido por 72 horas, e cria a própria senha. Quem já tem conta só entra no workspace.",
    "",
    "O e-mail não fica no histórico da conversa e o link aparece uma única vez, para você copiar.",
  ].join("\n");
}

/** Snapshot: esta mensagem mostra o cartão "Criar acesso" (só na última mensagem da conversa). */
export function attachFrontDoorAccessCardToSnapshot<S extends { frontDoorAccessCard?: boolean | null }>(
  snapshot: S,
  decision: { frontDoorAccessCard?: boolean } | null | undefined,
): S {
  return decision?.frontDoorAccessCard ? { ...snapshot, frontDoorAccessCard: true } : snapshot;
}
