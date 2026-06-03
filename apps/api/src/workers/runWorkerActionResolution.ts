import type { RegisteredAction } from "@eiah/core";

function normalizeActionName(value: string) {
  return value.trim().toLowerCase();
}

export function resolveDeclaredActionNames(
  declaredActionNames: string[] | undefined,
  canonicalByNormalized: Map<string, string>,
  definitions: Record<string, RegisteredAction>
) {
  return (declaredActionNames ?? [])
    .map((name) => canonicalByNormalized.get(normalizeActionName(name)) ?? name.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name) => Boolean(definitions[name]));
}

export function mergeActionsForExecution(params: {
  configured: Record<string, RegisteredAction>;
  definitions: Record<string, RegisteredAction>;
  dbAllowedCanonical: string[];
  dbAllowedRaw: string[];
  declaredAgentActions?: string[];
}) {
  const { configured, definitions, dbAllowedCanonical, dbAllowedRaw, declaredAgentActions } = params;
  const merged: Record<string, RegisteredAction> = { ...configured };

  for (const actionName of dbAllowedCanonical) {
    const def = definitions[actionName];
    if (def) {
      merged[actionName] = def;
    }
  }

  for (const actionName of declaredAgentActions ?? []) {
    const def = definitions[actionName];
    if (def) {
      merged[actionName] = def;
    }
  }

  for (const rawName of dbAllowedRaw) {
    if (merged[rawName]) continue;
    if (definitions[rawName]) {
      merged[rawName] = definitions[rawName];
      continue;
    }
    merged[rawName] = {
      name: rawName,
      version: "1.0.0",
      description: "Tenant policy allowed action",
      handler: async () => ({ status: "error", error: `Action ${rawName} not registered in core catalog` }),
    };
  }

  return merged;
}

export function resolveLocallyExecutableAction(
  actionName: string,
  catalog: Record<string, RegisteredAction> | undefined
) {
  if (!catalog) return null;
  return catalog[actionName] ?? null;
}
