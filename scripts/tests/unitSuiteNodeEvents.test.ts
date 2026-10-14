import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptNodeEvents,
  parseNdjson,
  validateRecord,
  type AdaptResult,
  type EventCounts,
  type UnitSuiteEventsIssueCode,
} from "../ci/unitSuiteNodeEvents";
import { evaluateUnitSuite, type ExpectedFileBaseline, type RunObservation } from "../ci/unitSuiteVerdict";

const ROOT = "/repo";
const OK_RUN: RunObservation = { exitCode: 0, signal: null, timedOut: false };

type Draft = Record<string, unknown>;

function result(ev: "test:start" | "test:pass" | "test:fail", file: string, name: string, extra: Draft = {}): Draft {
  return {
    v: 1, kind: "event", ev, file: `${ROOT}/${file}`, name, nesting: 0, skip: false, todo: false,
    detailsType: ev === "test:start" ? null : "test", failureType: null, ...extra,
  };
}

function summary(file: string | null, counts: Partial<EventCounts>, success: boolean | null = true): Draft {
  return {
    v: 1, kind: "event", ev: "test:summary", file: file === null ? null : `${ROOT}/${file}`, success,
    counts: { tests: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0, ...counts },
  };
}

/** Numera os rascunhos e envolve com cabeçalho e fim consistentes. */
function stream(drafts: Draft[], opts: { header?: boolean; end?: boolean } = {}): Draft[] {
  const body = drafts.map((draft, index) => ({ ...draft, seq: index + 2 }));
  const records: Draft[] = [];
  if (opts.header !== false) records.push({ v: 1, kind: "header", seq: 1, node: "v22.17.1" });
  records.push(...body);
  if (opts.end !== false) records.push({ v: 1, kind: "end", seq: body.length + 2, events: body.length });
  return records;
}

/** Arquivo íntegro: n testes de nesting 0, resumo coerente. */
function completeFile(file: string, n: number): Draft[] {
  const drafts: Draft[] = [];
  for (let i = 1; i <= n; i += 1) drafts.push(result("test:start", file, `t${i}`), result("test:pass", file, `t${i}`));
  drafts.push(summary(file, { tests: n, passed: n }));
  return drafts;
}

function adapt(drafts: Draft[], opts: Parameters<typeof stream>[1] = {}, cwd?: string): AdaptResult {
  return adaptNodeEvents(stream(drafts, opts), cwd === undefined ? { rootDir: ROOT } : { rootDir: ROOT, cwd });
}

function codes(adapted: AdaptResult): UnitSuiteEventsIssueCode[] {
  return adapted.issues.map((issue) => issue.code);
}

/** Composição exigida do chamador: qualquer issue do fluxo é FAIL; senão decide o verificador. */
function judge(adapted: AdaptResult, expected: ExpectedFileBaseline[], run: RunObservation = OK_RUN) {
  if (adapted.issues.length > 0) return { status: "FAIL" as const, via: "adapter" as const, reasons: [] as string[] };
  const verdict = evaluateUnitSuite({ expected, observed: adapted.observed, run });
  return {
    status: verdict.status, via: "verdict" as const,
    reasons: [...verdict.reasons, ...verdict.files.flatMap((file) => file.reasons)].map((entry) => entry.code.replace("UNIT_SUITE_", "")),
  };
}

// assert.ok sem mensagem pode travar quando falha em arquivos .ts transpilados (o Node relê o fonte para
// montar a mensagem); por isso as asserções de issue sempre passam por assert.equal com mensagem.
function hasIssue(found: readonly string[], code: string, context = ""): void {
  assert.equal(found.includes(code), true, `esperava a issue ${code}${context ? ` (${context})` : ""}; obtido: [${found.join(",")}]`);
}

const expect = (file: string, tests: number, skipped = 0, todo = 0): ExpectedFileBaseline => ({ file, tests, skipped, todo });

test("execução completa: contadores, identidade relativa e aprovação pelo verificador", () => {
  const adapted = adapt(completeFile("a/x.test.ts", 3));
  assert.deepEqual(adapted.issues, []);
  assert.equal(adapted.nodeVersion, "v22.17.1");
  assert.deepEqual(adapted.observed, [{
    file: "a/x.test.ts", started: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0, suiteFailures: 0,
    fileLevelEntries: 0, summaryCount: 1, summary: { tests: 3, passed: 3, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  }]);
  assert.deepEqual(judge(adapted, [expect("a/x.test.ts", 3)]), { status: "PASS", via: "verdict", reasons: [] });
});

test("falha individual: failed=1 e reprovação", () => {
  const drafts = [
    result("test:start", "f.test.ts", "ok"), result("test:pass", "f.test.ts", "ok"),
    result("test:start", "f.test.ts", "bad"), result("test:fail", "f.test.ts", "bad", { failureType: "testCodeFailure" }),
    summary("f.test.ts", { tests: 2, passed: 1, failed: 1 }, false),
  ];
  const adapted = adapt(drafts);
  assert.equal(adapted.observed[0].failed, 1);
  assert.equal(adapted.observed[0].suiteFailures, 0);
  assert.deepEqual(judge(adapted, [expect("f.test.ts", 2)], { exitCode: 1, signal: null, timedOut: false }).reasons, ["RUN_EXIT_NONZERO", "TEST_FAILED"]);
});

test("falha de suite (hookFailed) com rc=0, resumo de sucesso e testes aprovados reprova com SUITE_FAILED", () => {
  const drafts = [
    result("test:start", "s.test.ts", "sa"),
    result("test:start", "s.test.ts", "sa-1", { nesting: 1 }), result("test:pass", "s.test.ts", "sa-1", { nesting: 1 }),
    result("test:start", "s.test.ts", "sa-2", { nesting: 1 }), result("test:pass", "s.test.ts", "sa-2", { nesting: 1 }),
    result("test:fail", "s.test.ts", "sa", { detailsType: "suite", failureType: "hookFailed" }),
    summary("s.test.ts", { tests: 2, passed: 2 }, true),
    summary(null, { tests: 2, passed: 2 }, true),
  ];
  const adapted = adapt(drafts);
  assert.deepEqual(adapted.issues, []);
  assert.deepEqual(adapted.observed[0], {
    file: "s.test.ts", started: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0, suiteFailures: 1,
    fileLevelEntries: 0, summaryCount: 1, summary: { tests: 2, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  });
  assert.deepEqual(judge(adapted, [expect("s.test.ts", 2)], OK_RUN), { status: "FAIL", via: "verdict", reasons: ["SUITE_FAILED"] });
});

test("suite que passa não conta como teste e seu início é descontado de started", () => {
  const drafts = [
    result("test:start", "n.test.ts", "suite"),
    result("test:start", "n.test.ts", "it", { nesting: 1 }), result("test:pass", "n.test.ts", "it", { nesting: 1 }),
    result("test:pass", "n.test.ts", "suite", { detailsType: "suite" }),
    summary("n.test.ts", { tests: 1, passed: 1 }),
  ];
  const adapted = adapt(drafts);
  assert.deepEqual([adapted.observed[0].started, adapted.observed[0].passed, adapted.observed[0].suiteFailures], [1, 1, 0]);
  assert.equal(judge(adapted, [expect("n.test.ts", 1)]).status, "PASS");
});

test("skip, todo, skip+todo e todo que falha seguem a contagem do Node", () => {
  const f = "k.test.ts";
  const drafts = [
    result("test:start", f, "normal"), result("test:pass", f, "normal"),
    result("test:start", f, "skip"), result("test:pass", f, "skip", { skip: true }),
    result("test:start", f, "todo"), result("test:pass", f, "todo", { todo: true }),
    result("test:start", f, "todo-fails"), result("test:fail", f, "todo-fails", { todo: true, failureType: "testCodeFailure" }),
    result("test:start", f, "skip-and-todo"), result("test:pass", f, "skip-and-todo", { skip: true }),
    summary(f, { tests: 5, passed: 1, skipped: 2, todo: 2 }),
  ];
  const adapted = adapt(drafts);
  const o = adapted.observed[0];
  assert.deepEqual([o.passed, o.failed, o.skipped, o.todo], [5, 0, 2, 2], "todo que falha = passed + todo (política vigente)");
  assert.equal(judge(adapted, [expect(f, 5, 2, 2)]).status, "PASS");
  assert.deepEqual(judge(adapted, [expect(f, 5, 0, 0)]).reasons, ["SKIP_MISMATCH", "TODO_MISMATCH"], "skip e todo não declarados reprovam");
});

test("cancelamento: test:fail com cancelledByParent vira cancelled, não failed", () => {
  const f = "c.test.ts";
  const drafts = [
    result("test:start", f, "parent"), result("test:start", f, "child", { nesting: 1 }),
    result("test:fail", f, "child", { nesting: 1, failureType: "cancelledByParent" }),
    result("test:fail", f, "parent", { failureType: "subtestsFailed" }),
    summary(f, { tests: 2, failed: 1, cancelled: 1 }, false),
  ];
  const adapted = adapt(drafts);
  assert.deepEqual([adapted.observed[0].failed, adapted.observed[0].cancelled], [1, 1]);
  assert.deepEqual(judge(adapted, [expect(f, 2)]).reasons, ["FILE_CANCELLED", "TEST_FAILED"]);
});

test("nomes repetidos, em qualquer nível, são contados individualmente e não reprovam", () => {
  const f = "d.test.ts";
  const drafts = [
    ...["same", "same", "same"].flatMap((name) => [result("test:start", f, name), result("test:pass", f, name)]),
    result("test:start", f, "p"),
    ...["same", "same"].flatMap((name) => [result("test:start", f, name, { nesting: 1 }), result("test:pass", f, name, { nesting: 1 })]),
    result("test:pass", f, "p"),
    summary(f, { tests: 6, passed: 6 }),
  ];
  const adapted = adapt(drafts);
  assert.equal(adapted.observed[0].passed, 6);
  assert.equal(judge(adapted, [expect(f, 6)]).status, "PASS");
});

test("item de arquivo (nome = caminho absoluto, relativo ao cwd ou ./relativo) vira fileLevelEntries", () => {
  for (const name of [`${ROOT}/e/x.test.ts`, "e/x.test.ts", "./e/x.test.ts"]) {
    const drafts = [result("test:start", "e/x.test.ts", name), result("test:pass", "e/x.test.ts", name), summary(null, { tests: 1, passed: 1 })];
    const adapted = adapt(drafts);
    assert.deepEqual(adapted.issues, []);
    assert.deepEqual([adapted.observed[0].fileLevelEntries, adapted.observed[0].started, adapted.observed[0].passed, adapted.observed[0].summaryCount], [1, 0, 0, 0], name);
    assert.deepEqual(judge(adapted, [expect("e/x.test.ts", 2)]).reasons, ["FILE_LEVEL_ENTRY", "SUMMARY_MISSING", "COUNT_BELOW_EXPECTED"], name);
    assert.equal(adapted.globalSummaries, 1, "o resumo global não vira resumo do arquivo");
  }
});

test("item de arquivo com falha (erro de carga ou hook global) também é fileLevelEntries", () => {
  const drafts = [
    result("test:start", "l.test.ts", "l.test.ts"), result("test:fail", "l.test.ts", "l.test.ts", { failureType: "testCodeFailure" }),
    summary(null, { tests: 1, failed: 1 }, false),
  ];
  const adapted = adapt(drafts);
  assert.equal(adapted.observed[0].fileLevelEntries, 1);
  assert.equal(adapted.observed[0].failed, 0);
  assert.equal(judge(adapted, [expect("l.test.ts", 2)], { exitCode: 1, signal: null, timedOut: false }).status, "FAIL");
});

test("o cwd distingue o nome relativo: cwd diferente da raiz", () => {
  const drafts = [result("test:start", "pkg/y.test.ts", "y.test.ts"), result("test:pass", "pkg/y.test.ts", "y.test.ts")];
  assert.equal(adapt(drafts, {}, `${ROOT}/pkg`).observed[0].fileLevelEntries, 1);
  assert.equal(adapt(drafts).observed[0].fileLevelEntries, 0, "sem o cwd correto o nome é só um teste (e a contagem reprova)");
});

test("resumo por arquivo ausente ou duplicado reprova; o global nunca substitui o do arquivo", () => {
  const missing = adapt([...completeFile("m.test.ts", 2).slice(0, -1), summary(null, { tests: 2, passed: 2 })]);
  assert.equal(missing.observed[0].summaryCount, 0);
  assert.deepEqual(judge(missing, [expect("m.test.ts", 2)]).reasons, ["SUMMARY_MISSING"]);

  const duplicated = adapt([...completeFile("m.test.ts", 2), summary("m.test.ts", { tests: 2, passed: 2 })]);
  assert.equal(duplicated.observed[0].summaryCount, 2);
  assert.deepEqual(judge(duplicated, [expect("m.test.ts", 2)]).reasons, ["SUMMARY_DUPLICATE"]);
});

test("eventos incompletos: perda de resultados reprova pela contagem e pelo início sem resultado", () => {
  const truncated = adapt(completeFile("i.test.ts", 5).filter((draft, index) => index !== 3 && index !== 5));
  assert.deepEqual(judge(truncated, [expect("i.test.ts", 5)]).reasons, ["START_RESULT_MISMATCH", "SUMMARY_COUNT_MISMATCH", "COUNT_BELOW_EXPECTED"]);
  const noSummary = adapt(completeFile("i.test.ts", 5).slice(0, -1).slice(0, 7));
  assert.equal(judge(noSummary, [expect("i.test.ts", 5)]).status, "FAIL");
});

test("vários arquivos intercalados: cada arquivo é avaliado de forma independente e a ordem não importa", () => {
  const a = completeFile("a.test.ts", 3);
  const b = [
    result("test:start", "b.test.ts", "x"), result("test:fail", "b.test.ts", "x", { failureType: "testCodeFailure" }),
    summary("b.test.ts", { tests: 1, failed: 1 }, false),
  ];
  const c = [result("test:start", "c.test.ts", "c.test.ts"), result("test:pass", "c.test.ts", "c.test.ts")];
  const interleaved: Draft[] = [];
  const queues = [a, b, c].map((queue) => [...queue]);
  while (queues.some((queue) => queue.length > 0)) for (const queue of queues) { const next = queue.shift(); if (next) interleaved.push(next); }
  const sequential = adapt([...completeFile("a.test.ts", 3), ...b, ...c]);
  const mixed = adapt(interleaved);
  assert.deepEqual(mixed.observed, sequential.observed);
  assert.deepEqual(mixed.observed.map((o) => o.file), ["a.test.ts", "b.test.ts", "c.test.ts"]);
  const expected = [expect("a.test.ts", 3), expect("b.test.ts", 1), expect("c.test.ts", 2)];
  const verdict = evaluateUnitSuite({ expected, observed: mixed.observed, run: { exitCode: 1, signal: null, timedOut: false } });
  assert.deepEqual(verdict.files.map((file) => [file.file, file.status]), [["a.test.ts", "PASS"], ["b.test.ts", "FAIL"], ["c.test.ts", "FAIL"]]);
});

test("identidade vem só de eventos de teste e resumo: arquivo fora da raiz é issue", () => {
  const outside = adaptNodeEvents(stream([{ ...result("test:start", "x", "t"), file: "/other/x.test.ts" }]), { rootDir: ROOT });
  hasIssue(codes(outside), "UNIT_SUITE_EVENTS_FILE_OUTSIDE_ROOT");
  assert.deepEqual(outside.observed, []);
  const dotdot = adaptNodeEvents(stream([{ ...result("test:start", "x", "t"), file: `${ROOT}/a/../x.test.ts` }]), { rootDir: ROOT });
  hasIssue(codes(dotdot), "UNIT_SUITE_EVENTS_FILE_OUTSIDE_ROOT");
});

test("eventos essenciais desconhecidos, campos inválidos e chaves extras são rejeitados", () => {
  const bad: Draft[] = [
    { v: 1, kind: "event", ev: "test:stderr", file: "x", message: "m" },
    { ...result("test:pass", "a.test.ts", "t"), extra: 1 },
    { ...result("test:pass", "a.test.ts", "t"), nesting: -1 },
    { ...result("test:pass", "a.test.ts", "t"), file: null },
    { ...result("test:pass", "a.test.ts", "t"), skip: "yes" },
    { ...result("test:pass", "a.test.ts", "t"), detailsType: "other" },
    summary("a.test.ts", { tests: 1.5 }),
    { ...summary("a.test.ts", {}), counts: { tests: 1 } },
    { ...result("test:pass", "a.test.ts", "t"), v: 2 },
    { kind: "end", v: 1, events: "3" },
  ];
  for (const draft of bad) {
    assert.equal(validateRecord({ ...draft, seq: 2 }), null, JSON.stringify(draft));
    hasIssue(codes(adapt([draft])), "UNIT_SUITE_EVENTS_RECORD_INVALID", JSON.stringify(draft));
  }
  assert.notEqual(validateRecord({ ...result("test:pass", "a.test.ts", "t"), seq: 2 }), null);
});

test("integridade do fluxo: fim ausente, contagem do fim, lacuna, duplicata, registros após o fim e cabeçalho", () => {
  const body = completeFile("w.test.ts", 2);
  hasIssue(codes(adapt(body, { end: false })), "UNIT_SUITE_EVENTS_END_MISSING");
  hasIssue(codes(adapt(body, { header: false })), "UNIT_SUITE_EVENTS_HEADER_MISSING");

  const full = stream(body);
  const end = full[full.length - 1];
  hasIssue(codes(adaptNodeEvents([...full.slice(0, -1), { ...end, events: (end.events as number) + 1 }], { rootDir: ROOT })), "UNIT_SUITE_EVENTS_END_COUNT_MISMATCH");

  const gap = full.filter((_, index) => index !== 3);
  hasIssue(codes(adaptNodeEvents(gap, { rootDir: ROOT })), "UNIT_SUITE_EVENTS_SEQUENCE_GAP");

  const duplicate = [...full.slice(0, 4), full[3], ...full.slice(4)];
  hasIssue(codes(adaptNodeEvents(duplicate, { rootDir: ROOT })), "UNIT_SUITE_EVENTS_SEQUENCE_DUPLICATE");

  const afterEnd = [...full, { ...result("test:start", "w.test.ts", "late"), seq: full.length + 1 }];
  hasIssue(codes(adaptNodeEvents(afterEnd, { rootDir: ROOT })), "UNIT_SUITE_EVENTS_AFTER_END");

  const twoHeaders = [full[0], { ...full[0], seq: 2 }, ...full.slice(1).map((record) => ({ ...record, seq: (record.seq as number) + 1 }))];
  hasIssue(codes(adaptNodeEvents(twoHeaders, { rootDir: ROOT })), "UNIT_SUITE_EVENTS_HEADER_MISPLACED");

  for (const broken of [adapt(body, { end: false }), adaptNodeEvents(gap, { rootDir: ROOT })]) {
    assert.equal(judge(broken, [expect("w.test.ts", 2)]).via, "adapter", "issue do fluxo é FAIL sem consultar o verificador");
  }
});

test("fluxo vazio, sem eventos, ou opções inválidas: nunca presume sucesso", () => {
  hasIssue(codes(adaptNodeEvents([], { rootDir: ROOT })), "UNIT_SUITE_EVENTS_END_MISSING");
  hasIssue(codes(adaptNodeEvents([], { rootDir: ROOT })), "UNIT_SUITE_EVENTS_NO_EVENTS");
  hasIssue(codes(adapt([])), "UNIT_SUITE_EVENTS_NO_EVENTS");
  for (const options of [{ rootDir: "relative" }, { rootDir: "/repo/" }, { rootDir: "/repo/../x" }, { rootDir: ROOT, cwd: "x" }, {}] as Array<{ rootDir: string; cwd?: string }>) {
    assert.deepEqual(codes(adaptNodeEvents(stream(completeFile("a.test.ts", 1)), options)), ["UNIT_SUITE_EVENTS_OPTIONS_INVALID"]);
  }
  assert.deepEqual(codes(adaptNodeEvents("nope" as unknown as unknown[], { rootDir: ROOT })), ["UNIT_SUITE_EVENTS_OPTIONS_INVALID"]);
});

test("mais resultados de suite do que inícios é inconsistência explícita", () => {
  const adapted = adapt([result("test:pass", "u.test.ts", "suite", { detailsType: "suite" }), summary("u.test.ts", {})]);
  hasIssue(codes(adapted), "UNIT_SUITE_EVENTS_START_UNDERFLOW");
});

test("parseNdjson: linhas vazias são ignoradas; linha corrompida ou que não é objeto vira issue", () => {
  const good = JSON.stringify({ a: 1 });
  const parsed = parseNdjson(`${good}\n\n{"truncated":\n[1,2]\n${good}\n`);
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.issues.map((issue) => [issue.code, issue.line]), [["UNIT_SUITE_EVENTS_LINE_NOT_JSON", 3], ["UNIT_SUITE_EVENTS_LINE_NOT_JSON", 4]]);
  assert.equal(parseNdjson(undefined as unknown as string).issues.length, 1);
});

test("função pura: não altera a entrada e é determinística", () => {
  const records = stream(completeFile("p.test.ts", 2));
  const snapshot = JSON.stringify(records);
  const first = adaptNodeEvents(records, { rootDir: ROOT });
  const second = adaptNodeEvents(records, { rootDir: ROOT });
  assert.equal(JSON.stringify(records), snapshot);
  assert.deepEqual(first, second);
});
