import {
  parseMcpEnforceContractsEnv,
  parseMcpDefaultVersionEnv,
} from "@eiah/core/services/mcpGovernanceEnv";

export type McpEnforcementConfig = {
  enabled: boolean;
  defaultVersion: string;
};

export function mcpEnforcementConfigFromEnv(): McpEnforcementConfig {
  const enabled = parseMcpEnforceContractsEnv();
  const defaultVersion = parseMcpDefaultVersionEnv();

  return { enabled, defaultVersion };
}

export function resolveMcpToolVersion(metadata: unknown, fallback: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return fallback;
  const record = metadata as Record<string, unknown>;
  const candidates = ["toolVersion", "contractVersion", "version"];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}
