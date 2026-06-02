import { GLOBAL_HELP_DICTIONARY } from "@/components/agents/helpDictionary.global";
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
import { VERTICAL_HELP_DICTIONARY } from "@/components/agents/helpDictionary.verticals";

type HelpRouteIntent = "proposal" | "imob" | "playbook" | "help" | "orchestrator";

const ALL_HELP_DICTIONARY = [...GLOBAL_HELP_DICTIONARY, ...PAGE_HELP_DICTIONARY, ...VERTICAL_HELP_DICTIONARY];
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
      quickReplies: ["Explicar plataforma", "Explicar agentes", "Explicar Chat IMOB", "Explicar Billing"],
    },
    scopeHint: "global",
    confidence: 0.7,
  });
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
      scopeHint: entry.scope === "vertical" ? "vertical" : entry.scope === "page" ? "page" : "global",
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
    scopeHint: entry.scope === "vertical" ? "vertical" : entry.scope === "page" ? "page" : "global",
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
      scopeHint: entry.scope === "vertical" ? "vertical" : entry.scope === "page" ? "page" : "global",
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

  const shouldCheckVertical = params.routeIntent === "imob" || normalizedInput.includes("imob") || normalizedInput.includes("imobili");
  if (shouldCheckVertical) {
    const verticalEntry = resolveEntrySnapshot(findBestEntry(VERTICAL_HELP_DICTIONARY, normalizedInput), {
      input: params.input,
      normalizedInput,
      accessContext: params.accessContext,
      routeIntent: params.routeIntent,
    });
    if (verticalEntry) return verticalEntry;
  }

  const globalEntry = resolveEntrySnapshot(findBestEntry(GLOBAL_HELP_DICTIONARY, normalizedInput), {
    input: params.input,
    normalizedInput,
    accessContext: params.accessContext,
    routeIntent: params.routeIntent,
  });
  if (globalEntry) return globalEntry;

  return params.includeFallback ? buildNotFoundSnapshot() : null;
}
