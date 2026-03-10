import fs from "node:fs";
import path from "node:path";

const CHECK = "check:agent-protocol-compat";
const baselineFile = path.resolve("contracts/agent-protocol.v1.baseline.json");
const schemaFile = path.resolve("contracts/agent-protocol.v1.schema.json");
const exampleFile = path.resolve("contracts/examples/agent-protocol.v1.example.json");
const changelogFile = path.resolve("contracts/CHANGELOG.agent-protocol.md");
const policyFile = path.resolve("ops/contracts/agent-protocol-versioning-policy.md");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("invalid_json", { file, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const file of [baselineFile, schemaFile, exampleFile, changelogFile, policyFile]) {
  if (!fs.existsSync(file)) {
    fail("required_file_missing", { file: path.relative(process.cwd(), file) });
  }
}

const baseline = readJson(baselineFile) as Record<string, unknown>;
const schema = readJson(schemaFile) as Record<string, unknown>;
const example = readJson(exampleFile) as Record<string, unknown>;

const schemaVersion = baseline.schemaVersion;
if (schemaVersion !== "agent-protocol.v1") {
  fail("unsupported_schema_version", { expected: "agent-protocol.v1", got: schemaVersion });
}

const requiredTopLevelFields = baseline.requiredTopLevelFields;
if (!Array.isArray(requiredTopLevelFields) || requiredTopLevelFields.some((v) => typeof v !== "string")) {
  fail("invalid_baseline_requiredTopLevelFields");
}

const schemaRequired = schema.required;
if (!Array.isArray(schemaRequired) || schemaRequired.some((v) => typeof v !== "string")) {
  fail("invalid_schema_required");
}

const missingRequired = (requiredTopLevelFields as string[]).filter((key) => !(schemaRequired as string[]).includes(key));
if (missingRequired.length > 0) {
  fail("breaking_change_required_field_removed_without_major_bump", { missingRequired });
}

const tierEnum =
  (schema.properties as Record<string, unknown> | undefined)?.tier &&
  typeof (schema.properties as Record<string, unknown>).tier === "object"
    ? ((schema.properties as Record<string, Record<string, unknown>>).tier.enum as unknown)
    : null;
const requiredTierValues = baseline.requiredTierValues;
if (!Array.isArray(requiredTierValues) || requiredTierValues.some((v) => typeof v !== "string")) {
  fail("invalid_baseline_requiredTierValues");
}
if (!Array.isArray(tierEnum)) {
  fail("schema_tier_enum_missing");
}
const missingTierValues = (requiredTierValues as string[]).filter((value) => !(tierEnum as unknown[]).includes(value));
if (missingTierValues.length > 0) {
  fail("breaking_change_tier_enum_restricted_without_major_bump", { missingTierValues });
}

const expectedReceiptSpec = baseline.requiredReceiptSpecVersion;
const exampleReceiptSpec = (example.receiptSchema as Record<string, unknown> | undefined)?.specVersion;
if (typeof expectedReceiptSpec !== "string" || !expectedReceiptSpec) {
  fail("invalid_baseline_requiredReceiptSpecVersion");
}
if (exampleReceiptSpec !== expectedReceiptSpec) {
  fail("example_receipt_spec_mismatch", { expected: expectedReceiptSpec, got: exampleReceiptSpec });
}

if ((schema.$id as string | undefined)?.includes("agent-protocol.v1") !== true) {
  fail("schema_id_version_mismatch", { schemaId: schema.$id ?? null });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      files: [
        "contracts/agent-protocol.v1.baseline.json",
        "contracts/agent-protocol.v1.schema.json",
        "contracts/examples/agent-protocol.v1.example.json",
        "contracts/CHANGELOG.agent-protocol.md",
        "ops/contracts/agent-protocol-versioning-policy.md",
      ],
      schemaVersion,
    },
    null,
    2
  )
);
