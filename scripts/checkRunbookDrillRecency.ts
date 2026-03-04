import { ageDays, fail, hasAll, mustFile, parseIsoDate, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:runbook-drill-recency";
const file = "ops/evidence/2026-W09/base/drill-evidence.md";
const maxAgeDays = Number(process.env.RUNBOOK_DRILL_MAX_AGE_DAYS || 30);

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["passos", "resultado", "lições", "data"]);
  if (missing.length) fail(CHECK, "Evidence missing required sections", file, { missing });

  const parsed = parseIsoDate(content);
  if (!parsed) fail(CHECK, "Could not parse date in drill evidence", file);
  const age = ageDays(parsed);
  if (age > maxAgeDays) fail(CHECK, `Drill evidence too old: ${age.toFixed(2)} days`, file, { maxAgeDays });

  pass(CHECK, "Runbook drill recency valid", file, { ageDays: Number(age.toFixed(3)) });
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
