import { registerAllActions, VersionedActionRegistry } from "@eiah/core";
const versionedRegistry = new VersionedActionRegistry();
const { registry, resolve } = registerAllActions(versionedRegistry);
export { registry as tenantActionRegistry, resolve as tenantActionResolver };
//# sourceMappingURL=tenantActionRegistry.js.map
