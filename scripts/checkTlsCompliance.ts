import { fail, hasAll, mustFile, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:tls-compliance";
const file = "ops/evidence/latest/domain-go-live/tls-full-strict-check.md";

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["full (strict)", "tls", "1.2", "snapshot", "curl"]);
  if (missing.length) fail(CHECK, "TLS evidence missing required sections", file, { missing });
  pass(CHECK, "TLS compliance evidence valid", file);
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
