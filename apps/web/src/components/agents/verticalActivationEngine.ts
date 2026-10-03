import {
  ApiError,
  apiConfirmChatVerticalActivation,
  apiPreviewChatVerticalActivation,
  apiRequestVerticalAccess,
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
 *
 * ADR-011 §2.4: sem liberação da EIAH, quem pode ativar recebe a oferta de pedir a liberação;
 * o pedido só sai com a confirmação explícita logo depois da oferta, e o servidor valida tudo de novo.
 */

export const ACTIVATION_CONFIRM_REPLY = "Confirmar ativação do IMOB";
export const ACTIVATION_CANCEL_REPLY = "Cancelar ativação";
export const ACTIVATION_REQUEST_REPLY = "Ativar o IMOB neste workspace";
export const ACCESS_REQUEST_CONFIRM_REPLY = "Pedir liberação do IMOB";
export const ACCESS_REQUEST_CANCEL_REPLY = "Agora não";

/** Proposta pendente, congelada no snapshot da mensagem do assistente. */
export type VerticalActivationSnapshot =
  | { status: "proposed"; verticalId: "imob"; registryVersion: string }
  | {
      status: "activated" | "already_active" | "cancelled" | "failed" | "access_request_proposed" | "access_requested";
      verticalId: "imob";
    };

export type VerticalActivationRequest =
  | { step: "preview"; verticalId: "imob" }
  | { step: "confirm"; verticalId: "imob"; registryVersion: string }
  | { step: "cancel"; verticalId: "imob" }
  | { step: "request_access"; verticalId: "imob" }
  | { step: "cancel_access_request"; verticalId: "imob" };

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

/** Confirmação explícita do pedido de liberação (um "sim" solto não pede nada). */
export function isAccessRequestConfirmation(input: string) {
  const text = normalize(input);
  return text === normalize(ACCESS_REQUEST_CONFIRM_REPLY) || /^(confirmo|sim,?) (o )?pedido de liberacao$/.test(text);
}

export function isAccessRequestCancel(input: string) {
  const text = normalize(input);
  return text === normalize(ACCESS_REQUEST_CANCEL_REPLY) || /^(cancelar|cancela|nao|agora nao)$/.test(text);
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
  if (pending?.status === "access_request_proposed") {
    if (isAccessRequestConfirmation(input)) return { step: "request_access", verticalId: pending.verticalId };
    if (isAccessRequestCancel(input)) return { step: "cancel_access_request", verticalId: pending.verticalId };
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

const APPROVAL_CODES = new Set([
  "VERTICAL_NOT_APPROVED",
  "VERTICAL_APPROVAL_PENDING",
  "VERTICAL_APPROVAL_REFUSED",
  "VERTICAL_APPROVAL_REVOKED",
]);

/**
 * ADR-011: sem liberação da EIAH a conversa explica o estado; não propõe ativar. Quem pode ativar
 * (e não tem pedido em análise) recebe a oferta de pedir a liberação, que só sai com confirmação.
 */
function describeApprovalBlock(code: string | undefined, message: string | undefined, canRequest = false): VerticalActivationPresentation {
  if (canRequest) {
    return {
      content: [
        message ?? "O IMOB precisa ser liberado pela EIAH antes de ativar.",
        "",
        "Quer pedir a liberação à EIAH agora? Um administrador da EIAH analisa e decide; você recebe um aviso aqui quando houver decisão.",
        `Nada é enviado até você confirmar. Para seguir, responda "${ACCESS_REQUEST_CONFIRM_REPLY}".`,
      ].join("\n"),
      quickReplies: [ACCESS_REQUEST_CONFIRM_REPLY, ACCESS_REQUEST_CANCEL_REPLY],
      activation: { status: "access_request_proposed", verticalId: "imob" },
    };
  }
  const hint = code === "VERTICAL_NOT_APPROVED" ? " Quem pode ativar produtos neste workspace pode pedir a liberação." : "";
  return {
    content: `${message ?? "O IMOB precisa ser liberado pela EIAH antes de ativar."}${hint}`,
    quickReplies: [],
    activation: { status: "failed", verticalId: "imob" },
  };
}

export function describeActivationPreview(preview: ChatVerticalActivationPreview): VerticalActivationPresentation {
  if (preview.status === "approval_required") {
    return describeApprovalBlock(preview.approval.code, preview.approval.message, preview.canRequest === true);
  }
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

export function describeAccessRequestResult(
  outcome: "requested" | "already_requested" | "already_approved",
): VerticalActivationPresentation {
  if (outcome === "already_approved") {
    return {
      content: "O IMOB já está liberado pela EIAH neste workspace. Se quiser ativar agora, peça para ativar o IMOB.",
      quickReplies: [ACTIVATION_REQUEST_REPLY],
      activation: { status: "access_requested", verticalId: "imob" },
    };
  }
  return {
    content: outcome === "requested"
      ? "Pedido de liberação enviado à EIAH! Agora é com a gente: um administrador vai analisar e, assim que houver decisão, o aviso aparece aqui na conversa (e no Marketplace)."
      : "Você já tem um pedido de liberação em análise pela EIAH. Assim que houver decisão, o aviso aparece aqui na conversa (e no Marketplace).",
    quickReplies: [],
    activation: { status: "access_requested", verticalId: "imob" },
  };
}

export function describeAccessRequestFailure(error: unknown): VerticalActivationPresentation {
  const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
  return {
    content: body?.error?.code === "VERTICAL_ACCESS_REQUEST_FORBIDDEN"
      ? "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode pedir a liberação."
      : "Não consegui enviar o pedido de liberação agora. Nada foi enviado; tente de novo ou peça pelo Marketplace.",
    quickReplies: [],
    activation: { status: "failed", verticalId: "imob" },
  };
}

export function describeActivationFailure(error: unknown): VerticalActivationPresentation {
  const body = error instanceof ApiError ? (error.body as { error?: { code?: string; message?: string } } | undefined) : undefined;
  const code = body?.error?.code;
  if (code && APPROVAL_CODES.has(code)) return describeApprovalBlock(code, body?.error?.message);
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
    requestAccess?: typeof apiRequestVerticalAccess;
  } = { preview: apiPreviewChatVerticalActivation, confirm: apiConfirmChatVerticalActivation, requestAccess: apiRequestVerticalAccess },
): Promise<D | null> {
  const request = decision?.verticalActivationRequest;
  if (!decision || !request) return decision;
  let presentation: VerticalActivationPresentation;
  if (request.step === "cancel") {
    presentation = { content: "Ativação cancelada. Nada foi alterado.", quickReplies: [], activation: { status: "cancelled", verticalId: "imob" } };
  } else if (request.step === "cancel_access_request") {
    presentation = { content: "Tudo bem, nenhum pedido foi enviado. Quando quiser seguir, é só me dizer \"ativar o IMOB\".", quickReplies: [], activation: { status: "cancelled", verticalId: "imob" } };
  } else if (request.step === "request_access") {
    try {
      const requestAccess = api.requestAccess ?? apiRequestVerticalAccess;
      presentation = describeAccessRequestResult((await requestAccess({ vertical: "IMOB", channel: "chat" })).data.outcome);
    } catch (error) {
      presentation = describeAccessRequestFailure(error);
    }
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
