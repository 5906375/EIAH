import assert from "node:assert/strict";
import test from "node:test";

import {
  type CircularityException,
  type CircularityExceptionContract,
  type RepositoryAnalysisInput,
  type UndeterminedCircularityException,
  analyzeStructuralCircularity,
} from "../checkStructuralCircularity.js";

const WORKFLOW = ".github/workflows/ci.yml";
const GENERATOR = "generate:fixture";
const CHECK = "check:fixture";
const JOB_ID = "fixture_job";

function clock(date = "2026-08-04") {
  return { now: () => new Date(`${date}T00:00:00.000Z`) };
}

function exception(overrides: Partial<CircularityException> = {}): CircularityException {
  return {
    jobId: JOB_ID,
    generatorTarget: GENERATOR,
    checkTarget: CHECK,
    reason: "replace fixture declarations with independent capture",
    grantedAt: "2026-08-04",
    expiresAt: "2026-11-02",
    restoreFront: "FIXTURE-RESTORE-FRONT",
    approvedBy: "fixture-owner",
    ...overrides,
  };
}

function contract(exceptions: readonly CircularityException[] = []): CircularityExceptionContract {
  return { schemaVersion: "circularity-exceptions.v1", exceptions };
}

function workflow(runLines = [`pnpm ${GENERATOR}`, `pnpm ${CHECK}`]): string {
  return [
    "name: Fixture",
    "jobs:",
    `  ${JOB_ID}:`,
    "    name: FixtureJob",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Analyze",
    "        run: |",
    ...runLines.map((line) => `          ${line}`),
  ].join("\n");
}

function input(options: {
  contract?: CircularityExceptionContract;
  workflow?: string;
  generatorSource?: string;
  packageScripts?: Record<string, string>;
  date?: string;
} = {}): RepositoryAnalysisInput {
  return {
    packageScripts: options.packageScripts ?? {
      [GENERATOR]: "node --import tsx scripts/generateFixture.ts",
      [CHECK]: "node --import tsx scripts/checkFixture.ts",
    },
    workflowSources: { [WORKFLOW]: options.workflow ?? workflow() },
    scriptSources: {
      "scripts/generateFixture.ts": options.generatorSource ?? [
        'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
        'fs.writeFileSync(path.join(EVIDENCE_DIR, `fixture-${TODAY}.json`), "{}");',
      ].join("\n"),
      "scripts/checkFixture.ts": [
        'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
        'findLatestEvidenceFile(/^fixture-\\d{4}-\\d{2}-\\d{2}\\.json$/);',
      ].join("\n"),
    },
    contract: options.contract ?? contract(),
    clock: clock(options.date),
  };
}

test("a circular pair without an exception fails", () => {
  const result = analyzeStructuralCircularity(input());

  assert.equal(result.ok, false);
  assert.equal(result.pairsDetected.length, 1);
  assert.equal(result.pairsDetected[0]?.state, "undeclared");
  assert.equal(result.violations[0]?.code, "STRUCTURAL_CIRCULARITY_UNDECLARED");
});

test("a circular pair with a valid nominal exception passes", () => {
  const result = analyzeStructuralCircularity(input({ contract: contract([exception()]) }));

  assert.equal(result.ok, true);
  assert.equal(result.pairsDetected[0]?.state, "excepted");
  assert.equal(result.pairsExcepted[0]?.code, "STRUCTURAL_CIRCULARITY_EXCEPTION_ACTIVE");
  assert.equal(result.pairsExcepted[0]?.approvedBy, "fixture-owner");
});

test("a circular pair with an expired exception fails", () => {
  const result = analyzeStructuralCircularity(input({
    contract: contract([exception({ grantedAt: "2026-08-01", expiresAt: "2026-08-03" })]),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.pairsDetected[0]?.state, "expired");
  assert.equal(result.violations[0]?.code, "STRUCTURAL_CIRCULARITY_EXCEPTION_EXPIRED");
});

test("an exception for a nonexistent pair fails as stale", () => {
  const result = analyzeStructuralCircularity(input({
    contract: contract([exception()]),
    workflow: workflow([`pnpm ${CHECK}`]),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.pairsDetected.length, 0);
  assert.equal(result.violations[0]?.code, "STRUCTURAL_CIRCULARITY_EXCEPTION_STALE");
});

test("a dynamic governed write path is reported as undetermined", () => {
  const result = analyzeStructuralCircularity(input({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "fs.writeFileSync(path.join(EVIDENCE_DIR, process.env.OUTPUT_FILE), '{}');",
    ].join("\n"),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.undetermined.length, 1);
  assert.equal(result.undetermined[0]?.operation, "write");
  assert.equal(result.violations[0]?.code, "STRUCTURAL_CIRCULARITY_UNDETERMINED");
});

test("targets chained by && in one run command preserve order and are detected", () => {
  const result = analyzeStructuralCircularity(input({
    contract: contract([exception()]),
    workflow: workflow([`pnpm ${GENERATOR} && pnpm ${CHECK}`]),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.pairsDetected.length, 1);
  assert.equal(result.pairsDetected[0]?.generatorOrder, 0);
  assert.equal(result.pairsDetected[0]?.checkOrder, 1);
});

test("recursive package target expansion detects and reports a target cycle", () => {
  const result = analyzeStructuralCircularity(input({
    packageScripts: {
      ...input().packageScripts,
      "check:cycle-a": "pnpm check:cycle-b",
      "check:cycle-b": "pnpm check:cycle-a",
    },
    workflow: workflow(["pnpm check:cycle-a"]),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.undetermined[0]?.operation, "target-expansion");
  assert.match(result.undetermined[0]?.reason ?? "", /cycle detected/);
});

// Fixtures below reproduce the shape found in generateP3EconomyEvidence.ts:
// a `for (const { file, payload } of evidences)` loop over a const array
// literal, with `file` a template literal, joined via an intermediate
// `const filePath = path.join(EVIDENCE_DIR, file);` before the write call.
function customInput(options: {
  generatorSource: string;
  checkSource: string;
  contract?: CircularityExceptionContract;
}): RepositoryAnalysisInput {
  const generatorTarget = "generate:custom-fixture";
  const checkTarget = "check:custom-fixture";
  return {
    packageScripts: {
      [generatorTarget]: "node --import tsx scripts/generateCustomFixture.ts",
      [checkTarget]: "node --import tsx scripts/checkCustomFixture.ts",
    },
    workflowSources: { [WORKFLOW]: workflow([`pnpm ${generatorTarget}`, `pnpm ${checkTarget}`]) },
    scriptSources: {
      "scripts/generateCustomFixture.ts": options.generatorSource,
      "scripts/checkCustomFixture.ts": options.checkSource,
    },
    contract: options.contract ?? contract(),
    clock: clock(),
  };
}

test("a destination reached through path.join(CONST, var) with var bound by for...of over a const array literal of templates is resolved, not undetermined", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "const evidences = [",
      "  { file: `alpha-report-${TODAY}.json`, payload: {} },",
      "  { file: `beta-report-${TODAY}.json`, payload: {} },",
      "];",
      "for (const { file, payload } of evidences) {",
      "  const filePath = path.join(EVIDENCE_DIR, file);",
      "  fs.writeFileSync(filePath, JSON.stringify(payload));",
      "}",
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceFile(/^alpha-report-\\d{4}-\\d{2}-\\d{2}\\.json$/);",
      "findLatestEvidenceFile(/^beta-report-\\d{4}-\\d{2}-\\d{2}\\.json$/);",
    ].join("\n"),
  }));

  assert.equal(result.undetermined.length, 0);
  assert.equal(result.pairsDetected.length, 1);
  assert.equal(result.pairsDetected[0]?.artifacts.length, 2);
  assert.equal(result.pairsDetected[0]?.state, "undeclared");
});

test("a template interpolation resolved through the for...of array literal matches an equivalent glob pattern read by the check", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "const evidences = [",
      "  { file: `policy-report-${TODAY}.json`, payload: {} },",
      "];",
      "for (const { file, payload } of evidences) {",
      "  const filePath = path.join(EVIDENCE_DIR, file);",
      "  fs.writeFileSync(filePath, JSON.stringify(payload));",
      "}",
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      'findLatestEvidenceByPattern("policy-report-*.json");',
    ].join("\n"),
  }));

  assert.equal(result.undetermined.length, 0);
  assert.equal(result.pairsDetected.length, 1);
  assert.equal(result.pairsDetected[0]?.artifacts[0], "ops/evidence/latest/policy-report-YYYY-MM-DD.json");
});

test("distinct prefixes resolved through the for...of array literal do not cross-match the check's pattern", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "const evidences = [",
      "  { file: `alpha-report-${TODAY}.json`, payload: {} },",
      "];",
      "for (const { file, payload } of evidences) {",
      "  const filePath = path.join(EVIDENCE_DIR, file);",
      "  fs.writeFileSync(filePath, JSON.stringify(payload));",
      "}",
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceFile(/^beta-report-\\d{4}-\\d{2}-\\d{2}\\.json$/);",
    ].join("\n"),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.pairsDetected.length, 0);
  assert.equal(result.undetermined.length, 0);
});

test("a write destination reached via path.join(CONST, var) whose var is bound by for...of over a non-literal source stays undetermined", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "for (const file of computeReportFiles()) {",
      '  const filePath = path.join(EVIDENCE_DIR, file);',
      '  fs.writeFileSync(filePath, "{}");',
      "}",
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceFile(/^report-\\d{4}-\\d{2}-\\d{2}\\.json$/);",
    ].join("\n"),
  }));

  assert.equal(result.pairsDetected.length, 0);
  assert.equal(result.undetermined.length, 1);
  assert.equal(result.undetermined[0]?.operation, "write");
});

// Fixtures below reproduce the auto-match defect found in F14c: the scanner
// matched `function findLatestEvidenceFile(pattern: RegExp)` (a declaration)
// as if it were a call, because the suppression heuristic compared the
// parameter name without stripping the type annotation.
function undeterminedException(overrides: Partial<UndeterminedCircularityException> = {}): UndeterminedCircularityException {
  return {
    target: "check:custom-fixture",
    source: "scripts/checkCustomFixture.ts",
    operation: "read",
    expression: "item.dynamicPattern as string",
    reason: "dynamicPattern comes from runtime config, not a literal array",
    grantedAt: "2026-08-04",
    expiresAt: "2026-11-02",
    restoreFront: "FIXTURE-RESTORE-FRONT",
    approvedBy: "fixture-owner",
    ...overrides,
  };
}

test("a function declaration is not counted as a call", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
    ].join("\n"),
    checkSource: [
      "function findLatestEvidenceFile(pattern: RegExp): string {",
      '  return "stub";',
      "}",
    ].join("\n"),
  }));

  assert.equal(result.undetermined.length, 0);
  assert.equal(result.pairsDetected.length, 0);
});

test("a real call with a type-annotated argument is still captured alongside its declaration", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "fs.writeFileSync(path.join(EVIDENCE_DIR, `report-${TODAY}.json`), \"{}\");",
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "function findLatestEvidenceFile(pattern: RegExp): string {",
      '  return "stub";',
      "}",
      "findLatestEvidenceFile(/^report-\\d{4}-\\d{2}-\\d{2}\\.json$/);",
    ].join("\n"),
  }));

  assert.equal(result.undetermined.length, 0);
  assert.equal(result.pairsDetected.length, 1);
  assert.equal(result.pairsDetected[0]?.state, "undeclared");
});

test("a genuinely dynamic read path stays undetermined", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceByPattern(item.dynamicPattern as string);",
    ].join("\n"),
  }));

  assert.equal(result.undetermined.length, 1);
  assert.equal(result.undetermined[0]?.expression, "item.dynamicPattern as string");
  assert.equal(result.undeterminedExcepted.length, 0);
});

test("ok semantics: an undetermined path without a declared exception fails ok", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceByPattern(item.dynamicPattern as string);",
    ].join("\n"),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.some((violation) => violation.code === "STRUCTURAL_CIRCULARITY_UNDETERMINED"), true);
});

test("ok semantics: an undetermined path with an active declared exception does not fail ok, and is listed as excepted without being removed from undetermined", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceByPattern(item.dynamicPattern as string);",
    ].join("\n"),
    contract: contract([undeterminedException()]),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.undetermined.length, 1);
  assert.equal(result.undeterminedExcepted.length, 1);
  assert.equal(result.undeterminedExcepted[0]?.code, "STRUCTURAL_CIRCULARITY_UNDETERMINED_EXCEPTION_ACTIVE");
  assert.equal(result.violations.length, 0);
});

test("ok semantics: an expired declared exception for an undetermined path still fails ok", () => {
  const result = analyzeStructuralCircularity(customInput({
    generatorSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
    ].join("\n"),
    checkSource: [
      'const EVIDENCE_DIR = path.resolve("ops/evidence/latest");',
      "findLatestEvidenceByPattern(item.dynamicPattern as string);",
    ].join("\n"),
    contract: contract([undeterminedException({ grantedAt: "2026-08-01", expiresAt: "2026-08-03" })]),
  }));

  assert.equal(result.ok, false);
  assert.equal(result.undetermined.length, 1);
  assert.equal(result.undeterminedExcepted.length, 0);
  assert.equal(result.violations[0]?.code, "STRUCTURAL_CIRCULARITY_UNDETERMINED_EXCEPTION_EXPIRED");
});
