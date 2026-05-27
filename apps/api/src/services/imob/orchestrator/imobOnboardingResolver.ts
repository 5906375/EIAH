import { buildImobAgentContractV1 } from "../imobAgentContract";
import type { ImobInternalAgentId } from "../agents/imobInternalAgents";
import {
  listAllImobCapabilities,
  type ImobCapabilityRegistryEntry,
  type ImobCapabilityRiskTier,
} from "../imobCapabilityRegistry";
import type { ImobAccessContext } from "../imobConversationContract";
import {
  ImobOnboardingIntent,
  type ImobOnboardingResponse,
} from "../../eiah/contracts/imobOnboardingResponse.v1";

type ImobOnboardingPromptTemplate = {
  label: string;
  prompt: string;
  targetAgent: ImobInternalAgentId | "IMOB_Orchestrator";
  capabilityId: string;
  intents: ImobOnboardingIntent[];
};

export type ResolveImobOnboardingParams = {
  intent: ImobOnboardingIntent;
  tenantId?: string | null;
  workspaceId?: string | null;
  access?: ImobAccessContext | null;
  disabledCapabilityIds?: string[] | null;
  chatRoute?: "/app/imob/chat" | string;
};

const IMOB_ONBOARDING_REGISTRY_VERSION = "imobCapabilityRegistry.v1";

const IMOB_ONBOARDING_PROMPTS: readonly ImobOnboardingPromptTemplate[] = [
  {
    label: "Captação",
    prompt: "quero captar um apartamento de 2 quartos em Itajaí para locação",
    targetAgent: "IMOB_MarketScanAgent",
    capabilityId: "active_capture.scouting",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP],
  },
  {
    label: "Viabilidade",
    prompt: "analisar viabilidade de locação deste imóvel em Itajaí",
    targetAgent: "IMOB_MarketScanAgent",
    capabilityId: "viability.market_analysis",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP, ImobOnboardingIntent.TRANSACTION_HELP],
  },
  {
    label: "Proprietário",
    prompt: "cadastrar proprietário do imóvel da Rua 700",
    targetAgent: "IMOB_OwnerAgent",
    capabilityId: "multiagent.mission_orchestration",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP],
  },
  {
    label: "Qualificação do lead",
    prompt: "qualificar lead para locação em Itajaí com orçamento de 3500",
    targetAgent: "IMOB_LeadAgent",
    capabilityId: "lead.qualify.discovery",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP],
  },
  {
    label: "Priorização do lead",
    prompt: "priorizar este lead pelo potencial de fechamento",
    targetAgent: "IMOB_LeadAgent",
    capabilityId: "lead.scoring",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP, ImobOnboardingIntent.NEXT_ACTION_QUERY],
  },
  {
    label: "Documentos",
    prompt: "o que falta para liberar o contrato deste caso?",
    targetAgent: "IMOB_DocumentAgent",
    capabilityId: "closing.documents_real",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.DOCUMENT_HELP, ImobOnboardingIntent.TRANSACTION_HELP],
  },
  {
    label: "Visitas",
    prompt: "agendar visita para sexta-feira à tarde",
    targetAgent: "IMOB_VisitAgent",
    capabilityId: "schedule.real_calendar",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP],
  },
  {
    label: "Relacionamento",
    prompt: "resumir histórico comercial e objeções deste caso",
    targetAgent: "IMOB_FollowUpAgent",
    capabilityId: "relationship.commercial_memory",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.NEXT_ACTION_QUERY, ImobOnboardingIntent.TRANSACTION_HELP],
  },
  {
    label: "Follow-up",
    prompt: "retomar follow-up comercial deste caso",
    targetAgent: "IMOB_FollowUpAgent",
    capabilityId: "reengagement.continuous",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.TRANSACTION_HELP, ImobOnboardingIntent.NEXT_ACTION_QUERY],
  },
  {
    label: "Estoque",
    prompt: "mostrar imóveis parecidos com este caso para acompanhamento",
    targetAgent: "IMOB_MarketScanAgent",
    capabilityId: "inventory.active_watch",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.CAPTURE_HELP, ImobOnboardingIntent.NEXT_ACTION_QUERY],
  },
  {
    label: "Proposta",
    prompt: "preparar proposta comercial deste caso",
    targetAgent: "IMOB_Orchestrator",
    capabilityId: "multiagent.mission_orchestration",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.TRANSACTION_HELP],
  },
  {
    label: "Próximo passo",
    prompt: "qual o próximo passo desse caso?",
    targetAgent: "IMOB_Orchestrator",
    capabilityId: "multiagent.mission_orchestration",
    intents: [ImobOnboardingIntent.GENERAL_HELP, ImobOnboardingIntent.NEXT_ACTION_QUERY, ImobOnboardingIntent.TRANSACTION_HELP],
  },
] as const;

function hasImobEntitlement(access?: ImobAccessContext | null) {
  return access?.entitlements?.REAL_ESTATE_CORE === true && access?.entitlements?.IMOB_INSTALLED === true;
}

function mapRiskTierToAutonomyLevel(riskTier: ImobCapabilityRiskTier) {
  switch (riskTier) {
    case "LOW":
      return 1;
    case "MEDIUM":
      return 2;
    case "HIGH":
      return 3;
    case "CRITICAL":
      return 4;
    default:
      return 2;
  }
}

function isCapabilityVisibleForOnboarding(
  capability: ImobCapabilityRegistryEntry,
  disabledCapabilityIds: Set<string>,
) {
  if (disabledCapabilityIds.has(capability.capabilityId)) return false;
  if (capability.status === "proposed") return false;
  if (capability.rolloutStage === "backlog") return false;
  return true;
}

function resolveIntentCopy(intent: ImobOnboardingIntent) {
  switch (intent) {
    case ImobOnboardingIntent.CAPTURE_HELP:
      return {
        summary:
          "O Chat IMOB ajuda a iniciar captação, qualificar contexto do imóvel e devolver o próximo passo seguro para seguir no negócio.",
        startingInstruction:
          "Comece dizendo o objetivo da captação em linguagem natural, com cidade, finalidade e tipo de imóvel quando já souber.",
        systemBehaviorNote:
          "O IMOB tenta devolver resultado, pendência dominante e próximo passo único, sem exigir que você descubra o fluxo sozinho.",
      };
    case ImobOnboardingIntent.DOCUMENT_HELP:
      return {
        summary:
          "O Chat IMOB ajuda a revisar o que falta em documentos, suficiência do pacote e blockers que impedem contrato ou handoff.",
        startingInstruction:
          "Peça o status documental do caso ou descreva o documento que precisa revisar para o IMOB responder de forma governada.",
        systemBehaviorNote:
          "Quando a proof ainda não estiver suficiente, o IMOB deve explicar o bloqueio e indicar o próximo passo dominante antes de seguir para contrato.",
      };
    case ImobOnboardingIntent.TRANSACTION_HELP:
      return {
        summary:
          "O Chat IMOB conduz proposta, follow-up comercial e contrato de forma integrada, sempre mostrando o blocker dominante e o próximo movimento do caso.",
        startingInstruction:
          "Comece dizendo se quer preparar proposta, acompanhar resposta, retomar negociação ou liberar contrato deste caso.",
        systemBehaviorNote:
          "O runtime separa proposta ativa, follow-up, blocker documental e handoff contratual para evitar chooser genérico e ação inválida.",
      };
    case ImobOnboardingIntent.NEXT_ACTION_QUERY:
      return {
        summary:
          "O Chat IMOB consegue ler o caso atual e responder o que aconteceu, o que bloqueia e qual é o próximo passo dominante.",
        startingInstruction:
          "Use mensagens curtas e diretas, como pergunta de bloqueio, pendência ou próxima ação do caso.",
        systemBehaviorNote:
          "A leitura consultiva do IMOB deve refletir a mesma verdade operacional do runtime, sem reabrir pendência stale ou CTA herdada.",
      };
    case ImobOnboardingIntent.GENERAL_HELP:
    default:
      return {
        summary:
          "O Chat IMOB conduz a esteira imobiliária: captação, lead, documentos, visitas, follow-up, proposta e contrato.",
        startingInstruction:
          "Para começar, escreva o objetivo do negócio em linguagem natural no chat. O IMOB organiza a jornada a partir dessa intenção.",
        systemBehaviorNote:
          "O IMOB devolve resultado, mostra o que falta e indica o próximo passo dominante. O launcher apenas renderiza o payload já resolvido pelo runtime.",
      };
  }
}

function resolveShortcutMessage(intent: ImobOnboardingIntent) {
  switch (intent) {
    case ImobOnboardingIntent.CAPTURE_HELP:
      return "quero captar um apartamento de 2 quartos em Itajaí para locação";
    case ImobOnboardingIntent.DOCUMENT_HELP:
      return "o que falta para liberar o contrato deste caso?";
    case ImobOnboardingIntent.TRANSACTION_HELP:
      return "preparar proposta comercial deste caso";
    case ImobOnboardingIntent.NEXT_ACTION_QUERY:
      return "qual o próximo passo desse caso?";
    case ImobOnboardingIntent.GENERAL_HELP:
    default:
      return "quero captar um apartamento de 2 quartos em Itajaí para locação";
  }
}

export function resolveImobOnboardingResponse(
  params: ResolveImobOnboardingParams,
): ImobOnboardingResponse {
  const access = params.access ?? null;
  const disabledCapabilityIds = new Set((params.disabledCapabilityIds ?? []).filter(Boolean));
  const capabilities = new Map(listAllImobCapabilities().map((item) => [item.capabilityId, item] as const));
  const copy = resolveIntentCopy(params.intent);
  const entitled = hasImobEntitlement(access);
  const agentContract = buildImobAgentContractV1();

  const suggestedPrompts = IMOB_ONBOARDING_PROMPTS
    .filter((item) => item.intents.includes(params.intent))
    .map((item) => {
      const capability = capabilities.get(item.capabilityId) ?? null;
      if (!capability) return null;
      if (!isCapabilityVisibleForOnboarding(capability, disabledCapabilityIds)) return null;

      return {
        label: item.label,
        prompt: item.prompt,
        targetAgent: item.targetAgent,
        capabilityId: capability.capabilityId,
        requiredAutonomyLevel: mapRiskTierToAutonomyLevel(capability.riskTier),
        riskTier: capability.riskTier,
        requiresHumanApproval: capability.requiresHumanApproval,
        executable: entitled,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const shortcutAllowed = entitled && Boolean(params.tenantId) && Boolean(params.workspaceId);
  const handoffShortcut = suggestedPrompts.length > 0
    ? {
        actionLabel: "Abrir Chat IMOB",
        preloadedMessage: resolveShortcutMessage(params.intent),
        route: params.chatRoute ?? "/app/imob/chat",
        allowed: shortcutAllowed,
        reasonCode: shortcutAllowed ? undefined : "IMOB_ENTITLEMENT_MISSING",
      }
    : undefined;

  return {
    intent: params.intent,
    summary: copy.summary,
    startingInstruction: copy.startingInstruction,
    suggestedPrompts,
    systemBehaviorNote: shortcutAllowed
      ? copy.systemBehaviorNote
      : `${copy.systemBehaviorNote} O onboarding pode explicar o IMOB sem entitlement, mas o atalho acionável só aparece quando tenant, workspace e IMOB ativo estiverem válidos.`,
    handoffShortcut,
    governance: {
      registryVersion: IMOB_ONBOARDING_REGISTRY_VERSION,
      agentContractVersion: String(agentContract.version),
      entitlementChecked: true,
      killSwitchAware: true,
    },
  };
}
