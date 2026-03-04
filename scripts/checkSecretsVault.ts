import { fail, hasAll, mustFile, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:secrets-vault";
const file = "ops/evidence/2026-W09/base/secrets-vault-evidence.md";

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["secrets", "staging", "prod", "vault", "timestamp"]);
  if (missing.length) {
    fail(CHECK, "Evidence missing required sections", file, { missing });
  }
  if (/placeholder|changeme|dummy_secret/i.test(content)) {
    fail(CHECK, "Unsafe placeholder detected in evidence", file);
  }
  pass(CHECK, "Secrets vault evidence valid", file);
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
