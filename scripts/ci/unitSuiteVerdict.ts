// Verificador puro e fail-closed da completude da suíte unitária.
//
// Recebe dados estruturados (baseline esperado por arquivo, observação por
// arquivo e observação da execução) e devolve um veredito. Não acessa disco,
// processos, rede nem variáveis de ambiente, e não lança: entrada ilegível ou
// erro interno resultam em FAIL.
//
// Regra: a aprovação exige evidência positiva e concordante por arquivo. Um
// código de saída 0, ou um resumo global, nunca basta sozinho.
//
// Contrato de ObservedFile (quem monta a observação a partir dos eventos do
// reporter é um adaptador futuro, fora deste módulo):
//   - started / passed / failed / cancelled contam eventos de testes reais do
//     arquivo. "passed" inclui testes marcados como skip ou todo.
//   - skipped / todo contam, dentro de "passed", os testes assim marcados.
//   - suiteFailures conta resultados de suite (describe) com falha, p. ex. hook
//     que falha. O Node não os inclui em "tests" nem em "failed" e pode sair com
//     código 0; por isso ficam em contador próprio, fora de failed/received.
//     Campo obrigatório: observação sem ele é inválida (nunca presumido 0).
//   - fileLevelEntries conta itens cujo nome é o próprio arquivo, o padrão que
//     o executor produz quando o processo sai antes de concluir (ou quando o
//     arquivo não tem testes). Esses itens NÃO entram nos demais contadores.
//   - summaryCount / summary descrevem o test:summary emitido para o arquivo.
// Nomes de testes não fazem parte do contrato: nomes repetidos são legítimos.

export const UNIT_SUITE_VERDICT_VERSION = "unit-suite-verdict.v1";

export const UNIT_SUITE_REASON_CODES = [
  "UNIT_SUITE_INTERNAL_ERROR",
  "UNIT_SUITE_INPUT_INVALID",
  "UNIT_SUITE_EXPECTED_EMPTY",
  "UNIT_SUITE_EXPECTED_INVALID",
  "UNIT_SUITE_OBSERVED_INVALID",
  "UNIT_SUITE_RUN_EXIT_UNKNOWN",
  "UNIT_SUITE_RUN_EXIT_NONZERO",
  "UNIT_SUITE_RUN_SIGNALED",
  "UNIT_SUITE_RUN_TIMED_OUT",
  "UNIT_SUITE_UNEXPECTED_FILE",
  "UNIT_SUITE_FILE_NOT_STARTED",
  "UNIT_SUITE_OBSERVATION_INVALID",
  "UNIT_SUITE_OBSERVATION_AMBIGUOUS",
  "UNIT_SUITE_FILE_LEVEL_ENTRY",
  "UNIT_SUITE_SUMMARY_MISSING",
  "UNIT_SUITE_SUMMARY_DUPLICATE",
  "UNIT_SUITE_FILE_CANCELLED",
  "UNIT_SUITE_TEST_FAILED",
  "UNIT_SUITE_SUITE_FAILED",
  "UNIT_SUITE_START_RESULT_MISMATCH",
  "UNIT_SUITE_SUMMARY_COUNT_MISMATCH",
  "UNIT_SUITE_COUNT_BELOW_EXPECTED",
  "UNIT_SUITE_COUNT_ABOVE_EXPECTED",
  "UNIT_SUITE_SKIP_MISMATCH",
  "UNIT_SUITE_TODO_MISMATCH",
] as const;

export type UnitSuiteReasonCode = (typeof UNIT_SUITE_REASON_CODES)[number];

export type ReasonDetail = Readonly<Record<string, string | number | boolean | null>>;

export type UnitSuiteReason = Readonly<{
  code: UnitSuiteReasonCode;
  detail?: ReasonDetail;
}>;

/** Linha de base esperada para um arquivo. Contagem exata; `todo` omitido vale 0. */
export type ExpectedFileBaseline = Readonly<{
  file: string;
  tests: number;
  skipped: number;
  todo?: number;
}>;

export type ObservedSummary = Readonly<{
  tests: number;
  passed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
}>;

export type ObservedFile = Readonly<{
  file: string;
  started: number;
  passed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
  suiteFailures: number;
  fileLevelEntries: number;
  summaryCount: number;
  summary: ObservedSummary | null;
}>;

/** Observação da execução inteira (em uma única invocação, o código de saída é global). */
export type RunObservation = Readonly<{
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}>;

export type UnitSuiteVerdictInput = Readonly<{
  expected: readonly ExpectedFileBaseline[];
  observed: readonly ObservedFile[];
  run: RunObservation;
}>;

export type FileVerdict = Readonly<{
  file: string;
  status: "PASS" | "FAIL";
  reasons: readonly UnitSuiteReason[];
}>;

export type UnitSuiteVerdict = Readonly<{
  version: typeof UNIT_SUITE_VERDICT_VERSION;
  status: "PASS" | "FAIL";
  /** Motivos que não pertencem a um arquivo específico. */
  reasons: readonly UnitSuiteReason[];
  /** Um item por arquivo esperado e válido, em ordem determinística. */
  files: readonly FileVerdict[];
  unexpectedFiles: readonly string[];
}>;

type Counted = { [key: string]: unknown };

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Counted {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function reason(code: UnitSuiteReasonCode, detail?: ReasonDetail): UnitSuiteReason {
  return detail === undefined ? { code } : { code, detail };
}

function failVerdict(reasons: readonly UnitSuiteReason[]): UnitSuiteVerdict {
  return { version: UNIT_SUITE_VERDICT_VERSION, status: "FAIL", reasons, files: [], unexpectedFiles: [] };
}

type NormalizedExpected = Readonly<{ file: string; tests: number; skipped: number; todo: number }>;

function readExpected(expected: unknown, reasons: UnitSuiteReason[]): Map<string, NormalizedExpected> {
  const byFile = new Map<string, NormalizedExpected>();
  if (!Array.isArray(expected)) {
    reasons.push(reason("UNIT_SUITE_EXPECTED_INVALID", { problem: "not_an_array" }));
    return byFile;
  }
  if (expected.length === 0) {
    reasons.push(reason("UNIT_SUITE_EXPECTED_EMPTY"));
    return byFile;
  }
  const seen = new Set<string>();
  expected.forEach((entry: unknown, index) => {
    if (!isRecord(entry) || typeof entry.file !== "string" || entry.file === "") {
      reasons.push(reason("UNIT_SUITE_EXPECTED_INVALID", { index, problem: "file" }));
      return;
    }
    const file = entry.file;
    const todo = entry.todo === undefined ? 0 : entry.todo;
    // Um arquivo esperado precisa ter ao menos um teste: zero é indistinguível de saída prematura.
    if (!isCount(entry.tests) || entry.tests < 1 || !isCount(entry.skipped) || !isCount(todo)
      || entry.skipped > entry.tests || todo > entry.tests) {
      reasons.push(reason("UNIT_SUITE_EXPECTED_INVALID", { index, file, problem: "counts" }));
      return;
    }
    if (seen.has(file)) {
      reasons.push(reason("UNIT_SUITE_EXPECTED_INVALID", { index, file, problem: "duplicate" }));
      return;
    }
    seen.add(file);
    byFile.set(file, { file, tests: entry.tests, skipped: entry.skipped, todo });
  });
  return byFile;
}

function isValidSummary(summary: unknown): summary is ObservedSummary {
  return isRecord(summary)
    && isCount(summary.tests) && isCount(summary.passed) && isCount(summary.failed)
    && isCount(summary.cancelled) && isCount(summary.skipped) && isCount(summary.todo);
}

function isValidObservation(entry: unknown): entry is ObservedFile {
  if (!isRecord(entry) || typeof entry.file !== "string" || entry.file === "") return false;
  const counters = [entry.started, entry.passed, entry.failed, entry.cancelled, entry.skipped, entry.todo,
    entry.suiteFailures, entry.fileLevelEntries, entry.summaryCount];
  if (!counters.every(isCount)) return false;
  if ((entry.skipped as number) > (entry.passed as number) || (entry.todo as number) > (entry.passed as number)) return false;
  if (entry.summary !== null && !isValidSummary(entry.summary)) return false;
  // summary e summaryCount precisam concordar: sem resumo, contagem 0; com resumo, ao menos 1.
  if (entry.summary === null && entry.summaryCount !== 0) return false;
  if (entry.summary !== null && entry.summaryCount === 0) return false;
  return true;
}

function evaluateFile(expected: NormalizedExpected, observed: ObservedFile): UnitSuiteReason[] {
  const reasons: UnitSuiteReason[] = [];
  const received = observed.passed + observed.failed + observed.cancelled;

  if (observed.fileLevelEntries > 0) {
    reasons.push(reason("UNIT_SUITE_FILE_LEVEL_ENTRY", { entries: observed.fileLevelEntries }));
  }
  if (observed.summaryCount === 0 || observed.summary === null) {
    reasons.push(reason("UNIT_SUITE_SUMMARY_MISSING"));
  } else if (observed.summaryCount > 1) {
    reasons.push(reason("UNIT_SUITE_SUMMARY_DUPLICATE", { summaries: observed.summaryCount }));
  }
  if (observed.cancelled > 0 || (observed.summary !== null && observed.summary.cancelled > 0)) {
    reasons.push(reason("UNIT_SUITE_FILE_CANCELLED", { cancelled: Math.max(observed.cancelled, observed.summary?.cancelled ?? 0) }));
  }
  if (observed.failed > 0 || (observed.summary !== null && observed.summary.failed > 0)) {
    reasons.push(reason("UNIT_SUITE_TEST_FAILED", { failed: Math.max(observed.failed, observed.summary?.failed ?? 0) }));
  }
  if (observed.suiteFailures > 0) {
    reasons.push(reason("UNIT_SUITE_SUITE_FAILED", { suiteFailures: observed.suiteFailures }));
  }
  if (observed.started !== received) {
    reasons.push(reason("UNIT_SUITE_START_RESULT_MISMATCH", { started: observed.started, results: received }));
  }
  if (observed.summary !== null && observed.summary.tests !== received) {
    reasons.push(reason("UNIT_SUITE_SUMMARY_COUNT_MISMATCH", { summaryTests: observed.summary.tests, results: received }));
  }
  if (received < expected.tests) {
    reasons.push(reason("UNIT_SUITE_COUNT_BELOW_EXPECTED", { expected: expected.tests, received }));
  } else if (received > expected.tests) {
    reasons.push(reason("UNIT_SUITE_COUNT_ABOVE_EXPECTED", { expected: expected.tests, received }));
  }
  if (observed.skipped !== expected.skipped) {
    reasons.push(reason("UNIT_SUITE_SKIP_MISMATCH", { expected: expected.skipped, received: observed.skipped }));
  }
  if (observed.todo !== expected.todo) {
    reasons.push(reason("UNIT_SUITE_TODO_MISMATCH", { expected: expected.todo, received: observed.todo }));
  }
  return reasons;
}

function readRun(run: unknown): UnitSuiteReason[] {
  if (!isRecord(run) || typeof run.timedOut !== "boolean"
    || !(run.signal === null || typeof run.signal === "string")
    || !(run.exitCode === null || (typeof run.exitCode === "number" && Number.isSafeInteger(run.exitCode)))) {
    return [reason("UNIT_SUITE_RUN_EXIT_UNKNOWN", { problem: "run_observation_invalid" })];
  }
  const reasons: UnitSuiteReason[] = [];
  if (run.timedOut) reasons.push(reason("UNIT_SUITE_RUN_TIMED_OUT"));
  if (run.signal !== null) reasons.push(reason("UNIT_SUITE_RUN_SIGNALED", { signal: run.signal }));
  if (run.exitCode === null) {
    if (!run.timedOut && run.signal === null) reasons.push(reason("UNIT_SUITE_RUN_EXIT_UNKNOWN", { problem: "exit_code_null" }));
  } else if (run.exitCode !== 0) {
    reasons.push(reason("UNIT_SUITE_RUN_EXIT_NONZERO", { exitCode: run.exitCode }));
  }
  return reasons;
}

function evaluate(input: UnitSuiteVerdictInput): UnitSuiteVerdict {
  if (!isRecord(input)) {
    return failVerdict([reason("UNIT_SUITE_INPUT_INVALID")]);
  }

  const reasons: UnitSuiteReason[] = [];
  const expectedByFile = readExpected(input.expected, reasons);

  const observedRaw: unknown = input.observed;
  const validObserved = new Map<string, ObservedFile>();
  const ambiguous = new Set<string>();
  const invalid = new Set<string>();
  const observedFiles = new Set<string>();
  if (!Array.isArray(observedRaw)) {
    reasons.push(reason("UNIT_SUITE_OBSERVED_INVALID", { problem: "not_an_array" }));
  } else {
    observedRaw.forEach((entry: unknown, index) => {
      const file = isRecord(entry) && typeof entry.file === "string" && entry.file !== "" ? entry.file : null;
      if (file !== null) {
        if (observedFiles.has(file)) ambiguous.add(file);
        observedFiles.add(file);
      }
      if (!isValidObservation(entry)) {
        if (file === null) reasons.push(reason("UNIT_SUITE_OBSERVED_INVALID", { index, problem: "entry" }));
        else invalid.add(file);
        return;
      }
      validObserved.set(entry.file, entry);
    });
  }

  reasons.push(...readRun(input.run));

  const files: FileVerdict[] = [];
  for (const file of [...expectedByFile.keys()].sort(compareCodeUnits)) {
    const expected = expectedByFile.get(file)!;
    let fileReasons: UnitSuiteReason[];
    if (!observedFiles.has(file)) {
      fileReasons = [reason("UNIT_SUITE_FILE_NOT_STARTED")];
    } else if (ambiguous.has(file)) {
      fileReasons = [reason("UNIT_SUITE_OBSERVATION_AMBIGUOUS")];
    } else if (invalid.has(file) || !validObserved.has(file)) {
      fileReasons = [reason("UNIT_SUITE_OBSERVATION_INVALID")];
    } else {
      fileReasons = evaluateFile(expected, validObserved.get(file)!);
    }
    files.push({ file, status: fileReasons.length === 0 ? "PASS" : "FAIL", reasons: fileReasons });
  }

  const unexpectedFiles = [...observedFiles].filter((file) => !expectedByFile.has(file)).sort(compareCodeUnits);
  for (const file of unexpectedFiles) reasons.push(reason("UNIT_SUITE_UNEXPECTED_FILE", { file }));

  const pass = reasons.length === 0 && files.length > 0 && files.every((file) => file.status === "PASS");
  return { version: UNIT_SUITE_VERDICT_VERSION, status: pass ? "PASS" : "FAIL", reasons, files, unexpectedFiles };
}

export function evaluateUnitSuite(input: UnitSuiteVerdictInput): UnitSuiteVerdict {
  try {
    return evaluate(input);
  } catch {
    return failVerdict([reason("UNIT_SUITE_INTERNAL_ERROR")]);
  }
}
