import { matchImobConversationalIntents } from "../imobIntentCatalog";
import type { ImobOperationalResolverParams } from "./imobCrmOperationalResolverShared";

export type LegacyCrmFallbackDecision = {
  eligible: boolean;
  allowed: boolean;
  reason: string;
  operationalFlow: string | null;
  conversationalIntentId: string | null;
  threadStateShape: string;
  scenarioKey: string;
};

export type LegacyCrmFallbackConfig = {
  mode: "allowlist" | "disabled" | "broad";
  allowlist: Set<string>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function getLegacyCrmFallbackConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LegacyCrmFallbackConfig {
  const normalizedMode = (env.IMOB_CRM_LEGACY_FALLBACK_MODE ?? "allowlist").trim().toLowerCase();
  const mode: LegacyCrmFallbackConfig["mode"] =
    normalizedMode === "disabled" || normalizedMode === "broad"
      ? normalizedMode
      : "allowlist";
  const allowlist = new Set(
    (env.IMOB_CRM_LEGACY_FALLBACK_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return { mode, allowlist };
}

export function describeLegacyThreadStateShape(params: Pick<ImobOperationalResolverParams, "caseId" | "threadState">) {
  const hasCaseScope = Boolean(asString(params.caseId));
  const threadStateObject = asObject(params.threadState);
  const operational = asObject(threadStateObject?.operational);
  const hasOperationalFlow = Boolean(asString(operational?.flow));
  const hasActiveCase = Boolean(asString(threadStateObject?.activeCaseId));
  const hasActiveThread = Boolean(asString(threadStateObject?.activeThreadId));
  const hasPendingFields = asStringList(operational?.pendingFields).length > 0;
  return [
    hasCaseScope ? "case_scope" : "no_case_scope",
    hasOperationalFlow ? "operational_flow" : "no_operational_flow",
    hasActiveCase ? "active_case" : "no_active_case",
    hasActiveThread ? "active_thread" : "no_active_thread",
    hasPendingFields ? "pending_fields" : "no_pending_fields",
  ].join("|");
}

export function resolveLegacyCrmFallbackDecision(
  params: Pick<ImobOperationalResolverParams, "message" | "caseId" | "threadState">,
  kind: "update" | "consult",
  config: LegacyCrmFallbackConfig,
): LegacyCrmFallbackDecision {
  const threadStateObject = asObject(params.threadState);
  const operational = asObject(threadStateObject?.operational);
  const operationalFlow = asString(operational?.flow);
  const threadStateShape = describeLegacyThreadStateShape(params);
  const conversationalIntentId = matchImobConversationalIntents(params.message)[0]?.intentId ?? null;
  const scenarioKey = [
    kind,
    operationalFlow ?? "no_flow",
    conversationalIntentId ?? "no_intent",
    threadStateShape,
  ].join(":");
  const eligible =
    Boolean(asString(params.caseId))
    || Boolean(operationalFlow)
    || Boolean(asString(threadStateObject?.activeCaseId))
    || Boolean(asString(threadStateObject?.activeThreadId));

  if (!eligible) {
    return {
      eligible: false,
      allowed: false,
      reason: "no_legacy_scope",
      operationalFlow,
      conversationalIntentId,
      threadStateShape,
      scenarioKey,
    };
  }

  if (config.mode === "disabled") {
    return {
      eligible: true,
      allowed: false,
      reason: "fallback_mode_disabled",
      operationalFlow,
      conversationalIntentId,
      threadStateShape,
      scenarioKey,
    };
  }

  if (config.mode === "broad") {
    return {
      eligible: true,
      allowed: true,
      reason: "fallback_mode_broad",
      operationalFlow,
      conversationalIntentId,
      threadStateShape,
      scenarioKey,
    };
  }

  const allowlistKeys = [scenarioKey, operationalFlow, conversationalIntentId, `${kind}:${operationalFlow ?? "no_flow"}`].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const allowed = allowlistKeys.some((key) => config.allowlist.has(key));

  return {
    eligible: true,
    allowed,
    reason: allowed ? "allowlist_match" : "allowlist_missing",
    operationalFlow,
    conversationalIntentId,
    threadStateShape,
    scenarioKey,
  };
}
