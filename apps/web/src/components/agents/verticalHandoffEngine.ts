import { apiGetChatVerticalRegistry, apiRequestChatVerticalHandoff, type ChatVerticalHandoffResult } from "@/lib/api";
import { syncSessionContext } from "@/state/sessionContextSync";
import { getSession } from "@/state/sessionStore";
import { ACTIVATION_REQUEST_REPLY, type VerticalActivationSnapshot } from "./verticalActivationEngine";
import { getPublicProductTaxonomyEntryByAnyName } from "@eiah/core/taxonomy/publicProductTaxonomy";

/**
 * Engine do front door (`/app/chat`) para handoff a uma vertical na mesma
 * conversa (ADR-010, etapa C). Decide quando o pedido é operacional do IMOB,
 * pede ao servidor a avaliação governada (`chat.vertical_handoff.v2`,
 * fail-closed) e devolve o texto, o card e os próximos passos já resolvidos.
 * O launcher só renderiza.
 */

export const IMOB_CRM_HANDOFF_REQUEST = {
  verticalId: "imob",
  capabilityId: "crm.forms",
  mode: "requires_write",
} as const;

export type VerticalHandoffRequest = {
  verticalId: string;
  /** Explicit transfers discover a read-only capability from the existing server registry. */
  capabilityId?: string;
  mode: "read_only" | "requires_write" | "critical_action";
};

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

/** EIAH transfer intent: a complete command and named target, never an isolated domain word. */
export function resolveExplicitVerticalHandoffRequest(input: string): VerticalHandoffRequest | null {
  const match = /^(?:(?:quero|preciso|vamos) )?(?:mudar|trocar|ir|seguir|voltar) para (?:a |o |vertical )?([a-z][a-z0-9_-]{1,39})[.!]?$/.exec(normalize(input));
  if (!match || match[1] === "core") return null;
  const namedProduct = getPublicProductTaxonomyEntryByAnyName(match[1]);
  if (namedProduct && namedProduct.taxonomyClass !== "vertical") return null;
  return { verticalId: match[1], mode: "read_only" };
}

const IMOB_OPERATIONAL_ACTION =
  /\b(cadastr\w*|registr\w*|inclu\w*|adicion\w*|edit\w*|corrig\w*|atualiz\w*|arquiv\w*|encerr\w*|anex\w*|ger\w*|fazer|faca|criar|crie|lancar|lance)\b/;
const IMOB_OPERATIONAL_OBJECT =
  /\b(imove(l|is)|apartamentos?|aptos?|casas?|kitnets?|salas? comercia(l|is)|terrenos?|proprietari[oa]s?|locador(es|a)?|locac(ao|oes)|alugue(l|is)|locatari[oa]s?|inquilin[oa]s?|contratos? de (locacao|venda|compra e venda|aluguel)|minutas?|vistorias?|matriculas?)\b/;

/** Pedido operacional de IMOB (cadastrar, editar, encerrar, anexar, gerar contrato…), não uma pergunta sobre o produto. */
export function isImobOperationalRequest(input: string) {
  const text = normalize(input);
  if (!text || (text.endsWith("?") && /\b(como|o que|quanto|qual|quais|funciona|serve)\b/.test(text))) return false;
  return IMOB_OPERATIONAL_ACTION.test(text) && IMOB_OPERATIONAL_OBJECT.test(text);
}

export const VERTICAL_HANDOFF_CAPABILITY_LABELS: Record<string, string> = {
  "crm.forms": "Cadastros, locações, documentos e contratos",
  "knowledge.search": "Busca na base do IMOB",
  "inventory.preview": "Consulta de imóveis",
};

/** Rótulo legível do bloqueio, para o card (o código técnico fica só no snapshot). */
export function verticalHandoffBlockLabel(reasonCode: string) {
  switch (reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return "não ativo neste workspace";
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return "ativação pendente";
    case "VERTICAL_SCOPE_DENIED":
      return "sem permissão para a sua função";
    case "VERTICAL_HITL_REQUIRED":
      return "precisa de aprovação humana";
    default:
      return "acesso não confirmado";
  }
}

export type VerticalHandoffPresentation = {
  content: string;
  quickReplies: string[];
  handoff: ChatVerticalHandoffResult;
};

/** Texto e próximos passos por resultado da avaliação (permitido ou cada motivo de bloqueio). */
export function describeVerticalHandoffResult(result: ChatVerticalHandoffResult, verticalId = "imob"): VerticalHandoffPresentation {
  if (result.ok) {
    const label = result.handoff.vertical.label ?? result.handoff.vertical.id.toUpperCase();
    return {
      // Os formulários do IMOB entram nesta conversa na etapa D da ADR-010; até lá, o caminho é a tela do IMOB.
      content: result.handoff.vertical.id === "imob"
        ? `Sigo com o ${label} nesta conversa. Cadastros, locações, documentos e contratos ficam aqui mesmo, na barra Proprietários, Imóveis, Locações e Negócios.`
        : `Sigo com o ${label} nesta conversa: o acesso foi confirmado neste workspace.`,
      quickReplies: [],
      handoff: result,
    };
  }
  if (verticalId !== "imob") return {
    content: `Não consegui confirmar uma capacidade de conversa disponível em ${verticalId.toUpperCase()} neste workspace. A revisão IMOB foi pausada e nenhuma ação foi executada.`,
    quickReplies: [], handoff: result,
  };
  switch (result.reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return {
        content: "O IMOB ainda não está ativo neste workspace. Posso ativá-lo por aqui mesmo, com a sua confirmação.",
        quickReplies: [ACTIVATION_REQUEST_REPLY, "Ver opções no Marketplace"],
        handoff: result,
      };
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return {
        content: "O IMOB está instalado, mas não está pronto para uso neste workspace (instalação, plano ou agentes pendentes). Posso refazer a ativação por aqui, com a sua confirmação.",
        quickReplies: [ACTIVATION_REQUEST_REPLY, "Ver opções no Marketplace"],
        handoff: result,
      };
    case "VERTICAL_SCOPE_DENIED":
      return {
        content: "Sua função neste workspace não tem acesso ao IMOB. Peça ao administrador a permissão de uso do IMOB (Perfil → Gerir funções).",
        quickReplies: [],
        handoff: result,
      };
    case "VERTICAL_HITL_REQUIRED":
      return {
        content: "Esta ação precisa de aprovação humana antes de seguir. Nada foi executado.",
        quickReplies: [],
        handoff: result,
      };
    default:
      return {
        content: "Não consegui confirmar o acesso ao IMOB agora. Nada foi executado; tente de novo em instantes.",
        quickReplies: [],
        handoff: { ok: false, reasonCode: result.reasonCode || "VERTICAL_GOVERNANCE_NOT_EVALUATED" },
      };
  }
}

/** Avaliação no servidor; qualquer falha bloqueia (fail-closed). */
export async function requestVerticalHandoff(
  request: VerticalHandoffRequest,
  refs?: { conversationId?: string | null; threadId?: string | null },
): Promise<ChatVerticalHandoffResult> {
  try {
    let capabilityId = request.capabilityId;
    if (!capabilityId) {
      const registry = (await apiGetChatVerticalRegistry())?.data;
      if (registry?.version !== "vertical.registry.v1") return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
      const vertical = registry.verticals.find((entry) => entry.id === request.verticalId);
      if (!vertical) return { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" };
      if (vertical.status !== "enabled") return { ok: false, reasonCode: "VERTICAL_DISABLED" };
      capabilityId = vertical.capabilities.find((entry) => entry.allowedModes.includes("read_only"))?.id;
      if (!capabilityId) return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
    }
    const response = await apiRequestChatVerticalHandoff({
      ...request,
      capabilityId,
      ...(refs?.conversationId || refs?.threadId
        ? {
            refs: {
              ...(refs.conversationId ? { conversationId: refs.conversationId } : {}),
              ...(refs.threadId ? { threadId: refs.threadId } : {}),
            },
          }
        : {}),
    });
    const data = response?.data;
    if (data && data.ok === true && data.handoff?.version === "chat.vertical_handoff.v2" && data.handoff.outcome === "allowed"
      && data.handoff.vertical.id === request.verticalId && data.handoff.capability.id === capabilityId
      && data.handoff.capability.mode === request.mode) return data;
    if (data && data.ok === false && typeof data.reasonCode === "string") return data;
    return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
  } catch {
    return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
  }
}

type DecisionWithHandoff = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalHandoffRequest?: VerticalHandoffRequest;
  verticalHandoff?: ChatVerticalHandoffResult;
  verticalActivation?: VerticalActivationSnapshot;
  /** Pedido original a seguir para a vertical depois do handoff permitido (ex.: abre o formulário pedido). */
  verticalHandoffForwardInput?: string;
  verticalHandoffSessionSync?: "synced" | "failed";
};

/** Etapa assíncrona do engine: avalia o handoff no servidor e resolve texto e próximos passos. */
export async function enrichLauncherDecisionWithVerticalHandoff<D extends DecisionWithHandoff>(
  decision: D | null,
  refs?: { conversationId?: string | null; threadId?: string | null },
  request: (req: VerticalHandoffRequest, r?: typeof refs) => Promise<ChatVerticalHandoffResult> = requestVerticalHandoff,
  syncSession: (domain: "imob") => Promise<unknown> = syncSessionContext,
): Promise<(D & DecisionWithHandoff) | null> {
  if (!decision?.verticalHandoffRequest) return decision;
  const initialSession = getSession();
  const result = await request(decision.verticalHandoffRequest, refs);
  const presentation = describeVerticalHandoffResult(result, decision.verticalHandoffRequest.verticalId);
  let sessionSync: DecisionWithHandoff["verticalHandoffSessionSync"];
  if (result.ok && result.handoff.vertical.id === "imob") {
    try {
      await syncSession("imob");
      const currentSession = getSession();
      if (currentSession.token !== initialSession.token || currentSession.tenantId !== initialSession.tenantId
          || currentSession.workspaceId !== initialSession.workspaceId) throw new Error("Handoff fora da sessão atual.");
      sessionSync = "synced";
    } catch {
      sessionSync = "failed";
      // Não fabrica disponibilidade nem desfaz a decisão de handoff do servidor.
      presentation.content = "O acesso ao IMOB foi confirmado, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.";
    }
  }
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalHandoff: presentation.handoff,
    ...(sessionSync ? { verticalHandoffSessionSync: sessionSync } : {}),
    // Confirmação do handoff não substitui a validação do contexto para encaminhar.
    verticalHandoffForwardInput: result.ok && sessionSync !== "failed" ? decision.verticalHandoffForwardInput : undefined,
  };
}

/** Congela o handoff no snapshot da mensagem; com handoff permitido, a conversa passa a ter contexto da vertical. */
export function attachVerticalHandoffToSnapshot<S extends {
  verticalContext?: "IMOB" | "LEGAL" | null;
  verticalHandoff?: ChatVerticalHandoffResult | null;
  verticalActivation?: VerticalActivationSnapshot | null;
}>(
  snapshot: S,
  decision: DecisionWithHandoff | null,
): S {
  if (decision?.verticalActivation) {
    const activated = decision.verticalActivation.status === "activated" || decision.verticalActivation.status === "already_active";
    snapshot = { ...snapshot, verticalActivation: decision.verticalActivation, ...(activated ? { verticalContext: "IMOB" as const } : {}) };
  }
  if (!decision?.verticalHandoff) return snapshot;
  const allowedImob = decision.verticalHandoff.ok && decision.verticalHandoff.handoff.vertical.id === "imob";
  return {
    ...snapshot,
    verticalHandoff: decision.verticalHandoff,
    ...(allowedImob ? { verticalContext: "IMOB" as const } : {}),
  };
}

/**
 * A conversa está no IMOB quando a última decisão de vertical registrada foi
 * um handoff permitido ou uma ativação confirmada. Reconstrói apenas o
 * histórico de transições; a superfície atual é derivada da sessão.
 */
export function isImobActiveInConversation(
  snapshots: Array<{ verticalHandoff?: ChatVerticalHandoffResult | null; verticalActivation?: VerticalActivationSnapshot | null } | null | undefined>,
) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (!snapshot) continue;
    if (snapshot.verticalHandoff) {
      return snapshot.verticalHandoff.ok && snapshot.verticalHandoff.handoff.vertical.id === "imob";
    }
    if (snapshot.verticalActivation && snapshot.verticalActivation.status !== "proposed" && snapshot.verticalActivation.status !== "cancelled") {
      return snapshot.verticalActivation.status === "activated" || snapshot.verticalActivation.status === "already_active";
    }
  }
  return false;
}
