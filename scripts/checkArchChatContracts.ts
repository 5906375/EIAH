import fs from "node:fs";
import path from "node:path";

const CHECK = "check:arch-chat-contracts";
const REASON_CODE = "ARCH_CHAT_CONTRACT_INVALID";

type ContractSpec = {
  file: string;
  version: string;
  requiredFields: string[];
  optionalFields: string[];
  baselineFile?: string;
  exampleFile?: string;
};

type Violation = {
  message: string;
  file: string;
  field?: string;
};

const contracts: ContractSpec[] = [
  {
    file: "contracts/chat/chat.vertical_handoff.v1.schema.json",
    version: "chat.vertical_handoff.v1",
    requiredFields: [
      "version",
      "handoffId",
      "tenantId",
      "workspaceId",
      "scope",
      "userId",
      "verticalId",
      "intentId",
      "handoffMessage",
      "reasonCode",
      "riskLevel",
      "hitlRequired",
    ],
    optionalFields: [
      "blueprintId",
      "requiredEntitlement",
      "requiredRoles",
      "renderHints",
      "runId",
      "receiptId",
      "bundleId",
    ],
  },
  {
    file: "contracts/chat/hitl.gate_state.v1.schema.json",
    version: "hitl.gate_state.v1",
    requiredFields: [
      "version",
      "gateId",
      "gateType",
      "tenantId",
      "workspaceId",
      "scope",
      "approvalState",
      "hitlRequired",
      "riskLevel",
      "reasonCode",
      "verticalId",
      "message",
    ],
    optionalFields: [
      "runId",
      "handoffId",
      "requiredRole",
      "requiredEntitlement",
      "allowedUserActions",
      "accessibilityLabel",
    ],
  },
  {
    file: "contracts/chat/proof_receipt_bundle_state.v1.schema.json",
    version: "proof_receipt_bundle_state.v1",
    requiredFields: [
      "version",
      "proofKind",
      "proofStatus",
      "runId",
      "verticalId",
      "tenantId",
      "workspaceId",
      "scope",
      "source",
      "reasonCode",
      "accessibilityLabel",
    ],
    optionalFields: [
      "proofId",
      "receiptId",
      "bundleId",
      "ledgerRef",
      "createdAt",
      "verifiedAt",
      "receiptLink",
      "bundleLink",
    ],
  },
  {
    file: "contracts/chat/vertical.registry.v1.schema.json",
    version: "vertical.registry.v1",
    requiredFields: ["version", "registryVersion", "scope", "verticals"],
    optionalFields: [],
    baselineFile: "contracts/chat/vertical.registry.v1.baseline.json",
    exampleFile: "contracts/examples/vertical.registry.v1.example.json",
  },
  {
    file: "contracts/chat/chat.vertical_handoff.v2.schema.json",
    version: "chat.vertical_handoff.v2",
    requiredFields: [
      "version",
      "handoffId",
      "vertical",
      "capability",
      "refs",
      "governance",
      "presentation",
      "outcome",
      "reasonCode",
    ],
    optionalFields: [],
    baselineFile: "contracts/chat/chat.vertical_handoff.v2.baseline.json",
    exampleFile: "contracts/examples/chat.vertical_handoff.v2.example.json",
  },
];

const VERTICAL_REASON_CODE_CATALOG = "contracts/chat/vertical.reason_codes.v1.json";
const PROHIBITED_CONTENT_FIELDS = new Set(["prompt", "response", "rawDocument", "documentBody"]);

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

function readJson(file: string, violations: Violation[]): Record<string, unknown> | null {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    violations.push({ message: "contract_file_missing", file });
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
  } catch (error) {
    violations.push({
      message: "contract_invalid_json",
      file,
      field: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    return [];
  }

  return value as string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkAdditionalProperties(
  node: unknown,
  file: string,
  pointer: string,
  violations: Violation[],
): void {
  if (!isObject(node)) {
    return;
  }

  const isSchemaObject = node.type === "object" || isObject(node.properties);
  if (
    isSchemaObject &&
    node.additionalProperties !== false &&
    typeof node["x-allowAdditionalPropertiesReason"] !== "string"
  ) {
    violations.push({ message: "schema_additionalProperties_must_be_false", file, field: pointer });
  }

  const properties = isObject(node.properties) ? node.properties : {};
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    checkAdditionalProperties(propertySchema, file, `${pointer}.properties.${propertyName}`, violations);
  }

  if (isObject(node.items)) {
    checkAdditionalProperties(node.items, file, `${pointer}.items`, violations);
  }

  for (const unionKeyword of ["anyOf", "oneOf", "allOf"] as const) {
    const entries = node[unionKeyword];
    if (Array.isArray(entries)) {
      entries.forEach((entry, index) => {
        checkAdditionalProperties(entry, file, `${pointer}.${unionKeyword}[${index}]`, violations);
      });
    }
  }
}

function checkProhibitedProperties(
  node: unknown,
  file: string,
  pointer: string,
  violations: Violation[],
): void {
  if (!isObject(node)) return;

  const properties = isObject(node.properties) ? node.properties : {};
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (PROHIBITED_CONTENT_FIELDS.has(propertyName)) {
      violations.push({ message: "prohibited_content_field_declared", file, field: `${pointer}.${propertyName}` });
    }
    checkProhibitedProperties(propertySchema, file, `${pointer}.${propertyName}`, violations);
  }

  if (isObject(node.items)) {
    checkProhibitedProperties(node.items, file, `${pointer}.items`, violations);
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

const violations: Violation[] = [];

for (const contract of contracts) {
  const schema = readJson(contract.file, violations);
  if (!schema) {
    continue;
  }

  if (schema.type !== "object") {
    violations.push({ message: "schema_type_must_be_object", file: contract.file, field: "type" });
  }
  if (schema.additionalProperties !== false) {
    violations.push({
      message: "schema_root_additionalProperties_must_be_false",
      file: contract.file,
      field: "additionalProperties",
    });
  }

  const required = asStringArray(schema.required);
  if (required.length === 0) {
    violations.push({ message: "schema_required_invalid", file: contract.file, field: "required" });
  }

  const properties = isObject(schema.properties) ? schema.properties : null;
  if (!properties) {
    violations.push({ message: "schema_properties_missing", file: contract.file, field: "properties" });
    continue;
  }

  const versionProperty = isObject(properties.version) ? properties.version : null;
  if (!versionProperty || versionProperty.const !== contract.version) {
    violations.push({ message: "schema_version_const_mismatch", file: contract.file, field: "properties.version.const" });
  }

  for (const field of contract.requiredFields) {
    if (!required.includes(field)) {
      violations.push({ message: "minimum_required_field_missing_from_required", file: contract.file, field });
    }
    if (!(field in properties)) {
      violations.push({ message: "minimum_required_field_missing_from_properties", file: contract.file, field });
    }
  }

  for (const field of contract.optionalFields) {
    if (!(field in properties)) {
      violations.push({ message: "minimum_optional_field_missing_from_properties", file: contract.file, field });
    }
    if (required.includes(field)) {
      violations.push({ message: "optional_field_marked_required", file: contract.file, field });
    }
  }

  checkAdditionalProperties(schema, contract.file, "$", violations);
  checkProhibitedProperties(schema, contract.file, "$", violations);

  if (contract.baselineFile) {
    const baseline = readJson(contract.baselineFile, violations);
    if (baseline) {
      if (baseline.version !== contract.version) {
        violations.push({ message: "baseline_version_mismatch", file: contract.baselineFile, field: "version" });
      }
      if (baseline.schema !== contract.file) {
        violations.push({ message: "baseline_schema_path_mismatch", file: contract.baselineFile, field: "schema" });
      }
    }
  }

  if (contract.exampleFile) {
    const example = readJson(contract.exampleFile, violations);
    if (example) {
      if (example.version !== contract.version) {
        violations.push({ message: "example_version_mismatch", file: contract.exampleFile, field: "version" });
      }
      for (const field of contract.requiredFields) {
        if (!(field in example)) {
          violations.push({ message: "example_required_field_missing", file: contract.exampleFile, field });
        }
      }
      for (const field of Object.keys(example)) {
        if (!(field in properties)) {
          violations.push({ message: "example_additional_property_not_allowed", file: contract.exampleFile, field });
        }
      }
    }
  }
}

const reasonCatalog = readJson(VERTICAL_REASON_CODE_CATALOG, violations);
const handoffV2 = readJson("contracts/chat/chat.vertical_handoff.v2.schema.json", violations);
if (reasonCatalog && handoffV2) {
  if (reasonCatalog.version !== "vertical.reason_codes.v1") {
    violations.push({ message: "reason_catalog_version_mismatch", file: VERTICAL_REASON_CODE_CATALOG, field: "version" });
  }

  const catalogCodes = asStringArray(reasonCatalog.codes);
  const handoffProperties = isObject(handoffV2.properties) ? handoffV2.properties : {};
  const reasonCodeProperty = isObject(handoffProperties.reasonCode) ? handoffProperties.reasonCode : {};
  const schemaCodes = asStringArray(reasonCodeProperty.enum);
  if (catalogCodes.length === 0 || !sameStringSet(catalogCodes, schemaCodes)) {
    violations.push({
      message: "handoff_reason_codes_must_match_catalog",
      file: "contracts/chat/chat.vertical_handoff.v2.schema.json",
      field: "properties.reasonCode.enum",
    });
  }
}

if (violations.length > 0) {
  fail(violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      contracts: contracts.map((contract) => ({
        file: contract.file,
        version: contract.version,
        requiredFields: contract.requiredFields,
        optionalFields: contract.optionalFields,
        baselineFile: contract.baselineFile,
        exampleFile: contract.exampleFile,
      })),
      reasonCodeCatalog: VERTICAL_REASON_CODE_CATALOG,
    },
    null,
    2,
  ),
);
