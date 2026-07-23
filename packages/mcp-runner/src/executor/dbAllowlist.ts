export const MCP_DB_REASON_CODES = {
  modelNotAllowlisted: "DB_MODEL_NOT_ALLOWLISTED",
  scopeViolation: "DB_SCOPE_VIOLATION",
  scopeMissing: "DB_SCOPE_MISSING",
} as const;

export type McpDbReasonCode =
  (typeof MCP_DB_REASON_CODES)[keyof typeof MCP_DB_REASON_CODES];

export type DbModelAllowlistEntry = Readonly<{
  model: string;
  tenantField: string | null;
  workspaceField: string | null;
  readOnly: true;
}>;

// Deny-all por decisão operacional do MCP-1K: o registry persistido não possui
// contratos. Inclusões de produção exigem aprovação explícita do operador.
export const MCP_DB_MODEL_ALLOWLIST: readonly DbModelAllowlistEntry[] =
  Object.freeze([]);

let testAllowlist: readonly DbModelAllowlistEntry[] | null = null;

export function resolveDbModelAllowlistEntry(
  model: string
): DbModelAllowlistEntry | null {
  const allowlist = testAllowlist ?? MCP_DB_MODEL_ALLOWLIST;
  return allowlist.find((entry) => entry.model === model) ?? null;
}

export function setMcpDbAllowlistForTests(
  entries?: readonly DbModelAllowlistEntry[]
) {
  testAllowlist = entries ? Object.freeze([...entries]) : null;
}

export class McpDbPolicyError extends Error {
  constructor(
    readonly reasonCode: McpDbReasonCode,
    message: string
  ) {
    super(message);
    this.name = "McpDbPolicyError";
  }
}
