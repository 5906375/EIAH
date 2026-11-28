/**
 * Rolagem do Front Door (`/app/chat`, compartilhado por todas as verticais) para respostas do assistente anexadas à conversa
 * sem passar pela digitação (respostas estruturadas do IMOB, avisos, mensagens de run). Só apresentação: decide se e para onde
 * rolar; quem rola é o launcher, que mantém a leitura manual do usuário.
 */
export type ScrollableMessage = { id: string; role: string; status?: string };

/**
 * Id da resposta do assistente acabada de anexar: exatamente UMA mensagem nova ao fim, com a lista anterior intacta.
 * Ficam de fora: a digitação progressiva (`streaming`, que já acompanha o fim por conta própria), a hidratação ou troca da
 * conversa (lista anterior vazia ou ids diferentes), a atualização de mensagens existentes (run, formulário) e mensagens do usuário.
 */
export function appendedAssistantReplyId(previousIds: readonly string[], messages: readonly ScrollableMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || last.status === "streaming") return null;
  if (previousIds.length === 0 || messages.length !== previousIds.length + 1) return null;
  return previousIds.every((id, index) => messages[index]?.id === id) ? last.id : null;
}

/**
 * Destino de `scrollTop` para a resposta recém-anexada, ou `null` para não mexer.
 * Guarda geométrica contra hidratação: só acompanha quando, ANTES da resposta, o fim da conversa estava a menos de uma tela
 * (a conversa recém-restaurada fica no topo, muito acima do fim). A decisão de preservar a leitura manual NÃO é desta função:
 * é do launcher, por gesto deliberado do usuário (o conteúdo que cresce sem rolagem não pode simular que o leitor saiu do fim).
 * Cabendo na área visível vai ao fim; sendo mais alta, o INÍCIO dela (um card alto nunca esconde o título).
 * `reply.top` é a distância do topo da resposta ao topo da área visível.
 */
export function replyScrollTop(
  reply: { top: number; height: number },
  viewport: { height: number; scrollTop: number; scrollHeight: number },
): number | null {
  const distanceBefore = viewport.scrollHeight - viewport.scrollTop - viewport.height - reply.height;
  if (distanceBefore > viewport.height) return null;
  return reply.height > viewport.height ? Math.max(0, viewport.scrollTop + reply.top) : viewport.scrollHeight;
}
