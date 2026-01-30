import fs from "node:fs";
import type {
  TenantActionConfig,
} from "@eiah/core/actions/registry/TenantActionResolver";
import type { ActionDefinition } from "@eiah/core/actions/registry/VersionedActionRegistry";

export function loadTenantActionPolicy(): Map<string, TenantActionConfig> {
  const fileUrl = new URL("./tenantActionPolicy.json", import.meta.url);
  const data = fs.readFileSync(fileUrl, "utf8");
  const json = JSON.parse(data) as Record<string, { version: string; overrides?: Record<string, unknown> }>;

  const map = new Map<string, TenantActionConfig>();
  for (const tenantId of Object.keys(json)) {
    const entry = json[tenantId];
    map.set(tenantId, {
      tenantId,
      version: entry.version,
      overrides: (entry.overrides as Record<string, ActionDefinition> | undefined) ?? {},
    });
  }
  return map;
}
