import { registerAllActions, VersionedActionRegistry, TenantActionResolver, getRegisteredActionDefinitions, createLogger, } from "@eiah/core";
import { createGuardrailLedgerStore } from "../services/guardrailLedgerStore";
import { loadTenantActionPolicy } from "./tenantActionPolicyLoader";
import { persistActionVersion } from "./actionCatalogStore";
const guardrailStore = createGuardrailLedgerStore();
const versionedRegistry = new VersionedActionRegistry();
const tenantConfigs = loadTenantActionPolicy();
const tenantActionResolver = new TenantActionResolver(versionedRegistry, tenantConfigs);
const actionRegistryHandle = registerAllActions({
    idempotencyStore: guardrailStore,
    actionResolver: tenantActionResolver,
});
const logger = createLogger({ component: "action-catalog" });
const defaultContract = {
    version: "default",
    actions: getRegisteredActionDefinitions(),
};
versionedRegistry.registerVersion(defaultContract);
persistActionVersion(defaultContract)
    .then(() => logger.info({
    version: defaultContract.version,
    actions: Object.keys(defaultContract.actions).length,
}, "action.catalog.persisted"))
    .catch((error) => logger.error({
    err: error,
    version: defaultContract.version,
}, "action.catalog.persist_failed"));
export function resolveTenantActions(tenantId) {
    return actionRegistryHandle.resolve(tenantId);
}
//# sourceMappingURL=tenantActionRegistry.js.map