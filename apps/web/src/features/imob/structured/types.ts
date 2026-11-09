import type { ImobCaseContext, ImobPresentationForm, ImobPresentationWidget, ImobThreadConversationState } from "@/lib/api";

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
  /** Resultado efêmero do campo, reutilizável somente enquanto sua identificação não mudar. */
  propertyUnitIntake?: import("@eiah/contracts").ImobPropertyUnitIntake;
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  form?: ImobPresentationForm;
  thread?: StructuredThreadRef;
  card?: StructuredCard;
  /** Apresentação estruturada devolvida pela vertical (ex.: cartão do especialista transversal). Só leitura. */
  widget?: ImobPresentationWidget;
  quickReplies?: StructuredQuickReply[];
  /** Estado devolvido pelo resolver; continuidade conversacional, sem contrato paralelo. */
  conversationState?: ImobThreadConversationState;
  caseContext?: ImobCaseContext | null;
};

/** O que cada chat precisa oferecer para hospedar os formulários do IMOB. */
export type ImobStructuredFormsHost = {
  /** Revisão de transporte: muda quando outro turno ou resposta toma a conversa. */
  getFormContextKey?: () => string;
  /** Guarda de transporte: ignora respostas de formulário encerrado ou de outra conversa. */
  isFormCurrent?: (message: StructuredMessage) => boolean;
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
  if (/[^\d\s-]/.test(value) || value.replace(/\D/g, "").length > 8) return value;
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Lookup só completa lacunas. Divergências com informação humana ficam explícitas. */
export function planImobCepAutofill(current: Record<string, string>, candidates: Array<[string, string | null]>, cepField: string) {
  const applied: Record<string, string> = {};
  const conflicts: Array<{ field: string; informed: string; lookup: string }> = [];
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const [field, value] of candidates) {
    if (!field || !value) continue;
    const informed = current[field]?.trim();
    if (field === cepField || !informed) applied[field] = value;
    else if (fold(informed) !== fold(value)) conflicts.push({ field, informed, lookup: value });
  }
  return { applied, conflicts };
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
