import fs from "node:fs";
import path from "node:path";

const CHECK = "check:presentation-snapshot-contract";
const REASON_CODE = "PRESENTATION_SNAPSHOT_CONTRACT_INVALID";
const baselineFile = path.resolve("contracts/presentation-snapshot.v1.baseline.json");
const schemaFile = path.resolve("contracts/presentation-snapshot.v1.schema.json");

type Violation = {
  message: string;
  file?: string;
  field?: string;
};

function fail(violations: Violation[]): never {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reasonCode: REASON_CODE,
        check: CHECK,
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function readJson(file: string, label: string): Record<string, unknown> {
  if (!fs.existsSync(file)) {
    fail([{ message: `${label}_missing`, file: path.relative(process.cwd(), file) }]);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (error) {
    fail([
      {
        message: `${label}_invalid_json`,
        file: path.relative(process.cwd(), file),
        field: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}

function expectStringArray(
  value: unknown,
  file: string,
  field: string,
  violations: Violation[],
): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    violations.push({ message: `${field}_invalid`, file, field });
    return [];
  }
  return value as string[];
}

const baseline = readJson(baselineFile, "baseline");
const schema = readJson(schemaFile, "schema");
const violations: Violation[] = [];

if (baseline.contractName !== "presentation-snapshot") {
  violations.push({ message: "baseline_contractName_mismatch", file: "contracts/presentation-snapshot.v1.baseline.json", field: "contractName" });
}
if (baseline.version !== "v1") {
  violations.push({ message: "baseline_version_mismatch", file: "contracts/presentation-snapshot.v1.baseline.json", field: "version" });
}
if (baseline.schema !== "contracts/presentation-snapshot.v1.schema.json") {
  violations.push({ message: "baseline_schema_ref_mismatch", file: "contracts/presentation-snapshot.v1.baseline.json", field: "schema" });
}

if (schema.type !== "object") {
  violations.push({ message: "schema_type_must_be_object", file: "contracts/presentation-snapshot.v1.schema.json", field: "type" });
}
if (schema.additionalProperties !== false) {
  violations.push({ message: "schema_additionalProperties_must_be_false", file: "contracts/presentation-snapshot.v1.schema.json", field: "additionalProperties" });
}

const requiredFields = expectStringArray(baseline.requiredFields, "contracts/presentation-snapshot.v1.baseline.json", "requiredFields", violations);
const optionalFields = expectStringArray(baseline.optionalFields, "contracts/presentation-snapshot.v1.baseline.json", "optionalFields", violations);
const prohibitedFields = expectStringArray(baseline.prohibitedFields, "contracts/presentation-snapshot.v1.baseline.json", "prohibitedFields", violations);
const sourceFiles = expectStringArray(baseline.sourceFiles, "contracts/presentation-snapshot.v1.baseline.json", "sourceFiles", violations);
const schemaRequired = expectStringArray(schema.required, "contracts/presentation-snapshot.v1.schema.json", "required", violations);

const properties =
  schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? (schema.properties as Record<string, unknown>)
    : null;

if (!properties) {
  violations.push({ message: "schema_properties_missing", file: "contracts/presentation-snapshot.v1.schema.json", field: "properties" });
}

for (const field of requiredFields) {
  if (!schemaRequired.includes(field)) {
    violations.push({ message: "baseline_required_field_missing_from_schema_required", file: "contracts/presentation-snapshot.v1.schema.json", field });
  }
  if (properties && !(field in properties)) {
    violations.push({ message: "baseline_required_field_missing_from_schema_properties", file: "contracts/presentation-snapshot.v1.schema.json", field });
  }
}

for (const field of optionalFields) {
  if (properties && !(field in properties)) {
    violations.push({ message: "baseline_optional_field_missing_from_schema_properties", file: "contracts/presentation-snapshot.v1.schema.json", field });
  }
  if (schemaRequired.includes(field)) {
    violations.push({ message: "baseline_optional_field_marked_required_in_schema", file: "contracts/presentation-snapshot.v1.schema.json", field });
  }
}

for (const field of prohibitedFields) {
  if (properties && field in properties) {
    violations.push({ message: "prohibited_field_present_in_schema_properties", file: "contracts/presentation-snapshot.v1.schema.json", field });
  }
}

for (const file of sourceFiles) {
  if (!fs.existsSync(path.resolve(file))) {
    violations.push({ message: "baseline_source_file_missing", file });
  }
}

const snapshotVersion =
  properties?.snapshotVersion && typeof properties.snapshotVersion === "object"
    ? (properties.snapshotVersion as Record<string, unknown>)
    : null;
if (!snapshotVersion || snapshotVersion.const !== "v1") {
  violations.push({ message: "snapshotVersion_const_mismatch", file: "contracts/presentation-snapshot.v1.schema.json", field: "snapshotVersion" });
}

const quickReplies =
  properties?.quickReplies && typeof properties.quickReplies === "object"
    ? (properties.quickReplies as Record<string, unknown>)
    : null;
if (!quickReplies || quickReplies.type !== "array" || quickReplies.maxItems !== 3) {
  violations.push({ message: "quickReplies_shape_mismatch", file: "contracts/presentation-snapshot.v1.schema.json", field: "quickReplies" });
}

const governedRuntime =
  properties?.governedRuntime && typeof properties.governedRuntime === "object"
    ? (properties.governedRuntime as Record<string, unknown>)
    : null;
const governedAnyOf = Array.isArray(governedRuntime?.anyOf) ? governedRuntime.anyOf : [];
const governedObject = governedAnyOf.find(
  (entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).type === "object",
) as Record<string, unknown> | undefined;
const governedProperties =
  governedObject?.properties && typeof governedObject.properties === "object"
    ? (governedObject.properties as Record<string, unknown>)
    : null;
const launcherPolicy =
  governedProperties?.launcherPolicy && typeof governedProperties.launcherPolicy === "object"
    ? (governedProperties.launcherPolicy as Record<string, unknown>)
    : null;

if (!governedObject) {
  violations.push({ message: "governedRuntime_object_variant_missing", file: "contracts/presentation-snapshot.v1.schema.json", field: "governedRuntime" });
} else {
  if (governedObject.additionalProperties !== false) {
    violations.push({ message: "governedRuntime_additionalProperties_must_be_false", file: "contracts/presentation-snapshot.v1.schema.json", field: "governedRuntime" });
  }
  if (!launcherPolicy || launcherPolicy.const !== "render_only") {
    violations.push({ message: "governedRuntime_launcherPolicy_const_mismatch", file: "contracts/presentation-snapshot.v1.schema.json", field: "governedRuntime.launcherPolicy" });
  }
}

if (violations.length > 0) {
  fail(violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      contract: "presentation-snapshot",
      version: "v1",
      checkedFiles: [
        "contracts/presentation-snapshot.v1.schema.json",
        "contracts/presentation-snapshot.v1.baseline.json",
        ...sourceFiles,
      ],
    },
    null,
    2,
  ),
);
