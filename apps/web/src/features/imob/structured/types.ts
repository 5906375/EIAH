import type { ImobPresentationForm } from "@/lib/api";

/**
 * Mensagem mínima que os formulários estruturados do IMOB precisam para
 * abrir, preencher e confirmar. O chat do IMOB (`/app/imob/chat`) e o front
 * door (`/app/chat`) usam tipos próprios mais ricos, compatíveis com este.
 */
export type StructuredThreadRef = {
  id: string;
  label: string;
  status?: "active" | "waiting" | "done" | "blocked";
};

export type StructuredCardCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
};

export type StructuredCard = {
  type: "action" | "risk" | "evidence" | "queue";
  /** Rótulo do selo quando o padrão do tipo não descreve o card (ex.: histórico). */
  chip?: string;
  title: string;
  lines: string[];
  thread?: StructuredThreadRef;
  ctas?: StructuredCardCta[];
};

export type StructuredQuickReply = { id: string; label: string; reply?: string; onSelect?: () => void };

export type StructuredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  form?: ImobPresentationForm;
  thread?: StructuredThreadRef;
  card?: StructuredCard;
  quickReplies?: StructuredQuickReply[];
};

/** O que cada chat precisa oferecer para hospedar os formulários do IMOB. */
export type ImobStructuredFormsHost = {
  /** Thread ativa da conversa (os formulários abrem nela). */
  activeThreadId: string | null;
  appendMessage: (message: StructuredMessage) => void;
  updateMessage: (messageId: string, patch: Partial<StructuredMessage>) => void;
  /** Atualiza uma mensagem a partir do estado atual dela (ex.: lista de imóveis do proprietário). */
  patchMessage: (messageId: string, update: (message: StructuredMessage) => StructuredMessage) => void;
  /** Grava a confirmação no histórico da conversa (nunca o conteúdo do formulário). */
  persistMessage: (message: StructuredMessage, meta: { intent: string; action: string }) => unknown;
  /** Envia um pedido de texto ao chat (itens de menu que abrem formulários do servidor). */
  sendText: (text: string, options: { displayText: string }) => unknown;
  /** Chamado quando um formulário de cadastro é salvo ou cancelado. */
  onFormClosed?: (message: StructuredMessage) => void;
};

export function makeStructuredId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeImobFormValue(value: string) {
  return value.trim();
}

export function normalizeCepValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function resolveFieldAutofillTarget(
  field: ImobPresentationForm["fields"][number],
  target: "address" | "city" | "neighborhood",
) {
  return field.lookup?.kind === "cep" ? field.lookup.autoFillTargets[target] ?? null : null;
}

export function formatUploadSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
