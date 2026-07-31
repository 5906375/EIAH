import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRepository,
  buildGateResult,
  type RepositoryView,
} from "../../../../scripts/checkOrphanTests";

function fixture(files: Record<string, string>): RepositoryView {
  const names = Object.keys(files).sort();
  return {
    label: "fixture",
    listFiles: () => names,
    listTestFiles: () => names.filter((file) => file.endsWith(".test.ts")),
    readFile: (file) => files[file],
  };
}

const baseline = {
  schemaVersion: "orphan-tests-baseline.v1" as const,
  initialOrphanCount: 2,
  frozenAt: "2026-07-31",
  frozenCommit: "a".repeat(40),
};

test("execution-aware gate separates blocking, disabled and uncalled references", () => {
  const view = fixture({
    "package.json": JSON.stringify({
      scripts: {
        "test:active": "pnpm --filter @eiah/api exec tsx --test src/live.test.ts",
        "test:uncalled": "node --import tsx --test tests/mentioned.test.ts",
      },
    }),
    "apps/api/package.json": JSON.stringify({ name: "@eiah/api" }),
    ".github/workflows/ci.yml": [
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: active suite",
      "        run: pnpm test:active",
      "      - name: informative suite",
      "        continue-on-error: true",
      "        run: node --import tsx --test tests/informative.test.ts",
    ].join("\n"),
    ".github/workflows/lint.yml": [
      "env:",
      "  RUN_DISABLED: '0'",
      "jobs:",
      "  lint:",
      "    steps:",
      "      - name: disabled suite",
      "        run: |",
      "          if [ \"${RUN_DISABLED}\" != \"1\" ]; then",
      "            exit 0",
      "          fi",
      "          find packages/db/src -name '*.test.ts' -type f",
    ].join("\n"),
    "apps/api/src/live.test.ts": "",
    "tests/informative.test.ts": "",
    "tests/mentioned.test.ts": "",
    "packages/db/src/disabled.test.ts": "",
    "tests/unmentioned.test.ts": "",
  });

  const analysis = analyzeRepository(view);
  assert.deepEqual(analysis.executedBlockingFiles, ["apps/api/src/live.test.ts"]);
  assert.deepEqual(analysis.executedInformationalFiles, [
    "packages/db/src/disabled.test.ts",
    "tests/informative.test.ts",
  ]);
  assert.deepEqual(analysis.referencedNotExecutedFiles, ["tests/mentioned.test.ts"]);
  assert.deepEqual(analysis.notReferencedFiles, ["tests/unmentioned.test.ts"]);
});

test("tests added to a CI-invoked static suite become blocking", () => {
  const view = fixture({
    "package.json": JSON.stringify({
      scripts: {
        "test:ci-unit-suite": [
          "node --import tsx --test",
          "apps/api/src/services/securityRelaxationFlags.test.ts",
          "apps/api/src/tests/auth-default-polarity.test.ts",
        ].join(" "),
      },
    }),
    ".github/workflows/ci.yml": [
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: static unit suite",
      "        run: pnpm test:ci-unit-suite",
    ].join("\n"),
    "apps/api/src/services/securityRelaxationFlags.test.ts": "",
    "apps/api/src/tests/auth-default-polarity.test.ts": "",
  });

  assert.deepEqual(analyzeRepository(view).executedBlockingFiles, [
    "apps/api/src/services/securityRelaxationFlags.test.ts",
    "apps/api/src/tests/auth-default-polarity.test.ts",
  ]);
});

test("new orphan blocks even when absolute debt does not increase", () => {
  const previous = analyzeRepository(fixture({
    "package.json": "{}",
    "tests/old.test.ts": "",
  }));
  const current = analyzeRepository(fixture({
    "package.json": "{}",
    "tests/new.test.ts": "",
  }));
  const result = buildGateResult(current, previous, baseline);
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockingOrphans, ["tests/new.test.ts"]);
});

test("a lower prior debt becomes the decreasing ceiling", () => {
  const previous = analyzeRepository(fixture({
    "package.json": "{}",
    "tests/one.test.ts": "",
  }));
  const current = analyzeRepository(fixture({
    "package.json": "{}",
    "tests/one.test.ts": "",
    "tests/two.test.ts": "",
  }));
  const result = buildGateResult(current, previous, baseline);
  assert.equal(result.comparison.decreasingCeiling, 1);
  assert.equal(result.ok, false);
});
