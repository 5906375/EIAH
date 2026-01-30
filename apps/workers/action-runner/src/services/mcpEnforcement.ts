export type McpEnforcementConfig = {
  enabled: boolean;
  defaultVersion: string;
};

export function mcpEnforcementConfigFromEnv(): McpEnforcementConfig {
  const enabledRaw = (process.env.MCP_ENFORCE_CONTRACTS ?? "true").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "on";

  const defaultVersion = (process.env.MCP_DEFAULT_VERSION ?? "1.0.0").trim() || "1.0.0";

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
