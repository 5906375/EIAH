import type { ActionDefinition, VersionedActionRegistry } from "./VersionedActionRegistry";

export interface TenantActionConfig {
  tenantId: string;
  version: string;
  overrides?: Record<string, ActionDefinition>;
}

export class TenantActionResolver {
  constructor(
    private readonly versionedRegistry: VersionedActionRegistry,
    private readonly tenantConfigs: Map<string, TenantActionConfig>
  ) {}

  resolveActions(tenantId: string) {
    const config = this.tenantConfigs.get(tenantId);

    if (!config) {
      return this.versionedRegistry.getActionsForVersion("default") ?? {};
    }

    const base = this.versionedRegistry.getActionsForVersion(config.version) ?? {};
    const overrides = config.overrides ?? {};

    return { ...base, ...overrides };
  }
}
