import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import unitSuiteReporter, { EVENTS_FILE_ENV, serializeEvent } from "../ci/unitSuiteReporter.mjs";
import { adaptNodeEvents, parseNdjson, validateRecord, type AdaptResult } from "../ci/unitSuiteNodeEvents";
import { evaluateUnitSuite, type ExpectedFileBaseline } from "../ci/unitSuiteVerdict";

const REPORTER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../ci/unitSuiteReporter.mjs");

// ---------------------------------------------------------------------------------------------
// Serialização (unidade, sem processos)
// ---------------------------------------------------------------------------------------------

test("serializeEvent grava apenas start/pass/fail/summary e descarta o resto", () => {
  for (const type of ["test:stdout", "test:stderr", "test:diagnostic", "test:enqueue", "test:dequeue", "test:complete", "test:plan", "test:coverage", "test:watch:drained", "unknown"]) {
    assert.equal(serializeEvent({ type, data: { file: "/x.test.ts", message: "m" } }, 2), null, type);
  }
  assert.equal(serializeEvent(undefined as never, 2), null);
});

test("serializeEvent reduz os campos e nunca guarda mensagem de erro nem motivo de skip", () => {
  const pass = serializeEvent({ type: "test:pass", data: { file: "/r/a.test.ts", name: "t", nesting: 1, skip: "motivo secreto", todo: undefined, details: { type: "suite", duration_ms: 3 } } }, 7);
  assert.deepEqual(pass, {
    v: 1, kind: "event", seq: 7, ev: "test:pass", file: "/r/a.test.ts", name: "t", nesting: 1,
    skip: true, todo: false, detailsType: "suite", failureType: null,
  });
  const fail = serializeEvent({ type: "test:fail", data: { file: "/r/a.test.ts", name: "t", nesting: 0, todo: true, details: { type: "test", error: { failureType: "cancelledByParent", message: "stack secreto" } } } }, 8);
  assert.equal(fail?.kind === "event" && "failureType" in fail ? fail.failureType : null, "cancelledByParent");
  assert.equal(JSON.stringify(fail).includes("secreto"), false, "mensagem de erro não pode vazar para o artefato");
});

test("serializeEvent preserva resumo do arquivo e global; valores inesperados viram null e o adaptador os rejeita", () => {
  const file = serializeEvent({ type: "test:summary", data: { file: "/r/a.test.ts", success: true, counts: { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0, topLevel: 2, suites: 0 } } }, 3);
  assert.deepEqual(file && "counts" in file ? file.counts : null, { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 }, "campos extras do Node não vazam");
  const global = serializeEvent({ type: "test:summary", data: { counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } } }, 4);
  assert.equal(global && "file" in global ? global.file : "x", null);

  const noFile = serializeEvent({ type: "test:pass", data: { name: "t", nesting: 0 } }, 5);
  assert.equal(noFile && "file" in noFile ? noFile.file : "x", null);
  assert.equal(validateRecord(noFile), null, "evento de teste sem arquivo é inválido para o adaptador");
  const brokenSummary = serializeEvent({ type: "test:summary", data: { file: "/r/a.test.ts", counts: { tests: "2" } } }, 6);
  assert.equal(validateRecord(brokenSummary), null);
});

// ---------------------------------------------------------------------------------------------
// Reporter (arquivo de saída, falhas de configuração) com fonte sintética
// ---------------------------------------------------------------------------------------------

let workDir = "";
let counter = 0;

before(() => {
  workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "eiah-unit-suite-reporter-")));
});
after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function nextEventsFile(): string {
  counter += 1;
  return path.join(workDir, `events-${counter}.ndjson`);
}

async function* source(events: unknown[], failWith?: Error) {
  for (const event of events) yield event;
  if (failWith) throw failWith;
}

async function drain(iterable: AsyncGenerator<unknown>) {
  for await (const _ of iterable) void _;
}

async function withEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env[EVENTS_FILE_ENV];
  if (value === undefined) delete process.env[EVENTS_FILE_ENV];
  else process.env[EVENTS_FILE_ENV] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[EVENTS_FILE_ENV];
    else process.env[EVENTS_FILE_ENV] = previous;
  }
}

test("o reporter grava cabeçalho, eventos e fim, sem emitir nada no stdout do runner", async () => {
  const target = nextEventsFile();
  const events = [
    { type: "test:enqueue", data: { file: `${workDir}/a.test.ts` } },
    { type: "test:start", data: { file: `${workDir}/a.test.ts`, name: "t", nesting: 0 } },
    { type: "test:stdout", data: { file: "a.test.ts", message: "ruído" } },
    { type: "test:pass", data: { file: `${workDir}/a.test.ts`, name: "t", nesting: 0, details: { type: "test" } } },
    { type: "test:summary", data: { file: `${workDir}/a.test.ts`, success: true, counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } } },
  ];
  const yielded: unknown[] = [];
  await withEnv(target, async () => { for await (const chunk of unitSuiteReporter(source(events))) yielded.push(chunk); });
  assert.deepEqual(yielded, []);
  const parsed = parseNdjson(fs.readFileSync(target, "utf8"));
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.records.map((record) => (record as { kind: string; ev?: string }).ev ?? (record as { kind: string }).kind), ["header", "test:start", "test:pass", "test:summary", "end"]);
  const adapted = adaptNodeEvents(parsed.records, { rootDir: workDir });
  assert.deepEqual(adapted.issues, []);
  assert.equal(adapted.observed[0].file, "a.test.ts");
});

test("sem a variável de ambiente, ou com arquivo já existente, o reporter lança erro e não altera o arquivo", async () => {
  await withEnv(undefined, async () => { await assert.rejects(drain(unitSuiteReporter(source([]))), /UNIT_SUITE_EVENTS_FILE/); });
  await withEnv("", async () => { await assert.rejects(drain(unitSuiteReporter(source([]))), /UNIT_SUITE_EVENTS_FILE/); });
  const existing = nextEventsFile();
  fs.writeFileSync(existing, "artefato anterior\n");
  await withEnv(existing, async () => { await assert.rejects(drain(unitSuiteReporter(source([]))), /EEXIST/); });
  assert.equal(fs.readFileSync(existing, "utf8"), "artefato anterior\n");
});

test("se a fonte falha no meio, o fim não é gravado e o adaptador acusa fluxo incompleto", async () => {
  const target = nextEventsFile();
  const file = `${workDir}/b.test.ts`;
  await withEnv(target, async () => {
    await assert.rejects(drain(unitSuiteReporter(source([
      { type: "test:start", data: { file, name: "t", nesting: 0 } },
      { type: "test:pass", data: { file, name: "t", nesting: 0, details: { type: "test" } } },
    ], new Error("fonte interrompida")))), /fonte interrompida/);
  });
  const parsed = parseNdjson(fs.readFileSync(target, "utf8"));
  const adapted = adaptNodeEvents(parsed.records, { rootDir: workDir });
  assert.equal(adapted.issues.some((issue) => issue.code === "UNIT_SUITE_EVENTS_END_MISSING"), true, "esperava END_MISSING");
});

// ---------------------------------------------------------------------------------------------
// Execuções reais de node:test (fixtures descartáveis, sem rede nem serviços externos)
// ---------------------------------------------------------------------------------------------

const FIXTURES: Record<string, string> = {
  "ok.test.mjs": `import test from "node:test";\nfor (let i = 1; i <= 5; i++) test(\`ok \${i}\`, () => {});\n`,
  "fail.test.mjs": `import test from "node:test"; import assert from "node:assert/strict";\nfor (let i = 1; i <= 4; i++) test(\`p \${i}\`, () => {});\ntest("boom", () => assert.equal(1, 2));\n`,
  "suite_after_fail.test.mjs": `import { describe, it, after } from "node:test";\ndescribe("sa", () => { after(() => { throw new Error("after da suite falhou"); }); it("sa-1", () => {}); it("sa-2", () => {}); });\n`,
  "skip.test.mjs": `import test from "node:test";\ntest("normal", () => {});\ntest("skip-opt", { skip: true }, () => {});\ntest("skip-ctx", (t) => { t.skip("runtime"); });\n`,
  "todo.test.mjs": `import test from "node:test";\ntest("normal", () => {});\ntest("todo-opt", { todo: true }, () => {});\ntest("todo-fails", { todo: true }, () => { throw new Error("todo que falha"); });\ntest("skip-and-todo", { skip: true, todo: true }, () => {});\n`,
  "cancel.test.mjs": `import test from "node:test";\ntest("a", () => {});\ntest("never-settles", () => new Promise(() => {}));\ntest("c", () => {});\n`,
  "nested.test.mjs": `import test, { describe, it } from "node:test";\ntest("top", async (t) => { await t.test("sub1", () => {}); await t.test("sub2", async (t2) => { await t2.test("subsub", () => {}); }); });\ndescribe("suite", () => { it("it1", () => {}); it("it2", () => {}); describe("inner", () => { it("it3", () => {}); }); });\ntest("last", () => {});\n`,
  "dupnames.test.mjs": `import test from "node:test";\ntest("same", () => {}); test("same", () => {}); test("same", () => {});\ntest("p", async (t) => { await t.test("same", () => {}); await t.test("same", () => {}); });\n`,
  "empty.test.mjs": `import test from "node:test"; void test;\n`,
  "exit0_mid.test.mjs": `import test from "node:test";\nfor (let i = 1; i <= 10; i++) test(\`t\${i}\`, () => { if (i === 5) process.exit(0); });\n`,
  "exit0_top.test.mjs": `import test from "node:test";\ntest("t1", () => {}); test("t2", () => {}); process.exit(0);\n`,
  "throw_load.test.mjs": `import test from "node:test"; void test;\nthrow new Error("falha ao carregar");\n`,
  "sub/dir/deep.test.mjs": `import test from "node:test";\ntest("d1", () => {}); test("d2", () => {});\n`,
  "big.test.mjs": `import test from "node:test";\nfor (let i = 1; i <= 300; i++) test(\`b\${i}\`, () => {});\n`,
};

before(() => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    const target = path.join(workDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
});

type Run = {
  rc: number | null;
  signal: string | null;
  adapted: AdaptResult;
  verdict: ReturnType<typeof evaluateUnitSuite>;
  /** FAIL se houver issue do fluxo; senão o status do verificador. */
  status: "PASS" | "FAIL";
  reasons: string[];
};

function runNodeTest(files: string[], baseline: ExpectedFileBaseline[], nodeArgs: string[] = []): Run {
  const eventsFile = nextEventsFile();
  const env: NodeJS.ProcessEnv = { ...process.env, [EVENTS_FILE_ENV]: eventsFile };
  delete env.NODE_TEST_CONTEXT; // um node --test aninhado herdaria o modo "filho" deste processo
  const child = spawnSync(process.execPath, ["--test", `--test-reporter=${REPORTER}`, ...nodeArgs, ...files], {
    cwd: workDir, env, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL",
  });
  const text = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, "utf8") : "";
  const parsed = parseNdjson(text);
  const adapted = adaptNodeEvents(parsed.records, { rootDir: workDir });
  const issues = [...parsed.issues, ...adapted.issues];
  const verdict = evaluateUnitSuite({
    expected: baseline,
    observed: adapted.observed,
    run: { exitCode: child.status, signal: child.signal, timedOut: false },
  });
  const status = issues.length > 0 ? "FAIL" : verdict.status;
  const reasons = [...issues.map((issue) => issue.code), ...verdict.reasons.map((entry) => entry.code), ...verdict.files.flatMap((file) => file.reasons.map((entry) => entry.code))]
    .map((code) => code.replace("UNIT_SUITE_", ""));
  return { rc: child.status, signal: child.signal, adapted, verdict, status, reasons };
}

const want = (file: string, tests: number, skipped = 0, todo = 0): ExpectedFileBaseline => ({ file, tests, skipped, todo });

test("e2e: execução completa e nomes repetidos/aninhados/suites aprovam", () => {
  assert.deepEqual(runNodeTest(["ok.test.mjs"], [want("ok.test.mjs", 5)]).reasons, []);
  const nested = runNodeTest(["nested.test.mjs"], [want("nested.test.mjs", 8)]);
  assert.equal(nested.status, "PASS");
  assert.equal(nested.adapted.observed[0].suiteFailures, 0);
  assert.equal(runNodeTest(["dupnames.test.mjs"], [want("dupnames.test.mjs", 6)]).status, "PASS");
});

test("e2e: falha individual reprova", () => {
  const run = runNodeTest(["fail.test.mjs"], [want("fail.test.mjs", 5)]);
  assert.equal(run.status, "FAIL");
  assert.equal(run.rc, 1);
  assert.deepEqual(run.reasons, ["RUN_EXIT_NONZERO", "TEST_FAILED"]);
});

test("e2e: falha de hook em describe() com testes aprovados e resumo de sucesso reprova por SUITE_FAILED", () => {
  const run = runNodeTest(["suite_after_fail.test.mjs"], [want("suite_after_fail.test.mjs", 2)]);
  const observed = run.adapted.observed[0];
  assert.deepEqual([observed.passed, observed.failed, observed.suiteFailures], [2, 0, 1]);
  assert.equal(observed.summary?.failed, 0, "o resumo do Node não conta a falha de suite");
  assert.equal(run.status, "FAIL");
  assert.deepEqual(run.reasons, ["SUITE_FAILED"]);
  if (process.version === "v22.17.1") assert.equal(run.rc, 0, "no Node v22.17.1 o processo sai com código 0 apesar da falha");
});

test("e2e: skip e todo precisam estar declarados; todo que falha segue a política vigente (todo)", () => {
  assert.equal(runNodeTest(["skip.test.mjs"], [want("skip.test.mjs", 3, 2)]).status, "PASS");
  assert.deepEqual(runNodeTest(["skip.test.mjs"], [want("skip.test.mjs", 3, 0)]).reasons, ["SKIP_MISMATCH"]);
  const todo = runNodeTest(["todo.test.mjs"], [want("todo.test.mjs", 4, 1, 2)]);
  assert.equal(todo.status, "PASS");
  assert.equal(todo.rc, 0);
  assert.deepEqual(runNodeTest(["todo.test.mjs"], [want("todo.test.mjs", 4, 1, 0)]).reasons, ["TODO_MISMATCH"]);
});

test("e2e: cancelamento reprova", () => {
  const run = runNodeTest(["cancel.test.mjs"], [want("cancel.test.mjs", 3)]);
  assert.equal(run.status, "FAIL");
  assert.deepEqual(run.reasons, ["RUN_EXIT_NONZERO", "FILE_CANCELLED"]);
});

test("e2e: arquivo vazio, process.exit(0) prematuro e erro de carga reprovam como item de arquivo sem resumo", () => {
  for (const [file, tests, rc] of [["empty.test.mjs", 3, 0], ["exit0_mid.test.mjs", 10, 0], ["exit0_top.test.mjs", 2, 0], ["throw_load.test.mjs", 2, 1]] as const) {
    const run = runNodeTest([file], [want(file, tests)]);
    assert.equal(run.status, "FAIL", file);
    assert.equal(run.rc, rc, file);
    assert.equal(run.reasons.includes("FILE_LEVEL_ENTRY") && run.reasons.includes("SUMMARY_MISSING") && run.reasons.includes("COUNT_BELOW_EXPECTED"), true, `${file}: ${run.reasons.join(",")}`);
    assert.equal(run.adapted.observed[0].file, file);
  }
});

test("e2e: identidade relativa e absoluta do arquivo é a mesma (caminho relativo à raiz)", () => {
  const relative = runNodeTest(["sub/dir/deep.test.mjs"], [want("sub/dir/deep.test.mjs", 2)]);
  const absolute = runNodeTest([path.join(workDir, "sub/dir/deep.test.mjs")], [want("sub/dir/deep.test.mjs", 2)]);
  for (const run of [relative, absolute]) {
    assert.equal(run.status, "PASS", run.reasons.join(","));
    assert.deepEqual(run.adapted.observed.map((entry) => entry.file), ["sub/dir/deep.test.mjs"]);
  }
});

test("e2e: o item de arquivo prematuro é reconhecido também em subdiretório, com caminho relativo e absoluto", () => {
  fs.writeFileSync(path.join(workDir, "sub/dir/exit0.test.mjs"), FIXTURES["exit0_top.test.mjs"]);
  for (const arg of ["sub/dir/exit0.test.mjs", path.join(workDir, "sub/dir/exit0.test.mjs")]) {
    const run = runNodeTest([arg], [want("sub/dir/exit0.test.mjs", 2)]);
    assert.equal(run.status, "FAIL", arg);
    assert.equal(run.reasons.includes("FILE_LEVEL_ENTRY"), true, `${arg}: ${run.reasons.join(",")}`);
  }
});

test("e2e: vários arquivos na mesma execução são avaliados individualmente", () => {
  const files = ["ok.test.mjs", "fail.test.mjs", "skip.test.mjs", "nested.test.mjs", "exit0_mid.test.mjs", "dupnames.test.mjs", "suite_after_fail.test.mjs"];
  const run = runNodeTest(files, [
    want("ok.test.mjs", 5), want("fail.test.mjs", 5), want("skip.test.mjs", 3, 2), want("nested.test.mjs", 8),
    want("exit0_mid.test.mjs", 10), want("dupnames.test.mjs", 6), want("suite_after_fail.test.mjs", 2),
  ]);
  assert.deepEqual(run.adapted.issues, []);
  assert.equal(run.status, "FAIL");
  const byFile = Object.fromEntries(run.verdict.files.map((entry) => [entry.file, entry.status]));
  assert.deepEqual(byFile, {
    "dupnames.test.mjs": "PASS", "exit0_mid.test.mjs": "FAIL", "fail.test.mjs": "FAIL", "nested.test.mjs": "PASS",
    "ok.test.mjs": "PASS", "skip.test.mjs": "PASS", "suite_after_fail.test.mjs": "FAIL",
  });
  assert.equal(run.adapted.globalSummaries, 1);
});

test("e2e: arquivo esperado que não foi passado ao runner e arquivo inesperado reprovam", () => {
  const missing = runNodeTest(["ok.test.mjs"], [want("ok.test.mjs", 5), want("dupnames.test.mjs", 6)]);
  assert.equal(missing.status, "FAIL");
  assert.deepEqual(missing.reasons, ["FILE_NOT_STARTED"]);
  const extra = runNodeTest(["ok.test.mjs", "dupnames.test.mjs"], [want("ok.test.mjs", 5)]);
  assert.equal(extra.status, "FAIL");
  assert.deepEqual(extra.reasons, ["UNEXPECTED_FILE"]);
});

test("e2e: reporter sem variável de ambiente derruba a execução (fail-closed)", () => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env[EVENTS_FILE_ENV];
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--test", `--test-reporter=${REPORTER}`, "ok.test.mjs"], { cwd: workDir, env, encoding: "utf8", timeout: 60_000 });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /UNIT_SUITE_EVENTS_FILE/);
});

test("e2e: sob --test-force-exit nenhuma execução incompleta é aprovada", () => {
  const outcomes = { pass: 0, fail: 0, truncated: 0 };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const run = runNodeTest(["big.test.mjs", "ok.test.mjs"], [want("big.test.mjs", 300), want("ok.test.mjs", 5)], ["--test-force-exit"]);
    const big = run.adapted.observed.find((entry) => entry.file === "big.test.mjs");
    const complete = big !== undefined && big.passed === 300 && big.summaryCount === 1 && run.adapted.issues.length === 0;
    if (run.status === "PASS") {
      assert.equal(complete, true, `PASS indevido: recebidos ${big ? big.passed : "n/a"}`);
      outcomes.pass += 1;
    } else {
      outcomes.fail += 1;
      if (!complete) outcomes.truncated += 1;
      assert.equal(run.reasons.length > 0, true, "FAIL sem motivo");
    }
  }
  assert.equal(outcomes.pass + outcomes.fail, 12);
  // `truncated` é informativo: a perda é intermitente, o que se afirma é que nunca aprova.
});
