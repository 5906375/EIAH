import type { ImobCaseContext, ImobChatMessage } from "@/lib/api";
import { hasProposalReviewCarrier } from "@/pages/app/imob/proposalForm";
import type { StructuredCard, StructuredMessage } from "@/features/imob/structured/types";

/**
 * FD-IMOB-PERSISTENCE-001 — contrato de histórico do IMOB hospedado pelo Front Door.
 *
 * A persistência é a do chat IMOB existente (`/imob/chat/conversations/*`, memory events `imob.chat.*`): nada de tabela, migração ou
 * semântica nova. Este módulo só adapta o formato do launcher ao MESMO registro que o chat legado grava (`metadata.card|caseContext|form|…`),
 * para que o histórico seja legível pelas duas superfícies. Regras herdadas do chat legado (`buildPersistedImobChatMessageMetadata` /
 * `mapStoredMessageToChat`): o histórico nunca guarda credencial de pergunta ativa nem rascunho; revisão de proposta restaurada falha fechada.
 */

/** Rota de superfície registrada na telemetria (o chat legado registrava a rota da própria página). */
export const FRONT_DOOR_SURFACE_ROUTE = "/app/chat";
/** Thread sintética do bootstrap do Front Door: nunca é gravada (não cria thread artificial no histórico). */
export const FRONT_DOOR_SYNTHETIC_THREAD_ID = "frontdoor-imob";
export const FRONT_DOOR_RESTORED_REVIEW_TEXT =
  "Esta revisão pertence ao histórico. Reabra Gerar proposta para revisar os dados; nenhuma ação foi autorizada.";
export const FRONT_DOOR_CLOSED_FORM_NOTE = "(Formulário fechado sem salvar.)";

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Corpo de `apiCreateImobChatMessage` para uma mensagem do Front Door; `null` quando a mensagem não deve ser gravada. */
export function buildFrontDoorPersistedMessage(message: StructuredMessage | { role: "user" | "assistant" | "system"; text: string }) {
  const structured = message as StructuredMessage;
  const text = (message.text ?? "").trim();
  if (!text || message.role === "system") return null;
  const thread = structured.thread && structured.thread.id !== FRONT_DOOR_SYNTHETIC_THREAD_ID ? structured.thread : null;
  const caseContext = structured.caseContext ?? null;
  return {
    role: message.role,
    content: text,
    ...(thread ? { threadId: thread.id, threadLabel: thread.label, threadStatus: thread.status ?? "active" } : {}),
    metadata: {
      card: structured.card ?? null,
      caseContext,
      // A definição do formulário (opções com nomes/endereços do CRM) não é copiada para o histórico: o Front Door não reabre
      // formulário vivo. Fica só o indício, para o histórico mostrar "(Formulário fechado sem salvar.)".
      ...(structured.form ? { hadForm: true } : {}),
      ...(hasProposalReviewCarrier(structured.conversationState)
        ? { operationalContinuity: { version: "v1", phase: structured.conversationState?.operational?.continuity?.phase ?? "review", pending: null } }
        : {}),
      surface: "front_door",
    },
  } as const;
}

function restoreCard(value: unknown, thread: StructuredMessage["thread"]): StructuredCard | undefined {
  const card = asObject(value);
  if (!card || typeof card.title !== "string") return undefined;
  const lines = Array.isArray(card.lines) ? card.lines.filter((line): line is string => typeof line === "string") : [];
  const ctas = (Array.isArray(card.ctas) ? card.ctas : []).flatMap((cta) => {
    const item = asObject(cta);
    // Só link restaurável: CTA do chat legado que depende de `action` não tem o que executar aqui (não vira botão morto).
    if (!item || typeof item.id !== "string" || typeof item.label !== "string" || typeof item.href !== "string" || !item.href.startsWith("/")) return [];
    const kind = item.kind === "primary" || item.kind === "secondary" || item.kind === "neutral" ? item.kind : undefined;
    const restored: NonNullable<StructuredCard["ctas"]>[number] = { id: item.id, label: item.label, href: item.href, ...(kind ? { kind } : {}) };
    return [restored];
  });
  const type = card.type === "risk" || card.type === "evidence" || card.type === "queue" || card.type === "action" ? card.type : "action";
  return { type, title: card.title, lines, ...(thread ? { thread } : {}), ...(ctas.length ? { ctas } : {}) };
}

/**
 * Mensagem gravada → mensagem do launcher. Formulários voltam FECHADOS (o histórico não reabre formulário vivo) e a revisão de proposta
 * restaurada falha fechada. Mensagens `hiddenFromTimeline` não voltam.
 */
export function mapStoredMessageToFrontDoor(message: ImobChatMessage): StructuredMessage | null {
  const metadata = asObject(message.metadata);
  if (metadata?.hiddenFromTimeline === true) return null;
  const restoredReview = message.role === "assistant"
    && (message.action === "crm.proposal.review" || Boolean(metadata && Object.prototype.hasOwnProperty.call(metadata, "operationalContinuity")));
  const thread = message.threadId && message.threadId !== FRONT_DOOR_SYNTHETIC_THREAD_ID
    ? { id: message.threadId, label: message.threadLabel ?? "Operação", status: message.threadStatus ?? ("active" as const) }
    : undefined;
  const caseContext = asObject(metadata?.caseContext) as ImobCaseContext | null;
  const hadForm = Boolean(asObject(metadata?.form)) || metadata?.hadForm === true;
  const base = restoredReview ? FRONT_DOOR_RESTORED_REVIEW_TEXT : message.content;
  return {
    id: message.id,
    role: message.role,
    text: hadForm && !restoredReview ? `${base} ${FRONT_DOOR_CLOSED_FORM_NOTE}` : base,
    ...(thread ? { thread } : {}),
    ...(caseContext ? { caseContext } : {}),
    ...(message.role === "assistant" ? (() => { const card = restoreCard(metadata?.card, thread); return card ? { card } : {}; })() : {}),
  };
}

export type RestoredFrontDoorMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imobStructured?: StructuredMessage;
  imobPersisted: { conversationId: string; messageId: string };
};

/** Lista gravada → mensagens do launcher, na ordem do servidor, sem repetir ids. */
export function restoreFrontDoorMessages(conversationId: string, items: ImobChatMessage[]): RestoredFrontDoorMessage[] {
  const seen = new Set<string>();
  const out: RestoredFrontDoorMessage[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const structured = mapStoredMessageToFrontDoor(item);
    if (!structured) continue;
    out.push({
      id: item.id,
      role: item.role,
      content: structured.text,
      // O usuário é texto puro; só o assistente tem parte estruturada (card/contexto de caso).
      ...(item.role === "assistant" ? { imobStructured: structured } : {}),
      imobPersisted: { conversationId, messageId: item.id },
    });
  }
  return out;
}
