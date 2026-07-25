import { prisma } from "@repo/db";
function serializeActions(contract) {
    const entries = {};
    const actions = Object.entries(contract.actions);
    for (const [name, action] of actions) {
        entries[name] = {
            name: action.name ?? name,
            description: action.description,
            version: action.version ?? "1.0.0",
            guardrails: (action.guardrails ?? []).map((guard) => guard.name),
            hasInputSchema: Boolean(action.contract?.input),
            hasOutputSchema: Boolean(action.contract?.output),
        };
    }
    return entries;
}
export async function persistActionVersion(contract) {
    const actions = serializeActions(contract);
    await prisma.actionVersion.upsert({
        where: { version: contract.version },
        update: {
            actions: actions,
        },
        create: {
            version: contract.version,
            actions: actions,
        },
    });
}
//# sourceMappingURL=actionCatalogStore.js.map
