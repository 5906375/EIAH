type ConversationPersistenceMode = "ephemeral" | "durable";

type ConversationPromotionTrigger =
  | "approval_required"
  | "critical_execution"
  | "delegation"
  | "provenance_required"
  | "final_summary"
  | "user_confirmed"
  | "manual_save";

export type ConversationPersistencePolicy = {
  mode: ConversationPersistenceMode;
  ttlMinutes?: number;
  promoteOn?: ConversationPromotionTrigger[];
  persistSummary?: boolean;
  persistShortTermMemory?: boolean;
};

export type ConversationPersistenceDecision = {
  mode: ConversationPersistenceMode;
  promoted: boolean;
  persistShortTermMemory: boolean;
  ttlMinutes: number | null;
  reason:
    | "policy_durable"
    | "approval_required"
    | "critical_execution"
    | "delegation"
    | "provenance_required"
    | "final_summary"
    | "user_confirmed"
    | "manual_save"
    | "ephemeral_default";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown) {
  return value === true;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizePromoteOn(value: unknown): ConversationPromotionTrigger[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ConversationPromotionTrigger =>
      item === "approval_required" ||
      item === "critical_execution" ||
      item === "delegation" ||
      item === "provenance_required" ||
      item === "final_summary" ||
      item === "user_confirmed" ||
      item === "manual_save"
  );
}

export function normalizeConversationPersistencePolicy(
  value: unknown
): ConversationPersistencePolicy {
  if (!isPlainObject(value)) {
    return {
      mode: "ephemeral",
      ttlMinutes: 60,
      promoteOn: ["approval_required", "critical_execution", "delegation", "provenance_required", "final_summary"],
      persistSummary: true,
      persistShortTermMemory: false,
    };
  }

  const mode = value.mode === "durable" ? "durable" : "ephemeral";
  const ttlMinutes =
    typeof value.ttlMinutes === "number" && Number.isFinite(value.ttlMinutes) && value.ttlMinutes > 0
      ? Math.trunc(value.ttlMinutes)
      : mode === "ephemeral"
      ? 60
      : 1440;

  return {
    mode,
    ttlMinutes,
    promoteOn: normalizePromoteOn(value.promoteOn),
    persistSummary: value.persistSummary !== false,
    persistShortTermMemory: value.persistShortTermMemory === true,
  };
}

export function resolveConversationPersistenceDecision(params: {
  metadata?: Record<string, unknown> | null;
  knowledgePolicy?: Record<string, unknown> | null;
}): ConversationPersistenceDecision {
  const metadata = params.metadata ?? {};
  const policy = normalizeConversationPersistencePolicy(metadata.conversationPersistence);
  const promoteOn = new Set(policy.promoteOn ?? []);
  const provenancePolicy =
    asString(metadata.provenancePolicy) ??
    (isPlainObject(params.knowledgePolicy) ? asString(params.knowledgePolicy.provenancePolicy) : null);

  if (policy.mode === "durable") {
    return {
      mode: "durable",
      promoted: false,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "policy_durable",
    };
  }

  if (promoteOn.has("manual_save") && asBoolean(metadata.persistConversation)) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "manual_save",
    };
  }

  if (
    promoteOn.has("approval_required") &&
    (asBoolean(metadata.approvalRequired) || asBoolean(metadata.requiresConfirmation))
  ) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "approval_required",
    };
  }

  if (
    promoteOn.has("critical_execution") &&
    (asBoolean(metadata.criticalExecution) ||
      asBoolean(metadata.txIdRequired) ||
      asString(metadata.runTier) === "HIGH")
  ) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "critical_execution",
    };
  }

  if (promoteOn.has("delegation") && isPlainObject(metadata.delegation)) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "delegation",
    };
  }

  if (promoteOn.has("provenance_required") && provenancePolicy === "required") {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "provenance_required",
    };
  }

  if (
    promoteOn.has("final_summary") &&
    (asBoolean(metadata.finalSummary) || asString(metadata.writeLabel) === "conversation.finalized")
  ) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "final_summary",
    };
  }

  if (promoteOn.has("user_confirmed") && asBoolean(metadata.userConfirmed)) {
    return {
      mode: "durable",
      promoted: true,
      persistShortTermMemory: true,
      ttlMinutes: policy.ttlMinutes ?? null,
      reason: "user_confirmed",
    };
  }

  return {
    mode: "ephemeral",
    promoted: false,
    persistShortTermMemory: policy.persistShortTermMemory === true,
    ttlMinutes: policy.ttlMinutes ?? null,
    reason: "ephemeral_default",
  };
}
