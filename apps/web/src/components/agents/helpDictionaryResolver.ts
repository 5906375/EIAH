import { AGENT_HELP_DICTIONARY } from "@/components/agents/helpDictionary.agents";
import { BILLING_HELP_DICTIONARY } from "@/components/agents/helpDictionary.billing";
import { GLOBAL_HELP_DICTIONARY } from "@/components/agents/helpDictionary.global";
import { GOVERNANCE_HELP_DICTIONARY } from "@/components/agents/helpDictionary.governance";
import {
  buildResolvedHelpSnapshotFromResponse,
  entryMatchesInput,
  normalizeMatcherInput,
  sanitizeHelpQuickReplies,
  validateHelpDictionaryEntry,
  type HelpDictionaryAccessContext,
  type HelpDictionaryEntry,
  type ResolvedHelpSnapshot,
} from "@/components/agents/helpDictionary";
import { PAGE_HELP_DICTIONARY } from "@/components/agents/helpDictionary.pages";
import { PRODUCT_STRATEGY_HELP_DICTIONARY } from "@/components/agents/helpDictionary.productStrategy";
import { VERTICAL_HELP_DICTIONARY } from "@/components/agents/helpDictionary.verticals";
import { WORKFLOW_HELP_DICTIONARY } from "@/components/agents/helpDictionary.workflows";

type HelpRouteIntent = "proposal" | "imob" | "playbook" | "help" | "orchestrator";

const ALL_HELP_DICTIONARY = [
  ...GLOBAL_HELP_DICTIONARY,
  ...PAGE_HELP_DICTIONARY,
  ...VERTICAL_HELP_DICTIONARY,
  ...AGENT_HELP_DICTIONARY,
  ...WORKFLOW_HELP_DICTIONARY,
  ...GOVERNANCE_HELP_DICTIONARY,
  ...BILLING_HELP_DICTIONARY,
  ...PRODUCT_STRATEGY_HELP_DICTIONARY,
];
for (const entry of ALL_HELP_DICTIONARY) validateHelpDictionaryEntry(entry);

function hasWorkspaceContext(accessContext?: HelpDictionaryAccessContext | null) {
  return Boolean(accessContext?.tenantId && accessContext?.workspaceId);
}

function hasEntryEntitlement(entry: HelpDictionaryEntry, accessContext?: HelpDictionaryAccessContext | null) {
  if (!entry.requiresEntitlement) return true;
  return accessContext?.entitlements?.[entry.requiresEntitlement] === true;
}

function normalizeEntryScore(entry: HelpDictionaryEntry, normalizedInput: string) {
  const terms = [...entry.matcherTerms, ...(entry.aliases ?? [])].map(normalizeMatcherInput);
  let best = 0;
  for (const term of terms) {
    if (normalizedInput === term) best = Math.max(best, 120);
    else if (normalizedInput.includes(term)) best = Math.max(best, 100 - Math.max(0, normalizedInput.length - term.length));
  }
  return (entry.priority ?? 0) + best;
}

function findBestEntry(entries: HelpDictionaryEntry[], normalizedInput: string) {
  return entries
    .filter((entry) => entryMatchesInput(entry, normalizedInput))
    .sort((a, b) => normalizeEntryScore(b, normalizedInput) - normalizeEntryScore(a, normalizedInput))[0] ?? null;
}

function buildClarifySnapshot() {
  return buildResolvedHelpSnapshotFromResponse({
    response: {
      intentId: "policy_clarify",
      responseType: "clarify",
      content: [
        "Posso explicar melhor se você me disser qual área quer entender agora.",
        "",
        "Exemplos de foco:",
        "- plataforma como um todo",
        "- agentes",
        "- chat",
        "- Chat IMOB",
        "- billing e quotas",
        "- marketplace",
        "- self-service",
      ].join("\n"),
      quickReplies: ["Explicar plataforma", "Explicar agentes", "Explicar Chat IMOB"],
    },
    scopeHint: "global",
    confidence: 0.7,
  });
}

function resolveScopeHint(entry: HelpDictionaryEntry) {
  if (entry.scope === "fallback") return "fallback";
  return entry.scope;
}

function buildNotFoundSnapshot() {
  return buildResolvedHelpSnapshotFromResponse({
    response: {
      intentId: null,
      responseType: "not_found",
      content: [
        "**Como a plataforma EIAH se organiza**",
        "",
        "O EIAH combina chat, especialistas, runs, billing e verticais para te ajudar a sair de uma dúvida até uma execução com mais contexto.",
        "",
        "Na prática, a plataforma se divide assim:",
        "- `Runs`: executar, simular e acompanhar tarefas",
        "- `Chat`: ver especialistas disponíveis no workspace",
        "- `Billing`: plano, uso, faturas e cobrança",
        "- `Marketplace`: ativar agentes e módulos",
        "- `IMOB`: contexto imobiliário, pipeline e acompanhamento",
        "",
        "Se você quiser, eu posso te explicar só uma dessas áreas agora.",
      ].join("\n"),
      quickReplies: ["Explique as páginas", "Me mostre o caminho mais rápido"],
    },
    scopeHint: "global",
    confidence: 0.7,
  });
}

function buildBlockedSnapshot(entry: HelpDictionaryEntry, accessContext?: HelpDictionaryAccessContext | null) {
  if (entry.requiresEntitlement && !hasEntryEntitlement(entry, accessContext)) {
    return buildResolvedHelpSnapshotFromResponse({
      response: {
        intentId: "policy_blocked_missing_entitlement",
        responseType: "blocked",
        content: [
          "Não consigo avançar nesse fluxo porque falta habilitação de produto/entitlement para este workspace.",
          "",
          "Ative o módulo correspondente e tente novamente para continuar com segurança.",
        ].join("\n"),
        quickReplies: ["Ativar módulo no Marketplace", "Verificar acesso"],
      },
      scopeHint: resolveScopeHint(entry),
    });
  }

  return buildResolvedHelpSnapshotFromResponse({
    response: {
      intentId: "policy_blocked_missing_workspace_context",
      responseType: "blocked",
      content: [
        "Ainda não consigo validar essa ação porque falta contexto de workspace/tenant.",
        "",
        "Entre no workspace correto e tente novamente para eu continuar com precisão.",
      ].join("\n"),
      quickReplies: ["Selecionar workspace", "Verificar acesso"],
    },
    scopeHint: resolveScopeHint(entry),
  });
}

function isGenericClarificationInput(normalizedInput: string) {
  return new Set([
    "como funciona",
    "explique",
    "explica",
    "me explique",
    "me explica",
    "quero entender",
    "entender como funciona",
    "explique como funciona",
    "explica como funciona",
    "me explique como funciona",
    "me explica como funciona",
    "chat",
  ]).has(normalizedInput);
}

function resolveEntrySnapshot(
  entry: HelpDictionaryEntry | null,
  params: { input: string; normalizedInput: string; accessContext?: HelpDictionaryAccessContext | null; routeIntent: HelpRouteIntent },
): ResolvedHelpSnapshot | null {
  if (!entry) return null;
  if (entry.requiresWorkspaceContext && !hasWorkspaceContext(params.accessContext)) {
    return buildBlockedSnapshot(entry, params.accessContext);
  }
  if (entry.requiresEntitlement && !hasEntryEntitlement(entry, params.accessContext)) {
    return buildBlockedSnapshot(entry, params.accessContext);
  }
  const response = entry.resolve(params);
  return {
    ...buildResolvedHelpSnapshotFromResponse({
      response: {
        ...response,
        quickReplies: sanitizeHelpQuickReplies(response.quickReplies),
      },
      scopeHint: resolveScopeHint(entry),
      confidence: 0.84,
    }),
  };
}

export function resolveHelpDictionarySnapshot(params: {
  input: string;
  routeIntent: HelpRouteIntent;
  accessContext?: HelpDictionaryAccessContext | null;
  includeFallback?: boolean;
}): ResolvedHelpSnapshot | null {
  const normalizedInput = normalizeMatcherInput(params.input);
  if (!normalizedInput) return null;

  if (isGenericClarificationInput(normalizedInput)) {
    return buildClarifySnapshot();
  }

  const pageEntry = resolveEntrySnapshot(findBestEntry(PAGE_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (pageEntry) return pageEntry;

  const hasVerticalHint = normalizedInput.includes("imob") || normalizedInput.includes("imobili");
  if (params.routeIntent === "imob") {
    const verticalEntry = resolveEntrySnapshot(findBestEntry(VERTICAL_HELP_DICTIONARY, normalizedInput), {
      input: params.input,
      normalizedInput,
      accessContext: params.accessContext,
      routeIntent: params.routeIntent,
    });
    if (verticalEntry) return verticalEntry;
  }

  const agentEntry = resolveEntrySnapshot(findBestEntry(AGENT_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (agentEntry) return agentEntry;

  const workflowEntry = resolveEntrySnapshot(findBestEntry(WORKFLOW_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (workflowEntry) return workflowEntry;

  if (hasVerticalHint) {
    const verticalEntry = resolveEntrySnapshot(findBestEntry(VERTICAL_HELP_DICTIONARY, normalizedInput), {
      input: params.input,
      normalizedInput,
      accessContext: params.accessContext,
      routeIntent: params.routeIntent,
    });
    if (verticalEntry) return verticalEntry;
  }

  const governanceEntry = resolveEntrySnapshot(findBestEntry(GOVERNANCE_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (governanceEntry) return governanceEntry;

  const billingEntry = resolveEntrySnapshot(findBestEntry(BILLING_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (billingEntry) return billingEntry;

  const productStrategyEntry = resolveEntrySnapshot(findBestEntry(PRODUCT_STRATEGY_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (productStrategyEntry) return productStrategyEntry;

  const globalEntry = resolveEntrySnapshot(findBestEntry(GLOBAL_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (globalEntry) return globalEntry;

  return params.includeFallback ? buildNotFoundSnapshot() : null;
}
