import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateUnitSuite,
  UNIT_SUITE_REASON_CODES,
  UNIT_SUITE_VERDICT_VERSION,
  type ExpectedFileBaseline,
  type ObservedFile,
  type RunObservation,
  type UnitSuiteVerdict,
  type UnitSuiteVerdictInput,
} from "../ci/unitSuiteVerdict";

const OK_RUN: RunObservation = { exitCode: 0, signal: null, timedOut: false };

/** Observação de um arquivo que concluiu normalmente: `tests` resultados, resumo coerente. */
function complete(file: string, tests: number, extra: { skipped?: number; todo?: number } = {}): ObservedFile {
  const skipped = extra.skipped ?? 0;
  const todo = extra.todo ?? 0;
  return {
    file,
    started: tests,
    passed: tests,
    failed: 0,
    cancelled: 0,
    skipped,
    todo,
    suiteFailures: 0,
    fileLevelEntries: 0,
    summaryCount: 1,
    summary: { tests, passed: tests - skipped - todo, failed: 0, cancelled: 0, skipped, todo },
  };
}

function expectation(file: string, tests: number, skipped = 0, todo?: number): ExpectedFileBaseline {
  return todo === undefined ? { file, tests, skipped } : { file, tests, skipped, todo };
}

function input(overrides: Partial<UnitSuiteVerdictInput> = {}): UnitSuiteVerdictInput {
  return {
    expected: [expectation("a.test.ts", 30), expectation("b.test.ts", 5, 1)],
    observed: [complete("a.test.ts", 30), complete("b.test.ts", 5, { skipped: 1 })],
    run: OK_RUN,
    ...overrides,
  };
}

function codesOf(verdict: UnitSuiteVerdict, file: string): string[] {
  const item = verdict.files.find((entry) => entry.file === file);
  assert.ok(item, `arquivo ${file} ausente do veredito`);
  return item.reasons.map((entry) => entry.code);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("execução completa e concordante é aprovada", () => {
  const verdict = evaluateUnitSuite(input());
  assert.equal(verdict.version, UNIT_SUITE_VERDICT_VERSION);
  assert.equal(verdict.status, "PASS");
  assert.deepEqual(verdict.reasons, []);
  assert.deepEqual(verdict.files.map((entry) => [entry.file, entry.status]), [["a.test.ts", "PASS"], ["b.test.ts", "PASS"]]);
  assert.deepEqual(verdict.unexpectedFiles, []);
});

test("rc=0 com contagem incompleta reprova (perda observada sob --test-force-exit)", () => {
  const truncated: ObservedFile = { ...complete("a.test.ts", 30), started: 21, passed: 21, summaryCount: 0, summary: null };
  const verdict = evaluateUnitSuite(input({ observed: [truncated, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(verdict.reasons, [], "o código de saída 0 não é motivo; a reprovação vem do arquivo");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_SUMMARY_MISSING", "UNIT_SUITE_COUNT_BELOW_EXPECTED"]);
  assert.deepEqual(verdict.files[0].reasons[1].detail, { expected: 30, received: 21 });
  assert.equal(verdict.files[1].status, "PASS");
});

test("contagem truncada mas com resumo coerente com os eventos ainda reprova pela contagem esperada", () => {
  const consistentButShort: ObservedFile = {
    ...complete("a.test.ts", 30), started: 24, passed: 24, summary: { tests: 24, passed: 24, failed: 0, cancelled: 0, skipped: 0, todo: 0 },
  };
  const verdict = evaluateUnitSuite(input({ observed: [consistentButShort, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_COUNT_BELOW_EXPECTED"]);
});

test("contagem acima da esperada também reprova", () => {
  const verdict = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 31), complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_COUNT_ABOVE_EXPECTED"]);
});

test("resumo por arquivo ausente reprova mesmo com todas as contagens batendo", () => {
  const noSummary: ObservedFile = { ...complete("a.test.ts", 30), summaryCount: 0, summary: null };
  const verdict = evaluateUnitSuite(input({ observed: [noSummary, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_SUMMARY_MISSING"]);
});

test("resumo duplicado é resultado ambíguo e reprova", () => {
  const twice: ObservedFile = { ...complete("a.test.ts", 30), summaryCount: 2 };
  const verdict = evaluateUnitSuite(input({ observed: [twice, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_SUMMARY_DUPLICATE"]);
  assert.equal(verdict.status, "FAIL");
});

test("process.exit(0) prematuro (item de nível de arquivo, sem testes nem resumo) reprova", () => {
  const premature: ObservedFile = {
    file: "a.test.ts", started: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0, suiteFailures: 0,
    fileLevelEntries: 1, summaryCount: 0, summary: null,
  };
  const verdict = evaluateUnitSuite(input({ observed: [premature, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), [
    "UNIT_SUITE_FILE_LEVEL_ENTRY",
    "UNIT_SUITE_SUMMARY_MISSING",
    "UNIT_SUITE_COUNT_BELOW_EXPECTED",
  ]);
  assert.equal(verdict.reasons.length, 0, "rc=0: a reprovação é por arquivo");
});

test("falha real reprova e identifica o arquivo", () => {
  const failing: ObservedFile = {
    ...complete("a.test.ts", 30), passed: 29, failed: 1,
    summary: { tests: 30, passed: 29, failed: 1, cancelled: 0, skipped: 0, todo: 0 },
  };
  const verdict = evaluateUnitSuite(input({ observed: [failing, complete("b.test.ts", 5, { skipped: 1 })], run: { exitCode: 1, signal: null, timedOut: false } }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_TEST_FAILED"]);
  assert.deepEqual(verdict.reasons.map((entry) => entry.code), ["UNIT_SUITE_RUN_EXIT_NONZERO"]);
});

test("falha apenas no resumo (sem evento de falha) também reprova", () => {
  const onlySummary: ObservedFile = { ...complete("a.test.ts", 30), summary: { tests: 30, passed: 29, failed: 1, cancelled: 0, skipped: 0, todo: 0 } };
  const verdict = evaluateUnitSuite(input({ observed: [onlySummary, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_TEST_FAILED"]);
});

test("skip declarado no baseline é aprovado", () => {
  const verdict = evaluateUnitSuite(input());
  assert.equal(verdict.files.find((entry) => entry.file === "b.test.ts")?.status, "PASS");
});

test("skip não declarado reprova, e skip declarado que desapareceu também", () => {
  const undeclared = evaluateUnitSuite(input({
    expected: [expectation("a.test.ts", 30), expectation("b.test.ts", 5, 0)],
  }));
  assert.deepEqual(codesOf(undeclared, "b.test.ts"), ["UNIT_SUITE_SKIP_MISMATCH"]);
  assert.deepEqual(undeclared.files[1].reasons[0].detail, { expected: 0, received: 1 });

  const vanished = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 30), complete("b.test.ts", 5)] }));
  assert.deepEqual(codesOf(vanished, "b.test.ts"), ["UNIT_SUITE_SKIP_MISMATCH"]);
  assert.equal(vanished.status, "FAIL");
});

test("todo é tratado como skip: precisa estar declarado", () => {
  const withTodo = input({ observed: [complete("a.test.ts", 30, { todo: 1 }), complete("b.test.ts", 5, { skipped: 1 })] });
  assert.deepEqual(codesOf(evaluateUnitSuite(withTodo), "a.test.ts"), ["UNIT_SUITE_TODO_MISMATCH"]);
  const declared = evaluateUnitSuite({ ...withTodo, expected: [expectation("a.test.ts", 30, 0, 1), expectation("b.test.ts", 5, 1)] });
  assert.equal(declared.status, "PASS");
});

test("cancelamento reprova, mesmo que o resumo só o registre", () => {
  const cancelled: ObservedFile = {
    ...complete("a.test.ts", 30), passed: 28, cancelled: 2, started: 30,
    summary: { tests: 30, passed: 28, failed: 0, cancelled: 2, skipped: 0, todo: 0 },
  };
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [cancelled, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_FILE_CANCELLED"]);

  const summaryOnly: ObservedFile = { ...complete("a.test.ts", 30), summary: { tests: 30, passed: 28, failed: 0, cancelled: 2, skipped: 0, todo: 0 } };
  assert.ok(codesOf(evaluateUnitSuite(input({ observed: [summaryOnly, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts").includes("UNIT_SUITE_FILE_CANCELLED"));
});

test("eventos inconsistentes reprovam: teste iniciado sem resultado e resumo divergente dos eventos", () => {
  const startedNoResult: ObservedFile = { ...complete("a.test.ts", 30), started: 31 };
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [startedNoResult, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_START_RESULT_MISMATCH"]);

  const summaryDiverges: ObservedFile = { ...complete("a.test.ts", 30), summary: { tests: 29, passed: 29, failed: 0, cancelled: 0, skipped: 0, todo: 0 } };
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [summaryDiverges, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_SUMMARY_COUNT_MISMATCH"]);
});

test("arquivo inesperado reprova a execução", () => {
  const verdict = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 30), complete("b.test.ts", 5, { skipped: 1 }), complete("z.test.ts", 3)] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(verdict.unexpectedFiles, ["z.test.ts"]);
  assert.deepEqual(verdict.reasons, [{ code: "UNIT_SUITE_UNEXPECTED_FILE", detail: { file: "z.test.ts" } }]);
  assert.ok(verdict.files.every((entry) => entry.status === "PASS"), "os esperados continuam avaliados individualmente");
});

test("arquivo obrigatório ausente (nunca iniciou) reprova", () => {
  const verdict = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 30)] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "b.test.ts"), ["UNIT_SUITE_FILE_NOT_STARTED"]);
});

test("observações vazias com rc=0 reprovam: sem evidência não há aprovação presumida", () => {
  const verdict = evaluateUnitSuite(input({ observed: [] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(verdict.files.map((entry) => codesOf(verdict, entry.file)), [["UNIT_SUITE_FILE_NOT_STARTED"], ["UNIT_SUITE_FILE_NOT_STARTED"]]);
});

test("dois testes legítimos com o mesmo nome não reprovam: nomes não fazem parte do contrato", () => {
  // O arquivo observado tem 3 testes de mesmo nome; o contrato só carrega contagens.
  const verdict = evaluateUnitSuite({
    expected: [expectation("dup.test.ts", 3)],
    observed: [complete("dup.test.ts", 3)],
    run: OK_RUN,
  });
  assert.equal(verdict.status, "PASS");
});

test("duas observações do mesmo arquivo são ambíguas e reprovam", () => {
  const verdict = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 30), complete("a.test.ts", 30), complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_OBSERVATION_AMBIGUOUS"]);
});

test("observação malformada reprova o arquivo; entrada sem identificação reprova a execução", () => {
  const broken = { ...complete("a.test.ts", 30), passed: -1 } as ObservedFile;
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [broken, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_OBSERVATION_INVALID"]);

  const nonInteger = { ...complete("a.test.ts", 30), passed: 29.5 } as ObservedFile;
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [nonInteger, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_OBSERVATION_INVALID"]);

  const incoherent = { ...complete("a.test.ts", 30), summaryCount: 0 } as ObservedFile;
  assert.deepEqual(codesOf(evaluateUnitSuite(input({ observed: [incoherent, complete("b.test.ts", 5, { skipped: 1 })] })), "a.test.ts"), ["UNIT_SUITE_OBSERVATION_INVALID"]);

  const anonymous = evaluateUnitSuite(input({ observed: [complete("a.test.ts", 30), complete("b.test.ts", 5, { skipped: 1 }), {} as ObservedFile] }));
  assert.equal(anonymous.status, "FAIL");
  assert.ok(anonymous.reasons.some((entry) => entry.code === "UNIT_SUITE_OBSERVED_INVALID"));
});

test("baseline inválido ou vazio reprova a execução", () => {
  const empty = evaluateUnitSuite(input({ expected: [] }));
  assert.equal(empty.status, "FAIL");
  assert.ok(empty.reasons.some((entry) => entry.code === "UNIT_SUITE_EXPECTED_EMPTY"));

  for (const bad of [
    expectation("a.test.ts", 0),
    expectation("a.test.ts", 3, 4),
    { file: "a.test.ts", tests: 2.5, skipped: 0 },
    { file: "", tests: 2, skipped: 0 },
  ] as ExpectedFileBaseline[]) {
    const verdict = evaluateUnitSuite(input({ expected: [bad, expectation("b.test.ts", 5, 1)] }));
    assert.equal(verdict.status, "FAIL");
    assert.ok(verdict.reasons.some((entry) => entry.code === "UNIT_SUITE_EXPECTED_INVALID"), JSON.stringify(bad));
  }

  const duplicated = evaluateUnitSuite(input({ expected: [expectation("a.test.ts", 30), expectation("a.test.ts", 30), expectation("b.test.ts", 5, 1)] }));
  assert.equal(duplicated.status, "FAIL");
  assert.ok(duplicated.reasons.some((entry) => entry.detail?.problem === "duplicate"));
});

test("execução: código de saída ≠ 0, sinal, timeout e saída desconhecida reprovam mesmo com arquivos íntegros", () => {
  const cases: Array<[RunObservation, string[]]> = [
    [{ exitCode: 1, signal: null, timedOut: false }, ["UNIT_SUITE_RUN_EXIT_NONZERO"]],
    [{ exitCode: null, signal: "SIGKILL", timedOut: false }, ["UNIT_SUITE_RUN_SIGNALED"]],
    [{ exitCode: null, signal: "SIGTERM", timedOut: true }, ["UNIT_SUITE_RUN_TIMED_OUT", "UNIT_SUITE_RUN_SIGNALED"]],
    [{ exitCode: null, signal: null, timedOut: false }, ["UNIT_SUITE_RUN_EXIT_UNKNOWN"]],
    [undefined as unknown as RunObservation, ["UNIT_SUITE_RUN_EXIT_UNKNOWN"]],
    [{ exitCode: "0", signal: null, timedOut: false } as unknown as RunObservation, ["UNIT_SUITE_RUN_EXIT_UNKNOWN"]],
  ];
  for (const [run, codes] of cases) {
    const verdict = evaluateUnitSuite(input({ run }));
    assert.equal(verdict.status, "FAIL", JSON.stringify(run));
    assert.deepEqual(verdict.reasons.map((entry) => entry.code), codes, JSON.stringify(run));
    assert.ok(verdict.files.every((entry) => entry.status === "PASS"));
  }
});

test("entrada ilegível não lança e reprova", () => {
  for (const bad of [undefined, null, 42, "x", []] as unknown as UnitSuiteVerdictInput[]) {
    const verdict = evaluateUnitSuite(bad);
    assert.equal(verdict.status, "FAIL");
    assert.ok(verdict.reasons.length > 0);
  }
  const verdict = evaluateUnitSuite({ expected: "nope", observed: 7, run: OK_RUN } as unknown as UnitSuiteVerdictInput);
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(verdict.reasons.map((entry) => entry.code), ["UNIT_SUITE_EXPECTED_INVALID", "UNIT_SUITE_OBSERVED_INVALID"]);
});

test("função pura: não altera a entrada e produz o mesmo veredito com entrada congelada", () => {
  const frozen = deepFreeze(input({ observed: [complete("a.test.ts", 29), complete("b.test.ts", 5, { skipped: 1 })] }));
  const first = evaluateUnitSuite(frozen);
  const second = evaluateUnitSuite(frozen);
  assert.deepEqual(first, second);
  assert.equal(first.status, "FAIL");
});

test("ordem de entrada não altera o veredito: arquivos saem em ordem determinística", () => {
  const forward = evaluateUnitSuite(input());
  const reversed = evaluateUnitSuite(input({
    expected: [expectation("b.test.ts", 5, 1), expectation("a.test.ts", 30)],
    observed: [complete("b.test.ts", 5, { skipped: 1 }), complete("a.test.ts", 30)],
  }));
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.files.map((entry) => entry.file), ["a.test.ts", "b.test.ts"]);
});

test("identificadores de erro são estáveis, únicos e com prefixo UNIT_SUITE_", () => {
  assert.equal(new Set(UNIT_SUITE_REASON_CODES).size, UNIT_SUITE_REASON_CODES.length);
  assert.ok(UNIT_SUITE_REASON_CODES.every((code) => /^UNIT_SUITE_[A-Z_]+$/.test(code)));
  assert.equal(UNIT_SUITE_REASON_CODES.length, 25);
  const codes: readonly string[] = UNIT_SUITE_REASON_CODES;
  assert.equal(codes.indexOf("UNIT_SUITE_SUITE_FAILED"), codes.indexOf("UNIT_SUITE_TEST_FAILED") + 1);
});

// Falha de hook em describe(): o Node emite um resultado de suite com falha, não o conta em
// "tests" nem em "failed" e pode sair com código 0 (observado em Node v22.17.1).
test("falha de suite com dois testes aprovados, resumo completo e rc=0 reprova", () => {
  const suiteFailed: ObservedFile = { ...complete("a.test.ts", 2), suiteFailures: 1 };
  const verdict = evaluateUnitSuite({
    expected: [expectation("a.test.ts", 2)],
    observed: [suiteFailed],
    run: OK_RUN,
  });
  assert.equal(suiteFailed.summary?.failed, 0);
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(verdict.reasons, [], "rc=0: a reprovação vem do arquivo");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_SUITE_FAILED"]);
  assert.deepEqual(verdict.files[0].reasons[0].detail, { suiteFailures: 1 });
});

test("falha de suite fica separada das falhas individuais e não altera as contagens", () => {
  const onlySuite = evaluateUnitSuite(input({ observed: [{ ...complete("a.test.ts", 30), suiteFailures: 2 }, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.deepEqual(codesOf(onlySuite, "a.test.ts"), ["UNIT_SUITE_SUITE_FAILED"], "sem TEST_FAILED nem divergência de contagem");

  const both: ObservedFile = {
    ...complete("a.test.ts", 30), passed: 29, failed: 1, suiteFailures: 1,
    summary: { tests: 30, passed: 29, failed: 1, cancelled: 0, skipped: 0, todo: 0 },
  };
  const verdict = evaluateUnitSuite(input({ observed: [both, complete("b.test.ts", 5, { skipped: 1 })] }));
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_TEST_FAILED", "UNIT_SUITE_SUITE_FAILED"]);
  assert.deepEqual(verdict.files[0].reasons[0].detail, { failed: 1 }, "failed não inclui a falha de suite");
});

test("falha de suite reprova mesmo com skip e todo declarados e arquivos vizinhos íntegros", () => {
  const verdict = evaluateUnitSuite({
    expected: [expectation("a.test.ts", 5, 1, 1), expectation("b.test.ts", 5, 1)],
    observed: [{ ...complete("a.test.ts", 5, { skipped: 1, todo: 1 }), suiteFailures: 1 }, complete("b.test.ts", 5, { skipped: 1 })],
    run: OK_RUN,
  });
  assert.equal(verdict.status, "FAIL");
  assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_SUITE_FAILED"]);
  assert.equal(verdict.files.find((entry) => entry.file === "b.test.ts")?.status, "PASS");
});

test("suiteFailures é obrigatório e deve ser inteiro seguro não negativo", () => {
  const { suiteFailures: _omitted, ...withoutField } = complete("a.test.ts", 30);
  const invalid: unknown[] = [withoutField, { ...complete("a.test.ts", 30), suiteFailures: undefined },
    { ...complete("a.test.ts", 30), suiteFailures: -1 }, { ...complete("a.test.ts", 30), suiteFailures: 1.5 },
    { ...complete("a.test.ts", 30), suiteFailures: "1" }, { ...complete("a.test.ts", 30), suiteFailures: null },
    { ...complete("a.test.ts", 30), suiteFailures: Number.NaN }, { ...complete("a.test.ts", 30), suiteFailures: Number.MAX_SAFE_INTEGER + 1 }];
  for (const entry of invalid) {
    const verdict = evaluateUnitSuite(input({ observed: [entry as ObservedFile, complete("b.test.ts", 5, { skipped: 1 })] }));
    assert.equal(verdict.status, "FAIL", JSON.stringify(entry));
    assert.deepEqual(codesOf(verdict, "a.test.ts"), ["UNIT_SUITE_OBSERVATION_INVALID"], JSON.stringify(entry));
  }
  const zero = evaluateUnitSuite(input());
  assert.equal(zero.status, "PASS", "suiteFailures=0 explícito continua aprovando");
});
