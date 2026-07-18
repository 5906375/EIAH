import fs from "node:fs";
import path from "node:path";

export const HITL_GATE_STATE_VERSION = "hitl.gate_state.v1" as const;
export const HITL_GATE_STATE_SCHEMA_PATH = "contracts/chat/hitl.gate_state.v1.schema.json" as const;
export const PROOF_RECEIPT_BUNDLE_STATE_VERSION = "proof_receipt_bundle_state.v1" as const;
export const PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH =
  "contracts/chat/proof_receipt_bundle_state.v1.schema.json" as const;

export type ChatGateRiskLevel = "read_only" | "assisted" | "high" | "critical";
export type ChatGateType =
  | "approval"
  | "policy"
  | "entitlement"
  | "rbac"
  | "source_access"
  | "proof_required"
  | "human_review";
export type ChatGateApprovalState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "invalid"
  | "blocked";
export type ChatGateAllowedUserAction =
  | "view_details"
  | "open_cockpit"
  | "open_run"
  | "view_proof"
  | "request_review"
  | "contact_admin";

export type BuildReadOnlyHitlGateStateInput = {
  gateId?: string | null;
  gateType?: ChatGateType | string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  scope?: string | null;
  approvalState?: ChatGateApprovalState | string | null;
  hitlRequired?: boolean | null;
  riskLevel?: ChatGateRiskLevel | string | null;
  reasonCode?: string | null;
  verticalId?: string | null;
  message?: string | null;
  runId?: string | null;
  handoffId?: string | null;
  requiredRole?: string | null;
  requiredEntitlement?: string | null;
  allowedUserActions?: string[] | null;
  accessibilityLabel?: string | null;
};

export type ChatHitlGateState = {
  version: typeof HITL_GATE_STATE_VERSION;
  gateId: string;
  gateType: ChatGateType;
  tenantId: string;
  workspaceId: string;
  scope: string;
  approvalState: ChatGateApprovalState;
  hitlRequired: boolean;
  riskLevel: ChatGateRiskLevel;
  reasonCode: string;
  verticalId: string;
  message: string;
  runId?: string;
  handoffId?: string;
  requiredRole?: string;
  requiredEntitlement?: string;
  allowedUserActions?: ChatGateAllowedUserAction[];
  accessibilityLabel?: string;
};

export type ProofReceiptBundleKind =
  | "receipt"
  | "bundle"
  | "ledger_ref"
  | "external_proof"
  | "runtime_state";
export type ProofReceiptBundleStatus =
  | "not_required"
  | "pending"
  | "available"
  | "blocked"
  | "failed"
  | "inconsistent";
export type ProofReceiptBundleSource =
  | "runtime"
  | "ledger"
  | "run_bundle"
  | "vertical_runtime_contract"
  | "chat.vertical_handoff.v1";

export type BuildReadOnlyProofReceiptBundleStateInput = {
  proofKind?: ProofReceiptBundleKind | string | null;
  proofStatus?: ProofReceiptBundleStatus | "unavailable" | string | null;
  runId?: string | null;
  verticalId?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  scope?: string | null;
  source?: ProofReceiptBundleSource | string | null;
  reasonCode?: string | null;
  accessibilityLabel?: string | null;
  proofId?: string | null;
  receiptId?: string | null;
  bundleId?: string | null;
  ledgerRef?: string | null;
  createdAt?: string | null;
  verifiedAt?: string | null;
  receiptLink?: string | null;
  bundleLink?: string | null;
};

export type ChatProofReceiptBundleState = {
  version: typeof PROOF_RECEIPT_BUNDLE_STATE_VERSION;
  proofKind: ProofReceiptBundleKind;
  proofStatus: ProofReceiptBundleStatus;
  runId: string;
  verticalId: string;
  tenantId: string;
  workspaceId: string;
  scope: string;
  source: ProofReceiptBundleSource;
  reasonCode: string;
  accessibilityLabel: string;
  proofId?: string;
  receiptId?: string;
  bundleId?: string;
  ledgerRef?: string;
  createdAt?: string;
  verifiedAt?: string;
  receiptLink?: string;
  bundleLink?: string;
};

export type ChatGateProofValidationViolation = {
  path: string;
  message: string;
};

export type BuildReadOnlyHitlGateStateResult =
  | {
      ok: true;
      state: ChatHitlGateState;
      schemaPath: typeof HITL_GATE_STATE_SCHEMA_PATH;
      readOnly: true;
      sideEffects: 0;
    }
  | {
      ok: false;
      reasonCode: string;
      message: string;
      schemaPath: typeof HITL_GATE_STATE_SCHEMA_PATH;
      readOnly: true;
      sideEffects: 0;
      violations?: ChatGateProofValidationViolation[];
    };

export type BuildReadOnlyProofReceiptBundleStateResult =
  | {
      ok: true;
      state: ChatProofReceiptBundleState;
      schemaPath: typeof PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH;
      readOnly: true;
      sideEffects: 0;
    }
  | {
      ok: false;
      reasonCode: string;
      message: string;
      schemaPath: typeof PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH;
      readOnly: true;
      sideEffects: 0;
      violations?: ChatGateProofValidationViolation[];
    };

type JsonSchema = Record<string, unknown>;

const GATE_REQUIRED_INPUT_FIELDS = [
  ["gateId", "CHAT_HITL_GATE_ID_REQUIRED"],
  ["gateType", "CHAT_HITL_GATE_TYPE_REQUIRED"],
  ["tenantId", "CHAT_HITL_GATE_TENANT_REQUIRED"],
  ["workspaceId", "CHAT_HITL_GATE_WORKSPACE_REQUIRED"],
  ["scope", "CHAT_HITL_GATE_SCOPE_REQUIRED"],
  ["approvalState", "CHAT_HITL_GATE_APPROVAL_STATE_REQUIRED"],
  ["riskLevel", "CHAT_HITL_GATE_RISK_REQUIRED"],
  ["reasonCode", "CHAT_HITL_GATE_REASON_REQUIRED"],
  ["verticalId", "CHAT_HITL_GATE_VERTICAL_REQUIRED"],
  ["message", "CHAT_HITL_GATE_MESSAGE_REQUIRED"],
] as const;

const PROOF_REQUIRED_INPUT_FIELDS = [
  ["proofKind", "CHAT_PROOF_KIND_REQUIRED"],
  ["proofStatus", "CHAT_PROOF_STATUS_REQUIRED"],
  ["runId", "CHAT_PROOF_RUN_REQUIRED"],
  ["verticalId", "CHAT_PROOF_VERTICAL_REQUIRED"],
  ["tenantId", "CHAT_PROOF_TENANT_REQUIRED"],
  ["workspaceId", "CHAT_PROOF_WORKSPACE_REQUIRED"],
  ["scope", "CHAT_PROOF_SCOPE_REQUIRED"],
  ["source", "CHAT_PROOF_SOURCE_REQUIRED"],
  ["reasonCode", "CHAT_PROOF_REASON_REQUIRED"],
  ["accessibilityLabel", "CHAT_PROOF_ACCESSIBILITY_LABEL_REQUIRED"],
] as const;

const GATE_ALLOWED_USER_ACTIONS = new Set<ChatGateAllowedUserAction>([
  "view_details",
  "open_cockpit",
  "open_run",
  "view_proof",
  "request_review",
  "contact_admin",
]);

function readSchema(schemaPath: string): JsonSchema {
  return JSON.parse(fs.readFileSync(path.resolve(schemaPath), "utf8")) as JsonSchema;
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

function validateValue(schema: JsonSchema, value: unknown, pathLabel: string): ChatGateProofValidationViolation[] {
  const violations: ChatGateProofValidationViolation[] = [];
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

function addOptionalString(target: Record<string, unknown>, key: string, value: unknown) {
  const normalized = asTrimmedString(value);
  if (normalized) target[key] = normalized;
}

export function validateHitlGateStateAgainstSchema(state: unknown): ChatGateProofValidationViolation[] {
  return validateValue(readSchema(HITL_GATE_STATE_SCHEMA_PATH), state, "$");
}

export function validateProofReceiptBundleStateAgainstSchema(state: unknown): ChatGateProofValidationViolation[] {
  return validateValue(readSchema(PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH), state, "$");
}

export function buildReadOnlyHitlGateState(
  input: BuildReadOnlyHitlGateStateInput,
): BuildReadOnlyHitlGateStateResult {
  for (const [field, reasonCode] of GATE_REQUIRED_INPUT_FIELDS) {
    if (!asTrimmedString(input[field])) {
      return {
        ok: false,
        reasonCode,
        message: `Missing required HITL gate field: ${field}`,
        schemaPath: HITL_GATE_STATE_SCHEMA_PATH,
        readOnly: true,
        sideEffects: 0,
      };
    }
  }

  if (typeof input.hitlRequired !== "boolean") {
    return {
      ok: false,
      reasonCode: "CHAT_HITL_GATE_HITL_REQUIRED_FIELD_REQUIRED",
      message: "Missing required HITL gate field: hitlRequired",
      schemaPath: HITL_GATE_STATE_SCHEMA_PATH,
      readOnly: true,
      sideEffects: 0,
    };
  }

  if (input.riskLevel === "critical" && input.hitlRequired !== true) {
    return {
      ok: false,
      reasonCode: "CHAT_HITL_GATE_HITL_REQUIRED_FOR_CRITICAL_RISK",
      message: "critical riskLevel requires hitlRequired=true",
      schemaPath: HITL_GATE_STATE_SCHEMA_PATH,
      readOnly: true,
      sideEffects: 0,
    };
  }

  const state: ChatHitlGateState = {
    version: HITL_GATE_STATE_VERSION,
    gateId: asTrimmedString(input.gateId) as string,
    gateType: asTrimmedString(input.gateType) as ChatGateType,
    tenantId: asTrimmedString(input.tenantId) as string,
    workspaceId: asTrimmedString(input.workspaceId) as string,
    scope: asTrimmedString(input.scope) as string,
    approvalState: asTrimmedString(input.approvalState) as ChatGateApprovalState,
    hitlRequired: input.hitlRequired,
    riskLevel: asTrimmedString(input.riskLevel) as ChatGateRiskLevel,
    reasonCode: asTrimmedString(input.reasonCode) as string,
    verticalId: asTrimmedString(input.verticalId) as string,
    message: asTrimmedString(input.message) as string,
  };

  addOptionalString(state, "runId", input.runId);
  addOptionalString(state, "handoffId", input.handoffId);
  addOptionalString(state, "requiredRole", input.requiredRole);
  addOptionalString(state, "requiredEntitlement", input.requiredEntitlement);
  addOptionalString(state, "accessibilityLabel", input.accessibilityLabel);

  const allowedUserActions = Array.isArray(input.allowedUserActions)
    ? Array.from(
        new Set(
          input.allowedUserActions
            .map(asTrimmedString)
            .filter((entry): entry is ChatGateAllowedUserAction =>
              Boolean(entry && GATE_ALLOWED_USER_ACTIONS.has(entry as ChatGateAllowedUserAction)),
            ),
        ),
      )
    : [];
  if (allowedUserActions.length > 0) {
    state.allowedUserActions = allowedUserActions;
  }

  const violations = validateHitlGateStateAgainstSchema(state);
  if (violations.length > 0) {
    return {
      ok: false,
      reasonCode: "CHAT_HITL_GATE_SCHEMA_INVALID",
      message: "HITL gate state failed hitl.gate_state.v1 schema validation",
      schemaPath: HITL_GATE_STATE_SCHEMA_PATH,
      readOnly: true,
      sideEffects: 0,
      violations,
    };
  }

  return {
    ok: true,
    state,
    schemaPath: HITL_GATE_STATE_SCHEMA_PATH,
    readOnly: true,
    sideEffects: 0,
  };
}

function normalizeProofStatus(value: unknown): string | null {
  const normalized = asTrimmedString(value);
  return normalized === "unavailable" ? "not_required" : normalized;
}

export function buildReadOnlyProofReceiptBundleState(
  input: BuildReadOnlyProofReceiptBundleStateInput,
): BuildReadOnlyProofReceiptBundleStateResult {
  for (const [field, reasonCode] of PROOF_REQUIRED_INPUT_FIELDS) {
    const value = field === "proofStatus" ? normalizeProofStatus(input[field]) : asTrimmedString(input[field]);
    if (!value) {
      return {
        ok: false,
        reasonCode,
        message: `Missing required proof state field: ${field}`,
        schemaPath: PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH,
        readOnly: true,
        sideEffects: 0,
      };
    }
  }

  const state: ChatProofReceiptBundleState = {
    version: PROOF_RECEIPT_BUNDLE_STATE_VERSION,
    proofKind: asTrimmedString(input.proofKind) as ProofReceiptBundleKind,
    proofStatus: normalizeProofStatus(input.proofStatus) as ProofReceiptBundleStatus,
    runId: asTrimmedString(input.runId) as string,
    verticalId: asTrimmedString(input.verticalId) as string,
    tenantId: asTrimmedString(input.tenantId) as string,
    workspaceId: asTrimmedString(input.workspaceId) as string,
    scope: asTrimmedString(input.scope) as string,
    source: asTrimmedString(input.source) as ProofReceiptBundleSource,
    reasonCode: asTrimmedString(input.reasonCode) as string,
    accessibilityLabel: asTrimmedString(input.accessibilityLabel) as string,
  };

  addOptionalString(state, "proofId", input.proofId);
  addOptionalString(state, "receiptId", input.receiptId);
  addOptionalString(state, "bundleId", input.bundleId);
  addOptionalString(state, "ledgerRef", input.ledgerRef);
  addOptionalString(state, "createdAt", input.createdAt);
  addOptionalString(state, "verifiedAt", input.verifiedAt);
  addOptionalString(state, "receiptLink", input.receiptLink);
  addOptionalString(state, "bundleLink", input.bundleLink);

  const violations = validateProofReceiptBundleStateAgainstSchema(state);
  if (violations.length > 0) {
    return {
      ok: false,
      reasonCode: "CHAT_PROOF_SCHEMA_INVALID",
      message: "Proof state failed proof_receipt_bundle_state.v1 schema validation",
      schemaPath: PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH,
      readOnly: true,
      sideEffects: 0,
      violations,
    };
  }

  return {
    ok: true,
    state,
    schemaPath: PROOF_RECEIPT_BUNDLE_STATE_SCHEMA_PATH,
    readOnly: true,
    sideEffects: 0,
  };
}
