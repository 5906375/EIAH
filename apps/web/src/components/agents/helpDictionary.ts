export type HelpDictionaryScope =
  | "global"
  | "page"
  | "vertical"
  | "agent"
  | "workflow"
  | "governance"
  | "billing"
  | "productStrategy"
  | "fallback";

export type HelpDictionaryScopeHint = Exclude<HelpDictionaryScope, "fallback"> | "fallback";

export type HelpFallbackType = "clarify" | "blocked" | "not_found";
export type HelpResolutionType = "resolved" | HelpFallbackType;

export type HelpDictionaryAccessContext = {
  tenantId?: string | null;
  workspaceId?: string | null;
  roleProfile?: "workspace_member" | "workspace_admin" | "tenant_admin" | "founder_global" | "service_operator" | null;
  activeDomain?: "core" | "imob" | null;
  installedProducts?: string[] | null;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    IMOB_INSTALLED?: boolean;
  } | null;
};

export type HelpDictionaryResponse = {
  intentId: string | null;
  content: string;
  quickReplies: string[];
  responseType?: HelpResolutionType;
};

export type ResolvedHelpSnapshot = {
  intent: {
    intentId: string | null;
    confidence: number;
    scopeHint?: HelpDictionaryScopeHint;
    needsClarification?: boolean;
  };
  responseType: HelpResolutionType;
  content: string;
  quickReplies: string[];
};

export type HelpDictionaryResolveParams = {
  input: string;
  normalizedInput: string;
  accessContext?: HelpDictionaryAccessContext | null;
  routeIntent?: "proposal" | "imob" | "playbook" | "help" | "orchestrator";
};

export type HelpDictionaryEntry = {
  id: string;
  scope: HelpDictionaryScope;
  matcherTerms: string[];
  aliases?: string[];
  pageId?: "billing" | "marketplace" | "economy" | "profile" | "agents" | "chat" | "self_service";
  verticalId?: "imob";
  priority?: number;
  requiresWorkspaceContext?: boolean;
  requiresEntitlement?: "REAL_ESTATE_CORE" | "IMOB_INSTALLED";
  resolve: (params: HelpDictionaryResolveParams) => HelpDictionaryResponse;
};

export function normalizeMatcherInput(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateHelpDictionaryEntry(entry: HelpDictionaryEntry) {
  if (!entry.id.trim()) throw new Error("help dictionary entry requires id");
  if (!entry.matcherTerms.length) throw new Error(`help dictionary entry ${entry.id} requires matcherTerms`);
  for (const matcher of entry.matcherTerms) {
    if (!normalizeMatcherInput(matcher)) {
      throw new Error(`help dictionary entry ${entry.id} contains empty matcher`);
    }
  }
  const response = entry.resolve({
    input: entry.matcherTerms[0],
    normalizedInput: normalizeMatcherInput(entry.matcherTerms[0]),
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
    routeIntent: "help",
  });
  if (!response.content.trim()) {
    throw new Error(`help dictionary entry ${entry.id} resolved empty content`);
  }
  if (!Array.isArray(response.quickReplies)) {
    throw new Error(`help dictionary entry ${entry.id} resolved invalid quickReplies`);
  }
}

export function entryMatchesInput(entry: HelpDictionaryEntry, normalizedInput: string) {
  const terms = [...entry.matcherTerms, ...(entry.aliases ?? [])].map(normalizeMatcherInput);
  return terms.some((term) => normalizedInput.includes(term));
}

export function sanitizeHelpQuickReplies(quickReplies: string[]) {
  return quickReplies
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label, index, array) => array.indexOf(label) === index)
    .slice(0, 3);
}

export function buildResolvedHelpSnapshotFromResponse(params: {
  response: HelpDictionaryResponse;
  scopeHint: HelpDictionaryScopeHint;
  confidence?: number;
}): ResolvedHelpSnapshot {
  const responseType = params.response.responseType ?? "resolved";
  return {
    intent: {
      intentId: responseType === "not_found" ? null : params.response.intentId,
      confidence: params.confidence ?? (responseType === "resolved" ? 0.82 : 0.7),
      scopeHint: params.scopeHint,
      needsClarification: responseType === "clarify",
    },
    responseType,
    content: params.response.content,
    quickReplies: sanitizeHelpQuickReplies(params.response.quickReplies),
  };
}
