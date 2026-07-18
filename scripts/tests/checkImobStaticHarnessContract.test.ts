import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  documentationPaths,
  requiredReasonCodes,
  requiredReferences,
  runImobStaticHarnessContractCheck,
  zeroMetrics,
} from "../checkImobStaticHarnessContract.ts";

type TempRepoOptions = {
  omitReference?: string;
  omitMetric?: string;
  omitReasonCode?: string;
  omitBoundary?: string;
  guardrailAppend?: string;
};

const actualRoot = process.cwd();
const fixturePath = "apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json";
const handoffContractPath = "contracts/chat/chat.vertical_handoff.v1.schema.json";
const hitlContractPath = "contracts/chat/hitl.gate_state.v1.schema.json";
const proofContractPath = "contracts/chat/proof_receipt_bundle_state.v1.schema.json";

function mkdirFor(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readActual(relativePath: string) {
  return fs.readFileSync(path.resolve(actualRoot, relativePath), "utf8");
}

function writeFile(root: string, relativePath: string, text: string) {
  const target = path.join(root, relativePath);
  mkdirFor(target);
  fs.writeFileSync(target, text);
}

function buildDocText(options: TempRepoOptions = {}) {
  const metrics = zeroMetrics
    .filter((metric) => metric !== options.omitMetric)
    .map((metric) => `| \`${metric}\` | \`0\` |`)
    .join("\n");
  const reasonCodes = requiredReasonCodes
    .filter((reasonCode) => reasonCode !== options.omitReasonCode)
    .map((reasonCode) => `- \`${reasonCode}\``)
    .join("\n");
  const boundaries = [
    "sem provider",
    "sem DB",
    "sem ledger/audit",
    "sem receipt; sem bundle; sem proof",
    "sem frontend preview",
    "sem regra de negocio no `ChatAgentLauncher`",
    "sem autorizacao produtiva",
  ]
    .filter((boundary) => boundary !== options.omitBoundary)
    .map((boundary) => `- ${boundary}`)
    .join("\n");

  return [
    "# Synthetic IMOB static harness contract source",
    "Status: proposta/parcial evidenciada localmente; aguardando PR/CI remoto.",
    "Este documento nao autoriza producao e nao declara Receipt Canon fechado nem IMOB operacionalmente fechado.",
    "## Metricas",
    metrics,
    "## ReasonCodes",
    reasonCodes,
    "## Boundaries",
    boundaries,
  ].join("\n");
}

function createTempRepo(options: TempRepoOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imob-static-check-"));
  const docText = buildDocText(options);

  for (const relativePath of requiredReferences) {
    if (relativePath === options.omitReference) continue;

    if (relativePath === fixturePath || relativePath === handoffContractPath || relativePath === hitlContractPath || relativePath === proofContractPath) {
      writeFile(root, relativePath, readActual(relativePath));
      continue;
    }

    const text =
      documentationPaths.includes(relativePath as (typeof documentationPaths)[number]) ||
      relativePath === "AGENTS.md" ||
      relativePath === "docs/architecture/agent-chat-runtime.md"
        ? docText
        : "";
    writeFile(root, relativePath, text);
  }

  if (options.guardrailAppend) {
    const guardrailPath = "docs/proposals/imob-pilot-6a-static-harness-contract-check.md";
    fs.appendFileSync(path.join(root, guardrailPath), options.guardrailAppend);
  }

  writeFile(root, "package.json", JSON.stringify({ scripts: {} }, null, 2));
  writeFile(root, ".github/workflows/ci.yml", "name: synthetic-ci\n");

  return root;
}

function runTempRepo(options: TempRepoOptions = {}) {
  return runImobStaticHarnessContractCheck({ repositoryRoot: createTempRepo(options) });
}

function reasonCodes(report: ReturnType<typeof runTempRepo>) {
  return report.violations.map((violation) => violation.reasonCode);
}

test("passes when references, metrics, reasonCodes, boundaries and guardrail language are present", () => {
  const report = runTempRepo();
  assert.equal(report.ok, true);
  assert.equal(report.decision, "GO_FOR_NEXT_REVIEW_ONLY");
  assert.deepEqual(report.violations, []);
  assert.equal(report.providerExternalCall, 0);
  assert.equal(report.mutationExternalSideEffect, 0);
  assert.equal(report.dbWrite, 0);
  assert.equal(report.ledgerWrite, 0);
  assert.equal(report.auditWrite, 0);
  assert.equal(report.receiptGenerated, 0);
  assert.equal(report.bundleGenerated, 0);
  assert.equal(report.proofGenerated, 0);
});

test("fails closed when a required reference is missing", () => {
  const report = runTempRepo({ omitReference: "docs/proposals/imob-pilot-6d-static-check-implementation-plan.md" });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_REFERENCE_MISSING"));
});

test("fails closed when a required zero metric is missing", () => {
  const report = runTempRepo({ omitMetric: "sideEffects" });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_REQUIRED_METRIC_MISSING"));
});

test("fails closed when a required reasonCode is missing", () => {
  const report = runTempRepo({ omitReasonCode: "IMOB_HARNESS_GO_FOR_NEXT_REVIEW_ONLY" });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_REASON_CODE_MISSING"));
});

test("fails closed when a required textual boundary is missing", () => {
  const report = runTempRepo({ omitBoundary: "sem provider" });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_BOUNDARY_DECLARATION_MISSING"));
});

test("fails closed when productive authorization language is present", () => {
  const spacing = `\n${"padding ".repeat(40)}`;
  const report = runTempRepo({ guardrailAppend: `${spacing}Este documento autoriza producao.\n` });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_PRODUCTIVE_LANGUAGE_FORBIDDEN"));
});

test("fails closed when improper operational closure is declared", () => {
  const spacing = `\n${"padding ".repeat(40)}`;
  const report = runTempRepo({ guardrailAppend: `${spacing}Receipt Canon fechado.\n` });
  assert.equal(report.ok, false);
  assert.equal(report.decision, "NO_GO");
  assert.ok(reasonCodes(report).includes("IMOB_STATIC_CHECK_OPERATIONAL_CLOSURE_FORBIDDEN"));
});
