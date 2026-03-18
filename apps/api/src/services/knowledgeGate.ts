type DeterministicSource = {
  sourceId: string;
  kind: "db" | "ledger" | "event_store" | "document_index" | "api" | "snapshot";
  authorityLevel: "primary" | "secondary" | "advisory";
  required: boolean;
  version: string;
};

type KnowledgePolicy = {
  deterministicSources: DeterministicSource[];
  sourcePrecedence: string[];
  conflictResolution: "fail_closed" | "use_primary" | "human_review";
  llmUsageMode:
    | "none"
    | "format_only"
    | "grounded_reasoning"
    | "open_reasoning_restricted"
    | "disallowed_for_critical_execution";
  fallbackPolicy: "block" | "approved_snapshot" | "human_review";
  provenancePolicy: "required" | "recommended" | "none";
  maskingPolicy: "required" | "conditional" | "none";
};

type ResolveKnowledgeContextParams = {
  runId?: string;
  tenantId?: string;
  workspaceId?: string;
  agentId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
  knowledgePolicy?: KnowledgePolicy;
};

type KnowledgeResolution = {
  metadata: Record<string, unknown>;
  blocked: boolean;
  reasonCode?: string;
  groundedFacts: Record<string, unknown>;
  resolvedSources: Array<Record<string, unknown>>;
  provenance: Record<string, unknown>;
};

type SourceResolutionRecord = {
  sourceId: string;
  kind: DeterministicSource["kind"];
  authorityLevel: DeterministicSource["authorityLevel"];
  required: boolean;
  version: string;
  status: "resolved" | "missing" | "declared" | "conflict";
  evidenceKeys: string[];
  bindings: string[];
  facts?: Record<string, unknown>;
};

type SourceAdapterResult = {
  status: "resolved" | "missing" | "declared";
  facts?: Record<string, unknown>;
  bindings: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function summarizePreviousRuns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 5)
    .map((item) => {
      if (!isPlainObject(item)) return null;
      return {
        id: typeof item.id === "string" ? item.id : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
      };
    })
    .filter(Boolean);
}

function summarizeMemorySnapshot(value: unknown) {
  if (!isPlainObject(value)) return null;
  return {
    shortTerm: Array.isArray(value.shortTerm) ? value.shortTerm.length : 0,
    longTerm: Array.isArray(value.longTerm) ? value.longTerm.length : 0,
    vectorMatches: Array.isArray(value.vectorMatches) ? value.vectorMatches.length : 0,
  };
}

function getBaseRuntimeFacts(params: ResolveKnowledgeContextParams) {
  const metadata = params.metadata ?? {};
  const existing = isPlainObject(metadata.groundedFacts) ? metadata.groundedFacts : {};
  const baseFacts: Record<string, unknown> = { ...existing };

  baseFacts.runtime = {
    agentId: params.agentId,
    runId: params.runId ?? null,
    tenantId: params.tenantId ?? null,
    workspaceId: params.workspaceId ?? null,
  };

  baseFacts.request = {
    promptPreview: params.prompt.slice(0, 240),
    action: typeof metadata.action === "string" ? metadata.action : null,
    domain: typeof metadata.domain === "string" ? metadata.domain : null,
    tier: typeof metadata.tier === "string" ? metadata.tier : null,
    txIdRequired: metadata.txIdRequired === true,
  };

  return baseFacts;
}

function readMetadataPath(
  metadata: Record<string, unknown>,
  path: string
): { found: boolean; value?: unknown; binding: string } {
  const parts = path.split(".");
  let current: unknown = metadata;
  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) {
      return { found: false, binding: `metadata.${path}` };
    }
    current = current[part];
  }
  return { found: current !== undefined && current !== null, value: current, binding: `metadata.${path}` };
}

function candidatePathsForSource(sourceId: string, kind: DeterministicSource["kind"]) {
  const normalized = sourceId.toLowerCase();
  const candidates = new Set<string>();

  if (normalized.includes("ledger")) candidates.add("billingLedger");
  if (normalized.includes("run-events") || normalized.includes("event-stream")) candidates.add("previousRuns");
  if (normalized.includes("rbac")) candidates.add("delegation");
  if (normalized.includes("state-machine")) candidates.add("agentState");
  if (normalized.includes("snapshot")) candidates.add("memorySnapshot");
  if (normalized.includes("policy")) candidates.add("executionInput");
  if (normalized.includes("contract") || normalized.includes("document") || normalized.includes("playbook") || normalized.includes("brief")) {
    candidates.add("executionInput");
  }

  if (kind === "event_store") candidates.add("previousRuns");
  if (kind === "ledger") candidates.add("billingLedger");
  if (kind === "snapshot") candidates.add("memorySnapshot");
  if (kind === "db") candidates.add("agentState");
  if (kind === "document_index") candidates.add("executionInput");
  if (kind === "api") candidates.add("executionInput");

  candidates.add("executionInput");
  return Array.from(candidates);
}

function normalizeFacts(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value : null;
  if (isPlainObject(value)) return Object.keys(value).length > 0 ? value : null;
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  return value ?? null;
}

function buildFactsForSource(sourceId: string, value: unknown) {
  const normalized = normalizeFacts(value);
  if (normalized === null) return null;
  return {
    [sourceId]: normalized,
  };
}

function resolveSourceFromMetadata(
  source: DeterministicSource,
  metadata: Record<string, unknown>
): SourceAdapterResult {
  const explicit = readMetadataPath(metadata, `resolvedKnowledge.${source.sourceId}`);
  if (explicit.found) {
    const facts = buildFactsForSource(source.sourceId, explicit.value);
    return facts
      ? { status: "resolved", facts, bindings: [explicit.binding] }
      : { status: "declared", bindings: [explicit.binding] };
  }

  const bindings: string[] = [];
  for (const path of candidatePathsForSource(source.sourceId, source.kind)) {
    const candidate = readMetadataPath(metadata, path);
    if (!candidate.found) continue;
    const facts = buildFactsForSource(source.sourceId, candidate.value);
    if (facts) {
      return { status: "resolved", facts, bindings: [candidate.binding] };
    }
    bindings.push(candidate.binding);
  }

  return { status: source.required ? "missing" : "declared", bindings };
}

function getOrderedSources(policy: KnowledgePolicy | undefined) {
  const sources = policy?.deterministicSources ?? [];
  const precedence = policy?.sourcePrecedence ?? [];
  const order = new Map(precedence.map((sourceId, index) => [sourceId, index]));
  return [...sources].sort((a, b) => {
    const aOrder = order.get(a.sourceId) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b.sourceId) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

function mergeFacts(
  baseFacts: Record<string, unknown>,
  sourceRecords: SourceResolutionRecord[],
  conflictResolution: KnowledgePolicy["conflictResolution"] | undefined
) {
  const groundedFacts: Record<string, unknown> = { ...baseFacts };
  const conflicts: string[] = [];

  for (const source of sourceRecords) {
    if (source.status !== "resolved" || !source.facts) continue;
    for (const [key, nextValue] of Object.entries(source.facts)) {
      if (!(key in groundedFacts)) {
        groundedFacts[key] = nextValue;
        continue;
      }

      const previousValue = groundedFacts[key];
      if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
        continue;
      }

      conflicts.push(key);
      if (conflictResolution === "use_primary") {
        continue;
      }
      if (conflictResolution === "human_review") {
        groundedFacts[`${key}Conflict`] = {
          current: previousValue,
          incoming: nextValue,
          sources: sourceRecords.filter((record) => record.status === "resolved").map((record) => record.sourceId),
        };
      }
    }
  }

  return { groundedFacts, conflicts };
}

function buildGroundedContext(params: ResolveKnowledgeContextParams) {
  const metadata = params.metadata ?? {};
  const baseFacts = getBaseRuntimeFacts(params);

  if (isPlainObject(metadata.executionInput)) {
    baseFacts.executionInput = metadata.executionInput;
  }

  const previousRuns = summarizePreviousRuns(metadata.previousRuns);
  if (previousRuns.length > 0) {
    baseFacts.previousRuns = previousRuns;
  }

  if (isPlainObject(metadata.agentState)) {
    baseFacts.agentState = metadata.agentState;
  }

  const memorySummary = summarizeMemorySnapshot(metadata.memorySnapshot);
  if (memorySummary) {
    baseFacts.memorySnapshot = memorySummary;
  }

  if (isPlainObject(metadata.delegation)) {
    baseFacts.delegation = metadata.delegation;
  }

  if (typeof metadata.deterministicResponse === "string" && metadata.deterministicResponse.trim()) {
    baseFacts.deterministicResponse = metadata.deterministicResponse.trim();
  }

  const orderedSources = getOrderedSources(params.knowledgePolicy);
  const resolvedSourceRecords: SourceResolutionRecord[] = orderedSources.map((source) => {
    const resolved = resolveSourceFromMetadata(source, metadata);
    return {
      sourceId: source.sourceId,
      kind: source.kind,
      authorityLevel: source.authorityLevel,
      required: source.required,
      version: source.version,
      status: resolved.status,
      evidenceKeys: resolved.facts ? Object.keys(resolved.facts) : [],
      bindings: resolved.bindings,
      facts: resolved.facts,
    };
  });

  const merged = mergeFacts(baseFacts, resolvedSourceRecords, params.knowledgePolicy?.conflictResolution);
  if (merged.conflicts.length > 0) {
    for (const record of resolvedSourceRecords) {
      if (record.evidenceKeys.some((key) => merged.conflicts.includes(key))) {
        record.status = "conflict";
      }
    }
  }

  return {
    groundedFacts: merged.groundedFacts,
    resolvedSources: resolvedSourceRecords.map(({ facts, ...record }) => record),
    conflicts: merged.conflicts,
  };
}

function evaluateKnowledgeGate(
  policy: KnowledgePolicy | undefined,
  metadata: Record<string, unknown>,
  resolvedSources: Array<Record<string, unknown>>,
  conflicts: string[]
) {
  const explicitConflict =
    metadata.sourceConflict === true ||
    (Array.isArray(metadata.sourceConflicts) && metadata.sourceConflicts.length > 0);
  const runtimeConflict = conflicts.length > 0;
  if ((explicitConflict || runtimeConflict) && policy?.conflictResolution === "fail_closed") {
    return { blocked: true, reasonCode: "knowledge_conflict_fail_closed" };
  }

  const unavailable = Array.isArray(metadata.unavailableSources)
    ? new Set(metadata.unavailableSources.filter((item): item is string => typeof item === "string"))
    : null;
  if (policy?.fallbackPolicy === "block" && unavailable && unavailable.size > 0) {
    const missingRequired = resolvedSources.some(
      (source) => source.required === true && typeof source.sourceId === "string" && unavailable.has(source.sourceId)
    );
    if (missingRequired) {
      return { blocked: true, reasonCode: "knowledge_required_source_unavailable" };
    }
  }

  if (policy?.fallbackPolicy === "block") {
    const missingRequired = resolvedSources.some(
      (source) => source.required === true && (source.status === "missing" || source.status === "declared")
    );
    if (missingRequired) {
      return { blocked: true, reasonCode: "knowledge_required_source_missing" };
    }
  }

  return { blocked: false as const, reasonCode: undefined };
}

function buildProvenance(
  params: ResolveKnowledgeContextParams,
  policy: KnowledgePolicy | undefined,
  groundedFacts: Record<string, unknown>,
  resolvedSources: Array<Record<string, unknown>>,
  blocked: boolean,
  reasonCode?: string
) {
  return {
    strategy: "deterministic_first",
    grounded: Object.keys(groundedFacts).length > 0,
    generatedAt: new Date().toISOString(),
    agentId: params.agentId,
    runId: params.runId ?? null,
    llmUsageMode: policy?.llmUsageMode ?? "open_reasoning_restricted",
    sourcePrecedence: policy?.sourcePrecedence ?? [],
    sourceIds: resolvedSources.map((source) => source.sourceId),
    blocked,
    reasonCode: reasonCode ?? null,
  };
}

export function resolveKnowledgeContext(params: ResolveKnowledgeContextParams): KnowledgeResolution {
  const metadata = isPlainObject(params.metadata) ? { ...params.metadata } : {};
  const grounded = buildGroundedContext({ ...params, metadata });
  const gate = evaluateKnowledgeGate(
    params.knowledgePolicy,
    metadata,
    grounded.resolvedSources,
    grounded.conflicts
  );
  const provenance = buildProvenance(
    params,
    params.knowledgePolicy,
    grounded.groundedFacts,
    grounded.resolvedSources,
    gate.blocked,
    gate.reasonCode
  );

  return {
    metadata: {
      ...metadata,
      groundedFacts: grounded.groundedFacts,
      resolvedSources: grounded.resolvedSources,
      provenance,
      sourceConflicts:
        grounded.conflicts.length > 0
          ? Array.from(new Set([...(Array.isArray(metadata.sourceConflicts) ? metadata.sourceConflicts : []), ...grounded.conflicts]))
          : metadata.sourceConflicts,
    },
    blocked: gate.blocked,
    reasonCode: gate.reasonCode,
    groundedFacts: grounded.groundedFacts,
    resolvedSources: grounded.resolvedSources,
    provenance,
  };
}
