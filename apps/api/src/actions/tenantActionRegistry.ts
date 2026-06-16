import { VersionedActionRegistry, registerAllActions } from "@eiah/core";
import { registerRealestateActions } from "./realestateActions";

// Cria registry local por tenant
const versionedRegistry = new VersionedActionRegistry();

// Registra todas as actions (incluindo agentes)
const { registry, resolve } = registerAllActions(versionedRegistry);

// Registra stubs fail-closed para realestate.* (Phase 4.0)
// Handlers reais pendentes até Phase 4.3 ImobPostRunMutationWorker
registerRealestateActions();

export { registry as tenantActionRegistry, resolve as tenantActionResolver };
