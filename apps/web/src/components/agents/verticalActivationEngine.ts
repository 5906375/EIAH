import {
  ApiError,
  apiConfirmChatVerticalActivation,
  apiPreviewChatVerticalActivation,
  apiRequestVerticalAccess,
  type ChatVerticalActivationConfirmResult,
  type ChatVerticalActivationPreview,
} from "@/lib/api";
import { syncSessionContext } from "@/state/sessionContextSync";

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

/** Verticais que a conversa sabe ativar (mesmo catálogo de `POST /chat/vertical-activation`). */
export type ActivatableVerticalId = "imob" | "log";

/**
 * Texto e botões de cada vertical, derivados da vertical efetivamente resolvida no turno. O IMOB mantém exatamente
 * os textos e botões anteriores; nenhuma vertical herda texto de outra e vertical desconhecida não cai em IMOB.
 */
type VerticalActivationCopy = {
  confirmReply: string;
  requestAccessReply: string;
  activateReply: string;
  notPermitted: string;
  approvalRequired: string;
  previewQuestion: string;
  alreadyActive: string;
  alreadyActiveOnConfirm: string;
  activated: string;
  accessAlreadyApproved: string;
  accessCancelled: string;
  activationFailed: string;
  sessionSyncFailed: string;
};

const LOG_INSTALLED_TEXT =
  "Logística & Comex está instalada neste workspace. O contexto permanece no Front Door e depende de liberação, vínculo ativo e política específica. Nenhuma ação operacional foi concedida.";

const VERTICAL_COPY: Record<ActivatableVerticalId, VerticalActivationCopy> = {
  imob: {
    confirmReply: ACTIVATION_CONFIRM_REPLY,
    requestAccessReply: ACCESS_REQUEST_CONFIRM_REPLY,
    activateReply: ACTIVATION_REQUEST_REPLY,
    notPermitted:
      "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode ativar o IMOB neste workspace. Peça ao proprietário para ativar ou para conceder a permissão (Perfil → Gerir funções).",
    approvalRequired: "O IMOB precisa ser liberado pela EIAH antes de ativar.",
    previewQuestion: "Quer ativar o IMOB neste workspace? A ativação:",
    alreadyActive: "O IMOB já está ativo neste workspace. Pode pedir, por exemplo, para cadastrar um imóvel.",
    alreadyActiveOnConfirm: "O IMOB já estava ativo neste workspace. Nada foi alterado.",
    activated:
      "IMOB ativado neste workspace. A partir de agora, pedidos como cadastrar imóvel, proprietário ou locação seguem com o IMOB nesta conversa.",
    accessAlreadyApproved: "O IMOB já está liberado pela EIAH neste workspace. Se quiser ativar agora, peça para ativar o IMOB.",
    accessCancelled: 'Tudo bem, nenhum pedido foi enviado. Quando quiser seguir, é só me dizer "ativar o IMOB".',
    activationFailed: "Não consegui ativar o IMOB agora. Nada foi alterado; tente de novo ou ative pelo Marketplace.",
    sessionSyncFailed: "O IMOB foi ativado, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.",
  },
  log: {
    confirmReply: "Confirmar ativação de Logística",
    requestAccessReply: "Pedir liberação de Logística",
    activateReply: "Ativar Logística & Comex neste workspace",
    notPermitted:
      "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode ativar Logística & Comex neste workspace. Peça ao proprietário para ativar ou para conceder a permissão (Perfil → Gerir funções).",
    approvalRequired: "Logística & Comex precisa ser liberada pela EIAH antes de ativar.",
    previewQuestion: "Quer ativar Logística & Comex neste workspace? A ativação:",
    alreadyActive: LOG_INSTALLED_TEXT,
    alreadyActiveOnConfirm: LOG_INSTALLED_TEXT,
    activated: LOG_INSTALLED_TEXT,
    accessAlreadyApproved: "Logística & Comex já está liberada pela EIAH neste workspace. Se quiser ativar agora, peça para ativar Logística & Comex.",
    accessCancelled: 'Tudo bem, nenhum pedido foi enviado. Quando quiser seguir, é só me dizer "ativar Logística".',
    activationFailed: "Não consegui ativar Logística & Comex agora. Nada foi alterado; tente de novo ou ative pelo Marketplace.",
    sessionSyncFailed: "Logística & Comex foi ativada, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.",
  },
};

export const verticalActivationCopy = (verticalId: ActivatableVerticalId) => VERTICAL_COPY[verticalId];

/** Vertical do servidor → vertical ativável. Valor desconhecido NÃO vira IMOB: o chamador trata como falha. */
export function asActivatableVertical(value: unknown): ActivatableVerticalId | null {
  return value === "imob" || value === "log" ? value : null;
}

/** Proposta pendente, congelada no snapshot da mensagem do assistente. */
export type VerticalActivationSnapshot =
  | { status: "proposed"; verticalId: "imob" | "log"; registryVersion: string }
  | {
      status: "activated" | "already_active" | "cancelled" | "failed" | "access_request_proposed" | "access_requested";
      verticalId: "imob" | "log";
    };

export type VerticalActivationRequest =
  | { step: "preview"; verticalId: "imob" | "log" }
  | { step: "confirm"; verticalId: "imob" | "log"; registryVersion: string }
  | { step: "cancel"; verticalId: "imob" | "log" }
  | { step: "request_access"; verticalId: "imob" | "log" }
  | { step: "cancel_access_request"; verticalId: "imob" | "log" };

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[.!]+$/g, "").replace(/\s+/g, " ").trim();

export function isVerticalActivationRequest(input: string) {
  const text = normalize(input);
  return !(/\bimob\b/.test(text) && /\blogistica\b/.test(text)) && /\b(ativar|ative|habilitar|habilite|instalar|instale|liberar|libere)\b/.test(text) && /\b(imob|logistica)\b/.test(text) && !text.endsWith("?");
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
    if (pending.verticalId === "log" ? normalize(input) === normalize(VERTICAL_COPY.log.confirmReply) : isActivationConfirmation(input)) return { step: "confirm", verticalId: pending.verticalId, registryVersion: pending.registryVersion };
    if (isActivationCancel(input)) return { step: "cancel", verticalId: pending.verticalId };
  }
  if (pending?.status === "access_request_proposed") {
    if (pending.verticalId === "log" ? normalize(input) === normalize(VERTICAL_COPY.log.requestAccessReply) : isAccessRequestConfirmation(input)) return { step: "request_access", verticalId: pending.verticalId };
    if (isAccessRequestCancel(input)) return { step: "cancel_access_request", verticalId: pending.verticalId };
  }
  if (isVerticalActivationRequest(input)) return { step: "preview", verticalId: /\blogistica\b/.test(normalize(input)) ? "log" : "imob" };
  return null;
}

export type VerticalActivationPresentation = {
  content: string;
  quickReplies: string[];
  activation: VerticalActivationSnapshot;
};

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
function describeApprovalBlock(
  code: string | undefined,
  message: string | undefined,
  canRequest: boolean,
  verticalId: ActivatableVerticalId,
): VerticalActivationPresentation {
  const copy = VERTICAL_COPY[verticalId];
  if (canRequest) {
    return {
      content: [
        message ?? copy.approvalRequired,
        "",
        "Quer pedir a liberação à EIAH agora? Um administrador da EIAH analisa e decide; você recebe um aviso aqui quando houver decisão.",
        `Nada é enviado até você confirmar. Para seguir, responda "${copy.requestAccessReply}".`,
      ].join("\n"),
      quickReplies: [copy.requestAccessReply, ACCESS_REQUEST_CANCEL_REPLY],
      activation: { status: "access_request_proposed", verticalId },
    };
  }
  const hint = code === "VERTICAL_NOT_APPROVED" ? " Quem pode ativar produtos neste workspace pode pedir a liberação." : "";
  return {
    content: `${message ?? copy.approvalRequired}${hint}`,
    quickReplies: [],
    activation: { status: "failed", verticalId },
  };
}

/** Vertical efetiva do resultado: a pedida pelo engine; se ausente, a do servidor — nunca um padrão silencioso. */
function resolveVerticalOrThrow(requested: ActivatableVerticalId | undefined, serverValue: unknown): ActivatableVerticalId {
  const resolved = requested ?? asActivatableVertical(serverValue);
  if (!resolved) throw new Error("vertical_not_activatable");
  return resolved;
}

export function describeActivationPreview(preview: ChatVerticalActivationPreview, verticalId?: ActivatableVerticalId): VerticalActivationPresentation {
  const vertical = resolveVerticalOrThrow(verticalId, preview.verticalId);
  const copy = VERTICAL_COPY[vertical];
  if (preview.status === "approval_required") {
    return describeApprovalBlock(preview.approval.code, preview.approval.message, preview.canRequest === true, vertical);
  }
  if (preview.status === "not_permitted") {
    return { content: copy.notPermitted, quickReplies: [], activation: { status: "failed", verticalId: vertical } };
  }
  if (preview.status === "already_active") {
    return { content: copy.alreadyActive, quickReplies: [], activation: { status: "already_active", verticalId: vertical } };
  }
  return {
    content: [
      copy.previewQuestion,
      ...preview.effects.map((effect) => `- ${effect}`),
      "",
      `Nada muda até você confirmar. Para seguir, responda "${copy.confirmReply}".`,
    ].join("\n"),
    quickReplies: [copy.confirmReply, ACTIVATION_CANCEL_REPLY],
    activation: { status: "proposed", verticalId: vertical, registryVersion: preview.registryVersion },
  };
}

export function describeActivationConfirmation(result: ChatVerticalActivationConfirmResult, verticalId?: ActivatableVerticalId): VerticalActivationPresentation {
  const vertical = resolveVerticalOrThrow(verticalId, result.verticalId);
  const copy = VERTICAL_COPY[vertical];
  if (result.status === "already_active") {
    return { content: copy.alreadyActiveOnConfirm, quickReplies: [], activation: { status: "already_active", verticalId: vertical } };
  }
  return { content: copy.activated, quickReplies: [], activation: { status: "activated", verticalId: vertical } };
}

export function describeAccessRequestResult(
  outcome: "requested" | "already_requested" | "already_approved",
  verticalId: ActivatableVerticalId = "imob",
): VerticalActivationPresentation {
  const copy = VERTICAL_COPY[verticalId];
  if (outcome === "already_approved") {
    return {
      content: copy.accessAlreadyApproved,
      quickReplies: [copy.activateReply],
      activation: { status: "access_requested", verticalId },
    };
  }
  return {
    content: outcome === "requested"
      ? "Pedido de liberação enviado à EIAH! Agora é com a gente: um administrador vai analisar e, assim que houver decisão, o aviso aparece aqui na conversa (e no Marketplace)."
      : "Você já tem um pedido de liberação em análise pela EIAH. Assim que houver decisão, o aviso aparece aqui na conversa (e no Marketplace).",
    quickReplies: [],
    activation: { status: "access_requested", verticalId },
  };
}

export function describeAccessRequestFailure(error: unknown, verticalId: ActivatableVerticalId = "imob"): VerticalActivationPresentation {
  const body = error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined) : undefined;
  return {
    content: body?.error?.code === "VERTICAL_ACCESS_REQUEST_FORBIDDEN"
      ? "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode pedir a liberação."
      : "Não consegui enviar o pedido de liberação agora. Nada foi enviado; tente de novo ou peça pelo Marketplace.",
    quickReplies: [],
    activation: { status: "failed", verticalId },
  };
}

export function describeActivationFailure(error: unknown, verticalId: ActivatableVerticalId = "imob"): VerticalActivationPresentation {
  const copy = VERTICAL_COPY[verticalId];
  const body = error instanceof ApiError ? (error.body as { error?: { code?: string; message?: string } } | undefined) : undefined;
  const code = body?.error?.code;
  if (code && APPROVAL_CODES.has(code)) return describeApprovalBlock(code, body?.error?.message, false, verticalId);
  if (code === "PRODUCT_ACTIVATION_FORBIDDEN") {
    return { content: copy.notPermitted, quickReplies: [], activation: { status: "failed", verticalId } };
  }
  return {
    content: code === "ACTIVATION_PROPOSAL_STALE"
      ? "O estado do workspace mudou desde a proposta, então nada foi ativado. Peça a ativação de novo para ver a proposta atualizada."
      : copy.activationFailed,
    quickReplies: code === "ACTIVATION_PROPOSAL_STALE" ? [copy.activateReply] : ["Ver opções no Marketplace"],
    activation: { status: "failed", verticalId },
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
    syncSession?: (domain: "imob" | "logistica" | "core") => Promise<unknown>;
  } = { preview: apiPreviewChatVerticalActivation, confirm: apiConfirmChatVerticalActivation, requestAccess: apiRequestVerticalAccess },
): Promise<D | null> {
  const request = decision?.verticalActivationRequest;
  if (!decision || !request) return decision;
  const vertical = request.verticalId;
  const copy = VERTICAL_COPY[vertical];
  let presentation: VerticalActivationPresentation;
  if (request.step === "cancel") {
    presentation = { content: "Ativação cancelada. Nada foi alterado.", quickReplies: [], activation: { status: "cancelled", verticalId: vertical } };
  } else if (request.step === "cancel_access_request") {
    presentation = { content: copy.accessCancelled, quickReplies: [], activation: { status: "cancelled", verticalId: vertical } };
  } else if (request.step === "request_access") {
    try {
      const requestAccess = api.requestAccess ?? apiRequestVerticalAccess;
      presentation = describeAccessRequestResult((await requestAccess({ vertical: vertical === "log" ? "LOGISTICA" : "IMOB", channel: "chat" })).data.outcome, vertical);
    } catch (error) {
      presentation = describeAccessRequestFailure(error, vertical);
    }
  } else {
    try {
      presentation = request.step === "preview"
        ? describeActivationPreview((await api.preview({ verticalId: vertical })).data, vertical)
        : describeActivationConfirmation(
            (await api.confirm({ verticalId: vertical, registryVersion: request.registryVersion, confirmed: true })).data,
            vertical,
          );
    } catch (error) {
      presentation = describeActivationFailure(error, vertical);
    }
  }
  if (presentation.activation.status === "activated" || presentation.activation.status === "already_active") {
    try {
      // Logística só vira domínio ativo da sessão depois de um handoff autorizado (acesso ao contexto confirmado pelo servidor);
      // ativar a instalação não concede esse acesso, por isso a sincronização aqui é a do domínio core.
      await (api.syncSession ?? syncSessionContext)(vertical === "log" ? "core" : vertical);
    } catch {
      // A ativação já foi resolvida pelo servidor; falha de reidratação não a desfaz.
      presentation.content = copy.sessionSyncFailed;
    }
  }
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalActivation: presentation.activation,
  };
}
