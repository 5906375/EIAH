// Adaptador puro: registros NDJSON do reporter (unitSuiteReporter.mjs) -> ObservedFile[].
//
// Não lê disco nem processos. Recebe texto ou registros já parseados e devolve
// as observações no formato de unitSuiteVerdict.ts, mais uma lista de `issues`
// sobre o próprio fluxo de eventos. Qualquer issue deve ser tratada pelo
// chamador como FAIL: o adaptador nunca preenche com zero o que não viu.
//
// Interpretação dos eventos (observada em node:test, Node v22.17.1):
//   - test:summary COM `file` é o resumo do arquivo; SEM `file` é o global, que
//     conta o item de arquivo como teste e por isso é ignorado.
//   - Item de arquivo: resultado de nesting 0 cujo nome é o caminho do arquivo
//     (absoluto ou relativo ao cwd). Aparece quando o processo sai cedo, o
//     arquivo é vazio ou falha ao carregar. Não entra nos contadores de testes.
//   - Suite (details.type = "suite") não entra em "tests" no Node. Os resultados
//     de suite só alimentam suiteFailures; seus test:start são descontados de
//     `started`, pois o evento de início não informa o tipo.
//   - Cancelamento: test:fail com failureType "cancelledByParent".
//   - Todo que falha: test:fail com todo; o Node o conta como todo (não como
//     falha). Contado aqui como passed + todo, mantendo a política vigente.
//   - skip e todo juntos: o Node conta só como skip.
//   - stdout/stderr e demais eventos não são serializados pelo reporter e,
//     portanto, nunca definem a identidade de um arquivo.
// Limitação conhecida: um teste de nesting 0 com o mesmo nome do caminho do
// arquivo é lido como item de arquivo (resulta em FAIL, nunca em PASS).

import type { ObservedFile, ObservedSummary } from "./unitSuiteVerdict";

export const UNIT_SUITE_EVENTS_VERSION = 1;

export type UnitSuiteEventsIssueCode =
  | "UNIT_SUITE_EVENTS_OPTIONS_INVALID"
  | "UNIT_SUITE_EVENTS_LINE_NOT_JSON"
  | "UNIT_SUITE_EVENTS_RECORD_INVALID"
  | "UNIT_SUITE_EVENTS_HEADER_MISSING"
  | "UNIT_SUITE_EVENTS_HEADER_MISPLACED"
  | "UNIT_SUITE_EVENTS_END_MISSING"
  | "UNIT_SUITE_EVENTS_END_DUPLICATE"
  | "UNIT_SUITE_EVENTS_END_COUNT_MISMATCH"
  | "UNIT_SUITE_EVENTS_AFTER_END"
  | "UNIT_SUITE_EVENTS_SEQUENCE_GAP"
  | "UNIT_SUITE_EVENTS_SEQUENCE_DUPLICATE"
  | "UNIT_SUITE_EVENTS_FILE_OUTSIDE_ROOT"
  | "UNIT_SUITE_EVENTS_START_UNDERFLOW"
  | "UNIT_SUITE_EVENTS_NO_EVENTS";

export type UnitSuiteEventsIssue = Readonly<{
  code: UnitSuiteEventsIssueCode;
  seq?: number;
  line?: number;
  detail?: string;
}>;

export type EventCounts = Readonly<{
  tests: number;
  passed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
}>;

export type UnitSuiteHeaderRecord = Readonly<{ v: 1; kind: "header"; seq: number; node: string }>;
export type UnitSuiteEndRecord = Readonly<{ v: 1; kind: "end"; seq: number; events: number }>;
export type UnitSuiteResultRecord = Readonly<{
  v: 1;
  kind: "event";
  seq: number;
  ev: "test:start" | "test:pass" | "test:fail";
  file: string;
  name: string;
  nesting: number;
  skip: boolean;
  todo: boolean;
  detailsType: "test" | "suite" | null;
  failureType: string | null;
}>;
export type UnitSuiteSummaryRecord = Readonly<{
  v: 1;
  kind: "event";
  seq: number;
  ev: "test:summary";
  /** null: resumo global da execução. */
  file: string | null;
  success: boolean | null;
  counts: EventCounts;
}>;
export type UnitSuiteEventRecord = UnitSuiteHeaderRecord | UnitSuiteEndRecord | UnitSuiteResultRecord | UnitSuiteSummaryRecord;

export type AdaptOptions = Readonly<{
  /** Raiz do repositório, caminho absoluto POSIX sem barra final. Identidade = caminho relativo a ela. */
  rootDir: string;
  /** cwd do runner, usado só para reconhecer o item de arquivo escrito de forma relativa. Padrão: rootDir. */
  cwd?: string;
}>;

export type AdaptResult = Readonly<{
  observed: readonly ObservedFile[];
  issues: readonly UnitSuiteEventsIssue[];
  /** Quantidade de resumos globais vistos (informativo; não entra nas observações). */
  globalSummaries: number;
  nodeVersion: string | null;
}>;

type Json = { [key: string]: unknown };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Json, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCounts(value: unknown): value is EventCounts {
  return isRecord(value)
    && hasExactKeys(value, ["tests", "passed", "failed", "cancelled", "skipped", "todo"])
    && isCount(value.tests) && isCount(value.passed) && isCount(value.failed)
    && isCount(value.cancelled) && isCount(value.skipped) && isCount(value.todo);
}

const RESULT_EVENTS = ["test:start", "test:pass", "test:fail"];

/** Valida um registro do reporter. Retorna null quando inválido (campos faltando, tipos errados, chaves extras ou evento desconhecido). */
export function validateRecord(value: unknown): UnitSuiteEventRecord | null {
  if (!isRecord(value) || value.v !== UNIT_SUITE_EVENTS_VERSION || !isCount(value.seq) || value.seq < 1) return null;
  if (value.kind === "header") {
    return hasExactKeys(value, ["v", "kind", "seq", "node"]) && typeof value.node === "string" && value.node !== ""
      ? (value as unknown as UnitSuiteHeaderRecord) : null;
  }
  if (value.kind === "end") {
    return hasExactKeys(value, ["v", "kind", "seq", "events"]) && isCount(value.events)
      ? (value as unknown as UnitSuiteEndRecord) : null;
  }
  if (value.kind !== "event" || typeof value.ev !== "string") return null;
  if (RESULT_EVENTS.includes(value.ev)) {
    const valid = hasExactKeys(value, ["v", "kind", "seq", "ev", "file", "name", "nesting", "skip", "todo", "detailsType", "failureType"])
      && typeof value.file === "string" && value.file !== "" && typeof value.name === "string"
      && isCount(value.nesting) && typeof value.skip === "boolean" && typeof value.todo === "boolean"
      && (value.detailsType === null || value.detailsType === "test" || value.detailsType === "suite")
      && (value.failureType === null || typeof value.failureType === "string");
    return valid ? (value as unknown as UnitSuiteResultRecord) : null;
  }
  if (value.ev === "test:summary") {
    const valid = hasExactKeys(value, ["v", "kind", "seq", "ev", "file", "success", "counts"])
      && (value.file === null || (typeof value.file === "string" && value.file !== ""))
      && (value.success === null || typeof value.success === "boolean")
      && isCounts(value.counts);
    return valid ? (value as unknown as UnitSuiteSummaryRecord) : null;
  }
  return null;
}

/** Converte o texto NDJSON em registros brutos. Linha vazia é ignorada; linha que não é objeto JSON vira issue. */
export function parseNdjson(text: string): { records: unknown[]; issues: UnitSuiteEventsIssue[] } {
  const records: unknown[] = [];
  const issues: UnitSuiteEventsIssue[] = [];
  if (typeof text !== "string") {
    return { records, issues: [{ code: "UNIT_SUITE_EVENTS_LINE_NOT_JSON", line: 0, detail: "content_not_string" }] };
  }
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error("not_an_object");
      records.push(parsed);
    } catch {
      issues.push({ code: "UNIT_SUITE_EVENTS_LINE_NOT_JSON", line: index + 1 });
    }
  });
  return { records, issues };
}

function isAbsolutePosix(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && value !== "/" && !value.endsWith("/")
    && !value.split("/").some((segment, index) => index > 0 && (segment === "" || segment === "." || segment === ".."));
}

function relativeTo(file: string, root: string): string | null {
  if (!file.startsWith(`${root}/`)) return null;
  const relative = file.slice(root.length + 1);
  return relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ? null : relative;
}

type FileState = {
  starts: number;
  suiteResults: number;
  suiteFailures: number;
  passed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
  fileLevelEntries: number;
  summaryCount: number;
  summary: ObservedSummary | null;
};

function emptyState(): FileState {
  return { starts: 0, suiteResults: 0, suiteFailures: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0, fileLevelEntries: 0, summaryCount: 0, summary: null };
}

export function adaptNodeEvents(rawRecords: readonly unknown[], options: AdaptOptions): AdaptResult {
  const issues: UnitSuiteEventsIssue[] = [];
  const empty: AdaptResult = { observed: [], issues, globalSummaries: 0, nodeVersion: null };

  const rootDir = options?.rootDir;
  const cwd = options?.cwd ?? rootDir;
  if (!isAbsolutePosix(rootDir) || !isAbsolutePosix(cwd) || !Array.isArray(rawRecords)) {
    issues.push({ code: "UNIT_SUITE_EVENTS_OPTIONS_INVALID" });
    return empty;
  }

  // 1) Estrutura do fluxo: cabeçalho, fim, sequência e contagem.
  const records: UnitSuiteEventRecord[] = [];
  const seen = new Set<number>();
  let expectedSeq = 1;
  let ended = false;
  let endRecord: UnitSuiteEndRecord | null = null;
  let nodeVersion: string | null = null;
  rawRecords.forEach((raw, index) => {
    const record = validateRecord(raw);
    if (record === null) {
      issues.push({ code: "UNIT_SUITE_EVENTS_RECORD_INVALID", detail: `index ${index}` });
      return;
    }
    if (seen.has(record.seq)) {
      issues.push({ code: "UNIT_SUITE_EVENTS_SEQUENCE_DUPLICATE", seq: record.seq });
      return;
    }
    if (record.seq !== expectedSeq) {
      issues.push({ code: "UNIT_SUITE_EVENTS_SEQUENCE_GAP", seq: record.seq, detail: `expected ${expectedSeq}` });
    }
    seen.add(record.seq);
    expectedSeq = record.seq + 1;
    if (ended) {
      issues.push({ code: "UNIT_SUITE_EVENTS_AFTER_END", seq: record.seq });
      return;
    }
    if (record.kind === "header") {
      if (records.length > 0 || nodeVersion !== null) issues.push({ code: "UNIT_SUITE_EVENTS_HEADER_MISPLACED", seq: record.seq });
      else nodeVersion = record.node;
      return;
    }
    if (record.kind === "end") {
      ended = true;
      endRecord = record;
      return;
    }
    if (records.length === 0 && nodeVersion === null) {
      issues.push({ code: "UNIT_SUITE_EVENTS_HEADER_MISSING", seq: record.seq });
    }
    records.push(record);
  });
  if (rawRecords.length > 0 && nodeVersion === null && !issues.some((issue) => issue.code === "UNIT_SUITE_EVENTS_HEADER_MISSING")) {
    issues.push({ code: "UNIT_SUITE_EVENTS_HEADER_MISSING" });
  }
  if (endRecord === null) {
    issues.push({ code: "UNIT_SUITE_EVENTS_END_MISSING" });
  } else if ((endRecord as UnitSuiteEndRecord).events !== records.length) {
    issues.push({
      code: "UNIT_SUITE_EVENTS_END_COUNT_MISMATCH",
      detail: `end declares ${(endRecord as UnitSuiteEndRecord).events}, received ${records.length}`,
    });
  }
  if (records.length === 0) issues.push({ code: "UNIT_SUITE_EVENTS_NO_EVENTS" });

  // 2) Interpretação por arquivo (a ordem entre arquivos não importa).
  const states = new Map<string, FileState>();
  let globalSummaries = 0;
  const stateFor = (file: string) => {
    let state = states.get(file);
    if (!state) {
      state = emptyState();
      states.set(file, state);
    }
    return state;
  };

  for (const record of records) {
    if (record.kind !== "event") continue;
    if (record.ev === "test:summary") {
      if (record.file === null) {
        globalSummaries += 1;
        continue;
      }
      const relative = relativeTo(record.file, rootDir);
      if (relative === null) {
        issues.push({ code: "UNIT_SUITE_EVENTS_FILE_OUTSIDE_ROOT", seq: record.seq });
        continue;
      }
      const state = stateFor(relative);
      state.summaryCount += 1;
      state.summary = { ...record.counts };
      continue;
    }

    const relative = relativeTo(record.file, rootDir);
    if (relative === null) {
      issues.push({ code: "UNIT_SUITE_EVENTS_FILE_OUTSIDE_ROOT", seq: record.seq });
      continue;
    }
    const state = stateFor(relative);
    const cwdRelative = relativeTo(record.file, cwd);
    const isFileLevel = record.nesting === 0
      && (record.name === record.file || (cwdRelative !== null && (record.name === cwdRelative || record.name === `./${cwdRelative}`)));

    if (record.ev === "test:start") {
      if (!isFileLevel) state.starts += 1;
      continue;
    }
    if (isFileLevel) {
      state.fileLevelEntries += 1;
      continue;
    }
    if (record.detailsType === "suite") {
      state.suiteResults += 1;
      if (record.ev === "test:fail") state.suiteFailures += 1;
      continue;
    }
    if (record.ev === "test:pass") {
      state.passed += 1;
      if (record.skip) state.skipped += 1;
      else if (record.todo) state.todo += 1;
    } else if (record.failureType === "cancelledByParent") {
      state.cancelled += 1;
    } else if (record.todo) {
      state.passed += 1;
      state.todo += 1;
    } else {
      state.failed += 1;
    }
  }

  const observed: ObservedFile[] = [];
  for (const file of [...states.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
    const state = states.get(file)!;
    const started = state.starts - state.suiteResults;
    if (started < 0) issues.push({ code: "UNIT_SUITE_EVENTS_START_UNDERFLOW", detail: file });
    observed.push({
      file,
      started: Math.max(started, 0),
      passed: state.passed,
      failed: state.failed,
      cancelled: state.cancelled,
      skipped: state.skipped,
      todo: state.todo,
      suiteFailures: state.suiteFailures,
      fileLevelEntries: state.fileLevelEntries,
      summaryCount: state.summaryCount,
      summary: state.summary,
    });
  }
  return { observed, issues, globalSummaries, nodeVersion };
}
