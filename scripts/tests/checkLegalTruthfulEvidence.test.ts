import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LEGAL_TRUTHFUL_EVIDENCE_FORBIDDEN_LITERAL,
  scanLegalTruthfulEvidence,
} from "../checkLegalTruthfulEvidence";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("scanner reports a forbidden runtime literal with path and line", (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "legal-truthful-evidence-"),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const fixtureFile = path.join(fixtureRoot, "apps/demo/src/violator.ts");
  fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
  fs.writeFileSync(
    fixtureFile,
    `export const safe = true;\nexport const lie = "${LEGAL_TRUTHFUL_EVIDENCE_FORBIDDEN_LITERAL}";\n`,
  );

  const violations = scanLegalTruthfulEvidence(fixtureRoot);

  assert.deepEqual(violations, [
    {
      file: "apps/demo/src/violator.ts",
      line: 2,
      location: "apps/demo/src/violator.ts:2",
    },
  ]);
});

test("scanner ignores tests, fixtures and build outputs", (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "legal-truthful-evidence-exclusions-"),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const excludedFiles = [
    "apps/demo/src/__tests__/report.ts",
    "apps/demo/src/report.test.ts",
    "apps/demo/src/report.spec.tsx",
    "packages/demo/src/fixtures/report.ts",
    "packages/demo/src/dist/report.js",
    "packages/demo/src/build/report.js",
    "packages/demo/src/node_modules/report.js",
  ];
  for (const relativeFile of excludedFiles) {
    const file = path.join(fixtureRoot, relativeFile);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, LEGAL_TRUTHFUL_EVIDENCE_FORBIDDEN_LITERAL);
  }

  assert.deepEqual(scanLegalTruthfulEvidence(fixtureRoot), []);
});

test("scanner finds zero violations in the current repository", () => {
  assert.deepEqual(scanLegalTruthfulEvidence(repositoryRoot), []);
});
