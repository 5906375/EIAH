import fs from "node:fs";
import path from "node:path";

const CHECK = "check:agent-protocol-compat";
const baselineFile = path.resolve("contracts/agent-protocol.v1.baseline.json");
const schemaFile = path.resolve("contracts/agent-protocol.v1.schema.json");
const exampleFile = path.resolve("contracts/examples/agent-protocol.v1.example.json");
const changelogFile = path.resolve("contracts/CHANGELOG.agent-protocol.md");
const policyFile = path.resolve("ops/contracts/agent-protocol-versioning-policy.md");
const apiContractFile = path.resolve("docs/ops/agent-protocol-api-contract.md");
const evidenceIndexFile = path.resolve("docs/EVIDENCE_INDEX.md");
const runtimeRoutesFile = path.resolve("apps/api/src/routes/agents.ts");

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

for (const file of [baselineFile, schemaFile, exampleFile, changelogFile, policyFile, apiContractFile, evidenceIndexFile, runtimeRoutesFile]) {
  if (!fs.existsSync(file)) {
    fail("required_file_missing", { file: path.relative(process.cwd(), file) });
  }
}

const baseline = readJson(baselineFile) as Record<string, unknown>;
const schema = readJson(schemaFile) as Record<string, unknown>;
const example = readJson(exampleFile) as Record<string, unknown>;
const changelog = fs.readFileSync(changelogFile, "utf8");
const apiContract = fs.readFileSync(apiContractFile, "utf8");
const evidenceIndex = fs.readFileSync(evidenceIndexFile, "utf8");
const runtimeRoutes = fs.readFileSync(runtimeRoutesFile, "utf8");

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

const missingExampleFields = (requiredTopLevelFields as string[]).filter((key) => !(key in example));
if (missingExampleFields.length > 0) {
  fail("example_missing_required_fields", { missingExampleFields });
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

if (typeof example.txIdRequired !== "boolean") {
  fail("example_txidrequired_invalid", { got: example.txIdRequired ?? null });
}

if ((schema.$id as string | undefined)?.includes("agent-protocol.v1") !== true) {
  fail("schema_id_version_mismatch", { schemaId: schema.$id ?? null });
}

if (!changelog.includes("## agent-protocol.v1")) {
  fail("changelog_version_entry_missing", { file: path.relative(process.cwd(), changelogFile) });
}

for (const endpoint of ["/api/agents/discovery", "/api/agents/negotiate", "/api/agents/execute"]) {
  if (!apiContract.includes(endpoint)) {
    fail("api_contract_missing_endpoint", { endpoint, file: path.relative(process.cwd(), apiContractFile) });
  }
}

for (const invariant of ["agent-protocol.v1", "txIdRequired", "receipt.canon.v1"]) {
  if (!apiContract.includes(invariant)) {
    fail("api_contract_missing_invariant", { invariant, file: path.relative(process.cwd(), apiContractFile) });
  }
}

for (const reference of [
  "contracts/agent-protocol.v1.schema.json",
  "contracts/agent-protocol.v1.baseline.json",
  "contracts/examples/agent-protocol.v1.example.json",
  "ops/contracts/agent-protocol-versioning-policy.md",
  "scripts/checkAgentProtocolVersioning.ts",
  "ops/evidence/latest/interop-routes-smoke-",
  "ops/evidence/latest/interop-e2e-agent-call-",
]) {
  if (!evidenceIndex.includes(reference)) {
    fail("evidence_index_missing_agent_protocol_reference", {
      reference,
      file: path.relative(process.cwd(), evidenceIndexFile),
    });
  }
}

const runtimeAction = typeof example.action === "string" ? example.action : null;
if (!runtimeAction) {
  fail("example_action_invalid", { got: example.action ?? null });
}
const runtimeVersion = typeof example.version === "string" ? example.version : null;
const runtimeTier = typeof example.tier === "string" ? example.tier : null;
const runtimeDefaultAgent = typeof example.defaultAgent === "string" ? example.defaultAgent : null;
if (!runtimeVersion || !runtimeTier || !runtimeDefaultAgent) {
  fail("example_runtime_alignment_fields_invalid", {
    version: example.version ?? null,
    tier: example.tier ?? null,
    defaultAgent: example.defaultAgent ?? null,
  });
}

const escapedAction = runtimeAction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const runtimeContractPattern = new RegExp(
  `"${escapedAction}"\\s*:\\s*\\{[\\s\\S]*?version:\\s*"${runtimeVersion}"[\\s\\S]*?tier:\\s*"${runtimeTier}"[\\s\\S]*?txIdRequired:\\s*true[\\s\\S]*?specVersion:\\s*"${expectedReceiptSpec}"[\\s\\S]*?defaultAgent:\\s*"${runtimeDefaultAgent}"`,
  "m"
);
if (!runtimeContractPattern.test(runtimeRoutes)) {
  fail("runtime_contract_action_missing", {
    action: runtimeAction,
    file: path.relative(process.cwd(), runtimeRoutesFile),
  });
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
        "docs/ops/agent-protocol-api-contract.md",
        "docs/EVIDENCE_INDEX.md",
        "apps/api/src/routes/agents.ts",
      ],
      schemaVersion,
    },
    null,
    2
  )
);
