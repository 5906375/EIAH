import { apiRequestChatVerticalHandoff, type ChatVerticalHandoffResult } from "@/lib/api";

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
  capabilityId: string;
  mode: "read_only" | "requires_write" | "critical_action";
};

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

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

export type VerticalHandoffPresentation = {
  content: string;
  quickReplies: string[];
  handoff: ChatVerticalHandoffResult;
};

/** Texto e próximos passos por resultado da avaliação (permitido ou cada motivo de bloqueio). */
export function describeVerticalHandoffResult(result: ChatVerticalHandoffResult): VerticalHandoffPresentation {
  if (result.ok) {
    const label = result.handoff.vertical.label ?? result.handoff.vertical.id.toUpperCase();
    return {
      // Os formulários do IMOB entram nesta conversa na etapa D da ADR-010; até lá, o caminho é a tela do IMOB.
      content: result.handoff.vertical.id === "imob"
        ? `Sigo com o ${label} nesta conversa: o acesso foi confirmado neste workspace. Por enquanto, os formulários de cadastro, locação e contrato abrem na tela do IMOB: [Abrir IMOB](/app/imob/chat).`
        : `Sigo com o ${label} nesta conversa: o acesso foi confirmado neste workspace.`,
      quickReplies: [],
      handoff: result,
    };
  }
  switch (result.reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return {
        content: "O IMOB ainda não está instalado neste workspace. Depois de ativado, cadastros, locações e contratos acontecem aqui mesmo nesta conversa.",
        quickReplies: ["Ver opções no Marketplace", "Entender planos com IMOB"],
        handoff: result,
      };
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return {
        content: "O IMOB está instalado, mas não está ativo para uso neste workspace (instalação, plano ou agentes pendentes). Regularize a ativação para continuar por aqui.",
        quickReplies: ["Ver opções no Marketplace", "Falar com comercial"],
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
    const response = await apiRequestChatVerticalHandoff({
      ...request,
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
    if (data && data.ok === true && data.handoff?.version === "chat.vertical_handoff.v2" && data.handoff.outcome === "allowed") return data;
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
};

/** Etapa assíncrona do engine: avalia o handoff no servidor e resolve texto e próximos passos. */
export async function enrichLauncherDecisionWithVerticalHandoff<D extends DecisionWithHandoff>(
  decision: D | null,
  refs?: { conversationId?: string | null; threadId?: string | null },
  request: (req: VerticalHandoffRequest, r?: typeof refs) => Promise<ChatVerticalHandoffResult> = requestVerticalHandoff,
): Promise<D | null> {
  if (!decision?.verticalHandoffRequest) return decision;
  const result = await request(decision.verticalHandoffRequest, refs);
  const presentation = describeVerticalHandoffResult(result);
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalHandoff: presentation.handoff,
  };
}

/** Congela o handoff no snapshot da mensagem; com handoff permitido, a conversa passa a ter contexto da vertical. */
export function attachVerticalHandoffToSnapshot<S extends { verticalContext?: "IMOB" | "LEGAL" | null; verticalHandoff?: ChatVerticalHandoffResult | null }>(
  snapshot: S,
  decision: DecisionWithHandoff | null,
): S {
  if (!decision?.verticalHandoff) return snapshot;
  const allowedImob = decision.verticalHandoff.ok && decision.verticalHandoff.handoff.vertical.id === "imob";
  return {
    ...snapshot,
    verticalHandoff: decision.verticalHandoff,
    ...(allowedImob ? { verticalContext: "IMOB" as const } : {}),
  };
}
