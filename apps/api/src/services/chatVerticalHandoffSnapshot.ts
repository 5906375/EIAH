import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CHAT_VERTICAL_HANDOFF_VERSION = "chat.vertical_handoff.v1" as const;
export const CHAT_VERTICAL_HANDOFF_SCHEMA_PATH = "contracts/chat/chat.vertical_handoff.v1.schema.json" as const;

export type ChatVerticalHandoffRiskLevel = "read_only" | "assisted" | "high" | "critical";

export type ChatVerticalHandoffRenderHints = {
  verticalBadgeLabel?: string;
  suggestedSurface?: "chat" | "cockpit" | "run" | "proof";
  ctaLabel?: string;
  cockpitDeepLink?: string;
};

export type BuildChatVerticalHandoffSnapshotInput = {
  handoffId?: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  scope?: string | null;
  userId?: string | null;
  verticalId?: string | null;
  intentId?: string | null;
  handoffMessage?: string | null;
  riskLevel?: ChatVerticalHandoffRiskLevel | string | null;
  hitlRequired?: boolean | null;
  reasonCode?: string | null;
  blueprintId?: string | null;
  requiredEntitlement?: string | null;
  requiredRoles?: string[] | null;
  renderHints?: ChatVerticalHandoffRenderHints | null;
  runId?: string | null;
  receiptId?: string | null;
  bundleId?: string | null;
};

export type ChatVerticalHandoffSnapshot = {
  version: typeof CHAT_VERTICAL_HANDOFF_VERSION;
  handoffId: string;
  tenantId: string;
  workspaceId: string;
  scope: string;
  userId: string;
  verticalId: string;
  intentId: string;
  handoffMessage: string;
  reasonCode: string;
  riskLevel: ChatVerticalHandoffRiskLevel;
  hitlRequired: boolean;
  blueprintId?: string;
  requiredEntitlement?: string;
  requiredRoles?: string[];
  renderHints?: ChatVerticalHandoffRenderHints;
  runId?: string;
  receiptId?: string;
  bundleId?: string;
};

export type ChatVerticalHandoffValidationViolation = {
  path: string;
  message: string;
};

export type BuildChatVerticalHandoffSnapshotResult =
  | {
      ok: true;
      snapshot: ChatVerticalHandoffSnapshot;
      schemaPath: typeof CHAT_VERTICAL_HANDOFF_SCHEMA_PATH;
      sideEffects: 0;
    }
  | {
      ok: false;
      reasonCode: string;
      message: string;
      schemaPath: typeof CHAT_VERTICAL_HANDOFF_SCHEMA_PATH;
      sideEffects: 0;
      violations?: ChatVerticalHandoffValidationViolation[];
    };

type JsonSchema = Record<string, unknown>;

const REQUIRED_INPUT_FIELDS = [
  ["tenantId", "CHAT_VERTICAL_HANDOFF_TENANT_REQUIRED"],
  ["workspaceId", "CHAT_VERTICAL_HANDOFF_WORKSPACE_REQUIRED"],
  ["scope", "CHAT_VERTICAL_HANDOFF_SCOPE_REQUIRED"],
  ["userId", "CHAT_VERTICAL_HANDOFF_USER_REQUIRED"],
  ["verticalId", "CHAT_VERTICAL_HANDOFF_VERTICAL_REQUIRED"],
  ["intentId", "CHAT_VERTICAL_HANDOFF_INTENT_REQUIRED"],
  ["handoffMessage", "CHAT_VERTICAL_HANDOFF_MESSAGE_REQUIRED"],
  ["reasonCode", "CHAT_VERTICAL_HANDOFF_REASON_REQUIRED"],
  ["riskLevel", "CHAT_VERTICAL_HANDOFF_RISK_REQUIRED"],
] as const;

function readSchema(): JsonSchema {
  const schemaFile = path.resolve(CHAT_VERTICAL_HANDOFF_SCHEMA_PATH);
  return JSON.parse(fs.readFileSync(schemaFile, "utf8")) as JsonSchema;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicHandoffId(snapshotSeed: Omit<ChatVerticalHandoffSnapshot, "handoffId">): string {
  const digest = crypto.createHash("sha256").update(stableStringify(snapshotSeed), "utf8").digest("hex");
  return `handoff_${digest.slice(0, 32)}`;
}

function addOptionalString(target: Record<string, unknown>, key: string, value: unknown) {
  const normalized = asTrimmedString(value);
  if (normalized) target[key] = normalized;
}

function normalizeRenderHints(renderHints: ChatVerticalHandoffRenderHints | null | undefined) {
  if (!renderHints || !isObject(renderHints)) return undefined;
  const normalized: Record<string, unknown> = {};
  addOptionalString(normalized, "verticalBadgeLabel", renderHints.verticalBadgeLabel);
  addOptionalString(normalized, "suggestedSurface", renderHints.suggestedSurface);
  addOptionalString(normalized, "ctaLabel", renderHints.ctaLabel);
  addOptionalString(normalized, "cockpitDeepLink", renderHints.cockpitDeepLink);
  return Object.keys(normalized).length > 0 ? (normalized as ChatVerticalHandoffRenderHints) : undefined;
}

function validateValue(schema: JsonSchema, value: unknown, pathLabel: string): ChatVerticalHandoffValidationViolation[] {
  const violations: ChatVerticalHandoffValidationViolation[] = [];
  const type = schema.type;

  if (type === "object") {
    if (!isObject(value)) {
      return [{ path: pathLabel, message: "expected_object" }];
    }

    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((entry): entry is string => typeof entry === "string") : [];

    for (const requiredField of required) {
      if (!(requiredField in value)) {
        violations.push({ path: `${pathLabel}.${requiredField}`, message: "required_field_missing" });
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          violations.push({ path: `${pathLabel}.${key}`, message: "additional_property_not_allowed" });
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isObject(propertySchema)) {
        violations.push(...validateValue(propertySchema, value[key], `${pathLabel}.${key}`));
      }
    }

    return violations;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      return [{ path: pathLabel, message: "expected_array" }];
    }
    if (schema.uniqueItems === true && new Set(value.map((entry) => stableStringify(entry))).size !== value.length) {
      violations.push({ path: pathLabel, message: "array_items_must_be_unique" });
    }
    if (isObject(schema.items)) {
      value.forEach((entry, index) => {
        violations.push(...validateValue(schema.items as JsonSchema, entry, `${pathLabel}[${index}]`));
      });
    }
  }

  if (type === "string") {
    if (typeof value !== "string") {
      return [{ path: pathLabel, message: "expected_string" }];
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      violations.push({ path: pathLabel, message: "string_too_short" });
    }
    if (typeof schema.const === "string" && value !== schema.const) {
      violations.push({ path: pathLabel, message: "const_mismatch" });
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      violations.push({ path: pathLabel, message: "enum_mismatch" });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      violations.push({ path: pathLabel, message: "pattern_mismatch" });
    }
  }

  if (type === "boolean" && typeof value !== "boolean") {
    violations.push({ path: pathLabel, message: "expected_boolean" });
  }

  return violations;
}

export function validateChatVerticalHandoffSnapshotAgainstSchema(
  snapshot: unknown,
): ChatVerticalHandoffValidationViolation[] {
  return validateValue(readSchema(), snapshot, "$");
}

export function buildChatVerticalHandoffSnapshot(
  input: BuildChatVerticalHandoffSnapshotInput,
): BuildChatVerticalHandoffSnapshotResult {
  for (const [field, reasonCode] of REQUIRED_INPUT_FIELDS) {
    if (!asTrimmedString(input[field])) {
      return {
        ok: false,
        reasonCode,
        message: `Missing required field: ${field}`,
        schemaPath: CHAT_VERTICAL_HANDOFF_SCHEMA_PATH,
        sideEffects: 0,
      };
    }
  }

  if (input.riskLevel === "critical" && input.hitlRequired !== true) {
    return {
      ok: false,
      reasonCode: "CHAT_VERTICAL_HANDOFF_HITL_REQUIRED_FOR_CRITICAL_RISK",
      message: "critical riskLevel requires hitlRequired=true",
      schemaPath: CHAT_VERTICAL_HANDOFF_SCHEMA_PATH,
      sideEffects: 0,
    };
  }

  const snapshotSeed: Omit<ChatVerticalHandoffSnapshot, "handoffId"> = {
    version: CHAT_VERTICAL_HANDOFF_VERSION,
    tenantId: asTrimmedString(input.tenantId) as string,
    workspaceId: asTrimmedString(input.workspaceId) as string,
    scope: asTrimmedString(input.scope) as string,
    userId: asTrimmedString(input.userId) as string,
    verticalId: asTrimmedString(input.verticalId) as string,
    intentId: asTrimmedString(input.intentId) as string,
    handoffMessage: asTrimmedString(input.handoffMessage) as string,
    reasonCode: asTrimmedString(input.reasonCode) as string,
    riskLevel: asTrimmedString(input.riskLevel) as ChatVerticalHandoffRiskLevel,
    hitlRequired: input.hitlRequired === true,
  };

  addOptionalString(snapshotSeed, "blueprintId", input.blueprintId);
  addOptionalString(snapshotSeed, "requiredEntitlement", input.requiredEntitlement);
  addOptionalString(snapshotSeed, "runId", input.runId);
  addOptionalString(snapshotSeed, "receiptId", input.receiptId);
  addOptionalString(snapshotSeed, "bundleId", input.bundleId);

  const requiredRoles = Array.isArray(input.requiredRoles)
    ? Array.from(new Set(input.requiredRoles.map(asTrimmedString).filter((entry): entry is string => Boolean(entry))))
    : [];
  if (requiredRoles.length > 0) {
    snapshotSeed.requiredRoles = requiredRoles;
  }

  const renderHints = normalizeRenderHints(input.renderHints);
  if (renderHints) {
    snapshotSeed.renderHints = renderHints;
  }

  const snapshot: ChatVerticalHandoffSnapshot = {
    ...snapshotSeed,
    handoffId: asTrimmedString(input.handoffId) ?? deterministicHandoffId(snapshotSeed),
  };

  const violations = validateChatVerticalHandoffSnapshotAgainstSchema(snapshot);
  if (violations.length > 0) {
    return {
      ok: false,
      reasonCode: "CHAT_VERTICAL_HANDOFF_SCHEMA_INVALID",
      message: "Snapshot failed chat.vertical_handoff.v1 schema validation",
      schemaPath: CHAT_VERTICAL_HANDOFF_SCHEMA_PATH,
      sideEffects: 0,
      violations,
    };
  }

  return {
    ok: true,
    snapshot,
    schemaPath: CHAT_VERTICAL_HANDOFF_SCHEMA_PATH,
    sideEffects: 0,
  };
}
