import "dotenv/config";
import { prismaGlobal } from "@repo/db";
import {
  registerAllActions,
  VersionedActionRegistry,
  listRegisteredActions,
} from "@eiah/core";

function parseVersionToInt(version?: string) {
  if (!version) return 1;
  const major = Number(version.split(".")[0]);
  return Number.isFinite(major) && major > 0 ? major : 1;
}

function inferSideEffects(name: string) {
  const n = name.toLowerCase();
  return (
    n.includes("create") ||
    n.includes("update") ||
    n.includes("delete") ||
    n.includes("send") ||
    n.includes("broadcast") ||
    n.includes("publish") ||
    n.includes("emit") ||
    n.includes("approve") ||
    n.includes("reject") ||
    n.includes("subscribe") ||
    n.includes("charge")
  );
}

function inferDataSensitivity(name: string) {
  const n = name.toLowerCase();
  if (n.includes("guardian") || n.includes("privacy")) return "high";
  if (n.includes("billing") || n.includes("payment")) return "high";
  if (n.includes("risk") || n.includes("audit") || n.includes("ledger")) return "medium";
  if (n.includes("memory") || n.includes("knowledge")) return "medium";
  return "low";
}

function inferCriticality(name: string, sideEffects: boolean, dataSensitivity: string) {
  if (!sideEffects && dataSensitivity === "low") return "low";
  if (sideEffects && dataSensitivity === "high") return "critical";
  if (sideEffects && dataSensitivity === "medium") return "high";
  if (!sideEffects && dataSensitivity === "high") return "high";
  return "medium";
}

async function main() {
  const registry = new VersionedActionRegistry();
  registerAllActions(registry);

  const actions = listRegisteredActions();
  if (actions.length === 0) {
    console.warn("No actions registered. Nothing to persist.");
    return;
  }

  const untagged: string[] = [];

  for (const action of actions) {
    const source =
      action.criticalitySource === "explicit"
        ? "explicit"
        : action.criticalitySource === "inferred"
        ? "inferred"
        : "default";
    const hasExplicit = source === "explicit";
    const sideEffects = inferSideEffects(action.name);
    const dataSensitivity = inferDataSensitivity(action.name);
    const inferredCriticality = inferCriticality(action.name, sideEffects, dataSensitivity);
    const criticality = hasExplicit
      ? (action.criticality ?? "unknown")
      : inferredCriticality;
    const criticalitySource = hasExplicit ? "explicit" : "inferred";
    const needsReview = !hasExplicit;
    if (needsReview) {
      untagged.push(action.name);
    }
    const versionInt = parseVersionToInt(action.version);
    await prismaGlobal.actionRegistry.upsert({
      where: { name_version: { name: action.name, version: versionInt } },
      create: {
        name: action.name,
        version: versionInt,
        description: action.description ?? null,
        criticality,
        criticalitySource,
        needsReview,
        sideEffects,
        dataSensitivity,
        schema: {
          version: action.version ?? null,
          guardrails: action.guardrails ?? [],
          hasInputSchema: Boolean(action.contract?.input),
          hasOutputSchema: Boolean(action.contract?.output),
        } as any,
      },
      update: {
        description: action.description ?? null,
        criticality,
        criticalitySource,
        needsReview,
        sideEffects,
        dataSensitivity,
        schema: {
          version: action.version ?? null,
          guardrails: action.guardrails ?? [],
          hasInputSchema: Boolean(action.contract?.input),
          hasOutputSchema: Boolean(action.contract?.output),
        } as any,
      },
    });
  }

  console.log(`ActionRegistry populated: ${actions.length} actions.`);
  if (untagged.length > 0) {
    console.warn(`Untagged criticality: ${untagged.length}`);
    console.warn(untagged.join(", "));
  } else {
    console.log("Criticality coverage: 100% (no untagged actions).");
  }
}

main()
  .then(() => prismaGlobal.$disconnect())
  .catch((err) => {
    console.error("populateActionRegistry failed:", err);
    prismaGlobal.$disconnect().finally(() => process.exit(1));
  });
