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

  assert.deepEqual(violations.map((entry) => entry.code), [
    "ACTIVE_REASON_CODE_BOOTSTRAP_FORBIDDEN",
  ]);
});

test("rejects an unknown reasonCode absent from the canonical source", () => {
  const violations = validateReasonCodeReferences(
    ["NOT_IN_THE_CANON"],
    REASON_CODE_CATALOG,
    "fixture.ts",
  );
  assert.deepEqual(violations.map((entry) => entry.code), ["UNKNOWN_REASON_CODE"]);
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
  assert.deepEqual(violations.map((entry) => entry.code), [
    "CANONICAL_REASON_CODE_SOURCE_MISSING",
  ]);
});

test("fails when the documented catalog differs from the canonical source", () => {
  const documentation = documentedCatalog(REASON_CODE_CATALOG.slice(1));
  const violations = validateDocumentedReasonCodeCatalog(
    documentation,
    REASON_CODE_CATALOG,
  );
  assert.equal(
    violations.some((entry) => entry.code === "DOCUMENTED_REASON_CODE_CATALOG_DRIFT"),
    true,
  );
});
