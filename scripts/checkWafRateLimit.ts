import { fail, hasAll, mustFile, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:waf-rate-limit";
const file = "ops/evidence/2026-W09/base/waf-rate-limit-evidence.md";

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["waf", "rate", "429", "rules", "webhook"]);
  if (missing.length) fail(CHECK, "Evidence missing required sections", file, { missing });
  pass(CHECK, "WAF/rate-limit evidence valid", file);
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
