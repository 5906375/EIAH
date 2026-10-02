/**
 * ADR-011 §2.7: criação de acessos pelo front door. O acesso é criado no painel "Criar acesso" do
 * `/app/chat`, que envia direto à API; a conversa só orienta e nunca guarda o e-mail do convidado:
 * se alguém digitar um e-mail ao pedir um acesso, o histórico guarda o e-mail mascarado.
 * O launcher só renderiza.
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
    "Para criar um acesso, use o botão **Criar acesso** no topo desta página.",
    "",
    "- Quem pode: Founder, Gestor ou Admin do workspace, em workspace com uma vertical liberada pela EIAH.",
    "- A pessoa recebe um link de uso único, válido por 72 horas, e cria a própria senha. Quem já tem conta só entra no workspace.",
    "- O link aparece uma única vez para você copiar. Não escreva o e-mail aqui na conversa: o painel envia direto, sem guardar no histórico.",
  ].join("\n");
}
