import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  decideUnitSuite,
  isConditionalCoverageFile,
  observeUnitSuite,
  UNIT_SUITE_DECISION_VERSION,
  UNIT_SUITE_GATE_REASON_CODES,
  UNIT_SUITE_OBSERVATION_VERSION,
  type StageName,
  type UnitSuiteDecision,
  type UnitSuiteDecisionInput,
  type UnitSuiteObservation,
  type UnitSuiteObservationInput,
} from "../ci/unitSuiteDecision";
import { parseUnitSuiteBaseline } from "../ci/unitSuiteBaseline";
import { adaptNodeEvents, parseNdjson } from "../ci/unitSuiteNodeEvents";
import { evaluateUnitSuite, type RunObservation } from "../ci/unitSuiteVerdict";

const ROOT = "/repo";
const FILES = ["a/x.test.ts", "b/y.test.ts"];
const OK_RUN: RunObservation = { exitCode: 0, signal: null, timedOut: false };
const STAGES: StageName[] = ["inventory", "baseline", "integrity", "argv", "run", "events", "adapter", "verdict"];
const DECLARED: Record<string, string> = { "a/x.test.ts": "1".repeat(64), "b/y.test.ts": "2".repeat(64) };
const BASELINE_SHA = "b".repeat(64);
const PROVENANCE = {
  status: "declared",
  recordedAt: "2026-10-12",
  recordedCommit: "f093ba0000000000000000000000000000000000",
  method: "contagens declaradas manualmente; não verificadas",
  nodeVersion: "v22.17.1",
};

type Draft = Record<string, unknown>;

function result(ev: string, file: string, name: string, extra: Draft = {}): Draft {
  return {
    v: 1, kind: "event", ev, file: `${ROOT}/${file}`, name, nesting: 0, skip: false, todo: false,
    detailsType: ev === "test:start" ? null : "test", failureType: null, ...extra,
  };
}

function summary(file: string | null, tests: number): Draft {
  return {
    v: 1, kind: "event", ev: "test:summary", file: file === null ? null : `${ROOT}/${file}`, success: true,
    counts: { tests, passed: tests, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  };
}

/** Eventos de um arquivo íntegro com n testes e resumo coerente. */
function fileDrafts(file: string, n = 3): Draft[] {
  const drafts: Draft[] = [];
  for (let i = 1; i <= n; i += 1) drafts.push(result("test:start", file, `t${i}`), result("test:pass", file, `t${i}`));
  drafts.push(summary(file, n));
  return drafts;
}

function toText(drafts: Draft[], opts: { header?: boolean; end?: boolean; node?: string } = {}): string {
  const body = drafts.map((draft, index) => ({ ...draft, seq: index + 2 }));
  const records: Draft[] = [];
  if (opts.header !== false) records.push({ v: 1, kind: "header", seq: 1, node: opts.node ?? "v22.17.1" });
  records.push(...body);
  if (opts.end !== false) records.push({ v: 1, kind: "end", seq: body.length + 2, events: body.length });
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function allDrafts(files: string[] = FILES): Draft[] {
  return [...files.flatMap((file) => fileDrafts(file)), summary(null, files.length * 3)];
}

function manifest(files: string[] = FILES): string {
  return `# manifesto de teste\n${files.join("\n")}\n`;
}

type BaselineDoc = { schemaVersion: unknown; provenance: Record<string, unknown>; files: Array<Record<string, unknown>>; [extra: string]: unknown };

function baselineDoc(files: string[] = FILES): BaselineDoc {
  return {
    schemaVersion: "unit-tests-baseline.v1",
    provenance: { ...PROVENANCE },
    files: files.map((file) => ({ file, tests: 3, skipped: 0, todo: 0, sha256: DECLARED[file] ?? "3".repeat(64) })),
  };
}

function baselineText(mutate: (doc: BaselineDoc) => void = () => {}, files: string[] = FILES): string {
  const doc = baselineDoc(files);
  mutate(doc);
  return JSON.stringify(doc, null, 2);
}

function digests(overrides: { before?: unknown; after?: unknown } = {}) {
  return { before: { ...DECLARED }, after: { ...DECLARED }, ...overrides };
}

function input(overrides: Record<string, unknown> = {}): UnitSuiteDecisionInput {
  return {
    manifestText: manifest(),
    baselineText: baselineText(),
    baselineSha256: BASELINE_SHA,
    testFileDigests: digests(),
    argv: [...FILES],
    eventsText: toText(allDrafts()),
    run: OK_RUN,
    rootDir: ROOT,
    ...overrides,
  } as UnitSuiteDecisionInput;
}

function stageCodes(decision: UnitSuiteDecision, stage: StageName): string[] {
  return decision.stages[stage].reasons.map((entry) => entry.code.replace("UNIT_SUITE_GATE_", ""));
}

function flat(decision: UnitSuiteDecision): string[] {
  return decision.reasons.map((entry) => `${entry.stage}:${entry.code.replace(/^UNIT_SUITE_(GATE_)?/, "")}`);
}

function statuses(decision: UnitSuiteDecision): Record<string, string> {
  return Object.fromEntries(STAGES.map((stage) => [stage, decision.stages[stage].status]));
}

function expectFlat(decision: UnitSuiteDecision, wanted: string, context = ""): void {
  assert.equal(flat(decision).includes(wanted), true, `esperava ${wanted}${context ? ` (${context})` : ""}; obtido: [${flat(decision).join(", ")}]`);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const allOk = Object.fromEntries(STAGES.map((stage) => [stage, "OK"]));

test("PASS integral: as oito etapas OK, sem motivos, com proveniência apenas declarada", () => {
  const decision = decideUnitSuite(input());
  assert.equal(decision.version, UNIT_SUITE_DECISION_VERSION);
  assert.equal(decision.decision, "PASS");
  assert.deepEqual(statuses(decision), allOk);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.nodeVersion, "v22.17.1");
  assert.deepEqual(decision.stages.inventory.files, FILES);
  assert.deepEqual(decision.stages.baseline.files, FILES);
  assert.deepEqual(decision.stages.integrity.files, FILES);
  assert.deepEqual(decision.stages.adapter.observed.map((entry) => entry.file), FILES);
  assert.equal(decision.stages.verdict.verdict?.status, "PASS");
});

test("a proveniência é só declarada: o relatório do baseline traz attestation not_demonstrated, mesmo em PASS", () => {
  const pass = decideUnitSuite(input());
  assert.equal(pass.decision, "PASS");
  assert.deepEqual(pass.stages.baseline.provenance, PROVENANCE);
  assert.equal(pass.stages.baseline.provenance?.status, "declared");
  assert.equal(pass.stages.baseline.sha256, BASELINE_SHA);
  assert.equal(pass.stages.baseline.attestation, "not_demonstrated");

  const fail = decideUnitSuite(input({ run: { exitCode: 1, signal: null, timedOut: false } }));
  assert.equal(fail.decision, "FAIL");
  assert.equal(fail.stages.baseline.attestation, "not_demonstrated");
  assert.equal(decideUnitSuite(input({ baselineText: "{" })).stages.baseline.attestation, "not_demonstrated");
});

test("o SHA-256 do baseline é apenas reportado: formato inválido reprova; valor válido não é 'verificado' aqui", () => {
  for (const bad of ["B".repeat(64), "b".repeat(63), "b".repeat(65), "g".repeat(64), "", 7, null, undefined]) {
    const decision = decideUnitSuite(input({ baselineSha256: bad }));
    assert.equal(decision.decision, "FAIL", String(bad));
    assert.equal(decision.stages.baseline.status, "FAIL", String(bad));
    assert.equal(decision.stages.baseline.sha256, null, String(bad));
    assert.equal(decision.stages.verdict.status, "NOT_EVALUATED", `${String(bad)}: baseline não aprovado não alimenta o verificador`);
    assert.equal(decision.stages.integrity.status, "NOT_EVALUATED", String(bad));
    assert.deepEqual(decision.stages.baseline.reasons, [{ code: "UNIT_SUITE_GATE_BASELINE_INVALID", detail: { problem: "sha256", expected: "64 lowercase hex characters" } }]);
  }
  const other = decideUnitSuite(input({ baselineSha256: "c".repeat(64) }));
  assert.equal(other.decision, "PASS", "a função pura não consegue confrontar este valor com os bytes do baseline");
  assert.equal(other.stages.baseline.sha256, "c".repeat(64));
});

test("a versão do Node não altera a decisão nesta etapa", () => {
  const decision = decideUnitSuite(input({ eventsText: toText(allDrafts(), { node: "v99.9.9" }) }));
  assert.equal(decision.decision, "PASS");
  assert.equal(decision.nodeVersion, "v99.9.9");
});

test("issues do adaptador reprovam mesmo com o verificador em PASS", () => {
  const decision = decideUnitSuite(input({ eventsText: toText(allDrafts(), { end: false }) }));
  assert.equal(decision.stages.verdict.status, "OK", "o verificador, isolado, aprova estas observações");
  assert.equal(decision.stages.adapter.status, "FAIL");
  assert.equal(decision.decision, "FAIL");
  assert.deepEqual(stageCodes(decision, "adapter"), ["ADAPTER_ISSUES"]);
  expectFlat(decision, "adapter:EVENTS_END_MISSING");
});

test("baseline inválido passa obrigatoriamente pelo parser: as issues originais são preservadas e o restante é bloqueado", () => {
  const cases: Array<[string, unknown, string]> = [
    ["JSON corrompido", "{", "UNIT_SUITE_BASELINE_JSON_INVALID"],
    ["vazio", "", "UNIT_SUITE_BASELINE_JSON_INVALID"],
    ["não é texto", 42, "UNIT_SUITE_BASELINE_TEXT_INVALID"],
    ["ausente", undefined, "UNIT_SUITE_BASELINE_TEXT_INVALID"],
    ["versão errada", baselineText((d) => { d.schemaVersion = "v2"; }), "UNIT_SUITE_BASELINE_SCHEMA_VERSION_INVALID"],
    ["chave extra", baselineText((d) => { d.runs = 3; }), "UNIT_SUITE_BASELINE_KEY_UNEXPECTED"],
    ["status != declared", baselineText((d) => { d.provenance.status = "verified"; }), "UNIT_SUITE_BASELINE_PROVENANCE_STATUS_INVALID"],
    ["tests = 0", baselineText((d) => { d.files[0].tests = 0; }), "UNIT_SUITE_BASELINE_TESTS_BELOW_ONE"],
    ["sha256 malformado", baselineText((d) => { d.files[0].sha256 = "x"; }), "UNIT_SUITE_BASELINE_SHA256_INVALID"],
    ["arquivo adicional", baselineText(() => {}, [...FILES, "c/z.test.ts"]), "UNIT_SUITE_BASELINE_FILE_NOT_IN_INVENTORY"],
    ["arquivo ausente", baselineText(() => {}, ["a/x.test.ts"]), "UNIT_SUITE_BASELINE_FILE_MISSING_FROM_BASELINE"],
    ["fora de ordem", baselineText((d) => { d.files.reverse(); }), "UNIT_SUITE_BASELINE_FILES_NOT_SORTED"],
  ];
  for (const [label, text, issue] of cases) {
    const decision = decideUnitSuite(input({ baselineText: text }));
    assert.equal(decision.decision, "FAIL", label);
    assert.equal(decision.stages.baseline.status, "FAIL", label);
    assert.equal(decision.stages.baseline.issues.some((entry) => entry.code === issue), true, `${label}: ${JSON.stringify(decision.stages.baseline.issues)}`);
    expectFlat(decision, `baseline:${issue.replace("UNIT_SUITE_", "")}`, label);
    assert.deepEqual(decision.stages.baseline.files, [], label);
    assert.equal(decision.stages.baseline.provenance, null, label);
    assert.equal(decision.stages.integrity.status, "NOT_EVALUATED", label);
    assert.equal(decision.stages.verdict.status, "NOT_EVALUATED", label);
    assert.deepEqual(decision.stages.verdict.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "verdict", blockedBy: "baseline" } }], label);
  }
});

test("chave duplicada no baseline é rejeitada (JSON.parse manteria a última) e nunca chega ao verificador", () => {
  const duplicated = baselineText().replace('"tests": 3,', '"tests": 3,\n      "tests": 99,');
  assert.equal(JSON.parse(duplicated).files[0].tests, 99, "premissa: JSON.parse ficaria com a última");
  const decision = decideUnitSuite(input({ baselineText: duplicated }));
  assert.equal(decision.decision, "FAIL");
  expectFlat(decision, "baseline:BASELINE_DUPLICATE_KEY");
  assert.equal(decision.stages.verdict.verdict, null);
});

test("o parser do baseline é sempre usado: texto com arquivos de outro inventário não alimenta o verificador", () => {
  const decision = decideUnitSuite(input({ manifestText: manifest(["a/x.test.ts"]), argv: ["a/x.test.ts"] }));
  assert.equal(decision.decision, "FAIL");
  expectFlat(decision, "baseline:BASELINE_FILE_NOT_IN_INVENTORY");
  assert.equal(decision.stages.verdict.status, "NOT_EVALUATED");
});

test("inventário inválido reprova, preserva as issues do parser e bloqueia baseline, integridade e argv", () => {
  const cases: Array<[string, unknown, string]> = [
    ["duplicata", "a/x.test.ts\na/x.test.ts\n", "INVENTORY_DUPLICATE_ENTRY"],
    ["travessia", "../a/x.test.ts\n", "INVENTORY_PATH_TRAVERSAL"],
    ["absoluto", "/a/x.test.ts\n", "INVENTORY_ABSOLUTE_PATH"],
    ["vazio", "# só comentário\n", "INVENTORY_EMPTY"],
    ["não é texto", 42, "INVENTORY_CONTENT_NOT_STRING"],
    ["ausente", undefined, "INVENTORY_CONTENT_NOT_STRING"],
  ];
  for (const [label, manifestText, issue] of cases) {
    const decision = decideUnitSuite(input({ manifestText }));
    assert.equal(decision.decision, "FAIL", label);
    assert.equal(decision.stages.inventory.status, "FAIL", label);
    assert.equal(decision.stages.inventory.issues.some((entry) => entry.code === issue), true, label);
    expectFlat(decision, `inventory:${issue}`, label);
    for (const blocked of ["baseline", "argv"] as const) assert.equal(decision.stages[blocked].status, "NOT_EVALUATED", `${label}: ${blocked}`);
    assert.equal(decision.stages.integrity.status, "NOT_EVALUATED", label);
    assert.deepEqual(decision.stages.baseline.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "baseline", blockedBy: "inventory" } }]);
    assert.deepEqual(decision.stages.baseline.issues, [], "o parser do baseline não é chamado sem inventário validado");
  }
});

test("integridade aprovada: declarado == anterior == posterior, com cobertura exata", () => {
  const decision = decideUnitSuite(input());
  assert.equal(decision.stages.integrity.status, "OK");
  assert.deepEqual(decision.stages.integrity.reasons, []);
  assert.deepEqual(decision.stages.integrity.files, FILES);
});

test("digest declarado diferente do observado antes e/ou depois reprova", () => {
  const wrong = "9".repeat(64);
  const both = decideUnitSuite(input({ testFileDigests: digests({ before: { ...DECLARED, "a/x.test.ts": wrong }, after: { ...DECLARED, "a/x.test.ts": wrong } }) }));
  assert.equal(both.decision, "FAIL");
  assert.deepEqual(both.stages.integrity.reasons, [
    { code: "UNIT_SUITE_GATE_DIGEST_MISMATCH", detail: { phase: "before", file: "a/x.test.ts" } },
    { code: "UNIT_SUITE_GATE_DIGEST_MISMATCH", detail: { phase: "after", file: "a/x.test.ts" } },
  ]);
  assert.equal(both.stages.verdict.status, "OK", "os testes passaram, mas o baseline não corresponde ao arquivo atual");

  const onlyBefore = decideUnitSuite(input({ testFileDigests: digests({ before: { ...DECLARED, "b/y.test.ts": wrong } }) }));
  assert.deepEqual(stageCodes(onlyBefore, "integrity"), ["DIGEST_MISMATCH", "FILES_CHANGED_DURING_RUN"]);
});

test("digest anterior diferente do posterior: arquivo alterado durante a execução", () => {
  const changed = decideUnitSuite(input({ testFileDigests: digests({ after: { ...DECLARED, "b/y.test.ts": "9".repeat(64) } }) }));
  assert.equal(changed.decision, "FAIL");
  assert.deepEqual(changed.stages.integrity.reasons, [
    { code: "UNIT_SUITE_GATE_DIGEST_MISMATCH", detail: { phase: "after", file: "b/y.test.ts" } },
    { code: "UNIT_SUITE_GATE_FILES_CHANGED_DURING_RUN", detail: { file: "b/y.test.ts" } },
  ]);
});

test("digest ausente, adicional ou inválido nos mapas reprova, com fase e arquivo", () => {
  const { "b/y.test.ts": _omitted, ...withoutB } = DECLARED;
  const missingBefore = decideUnitSuite(input({ testFileDigests: digests({ before: withoutB }) }));
  assert.deepEqual(missingBefore.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_DIGEST_MISSING", detail: { phase: "before", file: "b/y.test.ts" } }]);
  const missingAfter = decideUnitSuite(input({ testFileDigests: digests({ after: withoutB }) }));
  assert.deepEqual(missingAfter.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_DIGEST_MISSING", detail: { phase: "after", file: "b/y.test.ts" } }]);

  const extra = decideUnitSuite(input({ testFileDigests: digests({ before: { ...DECLARED, "c/z.test.ts": "3".repeat(64) } }) }));
  assert.deepEqual(extra.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { phase: "before", problem: "unexpected_file", file: "c/z.test.ts" } }]);

  for (const bad of ["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), "", 5, null, undefined, {}]) {
    const decision = decideUnitSuite(input({ testFileDigests: digests({ after: { ...DECLARED, "a/x.test.ts": bad } }) }));
    assert.equal(decision.decision, "FAIL", String(bad));
    assert.deepEqual(decision.stages.integrity.reasons.map((entry) => entry.code), ["UNIT_SUITE_GATE_DIGEST_INVALID"], String(bad));
    assert.deepEqual(decision.stages.integrity.reasons[0].detail, { phase: "after", file: "a/x.test.ts" });
  }
});

test("forma de testFileDigests: ausente, malformada, mapa que não é objeto, antes nulo", () => {
  for (const [label, value] of [["ausente", undefined], ["número", 42], ["texto", "x"], ["vazio", {}], ["sem after", { before: { ...DECLARED } }], ["sem before", { after: { ...DECLARED } }], ["lista", []]] as Array<[string, unknown]>) {
    const decision = decideUnitSuite(input({ testFileDigests: value }));
    assert.equal(decision.decision, "FAIL", label);
    assert.deepEqual(decision.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { problem: "testFileDigests_shape" } }], label);
  }
  for (const notMap of [[], "x", 7]) {
    const decision = decideUnitSuite(input({ testFileDigests: digests({ before: notMap }) }));
    assert.deepEqual(decision.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { phase: "before", problem: "not_an_object" } }], JSON.stringify(notMap));
  }
  const beforeNull = decideUnitSuite(input({ testFileDigests: digests({ before: null }) }));
  assert.equal(beforeNull.decision, "FAIL");
  assert.deepEqual(beforeNull.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { phase: "before", problem: "required" } }]);
});

test("run presente exige digests posteriores; run nulo permite after nulo mas avalia os digests anteriores", () => {
  const afterNull = decideUnitSuite(input({ testFileDigests: digests({ after: null }) }));
  assert.equal(afterNull.decision, "FAIL");
  assert.deepEqual(afterNull.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { phase: "after", problem: "required_when_run_present" } }]);

  const notRun = decideUnitSuite(input({ run: null, eventsText: null, testFileDigests: digests({ after: null }) }));
  assert.equal(notRun.decision, "FAIL");
  assert.equal(notRun.stages.integrity.status, "OK", "a integridade anterior é avaliada e está íntegra");
  assert.deepEqual(stageCodes(notRun, "run"), ["RUN_NOT_EXECUTED"]);
  expectFlat(notRun, "run:RUN_NOT_EXECUTED");
  assert.equal(notRun.stages.verdict.status, "NOT_EVALUATED");

  const notRunMismatch = decideUnitSuite(input({ run: null, eventsText: null, testFileDigests: digests({ before: { ...DECLARED, "a/x.test.ts": "9".repeat(64) }, after: null }) }));
  assert.deepEqual(notRunMismatch.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_DIGEST_MISMATCH", detail: { phase: "before", file: "a/x.test.ts" } }]);

  const afterWithoutRun = decideUnitSuite(input({ run: null, eventsText: null }));
  assert.deepEqual(afterWithoutRun.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", detail: { phase: "after", problem: "present_without_run" } }]);
});

test("run: null nunca é PASS, mesmo com todo o resto íntegro", () => {
  const decision = decideUnitSuite(input({ run: null, testFileDigests: digests({ after: null }) }));
  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.stages.run.status, "FAIL", "testes não executados nunca deixam a etapa run em OK");
  assert.deepEqual(stageCodes(decision, "run"), ["RUN_NOT_EXECUTED"]);
  assert.deepEqual(decision.stages.verdict.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "verdict", blockedBy: "run" } }]);
  assert.equal(decision.stages.events.status, "OK");
  assert.equal(decision.stages.adapter.status, "OK");
});

test("baseline inválido deixa a integridade não avaliada, com reprovação global, mesmo com digests corretos", () => {
  const decision = decideUnitSuite(input({ baselineText: "{" }));
  assert.equal(decision.stages.integrity.status, "NOT_EVALUATED");
  assert.deepEqual(decision.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "integrity", blockedBy: "baseline" } }]);
  assert.equal(decision.decision, "FAIL");
});

test("argv divergente do inventário reprova: ausente, adicional, duplicado, inválido; './' é normalizado", () => {
  // o runner que não recebeu b/y.test.ts também não emite eventos dele
  const missing = decideUnitSuite(input({ argv: ["a/x.test.ts"], eventsText: toText(allDrafts(["a/x.test.ts"])) }));
  assert.deepEqual(missing.stages.argv.reasons, [{ code: "UNIT_SUITE_GATE_ARGV_MISSING_FILE", detail: { file: "b/y.test.ts" } }]);
  expectFlat(missing, "verdict:FILE_NOT_STARTED", "o runner não recebeu o arquivo");

  const extra = decideUnitSuite(input({ argv: [...FILES, "c/z.test.ts"] }));
  assert.deepEqual(extra.stages.argv.reasons, [{ code: "UNIT_SUITE_GATE_ARGV_EXTRA_FILE", detail: { file: "c/z.test.ts" } }]);

  const duplicated = decideUnitSuite(input({ argv: [...FILES, "./a/x.test.ts"] }));
  assert.deepEqual(stageCodes(duplicated, "argv"), ["ARGV_DUPLICATE"]);
  assert.equal(duplicated.decision, "FAIL");

  for (const [label, argv] of [["não é lista", "a/x.test.ts"], ["vazio", []], ["absoluto", ["/repo/a/x.test.ts", "b/y.test.ts"]], ["não é texto", [42, "b/y.test.ts"]], ["com espaço", ["a/x.test.ts ", "b/y.test.ts"]]] as Array<[string, unknown]>) {
    const decision = decideUnitSuite(input({ argv }));
    assert.equal(decision.decision, "FAIL", label);
    assert.equal(decision.stages.argv.reasons.some((entry) => entry.code === "UNIT_SUITE_GATE_ARGV_INVALID"), true, label);
  }

  const normalized = decideUnitSuite(input({ argv: ["./a/x.test.ts", "b//y.test.ts"] }));
  assert.equal(normalized.decision, "PASS", "argv com './' e '//' é normalizado para o mesmo conjunto");
  assert.deepEqual(normalized.stages.argv.files, FILES);
});

test("execução: código ≠ 0, sinal, timeout, saída desconhecida, não executada e observação inválida reprovam", () => {
  const cases: Array<[string, unknown, string[]]> = [
    ["código 1", { exitCode: 1, signal: null, timedOut: false }, ["RUN_EXIT_NONZERO"]],
    ["sinal", { exitCode: null, signal: "SIGKILL", timedOut: false }, ["RUN_SIGNALED"]],
    ["timeout", { exitCode: null, signal: "SIGTERM", timedOut: true }, ["RUN_TIMED_OUT", "RUN_SIGNALED"]],
    ["timeout sem sinal", { exitCode: null, signal: null, timedOut: true }, ["RUN_TIMED_OUT"]],
    ["código 0 mas timeout", { exitCode: 0, signal: null, timedOut: true }, ["RUN_TIMED_OUT"]],
    ["saída desconhecida", { exitCode: null, signal: null, timedOut: false }, ["RUN_EXIT_UNKNOWN"]],
    ["não executada", null, ["RUN_NOT_EXECUTED"]],
    ["ausente (undefined)", undefined, ["RUN_INVALID"]],
    ["código como texto", { exitCode: "0", signal: null, timedOut: false }, ["RUN_INVALID"]],
    ["sem timedOut", { exitCode: 0, signal: null }, ["RUN_INVALID"]],
  ];
  for (const [label, run, codes] of cases) {
    const decision = decideUnitSuite(input({ run, testFileDigests: digests({ after: run === null ? null : { ...DECLARED } }) }));
    assert.equal(decision.decision, "FAIL", label);
    assert.deepEqual(stageCodes(decision, "run"), codes, label);
  }
  const nonzero = decideUnitSuite(input({ run: { exitCode: 2, signal: null, timedOut: false } }));
  assert.deepEqual(nonzero.stages.run.reasons[0].detail, { exitCode: 2 });
  assert.equal(nonzero.stages.adapter.status, "OK", "as demais etapas continuam sendo avaliadas");
});

test("eventos: ausente (null), vazio, só espaços, não texto e linha corrompida são distinguidos", () => {
  const missing = decideUnitSuite(input({ eventsText: null }));
  assert.deepEqual(stageCodes(missing, "events"), ["EVENTS_MISSING"]);
  assert.deepEqual(statuses(missing), { ...allOk, events: "FAIL", adapter: "NOT_EVALUATED", verdict: "NOT_EVALUATED" });
  assert.deepEqual(missing.stages.adapter.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "adapter", blockedBy: "events" } }]);
  assert.deepEqual(missing.stages.verdict.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "verdict", blockedBy: "adapter" } }]);
  assert.equal(missing.decision, "FAIL");

  for (const text of ["", "   \n\n"]) {
    const empty = decideUnitSuite(input({ eventsText: text }));
    assert.deepEqual(stageCodes(empty, "events"), ["EVENTS_EMPTY"], JSON.stringify(text));
    assert.equal(empty.decision, "FAIL");
  }

  const notText = decideUnitSuite(input({ eventsText: 42 }));
  assert.deepEqual(notText.stages.events.reasons, [{ code: "UNIT_SUITE_GATE_EVENTS_INVALID", detail: { problem: "not_string" } }]);

  const corrupted = decideUnitSuite(input({ eventsText: `${toText(allDrafts())}{"truncado":\n` }));
  assert.equal(corrupted.decision, "FAIL");
  assert.deepEqual(stageCodes(corrupted, "events"), ["EVENTS_INVALID"]);
  assert.equal(corrupted.stages.events.parseIssues[0].code, "UNIT_SUITE_EVENTS_LINE_NOT_JSON");
  assert.equal(corrupted.stages.adapter.status, "OK", "as linhas válidas continuam sendo interpretadas para o relatório");
  expectFlat(corrupted, "events:EVENTS_LINE_NOT_JSON");
});

test("falha de suite com rc=0, resumo de sucesso e testes aprovados reprova e preserva o motivo do verificador", () => {
  const suiteFailed = [
    result("test:start", "a/x.test.ts", "suite"),
    result("test:fail", "a/x.test.ts", "suite", { detailsType: "suite", failureType: "hookFailed" }),
  ];
  const drafts = allDrafts();
  drafts.splice(drafts.findIndex((draft) => draft.ev === "test:summary"), 0, ...suiteFailed);
  const decision = decideUnitSuite(input({ eventsText: toText(drafts), run: OK_RUN }));
  assert.equal(decision.stages.run.status, "OK", "rc=0");
  assert.equal(decision.stages.integrity.status, "OK");
  assert.equal(decision.stages.adapter.status, "OK");
  assert.equal(decision.stages.adapter.observed[0].summary?.failed, 0, "o resumo do Node não conta a falha de suite");
  assert.equal(decision.decision, "FAIL");
  assert.equal(decision.stages.verdict.status, "FAIL");
  assert.deepEqual(stageCodes(decision, "verdict"), ["VERDICT_FAIL"]);
  expectFlat(decision, "verdict:SUITE_FAILED");
  const reason = decision.reasons.find((entry) => entry.code === "UNIT_SUITE_SUITE_FAILED");
  assert.deepEqual(reason?.detail, { file: "a/x.test.ts", suiteFailures: 1 });
});

test("resumo ausente, duplicado e eventos perdidos reprovam com os motivos do verificador", () => {
  const withoutSummary = allDrafts().filter((draft) => !(draft.ev === "test:summary" && typeof draft.file === "string" && draft.file.endsWith("a/x.test.ts")));
  const missing = decideUnitSuite(input({ eventsText: toText(withoutSummary) }));
  assert.equal(missing.decision, "FAIL");
  assert.equal(missing.stages.adapter.status, "OK", "o fluxo está íntegro; falta o resumo do arquivo");
  expectFlat(missing, "verdict:SUMMARY_MISSING");

  const duplicated = decideUnitSuite(input({ eventsText: toText([...allDrafts(), summary("a/x.test.ts", 3)]) }));
  expectFlat(duplicated, "verdict:SUMMARY_DUPLICATE");
  assert.equal(duplicated.decision, "FAIL");

  const lost = allDrafts();
  lost.splice(1, 1);
  const truncated = decideUnitSuite(input({ eventsText: toText(lost) }));
  assert.equal(truncated.decision, "FAIL");
  expectFlat(truncated, "verdict:COUNT_BELOW_EXPECTED");
});

test("o veredito do verificador é preservado integralmente, usando os dados do parser do baseline", () => {
  const drafts = allDrafts().filter((draft) => draft.ev !== "test:summary" || draft.file === null);
  const eventsText = toText(drafts);
  const run = { exitCode: 1, signal: null, timedOut: false };
  const decision = decideUnitSuite(input({ eventsText, run }));
  const baseline = parseUnitSuiteBaseline(baselineText(), { expectedFiles: FILES });
  assert.equal(baseline.ok, true);
  const adapted = adaptNodeEvents(parseNdjson(eventsText).records, { rootDir: ROOT });
  const direct = evaluateUnitSuite({ expected: baseline.ok ? baseline.files : [], observed: adapted.observed, run });
  assert.deepEqual(decision.stages.verdict.verdict, direct);
  assert.equal(decision.stages.verdict.verdict?.status, "FAIL");
});

test("todas as etapas são avaliadas e relatadas mesmo quando várias falham", () => {
  const decision = decideUnitSuite(input({
    testFileDigests: digests({ before: { ...DECLARED, "a/x.test.ts": "9".repeat(64) } }),
    argv: ["a/x.test.ts"],
    run: { exitCode: 3, signal: null, timedOut: false },
    eventsText: `${toText(allDrafts())}{ruim\n`,
  }));
  assert.equal(decision.decision, "FAIL");
  assert.deepEqual(statuses(decision), { inventory: "OK", baseline: "OK", integrity: "FAIL", argv: "FAIL", run: "FAIL", events: "FAIL", adapter: "OK", verdict: "FAIL" });
  for (const wanted of ["integrity:DIGEST_MISMATCH", "argv:ARGV_MISSING_FILE", "run:RUN_EXIT_NONZERO", "events:EVENTS_INVALID", "verdict:VERDICT_FAIL"]) expectFlat(decision, wanted);
});

test("entrada ausente ou de tipo errado nunca lança e reprova, com todas as etapas não avaliadas", () => {
  for (const bad of [undefined, null, 42, "x", [], true]) {
    const decision = decideUnitSuite(bad as unknown as UnitSuiteDecisionInput);
    assert.equal(decision.decision, "FAIL", String(bad));
    assert.deepEqual(decision.reasons, [{ stage: "input", code: "UNIT_SUITE_GATE_INPUT_INVALID" }]);
    assert.deepEqual(statuses(decision), Object.fromEntries(STAGES.map((stage) => [stage, "NOT_EVALUATED"])));
    assert.deepEqual(decision.stages.run.reasons, [{ code: "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", detail: { stage: "run", blockedBy: "input" } }]);
    assert.equal(decision.stages.baseline.attestation, "not_demonstrated");
  }
  for (const key of ["manifestText", "baselineText", "baselineSha256", "testFileDigests", "argv", "eventsText", "run", "rootDir"]) {
    const partial: Record<string, unknown> = { ...input() };
    delete partial[key];
    const decision = decideUnitSuite(partial as unknown as UnitSuiteDecisionInput);
    assert.equal(decision.decision, "FAIL", `sem ${key}`);
  }
  for (const rootDir of ["relative", "/repo/", "", 5, null]) {
    const decision = decideUnitSuite(input({ rootDir }));
    assert.equal(decision.decision, "FAIL", `rootDir ${String(rootDir)}`);
    assert.equal(decision.stages.adapter.issues.some((entry) => entry.code === "UNIT_SUITE_EVENTS_OPTIONS_INVALID"), true);
  }
  assert.equal(decideUnitSuite(input({ cwd: null })).decision, "FAIL", "cwd explícito e inválido");
  assert.equal(decideUnitSuite(input({ cwd: "/repo" })).decision, "PASS");
});

test("exceções internas viram FAIL com GATE_INTERNAL_ERROR, nunca aprovação", () => {
  const hostileRun = { ...input() } as Record<string, unknown>;
  Object.defineProperty(hostileRun, "run", { enumerable: true, get() { throw new Error("getter hostil"); } });
  const topLevel = decideUnitSuite(hostileRun as unknown as UnitSuiteDecisionInput);
  assert.equal(topLevel.decision, "FAIL");
  assert.deepEqual(topLevel.reasons, [{ stage: "input", code: "UNIT_SUITE_GATE_INTERNAL_ERROR" }]);

  const hostileSha = { ...input() } as Record<string, unknown>;
  Object.defineProperty(hostileSha, "baselineSha256", { enumerable: true, get() { throw new Error("sha hostil"); } });
  const inBaseline = decideUnitSuite(hostileSha as unknown as UnitSuiteDecisionInput);
  assert.equal(inBaseline.decision, "FAIL");
  assert.deepEqual(inBaseline.stages.baseline.reasons, [{ code: "UNIT_SUITE_GATE_INTERNAL_ERROR", detail: { stage: "baseline" } }]);
  assert.equal(inBaseline.stages.integrity.status, "NOT_EVALUATED", "baseline com erro interno não libera a integridade");

  const hostileDigests = { before: { ...DECLARED }, after: { ...DECLARED } };
  Object.defineProperty(hostileDigests, "before", { enumerable: true, get() { throw new Error("digests hostis"); } });
  const inIntegrity = decideUnitSuite(input({ testFileDigests: hostileDigests }));
  assert.equal(inIntegrity.decision, "FAIL");
  assert.deepEqual(inIntegrity.stages.integrity.reasons, [{ code: "UNIT_SUITE_GATE_INTERNAL_ERROR", detail: { stage: "integrity" } }]);

  const hostileArgv = new Proxy([...FILES], { get(target, prop, receiver) { if (prop === "forEach") throw new Error("proxy hostil"); return Reflect.get(target, prop, receiver); } });
  const inArgv = decideUnitSuite(input({ argv: hostileArgv }));
  assert.equal(inArgv.decision, "FAIL");
  assert.deepEqual(inArgv.stages.argv.reasons, [{ code: "UNIT_SUITE_GATE_INTERNAL_ERROR", detail: { stage: "argv" } }]);

  const hostileExit = { get exitCode(): number { throw new Error("run hostil"); }, signal: null, timedOut: false };
  const inRun = decideUnitSuite(input({ run: hostileExit }));
  assert.equal(inRun.decision, "FAIL");
  assert.equal(inRun.stages.run.reasons.some((entry) => entry.code === "UNIT_SUITE_GATE_INTERNAL_ERROR"), true);
});

test("função pura: não altera a entrada, é determinística e aceita entrada congelada", () => {
  const frozen = deepFreeze(input({ run: { exitCode: 1, signal: null, timedOut: false } }));
  const snapshot = JSON.stringify(frozen);
  const first = decideUnitSuite(frozen);
  const second = decideUnitSuite(frozen);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(frozen), snapshot, "a entrada não pode ser alterada");
  assert.equal(first.decision, "FAIL");
  const passing = decideUnitSuite(deepFreeze(input()));
  assert.equal(passing.decision, "PASS");
  assert.notEqual(passing.stages.inventory.files, passing.stages.baseline.files, "relatórios não compartilham referências");
});

test("a ordem de argv e das chaves dos mapas de digest não altera a decisão", () => {
  const forward = decideUnitSuite(input());
  const reversed = decideUnitSuite(input({
    argv: [...FILES].reverse(),
    testFileDigests: { before: Object.fromEntries(Object.entries(DECLARED).reverse()), after: Object.fromEntries(Object.entries(DECLARED).reverse()) },
  }));
  assert.deepEqual(reversed, forward);
});

test("higiene do módulo: sem disco, processo, rede, ambiente, relógio, hash ou aleatoriedade; só importa módulos do gate", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../ci/unitSuiteDecision.ts", import.meta.url)), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  for (const forbidden of ["process.", "performance", "Math.random", "require(", "fetch(", "import(", "node:", "child_process", "readFileSync", "setTimeout", "globalThis", "createHash", "crypto", "JSON.parse"]) {
    assert.equal(source.includes(forbidden), false, `token proibido no módulo: ${forbidden}`);
  }
  assert.equal(/\bDate\b/.test(source), false, "o módulo não pode consultar o relógio");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ["./unitSuiteBaseline", "./unitSuiteInventory", "./unitSuiteNodeEvents", "./unitSuiteVerdict"]);
});

test("identificadores GATE são estáveis, únicos, com prefixo, e todo código usado no módulo está declarado", () => {
  assert.equal(new Set(UNIT_SUITE_GATE_REASON_CODES).size, UNIT_SUITE_GATE_REASON_CODES.length);
  assert.equal(UNIT_SUITE_GATE_REASON_CODES.every((code) => /^UNIT_SUITE_GATE_[A-Z_]+$/.test(code)), true);
  assert.equal(UNIT_SUITE_GATE_REASON_CODES.length, 25);
  const codes: readonly string[] = UNIT_SUITE_GATE_REASON_CODES;
  for (const removed of ["UNIT_SUITE_GATE_BASELINE_MISSING_FILE", "UNIT_SUITE_GATE_BASELINE_EXTRA_FILE"]) {
    assert.equal(codes.includes(removed), false, `${removed} foi removido: o parser já reporta o mesmo problema`);
  }
  for (const added of ["INTEGRITY_INPUT_INVALID", "DIGEST_MISSING", "DIGEST_INVALID", "DIGEST_MISMATCH", "FILES_CHANGED_DURING_RUN", "RUN_NOT_EXECUTED"]) {
    assert.equal(codes.includes(`UNIT_SUITE_GATE_${added}`), true, `falta ${added}`);
  }
  const source = fs.readFileSync(fileURLToPath(new URL("../ci/unitSuiteDecision.ts", import.meta.url)), "utf8");
  const used = new Set([...source.matchAll(/"(UNIT_SUITE_GATE_[A-Z_]+)"/g)].map((match) => match[1]));
  const declared: ReadonlySet<string> = new Set(UNIT_SUITE_GATE_REASON_CODES);
  for (const code of used) assert.equal(declared.has(code), true, `código usado e não declarado: ${code}`);
  for (const code of declared) assert.equal(used.has(code), true, `código declarado e não usado: ${code}`);
});

// ---------------------------------------------------------------------------------------------
// Modo observe (informativo, sem baseline)
// ---------------------------------------------------------------------------------------------

function obsInput(overrides: Record<string, unknown> = {}): UnitSuiteObservationInput {
  return {
    manifestText: manifest(),
    testFileDigests: digests(),
    argv: [...FILES],
    eventsText: toText(allDrafts()),
    run: OK_RUN,
    rootDir: ROOT,
    ...overrides,
  } as UnitSuiteObservationInput;
}

/** Arquivo com itens mistos; o resumo segue as contagens reais dos itens. */
function mixedFileDrafts(file: string, items: Array<"pass" | "skip" | "todo" | "fail">): Draft[] {
  const drafts: Draft[] = [];
  items.forEach((item, index) => {
    const name = `t${index + 1}`;
    drafts.push(result("test:start", file, name));
    if (item === "fail") drafts.push(result("test:fail", file, name, { failureType: "testCodeFailure" }));
    else drafts.push(result("test:pass", file, name, { skip: item === "skip", todo: item === "todo" }));
  });
  const count = (kind: string) => items.filter((item) => item === kind).length;
  drafts.push({
    v: 1, kind: "event", ev: "test:summary", file: `${ROOT}/${file}`, success: count("fail") === 0,
    counts: { tests: items.length, passed: count("pass"), failed: count("fail"), cancelled: 0, skipped: count("skip"), todo: count("todo") },
  });
  return drafts;
}

function eventsFor(parts: Record<string, Draft[]>): string {
  const drafts = Object.values(parts).flat();
  return toText([...drafts, summary(null, drafts.filter((draft) => draft.ev === "test:pass" || draft.ev === "test:fail").length)]);
}

function obsCodes(observation: UnitSuiteObservation): string[] {
  return observation.reasons.map((entry) => `${entry.stage}:${entry.code.replace(/^UNIT_SUITE_(GATE_)?/, "")}`);
}

test("observe: observação completa => OBSERVED_UNATTESTED, sem aprovação, sem baseline e com candidatos por arquivo", () => {
  const observation = observeUnitSuite(obsInput());
  assert.equal(observation.version, UNIT_SUITE_OBSERVATION_VERSION);
  assert.equal(observation.mode, "observe");
  assert.equal(observation.status, "OBSERVED_UNATTESTED");
  assert.equal(observation.approval, "NONE");
  assert.deepEqual(observation.baseline, { used: false, generated: false, ratified: false });
  assert.equal(observation.attestation, "not_demonstrated");
  assert.deepEqual(observation.reasons, []);
  for (const [name, stage] of Object.entries(observation.stages)) assert.equal(stage.status, "OK", name);
  assert.deepEqual(observation.files.map((row) => row.file), FILES);
  for (const row of observation.files) {
    assert.deepEqual([row.tests, row.executed, row.skipped, row.todo, row.failed, row.cancelled, row.suiteFailures], [3, 3, 0, 0, 0, 0, 0], row.file);
    assert.equal(row.sha256, DECLARED[row.file], "SHA-256 candidato = digest anterior à execução");
    assert.equal(row.coverage, "DEMONSTRATED");
    assert.equal(row.candidate, true);
    assert.equal(row.conditional, false);
    assert.deepEqual(row.problems, []);
  }
  assert.equal(observation.totals.tests, 6);
  assert.equal(observation.totals.filesObserved, 2);
  assert.equal(observation.nodeVersion, "v22.17.1");
  assert.equal(Object.prototype.hasOwnProperty.call(observation, "decision"), false, "não há campo de decisão de aprovação");
});

test("observe: o módulo não usa baseline (nenhum parser de baseline nem texto de baseline na entrada)", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../ci/unitSuiteDecision.ts", import.meta.url)), "utf8");
  const block = source.slice(source.indexOf("// Modo observe (informativo, SEM baseline)"));
  assert.equal(block.includes("parseUnitSuiteBaseline"), false);
  assert.equal(block.includes("baselineStage("), false);
  assert.equal(block.includes("baselineText"), false);
  assert.equal("baselineText" in obsInput(), false);
});

test("observe: nunca produz PASS nem aprovação, em nenhuma variação de entrada", () => {
  const variations: Record<string, unknown>[] = [
    {},
    { run: { exitCode: 1, signal: null, timedOut: false } },
    { run: { exitCode: null, signal: "SIGKILL", timedOut: true } },
    { run: null, testFileDigests: { before: { ...DECLARED }, after: null } },
    { eventsText: null },
    { manifestText: "" },
    { argv: [] },
    { testFileDigests: digests({ after: { ...DECLARED, "a/x.test.ts": "9".repeat(64) } }) },
    { eventsText: eventsFor({ a: mixedFileDrafts("a/x.test.ts", ["pass", "skip"]), b: mixedFileDrafts("b/y.test.ts", ["fail"]) }) },
  ];
  for (const [index, overrides] of variations.entries()) {
    const observation = observeUnitSuite(obsInput(overrides));
    const text = JSON.stringify(observation);
    assert.equal(text.includes('"PASS"'), false, `variação ${index}`);
    assert.equal(observation.approval, "NONE", `variação ${index}`);
    assert.equal(["OBSERVED_UNATTESTED", "OBSERVATION_FAILED", "OBSERVATION_INCOMPLETE"].includes(observation.status), true);
  }
});

test("observe: falhas estruturais => OBSERVATION_INCOMPLETE, nunca observação bem-sucedida", () => {
  const onlyA = toText([...fileDrafts("a/x.test.ts"), summary(null, 3)]);
  const fileLevelOnly = toText([result("test:pass", "a/x.test.ts", `${ROOT}/a/x.test.ts`), ...fileDrafts("b/y.test.ts"), summary(null, 3)]);
  const unexpected = toText([...allDrafts(), ...fileDrafts("c/z.test.ts")]);
  const noSummary = toText(allDrafts().filter((draft) => !(draft.ev === "test:summary" && typeof draft.file === "string" && draft.file.endsWith("a/x.test.ts"))));
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["eventos ausentes", { eventsText: null }, "events:EVENTS_MISSING"],
    ["eventos vazios", { eventsText: "" }, "events:EVENTS_EMPTY"],
    ["linha corrompida", { eventsText: `${toText(allDrafts())}{"x":\n` }, "events:EVENTS_INVALID"],
    ["registro end ausente", { eventsText: toText(allDrafts(), { end: false }) }, "adapter:ADAPTER_ISSUES"],
    ["execução ausente", { run: null, testFileDigests: { before: { ...DECLARED }, after: null } }, "run:RUN_NOT_EXECUTED"],
    ["timeout", { run: { exitCode: null, signal: "SIGKILL", timedOut: true } }, "run:RUN_TIMED_OUT"],
    ["sinal", { run: { exitCode: null, signal: "SIGTERM", timedOut: false } }, "run:RUN_SIGNALED"],
    ["saída desconhecida", { run: { exitCode: null, signal: null, timedOut: false } }, "run:RUN_EXIT_UNKNOWN"],
    ["arquivo alterado durante a execução", { testFileDigests: digests({ after: { ...DECLARED, "b/y.test.ts": "9".repeat(64) } }) }, "integrity:FILES_CHANGED_DURING_RUN"],
    ["digest ausente", { testFileDigests: { before: { "a/x.test.ts": DECLARED["a/x.test.ts"] }, after: { ...DECLARED } } }, "integrity:DIGEST_MISSING"],
    ["digest inválido", { testFileDigests: digests({ before: { ...DECLARED, "a/x.test.ts": "xyz" } }) }, "integrity:DIGEST_INVALID"],
    ["argv sem um arquivo", { argv: ["a/x.test.ts"] }, "argv:ARGV_MISSING_FILE"],
    ["argv com arquivo extra", { argv: [...FILES, "c/z.test.ts"] }, "argv:ARGV_EXTRA_FILE"],
    ["manifesto vazio", { manifestText: "# nada\n" }, "inventory:INVENTORY_INVALID"],
    ["arquivo nunca iniciado", { eventsText: onlyA }, "verdict:FILE_NOT_STARTED"],
    ["item de arquivo (saída prematura)", { eventsText: fileLevelOnly }, "verdict:FILE_LEVEL_ENTRY"],
    ["resumo ausente", { eventsText: noSummary }, "verdict:SUMMARY_MISSING"],
    ["arquivo inesperado nos eventos", { eventsText: unexpected }, "verdict:UNEXPECTED_FILE"],
  ];
  for (const [label, overrides, wanted] of cases) {
    const observation = observeUnitSuite(obsInput(overrides));
    assert.equal(observation.status, "OBSERVATION_INCOMPLETE", label);
    assert.equal(obsCodes(observation).includes(wanted), true, `${label}: esperava ${wanted}; obtido [${obsCodes(observation).join(", ")}]`);
    assert.equal(observation.files.every((row) => row.candidate === false), true, `${label}: nenhum candidato`);
    assert.equal(observation.files.every((row) => row.coverage === "NOT_DEMONSTRATED"), true, `${label}: cobertura não demonstrada`);
  }
});

test("observe: teste falho => OBSERVATION_FAILED (contagens informativas, sem candidatos); saída ≠ 0 sem falha nos eventos => INCOMPLETE", () => {
  const failing = eventsFor({ a: fileDrafts("a/x.test.ts"), b: mixedFileDrafts("b/y.test.ts", ["pass", "pass", "fail"]) });
  const failed = observeUnitSuite(obsInput({ eventsText: failing, run: { exitCode: 1, signal: null, timedOut: false } }));
  assert.equal(failed.status, "OBSERVATION_FAILED");
  assert.deepEqual(obsCodes(failed).filter((code) => code.startsWith("run:")), ["run:RUN_EXIT_NONZERO"]);
  assert.equal(failed.files.every((row) => row.candidate === false), true);
  const rowB = failed.files.find((row) => row.file === "b/y.test.ts");
  assert.deepEqual([rowB?.tests, rowB?.executed, rowB?.failed, rowB?.coverage], [3, 2, 1, "PARTIAL"]);
  assert.equal(failed.files.find((row) => row.file === "a/x.test.ts")?.coverage, "DEMONSTRATED");

  const unexplained = observeUnitSuite(obsInput({ run: { exitCode: 1, signal: null, timedOut: false } }));
  assert.equal(unexplained.status, "OBSERVATION_INCOMPLETE", "saída ≠ 0 com todos os testes aprovados é falha não explicada");

  const suiteDrafts = allDrafts();
  suiteDrafts.splice(suiteDrafts.findIndex((draft) => draft.ev === "test:summary"), 0,
    result("test:start", "a/x.test.ts", "suite"), result("test:fail", "a/x.test.ts", "suite", { detailsType: "suite", failureType: "hookFailed" }));
  const hook = observeUnitSuite(obsInput({ eventsText: toText(suiteDrafts) }));
  assert.equal(hook.status, "OBSERVATION_FAILED", "falha de suite com saída 0 não é observação bem-sucedida");
  assert.equal(hook.files.find((row) => row.file === "a/x.test.ts")?.suiteFailures, 1);
});

test("observe: skip e todo nunca contam como teste executado; arquivo condicional ignorado fica NOT_DEMONSTRATED", () => {
  const files = ["a/x.test.ts", "db/y.realPostgres.integration.test.ts", "c/z.test.ts"];
  const digs = { "a/x.test.ts": "1".repeat(64), "db/y.realPostgres.integration.test.ts": "2".repeat(64), "c/z.test.ts": "3".repeat(64) };
  const events = eventsFor({
    a: mixedFileDrafts("a/x.test.ts", ["pass", "pass", "skip", "todo"]),
    db: mixedFileDrafts("db/y.realPostgres.integration.test.ts", ["skip", "skip"]),
    c: mixedFileDrafts("c/z.test.ts", ["pass"]),
  });
  const observation = observeUnitSuite(obsInput({ manifestText: manifest(files), argv: files, testFileDigests: { before: digs, after: { ...digs } }, eventsText: events }));
  assert.equal(observation.status, "OBSERVED_UNATTESTED", "skip não é falha: a observação é completa");
  const row = (file: string) => observation.files.find((entry) => entry.file === file)!;
  assert.deepEqual([row("a/x.test.ts").tests, row("a/x.test.ts").executed, row("a/x.test.ts").skipped, row("a/x.test.ts").todo], [4, 2, 1, 1]);
  assert.equal(row("a/x.test.ts").coverage, "PARTIAL");
  const db = row("db/y.realPostgres.integration.test.ts");
  assert.deepEqual([db.conditional, db.tests, db.executed, db.skipped, db.coverage], [true, 2, 0, 2, "NOT_DEMONSTRATED"]);
  assert.equal(row("c/z.test.ts").coverage, "DEMONSTRATED");
  assert.equal(observation.totals.executed, 3, "só os testes realmente executados");
  assert.equal(observation.totals.skipped, 3);
  assert.equal(observation.totals.tests, 7);
  assert.deepEqual([observation.totals.conditionalFiles, observation.totals.conditionalNotDemonstrated, observation.totals.filesNotDemonstrated, observation.totals.filesPartial], [1, 1, 1, 1]);
});

test("observe: pré-verificação (sem execução) avalia inventário, integridade e argv e deixa o resto bloqueado", () => {
  const pre = observeUnitSuite(obsInput({ run: null, eventsText: null, testFileDigests: { before: { ...DECLARED }, after: null } }));
  assert.equal(pre.status, "OBSERVATION_INCOMPLETE");
  assert.deepEqual([pre.stages.inventory.status, pre.stages.integrity.status, pre.stages.argv.status], ["OK", "OK", "OK"]);
  assert.deepEqual([pre.stages.run.status, pre.stages.events.status, pre.stages.adapter.status, pre.stages.completeness.status], ["FAIL", "FAIL", "NOT_EVALUATED", "NOT_EVALUATED"]);
});

test("observe: determinístico, ordenado e não altera a entrada", () => {
  const files = ["b/y.test.ts", "a/x.test.ts"];
  const frozen = deepFreeze(obsInput({ manifestText: manifest(files), argv: [...files] }));
  const first = observeUnitSuite(frozen);
  const second = observeUnitSuite(frozen);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.files.map((row) => row.file), ["a/x.test.ts", "b/y.test.ts"], "ordem por unidades de código, independente do manifesto");
});

test("observe: entrada ilegível não lança e nunca vira observação bem-sucedida", () => {
  for (const bad of [null, undefined, 42, "x", [], { manifestText: 1 }, { ...obsInput(), testFileDigests: null }, { ...obsInput(), testFileDigests: "x" }]) {
    const observation = observeUnitSuite(bad as unknown as UnitSuiteObservationInput);
    assert.equal(observation.status, "OBSERVATION_INCOMPLETE", JSON.stringify(bad));
    assert.equal(observation.approval, "NONE");
    assert.equal(observation.files.every((row) => row.candidate === false), true);
  }
  const hostile = new Proxy({}, { get() { throw new Error("boom"); }, has() { throw new Error("boom"); } });
  assert.equal(observeUnitSuite(hostile as unknown as UnitSuiteObservationInput).status, "OBSERVATION_INCOMPLETE");
});

test("observe: classificação de cobertura condicional pelo nome do arquivo", () => {
  assert.equal(isConditionalCoverageFile("apps/api/src/services/apeWeeklyCycleV3BillingCollector.realPostgres.integration.test.ts"), true);
  assert.equal(isConditionalCoverageFile("apps/api/src/services/x.realPostgres.integration.test.tsx"), true);
  assert.equal(isConditionalCoverageFile("apps/api/src/services/apeWeeklyCycleV3BillingCollector.test.ts"), false);
  assert.equal(isConditionalCoverageFile("a/realPostgres.integration.test.ts"), false, "exige o ponto antes de realPostgres");
});
