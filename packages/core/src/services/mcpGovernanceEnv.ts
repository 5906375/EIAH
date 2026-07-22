// PR MCP-1F — helper puro compartilhado de parsing dos env vars de
// governanca MCP (ver docs/architecture/mcp-contract-v1.md). Consolida a
// logica ja duplicada em apps/workers/action-runner/src/services/
// mcpEnforcement.ts, apps/api/src/workers/runWorker.ts, packages/core/src/
// orchestrator/agentOrchestrator.ts e apps/api/src/services/intentValidator.ts
// preservando exatamente o mesmo default/truthy-set em cada call site — nao
// altera semantica, gates, nem MCP_PROXY_ALL_ACTIONS behavior.

const TRUTHY_VALUES = new Set(["1", "true", "on"]);

function parseBooleanEnv(raw: string | undefined, fallback: string): boolean {
  const normalized = (raw ?? fallback).trim().toLowerCase();
  return TRUTHY_VALUES.has(normalized);
}

export function parseMcpEnforceContractsEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnv(env.MCP_ENFORCE_CONTRACTS, "true");
}

export function parseMcpProxyAllActionsEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnv(env.MCP_PROXY_ALL_ACTIONS, "false");
}

export function parseMcpDefaultVersionEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MCP_DEFAULT_VERSION ?? "1.0.0").trim() || "1.0.0";
}
