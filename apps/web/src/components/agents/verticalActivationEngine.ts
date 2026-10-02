import {
  ApiError,
  apiConfirmChatVerticalActivation,
  apiPreviewChatVerticalActivation,
  type ChatVerticalActivationConfirmResult,
  type ChatVerticalActivationPreview,
} from "@/lib/api";

/**
 * Engine do front door para ativar uma vertical pela conversa (ADR-010,
 * etapa F). Nada é ativado sem confirmação explícita do usuário na conversa:
 * 1) pedido de ativação → proposta com os efeitos (servidor, só leitura);
 * 2) "Confirmar ativação do IMOB" logo depois da proposta → servidor ativa
 *    pelo mesmo serviço do Marketplace, se o estado não mudou.
 * Qualquer outra resposta descarta a proposta. O launcher só renderiza.
 */

export const ACTIVATION_CONFIRM_REPLY = "Confirmar ativação do IMOB";
export const ACTIVATION_CANCEL_REPLY = "Cancelar ativação";
export const ACTIVATION_REQUEST_REPLY = "Ativar o IMOB neste workspace";

/** Proposta pendente, congelada no snapshot da mensagem do assistente. */
export type VerticalActivationSnapshot =
  | { status: "proposed"; verticalId: "imob"; registryVersion: string }
  | { status: "activated" | "already_active" | "cancelled" | "failed"; verticalId: "imob" };

export type VerticalActivationRequest =
  | { step: "preview"; verticalId: "imob" }
  | { step: "confirm"; verticalId: "imob"; registryVersion: string }
  | { step: "cancel"; verticalId: "imob" };

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[.!]+$/g, "").replace(/\s+/g, " ").trim();

export function isVerticalActivationRequest(input: string) {
  const text = normalize(input);
  return /\b(ativar|ative|habilitar|habilite|instalar|instale|liberar|libere)\b/.test(text) && /\bimob\b/.test(text) && !text.endsWith("?");
}

/** Confirmação explícita: só frases de confirmação de ativação (um "sim" solto não ativa nada). */
export function isActivationConfirmation(input: string) {
  const text = normalize(input);
  return text === normalize(ACTIVATION_CONFIRM_REPLY)
    || /^(confirmo|confirmar|confirma)( a)? ativacao( do imob)?$/.test(text)
    || /^sim,? (pode )?ativar( o imob)?$/.test(text);
}

export function isActivationCancel(input: string) {
  const text = normalize(input);
  return text === normalize(ACTIVATION_CANCEL_REPLY) || /^(cancelar|cancela|nao|não)( a ativacao)?$/.test(text);
}

/** Decide o passo de ativação do turno (ou nenhum), a partir do pedido e da proposta pendente. */
export function resolveVerticalActivationStep(
  input: string,
  pending: VerticalActivationSnapshot | null | undefined,
): VerticalActivationRequest | null {
  if (pending?.status === "proposed") {
    if (isActivationConfirmation(input)) return { step: "confirm", verticalId: pending.verticalId, registryVersion: pending.registryVersion };
    if (isActivationCancel(input)) return { step: "cancel", verticalId: pending.verticalId };
  }
  if (isVerticalActivationRequest(input)) return { step: "preview", verticalId: "imob" };
  return null;
}

export type VerticalActivationPresentation = {
  content: string;
  quickReplies: string[];
  activation: VerticalActivationSnapshot;
};

const NOT_PERMITTED_TEXT =
  "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode ativar o IMOB neste workspace. Peça ao proprietário para ativar ou para conceder a permissão (Perfil → Gerir funções).";

export function describeActivationPreview(preview: ChatVerticalActivationPreview): VerticalActivationPresentation {
  if (preview.status === "not_permitted") {
    return { content: NOT_PERMITTED_TEXT, quickReplies: [], activation: { status: "failed", verticalId: "imob" } };
  }
  if (preview.status === "already_active") {
    return {
      content: "O IMOB já está ativo neste workspace. Pode pedir, por exemplo, para cadastrar um imóvel.",
      quickReplies: [],
      activation: { status: "already_active", verticalId: "imob" },
    };
  }
  return {
    content: [
      "Quer ativar o IMOB neste workspace? A ativação:",
      ...preview.effects.map((effect) => `- ${effect}`),
      "",
      `Nada muda até você confirmar. Para seguir, responda "${ACTIVATION_CONFIRM_REPLY}".`,
    ].join("\n"),
    quickReplies: [ACTIVATION_CONFIRM_REPLY, ACTIVATION_CANCEL_REPLY],
    activation: { status: "proposed", verticalId: "imob", registryVersion: preview.registryVersion },
  };
}

export function describeActivationConfirmation(result: ChatVerticalActivationConfirmResult): VerticalActivationPresentation {
  if (result.status === "already_active") {
    return {
      content: "O IMOB já estava ativo neste workspace. Nada foi alterado.",
      quickReplies: [],
      activation: { status: "already_active", verticalId: "imob" },
    };
  }
  return {
    content: "IMOB ativado neste workspace. A partir de agora, pedidos como cadastrar imóvel, proprietário ou locação seguem com o IMOB nesta conversa.",
    quickReplies: [],
    activation: { status: "activated", verticalId: "imob" },
  };
}

export function describeActivationFailure(error: unknown): VerticalActivationPresentation {
  const code = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined)?.error?.code : undefined;
  if (code === "PRODUCT_ACTIVATION_FORBIDDEN") {
    return { content: NOT_PERMITTED_TEXT, quickReplies: [], activation: { status: "failed", verticalId: "imob" } };
  }
  return {
    content: code === "ACTIVATION_PROPOSAL_STALE"
      ? "O estado do workspace mudou desde a proposta, então nada foi ativado. Peça a ativação de novo para ver a proposta atualizada."
      : "Não consegui ativar o IMOB agora. Nada foi alterado; tente de novo ou ative pelo Marketplace.",
    quickReplies: code === "ACTIVATION_PROPOSAL_STALE" ? [ACTIVATION_REQUEST_REPLY] : ["Ver opções no Marketplace"],
    activation: { status: "failed", verticalId: "imob" },
  };
}

type DecisionWithActivation = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalActivationRequest?: VerticalActivationRequest;
  verticalActivation?: VerticalActivationSnapshot;
};

/** Etapa assíncrona do engine: proposta (só leitura) ou confirmação (escrita) no servidor. */
export async function enrichLauncherDecisionWithVerticalActivation<D extends DecisionWithActivation>(
  decision: D | null,
  api: {
    preview: typeof apiPreviewChatVerticalActivation;
    confirm: typeof apiConfirmChatVerticalActivation;
  } = { preview: apiPreviewChatVerticalActivation, confirm: apiConfirmChatVerticalActivation },
): Promise<D | null> {
  const request = decision?.verticalActivationRequest;
  if (!decision || !request) return decision;
  let presentation: VerticalActivationPresentation;
  if (request.step === "cancel") {
    presentation = { content: "Ativação cancelada. Nada foi alterado.", quickReplies: [], activation: { status: "cancelled", verticalId: "imob" } };
  } else {
    try {
      presentation = request.step === "preview"
        ? describeActivationPreview((await api.preview({ verticalId: request.verticalId })).data)
        : describeActivationConfirmation(
            (await api.confirm({ verticalId: request.verticalId, registryVersion: request.registryVersion, confirmed: true })).data,
          );
    } catch (error) {
      presentation = describeActivationFailure(error);
    }
  }
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalActivation: presentation.activation,
  };
}
