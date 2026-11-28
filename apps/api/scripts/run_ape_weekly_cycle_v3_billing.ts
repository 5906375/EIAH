/**
 * Manual, honest execution of a real ape.weekly-cycle.v3 billing cycle
 * against real Postgres data — Passo 7 of the sequence ratified in
 * docs/ops/ape-audit-telemetry-decision.md §10 ("Produzir ciclo manual
 * honesto, com ratificação separada. Primeiro NO_GO aceitável.").
 *
 * This script calls the real production entry point
 * (runBillingCyclePipeline) exactly as-is: no clock override, no invented
 * tenant/workspace, no fabricated data. It stops at
 * "awaiting_human_ratification" or "rejected" and never proceeds further.
 *
 * It NEVER imports or calls persistCycleRatificationV3. Ratification is a
 * separate, deliberate human decision (Carlos Alberto Merlo or an explicitly
 * authorized delegate), made after reviewing this script's output — not by
 * this script, not automatically, not under any circumstance.
 *
 * Safety: only run against a dev-local DATABASE_URL. This script does not
 * itself validate the connection target beyond what runBillingCyclePipeline
 * already requires (a reachable Postgres with the real schema) — the
 * operator is responsible for confirming DATABASE_URL points at dev before
 * running this, exactly as for any other script here.
 *
 * Usage:
 *   node --env-file-if-exists=packages/db/.env --import tsx \
 *     apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts \
 *     --tenant-id <tenantId> --workspace-id <workspaceId>
 */
import { execFileSync } from "node:child_process";
import { prisma, closePrismaResources } from "@repo/db";
import { runBillingCyclePipeline, getLastClosedBillingCycleWindow } from "../src/services/apeWeeklyCycleV3BillingCycle.js";

function parseArgs(argv: readonly string[]): { tenantId: string; workspaceId: string } {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const tenantId = get("--tenant-id");
  const workspaceId = get("--workspace-id");
  if (!tenantId || !workspaceId) {
    throw new Error("Usage: run_ape_weekly_cycle_v3_billing.ts --tenant-id <tenantId> --workspace-id <workspaceId>");
  }
  return { tenantId, workspaceId };
}

function resolveCommitSha(): string {
  // Same pattern as scripts/generate_e2e_high_manifest.ts.
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return process.env.GITHUB_SHA ?? "unknown";
  }
}

async function main(): Promise<void> {
  const { tenantId, workspaceId } = parseArgs(process.argv.slice(2));
  const commitSha = resolveCommitSha();
  const window = getLastClosedBillingCycleWindow();

  console.log(JSON.stringify({
    step: "input",
    tenantId,
    workspaceId,
    commitSha,
    closedBillingCycleWindow: window,
  }, null, 2));

  // The real production entry point. No clock override, no operationId
  // override, no way to inject synthetic data — exactly as ratified.
  const result = await runBillingCyclePipeline(prisma, {
    tenantId,
    workspaceId,
    commitSha,
    workflowRunId: null,
  });

  console.log(JSON.stringify({ step: "result", result }, null, 2));

  if (result.status === "rejected") {
    console.log(
      "\n=== REJECTED ===\n" +
      `failureReasons: ${JSON.stringify(result.failureReasons)}\n` +
      "This is an honest, acceptable outcome for a first real cycle " +
      "(docs/ops/ape-audit-telemetry-decision.md §9: \"O primeiro ciclo " +
      "honesto pode ser NO_GO, e isso é aceitável\") — not a bug to fix.\n",
    );
  } else {
    console.log(
      "\n=== AWAITING_HUMAN_RATIFICATION ===\n" +
      `evidenceRef: ${result.evidenceRef}\n` +
      `evidenceDigest: ${result.evidenceDigest}\n` +
      `validationResultRef: ${result.validationResultRef}\n` +
      `validationResultDigest: ${result.validationResultDigest}\n` +
      "Ratification is a separate, deliberate human decision (Carlos " +
      "Alberto Merlo). This script does not build, sign, or persist a " +
      "CycleRatificationV3, and never will — that action happens " +
      "independently, after this output has been reviewed.\n",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrismaResources();
  });
