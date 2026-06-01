import { fail, hasAll, mustFile, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:origin-security";
const file = "ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md";

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["cloudflare", "bypass", "negado", "sg", "acl"]);
  if (missing.length) fail(CHECK, "Origin security evidence missing sections", file, { missing });
  pass(CHECK, "Origin security evidence valid", file);
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
