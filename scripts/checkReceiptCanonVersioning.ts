import fs from "node:fs";
import path from "node:path";

const CHECK = "check:receipt-canon-compat";

const baselineFile = path.resolve("contracts/receipt-canon.v1.baseline.json");
const policyFile = path.resolve("docs/ops/receipt-canon-versioning-policy.md");
const verifierGuide = path.resolve("docs/ops/receipt-canon-external-verifier.md");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(baselineFile)) {
  fail("receipt canon baseline missing", { file: "contracts/receipt-canon.v1.baseline.json" });
}
if (!fs.existsSync(policyFile)) {
  fail("receipt canon versioning policy missing", { file: "docs/ops/receipt-canon-versioning-policy.md" });
}
if (!fs.existsSync(verifierGuide)) {
  fail("receipt canon external verifier guide missing", { file: "docs/ops/receipt-canon-external-verifier.md" });
}

let baseline: unknown;
try {
  baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
} catch (error) {
  fail("invalid receipt canon baseline json", {
    file: "contracts/receipt-canon.v1.baseline.json",
    error: error instanceof Error ? error.message : String(error),
  });
}

if (!baseline || typeof baseline !== "object") {
  fail("receipt canon baseline must be an object", { file: "contracts/receipt-canon.v1.baseline.json" });
}

const baselineRecord = baseline as Record<string, unknown>;
const requiredKeys = ["schemaVersion", "requiredReceipts", "requiredReasonCodes"];
const missingKeys = requiredKeys.filter((key) => !(key in baselineRecord));
if (missingKeys.length > 0) {
  fail("receipt canon baseline missing required keys", {
    file: "contracts/receipt-canon.v1.baseline.json",
    missingKeys,
  });
}

const schemaVersion = baselineRecord.schemaVersion;
if (schemaVersion !== "1.0.0") {
  fail("unsupported receipt canon schemaVersion", {
    file: "contracts/receipt-canon.v1.baseline.json",
    expected: "1.0.0",
    got: schemaVersion,
  });
}

const requiredReceipts = baselineRecord.requiredReceipts;
if (!Array.isArray(requiredReceipts) || requiredReceipts.length === 0) {
  fail("requiredReceipts must be a non-empty array", { file: "contracts/receipt-canon.v1.baseline.json" });
}

const requiredReasonCodes = baselineRecord.requiredReasonCodes;
if (!Array.isArray(requiredReasonCodes) || requiredReasonCodes.length === 0) {
  fail("requiredReasonCodes must be a non-empty array", { file: "contracts/receipt-canon.v1.baseline.json" });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      schemaVersion,
      files: [
        "contracts/receipt-canon.v1.baseline.json",
        "docs/ops/receipt-canon-versioning-policy.md",
        "docs/ops/receipt-canon-external-verifier.md",
      ],
    },
    null,
    2,
  ),
);
