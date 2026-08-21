import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * PR B (docs/ops/ape-audit-telemetry-decision.md, Seções 5.1 e 10, passo 2):
 * garante que P3EconomyHardening, W4NonRegression e P4TrackPRollout permaneçam
 * gates estruturais reais e não regridam para telemetria declarativa.
 *
 * Verificação determinística por leitura direta de arquivo + string/regex —
 * nenhuma dependência de parser YAML foi adicionada.
 */

const root = process.cwd();

function readActual(relativePath: string): string {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

const CHECKER_FILES = {
  p3: "scripts/checkP3EconomyHardening.ts",
  w4: "scripts/checkW4NonRegression.ts",
  p4: "scripts/checkP4TrackPRollout.ts",
} as const;

const FORBIDDEN_TOKENS = [
  "ops/evidence",
  "ape-weekly-cycle",
  "realestate-pilot-rollout",
  "hardMetricsGo",
  "nonRegressionGo",
];

for (const [key, relativePath] of Object.entries(CHECKER_FILES)) {
  test(`${key}: checker no longer reads declarative telemetry evidence`, () => {
    const source = readActual(relativePath);
    for (const token of FORBIDDEN_TOKENS) {
      assert.equal(
        source.includes(token),
        false,
        `${relativePath} must not reference "${token}" (declarative telemetry consumption)`
      );
    }
  });

  // Asserção separada e obrigatória mesmo já existindo busca por "ops/evidence" acima:
  // w4-non-regression-kpis.json era o arquivo central consumido pelo checkW4NonRegression
  // original e precisa de uma verificação própria, independente do padrão genérico.
  test(`${key}: checker no longer reads w4-non-regression-kpis.json`, () => {
    const source = readActual(relativePath);
    assert.equal(
      source.includes("w4-non-regression-kpis.json"),
      false,
      `${relativePath} must not reference w4-non-regression-kpis.json`
    );
  });

  test(`${key}: checker declares named invariants and a non-zero invariantCount`, () => {
    const source = readActual(relativePath);
    assert.ok(source.includes("invariants"), `${relativePath} must declare an invariants collection`);
    assert.ok(source.includes("invariantCount"), `${relativePath} must report invariantCount`);
    assert.ok(
      source.includes("invariant_set_empty"),
      `${relativePath} must fail closed when the invariant set is empty ("verde não vazio")`
    );
  });

  test(`${key}: checker uses the canonical structural gate boundary`, () => {
    const source = readActual(relativePath);
    assert.ok(
      source.includes('from "./apeStructuralGateBoundary"'),
      `${relativePath} must import the boundary marker from ./apeStructuralGateBoundary`
    );
    assert.ok(source.includes("STRUCTURAL_GATE_BOUNDARY_SHA"));
    assert.ok(source.includes("STRUCTURAL_GATE_BOUNDARY_NOTE"));
  });

  test(`${key}: checker does not claim P2 scope`, () => {
    const source = readActual(relativePath);
    assert.equal(source.includes("P2HighGlobalCoverage"), false);
    assert.equal(source.includes("p2_high_global_coverage"), false);
  });
}

/**
 * Extrai o bloco de um job de nível superior em um workflow (indentação de 2
 * espaços) até a próxima chave de mesmo nível ou o fim do arquivo. Substitui
 * um parser YAML por localização determinística de texto, como já convenciona
 * este repositório (ver scripts/checkImobStaticHarnessContract.ts).
 */
function extractJobBlock(workflowText: string, jobName: string): string {
  const lines = workflowText.split("\n");
  const startPattern = new RegExp(`^  ${jobName}:\\s*$`);
  const siblingKeyPattern = /^  [A-Za-z_][A-Za-z0-9_]*:\s*$/;

  const startIndex = lines.findIndex((line) => startPattern.test(line));
  assert.ok(startIndex >= 0, `job "${jobName}" not found in workflow`);

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (siblingKeyPattern.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join("\n");
}

const ciWorkflowPath = ".github/workflows/ci.yml";
const apeWeeklyWorkflowPath = ".github/workflows/ape-weekly.yml";

test("ci.yml: p3_economy_hardening no longer generates or reads declarative P3 evidence", () => {
  const block = extractJobBlock(readActual(ciWorkflowPath), "p3_economy_hardening");
  assert.equal(block.includes("generate:p3-economy-evidence"), false);
  assert.equal(block.includes("check:p3-evidence-recency"), false);
  assert.ok(block.includes("check:p3-economy-hardening"), "job must still run the P3 checker");
});

test("ci.yml: p3_settlement_support_by_env remains untouched (declarative evidence intact, follow-up)", () => {
  const block = extractJobBlock(readActual(ciWorkflowPath), "p3_settlement_support_by_env");
  assert.ok(block.includes("generate:p3-economy-evidence"));
  assert.ok(block.includes("check:p3-evidence-recency"));
  assert.ok(block.includes("check:p3-settlement-support-by-env"));
});

test("ci.yml: p3_economy_hardening runs the real P3 test suite before the checker step", () => {
  const block = extractJobBlock(readActual(ciWorkflowPath), "p3_economy_hardening");
  const testStepIndex = block.indexOf("apps/api/src/tests/billing.economy.contract.test.ts");
  const checkStepIndex = block.indexOf("run: pnpm check:p3-economy-hardening");
  assert.ok(testStepIndex >= 0, "real P3 test suite step must be present");
  assert.ok(checkStepIndex >= 0, "checker step must be present");
  assert.ok(testStepIndex < checkStepIndex, "real tests must run before the structural checker");
});

test("ci.yml: w4_non_regression no longer depends on w4-non-regression-kpis.json and runs real tests first", () => {
  const block = extractJobBlock(readActual(ciWorkflowPath), "w4_non_regression");
  assert.equal(block.includes("w4-non-regression-kpis.json"), false);
  const testStepIndex = block.indexOf("marketplace.installations.activate.test.ts");
  const checkStepIndex = block.indexOf("run: pnpm check:w4-non-regression");
  assert.ok(testStepIndex >= 0);
  assert.ok(checkStepIndex >= 0);
  assert.ok(testStepIndex < checkStepIndex, "real tests must run before the structural checker");
});

test("ci.yml: p4_trackp_rollout exists as its own job, independent of the APE weekly cycle, running real tests before the checker", () => {
  const fullText = readActual(ciWorkflowPath);
  const block = extractJobBlock(fullText, "p4_trackp_rollout");
  assert.ok(block.includes("name: P4TrackPRollout"));
  assert.equal(block.includes("ape:cycle:weekly"), false);
  assert.equal(block.includes("hardMetricsGo"), false);
  const testStepIndex = block.indexOf("imob-pilot-rollout-state.test.ts");
  const checkStepIndex = block.indexOf("run: pnpm check:p4-trackp-rollout");
  assert.ok(testStepIndex >= 0);
  assert.ok(checkStepIndex >= 0);
  assert.ok(testStepIndex < checkStepIndex, "real tests must run before the structural checker");
});

test("ape-weekly.yml: P4 Track P rollout step was moved out, not duplicated", () => {
  const apeWeeklyText = readActual(apeWeeklyWorkflowPath);
  assert.equal(
    apeWeeklyText.includes("check:p4-trackp-rollout"),
    false,
    "ape-weekly.yml must no longer run check:p4-trackp-rollout — it now runs in ci.yml's p4_trackp_rollout job"
  );

  const ciText = readActual(ciWorkflowPath);
  const runOccurrences = ciText.split("run: pnpm check:p4-trackp-rollout").length - 1;
  assert.equal(
    runOccurrences,
    1,
    "check:p4-trackp-rollout must be executed by exactly one step across ci.yml (no ambiguous duplicate context)"
  );
});

test("job blocks touched by this PR do not reference P2 (P2 stays out of scope)", () => {
  const ciText = readActual(ciWorkflowPath);
  const touchedJobs = ["p3_economy_hardening", "p3_settlement_support_by_env", "w4_non_regression", "p4_trackp_rollout"];
  for (const jobName of touchedJobs) {
    const block = extractJobBlock(ciText, jobName);
    assert.equal(block.includes("P2HighGlobalCoverage"), false, `job ${jobName} must not reference P2`);
    assert.equal(block.includes("p2_high_global_coverage"), false, `job ${jobName} must not reference P2`);
  }

  const apeWeeklyText = readActual(apeWeeklyWorkflowPath);
  assert.equal(apeWeeklyText.includes("P2HighGlobalCoverage"), false);
  assert.equal(apeWeeklyText.includes("p2_high_global_coverage"), false);
});

test("package.json: the three converted checkers run on node --import tsx, not --experimental-strip-types", () => {
  const packageJson = JSON.parse(readActual("package.json")) as { scripts: Record<string, string> };
  for (const scriptName of [
    "check:p3-economy-hardening",
    "check:w4-non-regression",
    "check:p4-trackp-rollout",
  ]) {
    const command = packageJson.scripts[scriptName];
    assert.ok(command, `package.json must still declare ${scriptName}`);
    assert.ok(command.includes("node --import tsx"), `${scriptName} must run on node --import tsx`);
    assert.equal(
      command.includes("--experimental-strip-types"),
      false,
      `${scriptName} must no longer use --experimental-strip-types`
    );
  }
});
