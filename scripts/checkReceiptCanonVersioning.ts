import fs from "node:fs";
import path from "node:path";

const CHECK = "check:receipt-canon-compat";

const baselineFile = path.resolve("contracts/receipt-canon.v1.baseline.json");
const schemaFile = path.resolve("contracts/receipt-canon.v1.schema.json");
const exampleFile = path.resolve("contracts/examples/receipt-canon.v1.example.json");
const changelogFile = path.resolve("contracts/CHANGELOG.receipt-canon.md");
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
for (const requiredArtifact of [schemaFile, exampleFile, changelogFile]) {
  if (!fs.existsSync(requiredArtifact)) {
    fail("receipt canon required artifact missing", {
      file: path.relative(process.cwd(), requiredArtifact),
    });
  }
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
const requiredKeys = ["schemaVersion", "requiredReceipts", "optionalReceipts", "requiredReasonCodes"];
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

const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8")) as Record<string, unknown>;
const example = JSON.parse(fs.readFileSync(exampleFile, "utf8")) as Record<string, unknown>;
const schemaProperties = schema.properties as Record<string, Record<string, unknown>> | undefined;
if (schemaProperties?.specVersion?.const !== "receipt.canon.v1") {
  fail("receipt canon schema specVersion mismatch", {
    file: "contracts/receipt-canon.v1.schema.json",
  });
}
if (example.specVersion !== "receipt.canon.v1") {
  fail("receipt canon example specVersion mismatch", {
    file: "contracts/examples/receipt-canon.v1.example.json",
  });
}
const changelog = fs.readFileSync(changelogFile, "utf8");
if (!changelog.includes("receipt.canon.v1")) {
  fail("receipt canon changelog missing active version", {
    file: "contracts/CHANGELOG.receipt-canon.md",
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

const optionalReceipts = baselineRecord.optionalReceipts;
if (!Array.isArray(optionalReceipts) || !optionalReceipts.includes("ExecutionStateReceipt")) {
  fail("optionalReceipts must include ExecutionStateReceipt", {
    file: "contracts/receipt-canon.v1.baseline.json",
  });
}

const executionReasonCodes = [
  "MCP_TOOL_CONTRACT_MISSING",
  "SIMULATED_OUTPUT_IN_CRITICAL_CHAIN",
  "AUDIT_WRITE_FAILED",
];
const missingExecutionReasonCodes = executionReasonCodes.filter(
  (reasonCode) => !requiredReasonCodes.includes(reasonCode)
);
if (missingExecutionReasonCodes.length > 0) {
  fail("receipt canon execution reasonCodes missing", {
    file: "contracts/receipt-canon.v1.baseline.json",
    missingExecutionReasonCodes,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      schemaVersion,
      optionalReceipts,
      executionReasonCodes,
      files: [
        "contracts/receipt-canon.v1.baseline.json",
        "contracts/receipt-canon.v1.schema.json",
        "contracts/examples/receipt-canon.v1.example.json",
        "contracts/CHANGELOG.receipt-canon.md",
        "docs/ops/receipt-canon-versioning-policy.md",
        "docs/ops/receipt-canon-external-verifier.md",
      ],
    },
    null,
    2,
  ),
);
