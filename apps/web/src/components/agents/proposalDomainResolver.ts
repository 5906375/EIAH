import type { MessagePresentationSnapshot } from "@/components/agents/chatPresentationSnapshot";
import type {
  ProposalDomain,
  ProposalRequestedAction,
  ResolvedProposalState,
  ResolvedProposalUsageContext,
} from "@/components/agents/proposalTypes";

type LauncherRouteIntentLike = "proposal" | "imob" | "playbook" | "help" | "orchestrator";

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parsePtBrNumber(raw: string): number | null {
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  const multiplier = compact.endsWith("k")
    ? 1_000
    : compact.endsWith("m")
    ? 1_000_000
    : compact.endsWith("mil")
    ? 1_000
    : 1;
  const normalized = compact.replace(/[km]|mil$/g, "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value * multiplier : null;
}

function extractProposalInputs(input: string): { users: number | null; runs: number | null } {
  const normalized = normalizeIntentText(input);
  let users: number | null = null;
  let runs: number | null = null;

  const userMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(usuarios|usuario|users|user|pessoas|equipe)\b/);
  if (userMatch?.[1]) users = parsePtBrNumber(userMatch[1]);

  const runsMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(runs|run|execucoes|execucoes\/mes|runs\/mes|runs\/m[eê]s)\b/);
  if (runsMatch?.[1]) runs = parsePtBrNumber(runsMatch[1]);

  return {
    users: users !== null ? Math.max(0, Math.round(users)) : null,
    runs: runs !== null ? Math.max(0, Math.round(runs)) : null,
  };
}

function hasSaasProposalSignals(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "billing",
    "usuarios",
    "users",
    "runs",
    "trial",
    "demonstracao",
    "plano",
    "pricing",
    "preco do plano",
    "proposta comercial",
    "abrir proposta",
    "qual plano",
    "contratar eiah",
    "starter",
    "growth",
    "scale",
    "solo",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

// Vertical Context Rule v1: routeIntent="proposal" ou proposalMode=true não
// bastam sozinhos para iniciar proposta SaaS. Só há intenção forte quando o
// turno traz ação explícita, uso completo (users+runs), domínio SaaS já
// estabelecido no contexto anterior, ou um dos sinais fortes acima.
function hasStrongSaasProposalIntent(params: {
  requestedAction: ProposalRequestedAction | null;
  usage: { users: number | null; runs: number | null };
  previousDomain: ProposalDomain | null;
  explicitSaas: boolean;
}) {
  if (params.requestedAction) return true;
  if (params.usage.users && params.usage.runs) return true;
  if (params.previousDomain === "saas") return true;
  return params.explicitSaas;
}

function hasImobProposalSignals(input: string) {
  const normalized = normalizeIntentText(input);
  const signals = [
    "imob",
    "imovel",
    "imóvel",
    "compra",
    "venda",
    "locacao",
    "locação",
    "captacao",
    "captação",
    "leilao",
    "leilão",
    "matricula",
    "matrícula",
    "edital",
    "corretagem",
    "distrato",
  ];
  return signals.some((signal) => normalized.includes(signal));
}

export function resolveProposalUsageContext(params: {
  currentInput: string;
  previousUserMessage?: string | null;
  previousAssistantMessage?: string | null;
}): ResolvedProposalUsageContext {
  const current = extractProposalInputs(params.currentInput);
  const previousUser = params.previousUserMessage ? extractProposalInputs(params.previousUserMessage) : { users: null, runs: null };
  const previousAssistant = params.previousAssistantMessage
    ? extractProposalInputs(params.previousAssistantMessage)
    : { users: null, runs: null };

  const users = current.users ?? previousUser.users ?? previousAssistant.users ?? null;
  const runs = current.runs ?? previousUser.runs ?? previousAssistant.runs ?? null;
  const currentHasAny = current.users != null || current.runs != null;
  const previousHasAny =
    previousUser.users != null ||
    previousUser.runs != null ||
    previousAssistant.users != null ||
    previousAssistant.runs != null;

  const source: ResolvedProposalUsageContext["source"] =
    currentHasAny && previousHasAny ? "mixed" : currentHasAny ? "current_input" : previousHasAny ? "previous_context" : "none";

  return { users, runs, source };
}

export function resolveProposalRequestedAction(input: string): ProposalRequestedAction | null {
  const normalized = normalizeIntentText(input);
  if (normalized.includes("abrir proposta comercial")) return "open_commercial_proposal";
  if (normalized.includes("agendar demonstracao") || normalized.includes("agendar demonstração")) return "schedule_demo";
  if (normalized.includes("criar trial assistido")) return "create_assisted_trial";
  if (normalized.includes("enviar para comercial") || normalized.includes("falar com comercial")) return "send_to_sales";
  if (normalized.includes("compra nova")) return "new_purchase";
  if (normalized.includes("expansao do workspace") || normalized.includes("expansão do workspace")) return "workspace_expansion";
  return null;
}

export function resolveProposalState(params: {
  input: string;
  routeIntent: LauncherRouteIntentLike;
  proposalMode: boolean;
  previousUserMessage?: string | null;
  previousAssistantMessage?: string | null;
  previousAssistantSnapshot?: MessagePresentationSnapshot | null;
}): ResolvedProposalState | null {
  if (params.routeIntent !== "proposal" && !params.proposalMode) {
    return null;
  }

  const previousDomain = params.previousAssistantSnapshot?.proposalDomain ?? null;
  const usage = resolveProposalUsageContext({
    currentInput: params.input,
    previousUserMessage: params.previousUserMessage,
    previousAssistantMessage: params.previousAssistantMessage,
  });
  const requestedAction = resolveProposalRequestedAction(params.input);
  const normalizedInput = normalizeIntentText(params.input);
  const explicitImob = hasImobProposalSignals(params.input);
  const explicitSaas = hasSaasProposalSignals(params.input);
  const strongSaasIntent = hasStrongSaasProposalIntent({
    requestedAction,
    usage,
    previousDomain,
    explicitSaas,
  });

  const contextualDomain: ProposalDomain | null =
    previousDomain ?? (params.previousAssistantSnapshot?.verticalContext === "IMOB" ? "imob" : null);

  let domain: ProposalDomain | null =
    contextualDomain ?? (explicitImob && !explicitSaas ? "imob" : strongSaasIntent ? "saas" : null);

  if (explicitImob && !explicitSaas) domain = "imob";
  if (explicitSaas && !explicitImob) domain = "saas";

  if (domain == null) {
    return null;
  }

  const domainMismatch =
    previousDomain != null &&
    previousDomain !== domain &&
    (explicitImob || explicitSaas || normalizedInput.includes("proposta"));

  let stage: ResolvedProposalState["stage"] = "proposal_idle";
  if (domain === "saas") {
    if (requestedAction === "schedule_demo" || requestedAction === "create_assisted_trial") {
      stage = usage.users && usage.runs ? "proposal_demo_ready" : "proposal_demo_requested";
    } else if (requestedAction === "open_commercial_proposal" || requestedAction === "send_to_sales") {
      stage = usage.users && usage.runs ? "proposal_ready_to_open" : "proposal_collecting_usage";
    } else if (usage.users && usage.runs) {
      stage = "proposal_recommended";
    } else {
      stage = "proposal_collecting_usage";
    }
  }

  return {
    domain,
    stage,
    usage,
    requestedAction,
    contextRecovered: usage.source === "previous_context" || usage.source === "mixed",
    contextLost:
      (requestedAction === "open_commercial_proposal" ||
        requestedAction === "schedule_demo" ||
        requestedAction === "create_assisted_trial" ||
        requestedAction === "send_to_sales") &&
      params.previousAssistantSnapshot?.conversationStage === "proposal_recommended" &&
      !(usage.users && usage.runs),
    domainMismatch,
  };
}
