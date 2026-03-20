import type { Agent } from "@/lib/api";
import {
  buildAadvGuidanceReply,
  buildFinNexusGuidanceReply,
  buildGuardianGuidanceReply,
  buildJuridicoGuidanceReply,
  isAadvGuidanceQuestion,
  isFinanceGuidanceQuestion,
  isGuardianGuidanceQuestion,
  resolveJ360AgentProfile,
} from "@/components/agents/specialistGuidanceResolver";

export type SpecialistDecisionLike = {
  kind: "self_intro" | "capabilities_summary" | "specialist_guidance" | "contextual_fallback" | "needs_run";
  shouldCreateRun: boolean;
  content?: string;
  presentationRouteIntent: "help" | "self_intro" | "capabilities_summary";
  renderVariant: "simple_help" | "self_intro" | "guided_flow";
};

type SpecialistDecisionDeps = {
  isPresentationQuestion: (input: string) => boolean;
  buildDeterministicAgentOverviewReply: (agentProfile: Agent | null) => string | null;
  buildAgentCapabilitiesReply: (agentProfile: Agent | null) => string;
};

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolveJuridicoDecision(
  params: {
    input: string;
    agentProfile: Agent | null;
    intentUnknown: boolean;
  },
  deps: SpecialistDecisionDeps,
): SpecialistDecisionLike {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);
  const resolvedAgentProfile = resolveJ360AgentProfile(params.agentProfile, input);

  if (deps.isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content:
        deps.buildDeterministicAgentOverviewReply(resolvedAgentProfile) ?? deps.buildAgentCapabilitiesReply(resolvedAgentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: deps.buildAgentCapabilitiesReply(resolvedAgentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (
    normalized.includes("contrato") ||
    normalized.includes("clausula") ||
    normalized.includes("cláusula") ||
    normalized.includes("parecer") ||
    normalized.includes("risco") ||
    normalized.includes("locacao") ||
    normalized.includes("locação") ||
    normalized.includes("aluguel") ||
    normalized.includes("venda")
  ) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildJuridicoGuidanceReply(input, resolvedAgentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com contratos, cláusulas, riscos jurídicos e organização da análise. Se você me disser o tipo de contrato ou o ponto que quer revisar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveFinNexusDecision(
  params: {
    input: string;
    agentProfile: Agent | null;
    intentUnknown: boolean;
  },
  deps: SpecialistDecisionDeps,
): SpecialistDecisionLike {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (deps.isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: deps.buildDeterministicAgentOverviewReply(params.agentProfile) ?? deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isFinanceGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildFinNexusGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com pagamentos, pendências financeiras, documentos de cobrança, conciliação e risco operacional. Se você me disser o pagamento, documento ou pendência, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveGuardianDecision(
  params: {
    input: string;
    agentProfile: Agent | null;
    intentUnknown: boolean;
  },
  deps: SpecialistDecisionDeps,
): SpecialistDecisionLike {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (deps.isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: deps.buildDeterministicAgentOverviewReply(params.agentProfile) ?? deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades") ||
    normalized.includes("o que voce valida")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isGuardianGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildGuardianGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar com evidências, receipt, verify_url, integridade e trilha de auditoria. Se você me disser qual artefato quer validar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}

export function resolveAadvDecision(
  params: {
    input: string;
    agentProfile: Agent | null;
    intentUnknown: boolean;
  },
  deps: SpecialistDecisionDeps,
): SpecialistDecisionLike {
  const input = params.input.trim();
  const normalized = normalizeIntentText(input);

  if (deps.isPresentationQuestion(input)) {
    return {
      kind: "self_intro",
      shouldCreateRun: false,
      content: deps.buildDeterministicAgentOverviewReply(params.agentProfile) ?? deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "self_intro",
      renderVariant: "self_intro",
    };
  }

  if (
    normalized.includes("o que voce pode fazer") ||
    normalized.includes("como voce pode me ajudar") ||
    normalized.includes("especialidades") ||
    normalized.includes("capacidades")
  ) {
    return {
      kind: "capabilities_summary",
      shouldCreateRun: false,
      content: deps.buildAgentCapabilitiesReply(params.agentProfile),
      presentationRouteIntent: "capabilities_summary",
      renderVariant: "simple_help",
    };
  }

  if (isAadvGuidanceQuestion(input)) {
    return {
      kind: "specialist_guidance",
      shouldCreateRun: false,
      content: buildAadvGuidanceReply(input, params.agentProfile),
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  if (params.intentUnknown) {
    return {
      kind: "contextual_fallback",
      shouldCreateRun: false,
      content:
        "Posso te ajudar a organizar evidências, riscos, FinOps e próximos passos desse caso. Se você me disser qual bloco ou evidência quer consolidar, eu sigo de forma mais direta.",
      presentationRouteIntent: "help",
      renderVariant: "simple_help",
    };
  }

  return {
    kind: "needs_run",
    shouldCreateRun: true,
    presentationRouteIntent: "help",
    renderVariant: "guided_flow",
  };
}
