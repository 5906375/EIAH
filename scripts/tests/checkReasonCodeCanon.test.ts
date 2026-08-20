import assert from "node:assert/strict";
import test from "node:test";

import {
  REASON_CODE_CATALOG,
  type ReasonCodeDefinition,
} from "../../packages/core/src/reasons/reasonCatalog.js";
import {
  CANONICAL_REASON_CODE_SOURCE,
  validateCanonicalSourcePointer,
  validateDocumentedReasonCodeCatalog,
  validateReasonCodeCatalog,
  validateReasonCodeReferences,
} from "../checkReasonCodeCanon.js";

function activeFixture(): ReasonCodeDefinition {
  return {
    code: "ACTIVE_FIXTURE",
    domain: "imob",
    severity: "warning",
    category: "validation",
    description: "Known active fixture",
    status: "active",
    owner: "fixture owner",
    approver: {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    },
    evidenceRef: "fixture://authenticated-approval",
  };
}

function documentedCatalog(catalog: readonly ReasonCodeDefinition[]): string {
  const rows = catalog
    .map((definition) => `| \`${definition.code}\` | ${definition.status} |`)
    .join("\n");
  return [
    `Canonical source: \`${CANONICAL_REASON_CODE_SOURCE}\``,
    "<!-- reason-code-canon:start -->",
    "| Code | Status |",
    "| --- | --- |",
    rows,
    "<!-- reason-code-canon:end -->",
  ].join("\n");
}

test("accepts an active known code with owner, approver and evidenceRef", () => {
  assert.deepEqual(validateReasonCodeCatalog([activeFixture()]), []);
});

test("keeps MCP policy additions proposed and ratified DB input active", () => {
  const definitions = new Map(
    REASON_CODE_CATALOG.map((definition) => [definition.code, definition]),
  );
  const activeCodes = [
    "MCP_TOOL_CONTRACT_MISSING",
    "DB_SCOPE_MISSING",
    "DB_MODEL_NOT_ALLOWLISTED",
    "DB_INPUT_INVALID",
  ] as const;

  for (const code of activeCodes) {
    const definition = definitions.get(code);
    assert.equal(definition?.status, "active");
    assert.deepEqual(definition?.approver, {
      kind: "human",
      actor: "Carlos Alberto Merlo",
    });
  }

  assert.equal(definitions.get("DB_SCOPE_VIOLATION")?.status, "proposed");
  assert.equal(definitions.get("POLICY_NOT_FOUND")?.status, "proposed");
  const proposedCodes = [
    "MCP_POLICY_REFERENCE_MISSING",
    "MCP_POLICY_TARGET_NOT_FOUND",
    "MCP_POLICY_STORE_UNAVAILABLE",
    "MCP_POLICY_DENIED",
    "MCP_POLICY_CONTEXT_MISSING",
    "MCP_POLICY_CONTEXT_VIOLATION",
  ] as const;
  for (const code of proposedCodes) {
    assert.equal(definitions.get(code)?.status, "proposed");
    assert.equal(definitions.get(code)?.approver, undefined);
  }

  assert.equal(definitions.has("MCP_POLICY_NOT_RESOLVED"), false);
  assert.equal(definitions.has("MCP_POLICY_CONTEXT_INVALID"), false);

  const dbInputInvalid = definitions.get("DB_INPUT_INVALID");
  assert.equal(
    dbInputInvalid?.owner,
    "Governance Layer / MCP DB Authorization",
  );
  assert.equal(dbInputInvalid?.introducedBy, "RC-DB-1A");
  assert.equal(
    dbInputInvalid?.evidenceRef,
    "docs/ops/reason-codes-catalog.md#ratificacao-rc-db-1a-2026-07-28",
  );
});

test("keeps the ratified APE release containment code active", () => {
  const definition = REASON_CODE_CATALOG.find(
    (entry) => entry.code === "APE_TELEMETRY_NOT_AVAILABLE",
  );

  assert.equal(definition?.status, "active");
  assert.equal(definition?.domain, "release");
  assert.equal(definition?.owner, "Release governance / APE telemetry");
  assert.deepEqual(definition?.approver, {
    kind: "human",
    actor: "Carlos Alberto Merlo",
  });
  assert.equal(
    definition?.evidenceRef,
    "docs/ops/ape-audit-telemetry-decision.md#12-ratificação",
  );
});

test("rejects active without owner, approver or evidenceRef", () => {
  const fixture = {
    ...activeFixture(),
    owner: undefined,
    approver: undefined,
    evidenceRef: undefined,
  };
  const codes = validateReasonCodeCatalog([fixture]).map((entry) => entry.code);

  assert.deepEqual(codes, [
    "ACTIVE_REASON_CODE_OWNER_MISSING",
    "ACTIVE_REASON_CODE_APPROVER_MISSING",
    "ACTIVE_REASON_CODE_EVIDENCE_MISSING",
  ]);
});

test("rejects self-declared bootstrap outside the fenced pre-RC-0 baseline", () => {
  const fixture: ReasonCodeDefinition = {
    ...activeFixture(),
    approver: {
      kind: "bootstrap-validator",
      actor: "self-declared-validator",
    },
  };
  const violations = validateReasonCodeCatalog([fixture]);

  assert.deepEqual(
    violations.map((entry) => entry.code),
    ["ACTIVE_REASON_CODE_BOOTSTRAP_FORBIDDEN"],
  );
});

test("rejects an unknown reasonCode absent from the canonical source", () => {
  const violations = validateReasonCodeReferences(
    ["NOT_IN_THE_CANON"],
    REASON_CODE_CATALOG,
    "fixture.ts",
  );
  assert.deepEqual(
    violations.map((entry) => entry.code),
    ["UNKNOWN_REASON_CODE"],
  );
});

test("accepts proposed as catalogued but never as active or ratified", () => {
  const proposed: ReasonCodeDefinition = {
    code: "PROPOSED_FIXTURE",
    domain: "mcp",
    severity: "critical",
    category: "authorization",
    description: "Proposed fixture",
    status: "proposed",
  };

  assert.deepEqual(validateReasonCodeCatalog([proposed]), []);
  assert.deepEqual(
    validateReasonCodeReferences(
      ["PROPOSED_FIXTURE"],
      [proposed],
      "fixture.ts",
      true,
    ).map((entry) => entry.code),
    ["REASON_CODE_NOT_ACTIVE"],
  );
});

test("fails when documentation points to a canonical source that does not exist", () => {
  const violations = validateCanonicalSourcePointer(
    `Canonical source: \`${CANONICAL_REASON_CODE_SOURCE}\``,
    false,
  );
  assert.deepEqual(
    violations.map((entry) => entry.code),
    ["CANONICAL_REASON_CODE_SOURCE_MISSING"],
  );
});

test("fails when the documented catalog differs from the canonical source", () => {
  const documentation = documentedCatalog(REASON_CODE_CATALOG.slice(1));
  const violations = validateDocumentedReasonCodeCatalog(
    documentation,
    REASON_CODE_CATALOG,
  );
  assert.equal(
    violations.some(
      (entry) => entry.code === "DOCUMENTED_REASON_CODE_CATALOG_DRIFT",
    ),
    true,
  );
});

