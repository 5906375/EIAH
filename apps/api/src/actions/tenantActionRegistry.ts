import { VersionedActionRegistry, registerAllActions } from "@eiah/core";

// Cria registry local por tenant
const versionedRegistry = new VersionedActionRegistry();

// Registra todas as actions (incluindo agentes)
const { registry, resolve } = registerAllActions(versionedRegistry);

export { registry as tenantActionRegistry, resolve as tenantActionResolver };
