export const REASON_CODE_STATUSES = ["active", "proposed", "deprecated"] as const;
export type ReasonCodeStatus = (typeof REASON_CODE_STATUSES)[number];

export const REASON_CODE_DOMAINS = [
  "ledger",
  "execution",
  "mcp",
  "imob",
  "chat_vertical",
  "release",
  "rbac",
  "notification",
] as const;
export type ReasonCodeDomain = (typeof REASON_CODE_DOMAINS)[number];

export const REASON_CODE_SEVERITIES = ["info", "warning", "error", "critical"] as const;
export type ReasonCodeSeverity = (typeof REASON_CODE_SEVERITIES)[number];

export const REASON_CODE_CATEGORIES = [
  "audit",
  "authorization",
  "execution",
  "governance",
  "integrity",
  "validation",
] as const;
export type ReasonCodeCategory = (typeof REASON_CODE_CATEGORIES)[number];

export type ReasonCodeApprover = Readonly<{
  kind: "human" | "bootstrap-validator";
  actor: string;
}>;

export type ReasonCodeDefinition<Code extends string = string> = Readonly<{
  code: Code;
  domain: ReasonCodeDomain;
  severity: ReasonCodeSeverity;
  category: ReasonCodeCategory;
  description: string;
  status: ReasonCodeStatus;
  owner?: string;
  approver?: ReasonCodeApprover;
  introducedBy?: string;
  evidenceRef?: string;
}>;

const IMOB_BOOTSTRAP_ACTIVE_CODES = [
  "COMMERCIAL_PRIORITY",
  "FOLLOW_UP_DISCIPLINE",
  "DOCUMENT_BLOCKER",
  "FINANCIAL_BLOCKER",
  "AUDIT_BLOCKER",
  "BLOCKERS_PRESENT",
  "PENDING_ITEMS_PRESENT",
  "NEXT_STEP_AVAILABLE",
  "CASE_STATUS_BLOCKED",
  "CASE_RESPONSIBLE_REQUIRED",
  "CASE_OWNER_ASSIGNMENT_FORBIDDEN",
  "MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE",
  "RESPONSIBLE_ACTOR_CONTRACT_INVALID",
  "INVALID_ACTION_TYPE",
  "CASE_TRANSITION_EVENT_REQUIRED",
  "PENDING_ACTION_MISSING",
  "PENDING_ACTION_MISMATCH",
  "PENDING_ACTION_EXPIRED",
  "PENDING_ACTION_CANCELLED_BY_USER",
  "CONFIRMATION_TARGET_AMBIGUOUS",
  "DIRECTED_ACTION_CONTEXT_LOST",
  "DIRECTED_ACTION_ENTITY_MISMATCH",
  "DIRECTED_ACTION_JOURNEY_MISMATCH",
] as const;

const CHAT_VERTICAL_BOOTSTRAP_ACTIVE_CODES = [
  "VERTICAL_NOT_REGISTERED",
  "VERTICAL_DISABLED",
  "VERTICAL_ENTITLEMENT_REQUIRED",
  "VERTICAL_SCOPE_DENIED",
  "VERTICAL_CAPABILITY_NOT_AVAILABLE",
  "VERTICAL_REGISTRY_VERSION_MISMATCH",
  "VERTICAL_POLICY_DENIED",
  "VERTICAL_HITL_REQUIRED",
  "VERTICAL_GOVERNANCE_NOT_EVALUATED",
  "VERTICAL_PRESENTATION_INVALID",
  "VERTICAL_HANDOFF_ALLOWED",
  "VERTICAL_PREVIEW_ONLY",
] as const;

const LEDGER_PROPOSED_CODES = [
  "invalid_txid_format",
  "txid_not_found",
  "pou_txid_mismatch",
  "missing_trust_snapshot_for_pou",
  "missing_run_for_txid",
  "missing_bundle_hash_for_run",
  "run_txid_mismatch",
  "run_critical_hash_mismatch",
  "missing_scl_for_txid",
  "missing_scl_signature",
  "scl_critical_hash_mismatch",
  "delegation_pending_approval",
] as const;

const EXECUTION_PROPOSED_CODES = [
  "EXECUTION_FAILED",
  "SIMULATED_OUTPUT_IN_CRITICAL_CHAIN",
  "AUDIT_WRITE_FAILED",
] as const;

const EXECUTION_ASSIGNMENT_ACTIVE_CODES = [
  "AGENT_ASSIGNMENT_REQUIRED",
] as const;

const RELEASE_TELEMETRY_ACTIVE_CODES = [
  "APE_TELEMETRY_NOT_AVAILABLE",
] as const;

const CONNECTION_PROPOSED_CODES = [
  "REDIS_URL_REQUIRED",
] as const;

const MCP_TOOL_CONTRACT_ACTIVE_CODES = [
  "MCP_TOOL_CONTRACT_MISSING",
] as const;

const MCP_DB_SCOPE_ACTIVE_CODES = [
  "DB_SCOPE_MISSING",
] as const;

const MCP_DB_ALLOWLIST_ACTIVE_CODES = [
  "DB_MODEL_NOT_ALLOWLISTED",
] as const;

const MCP_DB_PROPOSED_CODES = [
  "DB_SCOPE_VIOLATION",
] as const;

const MCP_DB_INPUT_ACTIVE_CODES = [
  "DB_INPUT_INVALID",
] as const;

const MCP_POLICY_PROPOSED_CODES = [
  "MCP_POLICY_REFERENCE_MISSING",
  "MCP_POLICY_TARGET_NOT_FOUND",
  "MCP_POLICY_STORE_UNAVAILABLE",
  "MCP_POLICY_DENIED",
  "MCP_POLICY_CONTEXT_MISSING",
  "MCP_POLICY_CONTEXT_VIOLATION",
] as const;

const MCP_DENY_PROPOSED_CODES = [
  "POLICY_NOT_FOUND",
] as const;

const RBAC_PROPOSED_CODES = [
  "RBAC_OWNER_DEFERRAL",
  "RBAC_BUILD_ARTIFACT_DRIFT",
] as const;

const NOTIFICATION_PROPOSED_CODES = [
  "NOTIFICATION_NON_DELIVERY_ESCALATION",
  "NOTIFICATION_BLOCKED_FREEZE",
  "NOTIFICATION_BLOCKED_SECRET_PROVENANCE",
  "NOTIFICATION_BLOCKED_REASON_CODE_MISSING",
  "NOTIFICATION_BLOCKED_RUN_MISSING",
] as const;

type DefinitionMetadata = Readonly<
  Omit<ReasonCodeDefinition, "code" | "description"> & {
    descriptionPrefix: string;
  }
>;

function defineReasonCodes<const Codes extends readonly string[]>(
  codes: Codes,
  metadata: DefinitionMetadata,
): ReadonlyArray<ReasonCodeDefinition<Codes[number]>> {
  const { descriptionPrefix, ...definitionMetadata } = metadata;
  return codes.map((code) => ({
    code,
    description: `${descriptionPrefix}: ${code}`,
    ...definitionMetadata,
  }));
}

export const REASON_CODE_CATALOG = [
  ...defineReasonCodes(IMOB_BOOTSTRAP_ACTIVE_CODES, {
    domain: "imob",
    severity: "warning",
    category: "governance",
    descriptionPrefix: "Reason code enforced by the IMOB domain validator",
    status: "active",
    owner: "IMOB",
    approver: {
      kind: "bootstrap-validator",
      actor: "imobReasonCodeSchema",
    },
    evidenceRef:
      "apps/api/src/services/imob/control/imobReasonCodeCatalog.ts#IMOB_REASON_CODE_VALUES",
  }),
  ...defineReasonCodes(CHAT_VERTICAL_BOOTSTRAP_ACTIVE_CODES, {
    domain: "chat_vertical",
    severity: "warning",
    category: "authorization",
    descriptionPrefix: "Reason code enforced by the Chat to Vertical contract",
    status: "active",
    owner: "Chat/Vertical contract",
    approver: {
      kind: "bootstrap-validator",
      actor: "checkArchChatContracts",
    },
    evidenceRef: "contracts/chat/vertical.reason_codes.v1.json#codes",
  }),
  ...defineReasonCodes(EXECUTION_ASSIGNMENT_ACTIVE_CODES, {
    domain: "execution",
    severity: "critical",
    category: "authorization",
    descriptionPrefix:
      "No exact pre-existing enabled workspace agent assignment exists for the requested tenant, workspace, agent and version",
    status: "active",
    owner: "Execution governance",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "PR1a-assignment-fail-closed",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#ratificacao-pr1a-assignment-fail-closed-2026-08-12",
  }),
  ...defineReasonCodes(RELEASE_TELEMETRY_ACTIVE_CODES, {
    domain: "release",
    severity: "critical",
    category: "governance",
    descriptionPrefix:
      "Release publication is blocked because valid APE weekly-cycle v3 telemetry is unavailable",
    status: "active",
    owner: "Release governance / APE telemetry",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "APE-TELEMETRY-CONTAINMENT-PR-A",
    evidenceRef:
      "docs/ops/ape-audit-telemetry-decision.md#12-ratificação",
  }),
  ...defineReasonCodes(LEDGER_PROPOSED_CODES, {
    domain: "ledger",
    severity: "error",
    category: "integrity",
    descriptionPrefix: "Existing documented ledger reason code pending canonical ratification",
    status: "proposed",
    owner: "Ledger governance",
    evidenceRef:
      "git:516c34b670b7f8ba339d212a70ea3985c72370a3:docs/ops/reason-codes-catalog.md",
  }),
  ...defineReasonCodes(EXECUTION_PROPOSED_CODES, {
    domain: "execution",
    severity: "critical",
    category: "execution",
    descriptionPrefix: "Existing execution reason code pending canonical ratification",
    status: "proposed",
    owner: "Execution governance",
    evidenceRef: "apps/api/src/services/executionEvidence.ts",
  }),
  ...defineReasonCodes(CONNECTION_PROPOSED_CODES, {
    domain: "execution",
    severity: "critical",
    category: "governance",
    descriptionPrefix:
      "Required Redis connection URL is absent and localhost fallback is forbidden",
    status: "proposed",
    owner: "Tool Security / Runtime connection governance",
    introducedBy: "DB-CALLER-3",
    evidenceRef: "packages/core/src/config/redis.ts#ConnectionPolicyError",
  }),
  ...defineReasonCodes(MCP_TOOL_CONTRACT_ACTIVE_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix:
      "No exact active ToolContract exists for the requested tenant, action and version",
    status: "active",
    owner: "MCP/Tool Security governance",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "RC-MCP-1A",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#ratificacao-rc-mcp-1a-2026-07-28",
  }),
  ...defineReasonCodes(MCP_DB_SCOPE_ACTIVE_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix:
      "Authenticated context lacks tenant or workspace required by the scoped DB model",
    status: "active",
    owner: "MCP/Tool Security governance",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "RC-MCP-1A",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#ratificacao-rc-mcp-1a-2026-07-28",
  }),
  ...defineReasonCodes(MCP_DB_ALLOWLIST_ACTIVE_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix:
      "Requested DB model is absent from the governed allowlist",
    status: "active",
    owner: "MCP/Tool Security governance",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "RC-MCP-1A",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#ratificacao-rc-mcp-1a-2026-07-28",
  }),
  ...defineReasonCodes(MCP_DB_PROPOSED_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix: "Existing MCP DB reason code pending canonical ratification",
    status: "proposed",
    owner: "MCP governance",
    evidenceRef: "packages/mcp-runner/src/executor/dbAllowlist.ts#MCP_DB_REASON_CODES",
  }),
  ...defineReasonCodes(MCP_DB_INPUT_ACTIVE_CODES, {
    domain: "mcp",
    severity: "error",
    category: "validation",
    descriptionPrefix:
      "Structurally invalid MCP DB input rejected before Prisma or delegate access",
    status: "active",
    owner: "Governance Layer / MCP DB Authorization",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    introducedBy: "RC-DB-1A",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#ratificacao-rc-db-1a-2026-07-28",
  }),
  ...defineReasonCodes(MCP_POLICY_PROPOSED_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix:
      "MCP policy reason code pending canonical ratification and common enforcement",
    status: "proposed",
    owner: "MCP/Tool Security governance",
    introducedBy: "RC-MCP-2A",
    evidenceRef:
      "docs/ops/reason-codes-catalog.md#rc-mcp-2a-proposals",
  }),
  ...defineReasonCodes(MCP_DENY_PROPOSED_CODES, {
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    descriptionPrefix: "Reason code requested by the blocked MCP deny front",
    status: "proposed",
    owner: "MCP governance",
    evidenceRef: "packages/core/src/policy/TenantPolicyStore.ts#ScopeDecisionReasonCode",
  }),
  ...defineReasonCodes(RBAC_PROPOSED_CODES, {
    domain: "rbac",
    severity: "critical",
    category: "governance",
    descriptionPrefix: "Reason code requested by the blocked RBAC front",
    status: "proposed",
    owner: "RBAC governance",
  }),
  ...defineReasonCodes(NOTIFICATION_PROPOSED_CODES, {
    domain: "notification",
    severity: "error",
    category: "governance",
    descriptionPrefix: "Reason code requested by the blocked notification front",
    status: "proposed",
    owner: "Notification governance",
    evidenceRef: "scripts/notify/escalationNotice.ts",
  }),
] as const;

export type ReasonCode = (typeof REASON_CODE_CATALOG)[number]["code"];
export type ActiveReasonCode =
  | (typeof IMOB_BOOTSTRAP_ACTIVE_CODES)[number]
  | (typeof CHAT_VERTICAL_BOOTSTRAP_ACTIVE_CODES)[number]
  | (typeof RELEASE_TELEMETRY_ACTIVE_CODES)[number]
  | (typeof MCP_TOOL_CONTRACT_ACTIVE_CODES)[number]
  | (typeof MCP_DB_SCOPE_ACTIVE_CODES)[number]
  | (typeof MCP_DB_ALLOWLIST_ACTIVE_CODES)[number]
  | (typeof MCP_DB_INPUT_ACTIVE_CODES)[number];

const REASON_CODE_BY_CODE = new Map<string, (typeof REASON_CODE_CATALOG)[number]>(
  REASON_CODE_CATALOG.map((definition) => [definition.code, definition]),
);

export function getReasonCodeDefinition(
  value: string | null | undefined,
): (typeof REASON_CODE_CATALOG)[number] | undefined {
  if (!value) return undefined;
  return REASON_CODE_BY_CODE.get(value);
}

export function isReasonCode(value: string | null | undefined): value is ReasonCode {
  return Boolean(value && REASON_CODE_BY_CODE.has(value));
}

export function assertReasonCode(value: string | null | undefined): ReasonCode {
  if (isReasonCode(value)) return value;
  throw new Error(`Unknown reason code: ${value ?? "null"}`);
}

export function isActiveReasonCode(
  value: string | null | undefined,
): value is ActiveReasonCode {
  return getReasonCodeDefinition(value)?.status === "active";
}

export function assertActiveReasonCode(
  value: string | null | undefined,
): ActiveReasonCode {
  if (isActiveReasonCode(value)) return value;
  throw new Error(`Reason code is not active: ${value ?? "null"}`);
}

export function normalizeReason(
  value: string | null | undefined,
  fallback: ReasonCode,
): ReasonCode {
  return isReasonCode(value) ? value : fallback;
}
