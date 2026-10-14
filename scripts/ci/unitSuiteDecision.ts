// Decisão consolidada e fail-closed do gate de completude da suíte unitária.
//
// Composição pura: manifesto -> baseline -> integridade -> argv -> execução -> eventos -> adaptador
// -> verificador. Recebe valores já lidos e calculados pelo chamador (texto do manifesto, texto do
// baseline e seu SHA-256, digests dos arquivos de teste antes e depois da execução, argv, texto do
// NDJSON, observação da execução, rootDir/cwd) e devolve a decisão com um relatório por etapa. Não lê
// disco, não cria processos, não calcula hashes, não usa rede, ambiente nem relógio, e não lança:
// qualquer exceção, entrada ausente ou valor inesperado resulta em FAIL.
//
// PASS exige que as oito etapas terminem com status "OK":
//   C1 inventory  manifesto válido
//   C2 baseline   texto do baseline aprovado por parseUnitSuiteBaseline com o inventário validado
//                 (este módulo NÃO aceita baseline já "parseado"; não há desvio do parser)
//   C3 integrity  digest declarado == digest anterior == digest posterior, mapas com cobertura exata
//   C4 argv       mesmo conjunto do inventário, sem duplicata
//   C5 run        executou, código 0, sem sinal e sem timeout
//   C6 events     artefato presente, não vazio e com linhas JSON válidas
//   C7 adapter    nenhuma issue do adaptador (protocolo do reporter completo e coerente)
//   C8 verdict    unitSuiteVerdict em PASS (arquivos obrigatórios, resumos, contagens, skips,
//                 suiteFailures)
// Uma etapa bloqueada por outra fica "NOT_EVALUATED", registrada com motivo explícito, e impede a
// aprovação. Os motivos do verificador e as issues do inventário, do baseline, dos eventos e do
// adaptador são preservados integralmente nos relatórios das respectivas etapas.
//
// O que PASS significa: a execução avaliada corresponde às contagens e às evidências exigidas por este
// contrato. NÃO significa que as contagens do baseline foram comprovadas: a proveniência é apenas
// declarada (`attestation: "not_demonstrated"` no relatório do baseline, também em PASS).
// O SHA-256 do baseline e os digests dos arquivos são recebidos do chamador; esta função só valida o
// formato e compara strings, sem recalcular nem autenticar nada.
// Fora de escopo: política de versão do Node (informativa).

import { parseUnitSuiteManifest, type InventoryIssue } from "./unitSuiteInventory";
import {
  parseUnitSuiteBaseline,
  type BaselineDigest,
  type BaselineIssue,
  type BaselineProvenance,
} from "./unitSuiteBaseline";
import { adaptNodeEvents, parseNdjson, type UnitSuiteEventsIssue } from "./unitSuiteNodeEvents";
import {
  evaluateUnitSuite,
  type ExpectedFileBaseline,
  type ObservedFile,
  type ReasonDetail,
  type RunObservation,
  type UnitSuiteVerdict,
} from "./unitSuiteVerdict";

export const UNIT_SUITE_DECISION_VERSION = "unit-suite-decision.v1";

export const UNIT_SUITE_GATE_REASON_CODES = [
  "UNIT_SUITE_GATE_INTERNAL_ERROR",
  "UNIT_SUITE_GATE_INPUT_INVALID",
  "UNIT_SUITE_GATE_STAGE_NOT_EVALUATED",
  "UNIT_SUITE_GATE_INVENTORY_INVALID",
  "UNIT_SUITE_GATE_BASELINE_INVALID",
  "UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID",
  "UNIT_SUITE_GATE_DIGEST_MISSING",
  "UNIT_SUITE_GATE_DIGEST_INVALID",
  "UNIT_SUITE_GATE_DIGEST_MISMATCH",
  "UNIT_SUITE_GATE_FILES_CHANGED_DURING_RUN",
  "UNIT_SUITE_GATE_ARGV_INVALID",
  "UNIT_SUITE_GATE_ARGV_DUPLICATE",
  "UNIT_SUITE_GATE_ARGV_MISSING_FILE",
  "UNIT_SUITE_GATE_ARGV_EXTRA_FILE",
  "UNIT_SUITE_GATE_RUN_NOT_EXECUTED",
  "UNIT_SUITE_GATE_RUN_INVALID",
  "UNIT_SUITE_GATE_RUN_EXIT_UNKNOWN",
  "UNIT_SUITE_GATE_RUN_EXIT_NONZERO",
  "UNIT_SUITE_GATE_RUN_SIGNALED",
  "UNIT_SUITE_GATE_RUN_TIMED_OUT",
  "UNIT_SUITE_GATE_EVENTS_MISSING",
  "UNIT_SUITE_GATE_EVENTS_EMPTY",
  "UNIT_SUITE_GATE_EVENTS_INVALID",
  "UNIT_SUITE_GATE_ADAPTER_ISSUES",
  "UNIT_SUITE_GATE_VERDICT_FAIL",
] as const;

export type UnitSuiteGateReasonCode = (typeof UNIT_SUITE_GATE_REASON_CODES)[number];

export type StageName = "inventory" | "baseline" | "integrity" | "argv" | "run" | "events" | "adapter" | "verdict";
export type StageStatus = "OK" | "FAIL" | "NOT_EVALUATED";

const STAGE_ORDER: readonly StageName[] = ["inventory", "baseline", "integrity", "argv", "run", "events", "adapter", "verdict"];

export type GateReason = Readonly<{ code: UnitSuiteGateReasonCode; detail?: ReasonDetail }>;

type StageBase = Readonly<{ status: StageStatus; reasons: readonly GateReason[] }>;

export type InventoryStage = StageBase & Readonly<{ files: readonly string[]; issues: readonly InventoryIssue[] }>;
export type BaselineStage = StageBase & Readonly<{
  /** Arquivos do baseline aprovado pelo parser (vazio quando reprovado ou não avaliado). */
  files: readonly string[];
  /** Issues do parser do baseline, preservadas com os códigos originais. */
  issues: readonly BaselineIssue[];
  /** Proveniência DECLARADA no baseline; não é prova da origem das contagens. */
  provenance: BaselineProvenance | null;
  /** SHA-256 dos bytes do baseline informado pelo chamador. Não foi recalculado nem autenticado aqui. */
  sha256: string | null;
  /** Fixo: a origem das contagens não foi demonstrada, nem quando a decisão é PASS. */
  attestation: "not_demonstrated";
}>;
/** `files`: arquivos cujos digests foram comparados. */
export type IntegrityStage = StageBase & Readonly<{ files: readonly string[] }>;
/** `files`: argv normalizado (sem "./"), sem duplicatas. */
export type ArgvStage = StageBase & Readonly<{ files: readonly string[] }>;
export type RunStage = StageBase;
export type EventsStage = StageBase & Readonly<{ records: number; parseIssues: readonly UnitSuiteEventsIssue[] }>;
export type AdapterStage = StageBase & Readonly<{
  issues: readonly UnitSuiteEventsIssue[];
  observed: readonly ObservedFile[];
  globalSummaries: number;
}>;
export type VerdictStage = StageBase & Readonly<{ verdict: UnitSuiteVerdict | null }>;

export type DecisionReason = Readonly<{
  stage: StageName | "input";
  code: string;
  detail?: ReasonDetail;
}>;

export type UnitSuiteDecision = Readonly<{
  version: typeof UNIT_SUITE_DECISION_VERSION;
  decision: "PASS" | "FAIL";
  stages: Readonly<{
    inventory: InventoryStage;
    baseline: BaselineStage;
    integrity: IntegrityStage;
    argv: ArgvStage;
    run: RunStage;
    events: EventsStage;
    adapter: AdapterStage;
    verdict: VerdictStage;
  }>;
  /** Todos os motivos de reprovação, achatados e etiquetados com a etapa de origem. */
  reasons: readonly DecisionReason[];
  /** Versão do Node declarada no cabeçalho do NDJSON. Informativa: não influencia a decisão. */
  nodeVersion: string | null;
}>;

export type TestFileDigests = Readonly<{
  /** SHA-256 (64 hex minúsculos) dos bytes de cada arquivo de teste, calculado antes da execução. */
  before: Readonly<Record<string, string>> | null;
  /** Idem, após a execução. Deve ser null apenas quando `run` é null (testes não executados). */
  after: Readonly<Record<string, string>> | null;
}>;

export type UnitSuiteDecisionInput = Readonly<{
  manifestText: string;
  /** Texto do baseline (JSON). Obrigatoriamente passa por parseUnitSuiteBaseline. */
  baselineText: string;
  /** SHA-256 dos bytes originais do baseline, calculado pelo chamador; aqui só validado e reportado. */
  baselineSha256: string;
  testFileDigests: TestFileDigests;
  /** Arquivos passados ao runner, relativos à raiz do repositório. */
  argv: readonly string[];
  /** Conteúdo do NDJSON; null quando o artefato não existe. */
  eventsText: string | null;
  /** Observação da execução; null quando os testes não foram executados. */
  run: RunObservation | null;
  rootDir: string;
  cwd?: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function gate(code: UnitSuiteGateReasonCode, detail?: ReasonDetail): GateReason {
  return detail === undefined ? { code } : { code, detail };
}

function notEvaluated(stage: StageName, blockedBy: StageName | "input"): GateReason {
  return gate("UNIT_SUITE_GATE_STAGE_NOT_EVALUATED", { stage, blockedBy });
}

/**
 * Caminho de teste canônico, reutilizando as regras do inventário (sem absoluto, sem "..", extensão
 * permitida). Aceita "./" e "//" e devolve a forma normalizada.
 */
function normalizedPath(entry: unknown): string | null {
  if (typeof entry !== "string" || entry === "" || /\s/.test(entry)) return null;
  const parsed = parseUnitSuiteManifest(entry);
  return parsed.ok && parsed.files.length === 1 ? parsed.files[0] : null;
}

function diffSets(actual: readonly string[], expected: readonly string[]): { missing: string[]; extra: string[] } {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((file) => !actualSet.has(file)).sort(compareCodeUnits),
    extra: actual.filter((file) => !expectedSet.has(file)).sort(compareCodeUnits),
  };
}

/** Executa uma etapa; exceção vira etapa FAIL com GATE_INTERNAL_ERROR, nunca aprovação. */
function attempt<S extends StageBase>(stage: StageName, run: () => S, fallback: S): S {
  try {
    return run();
  } catch {
    return { ...fallback, status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_INTERNAL_ERROR", { stage })] };
  }
}

function inventoryStage(manifestText: unknown): InventoryStage {
  const parsed = parseUnitSuiteManifest(manifestText as string);
  if (parsed.ok) return { status: "OK", reasons: [], files: [...parsed.files], issues: [] };
  return {
    status: "FAIL",
    reasons: [gate("UNIT_SUITE_GATE_INVENTORY_INVALID", { issues: parsed.issues.length })],
    files: [],
    issues: [...parsed.issues],
  };
}

type BaselineResult = { stage: BaselineStage; expected: ExpectedFileBaseline[] | null; digests: BaselineDigest[] | null };

function baselineStage(baselineText: unknown, baselineSha256: unknown, inventory: InventoryStage): BaselineResult {
  const sha256 = typeof baselineSha256 === "string" && SHA256.test(baselineSha256) ? baselineSha256 : null;
  const shaReasons: GateReason[] = sha256 === null
    ? [gate("UNIT_SUITE_GATE_BASELINE_INVALID", { problem: "sha256", expected: "64 lowercase hex characters" })]
    : [];
  const base = { sha256, attestation: "not_demonstrated" } as const;

  if (inventory.status !== "OK") {
    return {
      stage: { ...base, status: "NOT_EVALUATED", reasons: [notEvaluated("baseline", "inventory"), ...shaReasons], files: [], issues: [], provenance: null },
      expected: null,
      digests: null,
    };
  }
  const parsed = parseUnitSuiteBaseline(baselineText as string, { expectedFiles: inventory.files });
  if (!parsed.ok) {
    return {
      stage: {
        ...base,
        status: "FAIL",
        reasons: [gate("UNIT_SUITE_GATE_BASELINE_INVALID", { issues: parsed.issues.length }), ...shaReasons],
        files: [],
        issues: [...parsed.issues],
        provenance: null,
      },
      expected: null,
      digests: null,
    };
  }
  return {
    stage: {
      ...base,
      status: shaReasons.length === 0 ? "OK" : "FAIL",
      reasons: shaReasons,
      files: parsed.files.map((entry) => entry.file),
      issues: [],
      provenance: { ...parsed.provenance },
    },
    expected: parsed.files.map((entry) => ({ ...entry })),
    digests: parsed.digests.map((entry) => ({ ...entry })),
  };
}

function digestMap(value: unknown, phase: "before" | "after", declared: ReadonlyMap<string, string>, reasons: GateReason[]): Map<string, string> | null {
  if (!isRecord(value)) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase, problem: "not_an_object" }));
    return null;
  }
  const valid = new Map<string, string>();
  const keys = Object.keys(value).sort(compareCodeUnits);
  for (const key of keys) {
    if (!declared.has(key)) {
      reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase, problem: "unexpected_file", file: key }));
      continue;
    }
    const digest = value[key];
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      reasons.push(gate("UNIT_SUITE_GATE_DIGEST_INVALID", { phase, file: key }));
      continue;
    }
    valid.set(key, digest);
  }
  for (const file of [...declared.keys()].sort(compareCodeUnits)) {
    const present = Object.prototype.hasOwnProperty.call(value, file);
    if (!present) reasons.push(gate("UNIT_SUITE_GATE_DIGEST_MISSING", { phase, file }));
  }
  return valid;
}

function integrityStage(digests: unknown, run: unknown, declaredDigests: BaselineDigest[] | null, baseline: BaselineStage): IntegrityStage {
  if (declaredDigests === null || baseline.status !== "OK") {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("integrity", "baseline")], files: [] };
  }
  const reasons: GateReason[] = [];
  const declared = new Map(declaredDigests.map((entry) => [entry.file, entry.sha256] as const));
  const files = [...declared.keys()].sort(compareCodeUnits);
  if (!isRecord(digests) || !("before" in digests) || !("after" in digests)) {
    return { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { problem: "testFileDigests_shape" })], files };
  }
  const executed = run !== null;
  if (digests.before === null || digests.before === undefined) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "before", problem: "required" }));
  }
  if (executed && (digests.after === null || digests.after === undefined)) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "after", problem: "required_when_run_present" }));
  }
  if (!executed && digests.after !== null) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "after", problem: "present_without_run" }));
  }
  const before = digests.before === null || digests.before === undefined ? null : digestMap(digests.before, "before", declared, reasons);
  const after = !executed || digests.after === null || digests.after === undefined ? null : digestMap(digests.after, "after", declared, reasons);

  for (const file of files) {
    const wanted = declared.get(file)!;
    const seenBefore = before?.get(file);
    const seenAfter = after?.get(file);
    if (seenBefore !== undefined && seenBefore !== wanted) reasons.push(gate("UNIT_SUITE_GATE_DIGEST_MISMATCH", { phase: "before", file }));
    if (seenAfter !== undefined && seenAfter !== wanted) reasons.push(gate("UNIT_SUITE_GATE_DIGEST_MISMATCH", { phase: "after", file }));
    if (seenBefore !== undefined && seenAfter !== undefined && seenBefore !== seenAfter) {
      reasons.push(gate("UNIT_SUITE_GATE_FILES_CHANGED_DURING_RUN", { file }));
    }
  }
  return { status: reasons.length === 0 ? "OK" : "FAIL", reasons, files };
}

function argvStage(argv: unknown, inventory: InventoryStage): ArgvStage {
  const reasons: GateReason[] = [];
  const files: string[] = [];
  if (!Array.isArray(argv)) {
    reasons.push(gate("UNIT_SUITE_GATE_ARGV_INVALID", { problem: "not_an_array" }));
  } else if (argv.length === 0) {
    reasons.push(gate("UNIT_SUITE_GATE_ARGV_INVALID", { problem: "empty" }));
  } else {
    const seen = new Set<string>();
    argv.forEach((entry: unknown, index) => {
      const file = normalizedPath(entry);
      if (file === null) {
        reasons.push(gate("UNIT_SUITE_GATE_ARGV_INVALID", { index, problem: "file" }));
      } else if (seen.has(file)) {
        reasons.push(gate("UNIT_SUITE_GATE_ARGV_DUPLICATE", { index, file }));
      } else {
        seen.add(file);
        files.push(file);
      }
    });
  }
  files.sort(compareCodeUnits);
  if (reasons.length > 0) return { status: "FAIL", reasons, files };
  if (inventory.status !== "OK") {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("argv", "inventory")], files };
  }
  const { missing, extra } = diffSets(files, inventory.files);
  for (const file of missing) reasons.push(gate("UNIT_SUITE_GATE_ARGV_MISSING_FILE", { file }));
  for (const file of extra) reasons.push(gate("UNIT_SUITE_GATE_ARGV_EXTRA_FILE", { file }));
  return { status: reasons.length === 0 ? "OK" : "FAIL", reasons, files };
}

function runStage(run: unknown): RunStage {
  if (run === null) return { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_RUN_NOT_EXECUTED")] };
  if (!isRecord(run) || typeof run.timedOut !== "boolean"
    || !(run.signal === null || typeof run.signal === "string")
    || !(run.exitCode === null || (typeof run.exitCode === "number" && Number.isSafeInteger(run.exitCode)))) {
    return { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_RUN_INVALID")] };
  }
  const reasons: GateReason[] = [];
  if (run.timedOut) reasons.push(gate("UNIT_SUITE_GATE_RUN_TIMED_OUT"));
  if (run.signal !== null) reasons.push(gate("UNIT_SUITE_GATE_RUN_SIGNALED", { signal: run.signal }));
  if (run.exitCode === null) {
    if (!run.timedOut && run.signal === null) reasons.push(gate("UNIT_SUITE_GATE_RUN_EXIT_UNKNOWN"));
  } else if (run.exitCode !== 0) {
    reasons.push(gate("UNIT_SUITE_GATE_RUN_EXIT_NONZERO", { exitCode: run.exitCode }));
  }
  return { status: reasons.length === 0 ? "OK" : "FAIL", reasons };
}

/** `records` é null quando o texto não pode ser interpretado (ausente, vazio ou de tipo errado). */
function eventsStage(eventsText: unknown): { stage: EventsStage; records: unknown[] | null } {
  if (eventsText === null) {
    return { stage: { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_EVENTS_MISSING")], records: 0, parseIssues: [] }, records: null };
  }
  if (typeof eventsText !== "string") {
    return {
      stage: { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_EVENTS_INVALID", { problem: "not_string" })], records: 0, parseIssues: [] },
      records: null,
    };
  }
  if (eventsText.trim() === "") {
    return { stage: { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_EVENTS_EMPTY")], records: 0, parseIssues: [] }, records: null };
  }
  const parsed = parseNdjson(eventsText);
  const reasons = parsed.issues.length > 0
    ? [gate("UNIT_SUITE_GATE_EVENTS_INVALID", { problem: "lines", count: parsed.issues.length })]
    : [];
  return {
    stage: { status: reasons.length === 0 ? "OK" : "FAIL", reasons, records: parsed.records.length, parseIssues: [...parsed.issues] },
    records: parsed.records,
  };
}

function adapterStage(records: unknown[] | null, rootDir: unknown, cwd: unknown): { stage: AdapterStage; nodeVersion: string | null } {
  if (records === null) {
    return {
      stage: { status: "NOT_EVALUATED", reasons: [notEvaluated("adapter", "events")], issues: [], observed: [], globalSummaries: 0 },
      nodeVersion: null,
    };
  }
  // cwd que não seja texto vira "" (inválido) em vez de null/undefined: o adaptador trata null como ausente
  // (`cwd ?? rootDir`), o que aprovaria silenciosamente uma entrada inválida.
  const options = cwd === undefined
    ? { rootDir: rootDir as string }
    : { rootDir: rootDir as string, cwd: typeof cwd === "string" ? cwd : "" };
  const adapted = adaptNodeEvents(records, options);
  const reasons = adapted.issues.length > 0 ? [gate("UNIT_SUITE_GATE_ADAPTER_ISSUES", { count: adapted.issues.length })] : [];
  return {
    stage: {
      status: reasons.length === 0 ? "OK" : "FAIL",
      reasons,
      issues: [...adapted.issues],
      observed: [...adapted.observed],
      globalSummaries: adapted.globalSummaries,
    },
    nodeVersion: adapted.nodeVersion,
  };
}

function verdictStage(expected: ExpectedFileBaseline[] | null, adapter: AdapterStage, run: unknown): VerdictStage {
  if (adapter.status === "NOT_EVALUATED") {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("verdict", "adapter")], verdict: null };
  }
  if (expected === null) {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("verdict", "baseline")], verdict: null };
  }
  if (run === null) {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("verdict", "run")], verdict: null };
  }
  const verdict = evaluateUnitSuite({
    expected,
    observed: adapter.observed,
    run: run as RunObservation,
  });
  return {
    status: verdict.status === "PASS" ? "OK" : "FAIL",
    reasons: verdict.status === "PASS" ? [] : [gate("UNIT_SUITE_GATE_VERDICT_FAIL", { reasons: verdict.reasons.length + verdict.files.reduce((sum, file) => sum + file.reasons.length, 0) })],
    verdict,
  };
}

function flattenReasons(stages: UnitSuiteDecision["stages"]): DecisionReason[] {
  const out: DecisionReason[] = [];
  for (const name of STAGE_ORDER) {
    const stage = stages[name];
    for (const entry of stage.reasons) out.push({ stage: name, ...entry });
    if (name === "inventory") {
      for (const issue of stages.inventory.issues) {
        const detail: Record<string, string | number> = { line: issue.line, entry: issue.entry };
        if (issue.detail !== undefined) detail.detail = issue.detail;
        out.push({ stage: name, code: issue.code, detail });
      }
    } else if (name === "baseline") {
      for (const issue of stages.baseline.issues) {
        const detail: Record<string, string> = { path: issue.path };
        if (issue.detail !== undefined) detail.detail = issue.detail;
        out.push({ stage: name, code: issue.code, detail });
      }
    } else if (name === "events") {
      for (const issue of stages.events.parseIssues) out.push({ stage: name, code: issue.code, detail: eventIssueDetail(issue) });
    } else if (name === "adapter") {
      for (const issue of stages.adapter.issues) out.push({ stage: name, code: issue.code, detail: eventIssueDetail(issue) });
    } else if (name === "verdict" && stages.verdict.verdict !== null) {
      for (const entry of stages.verdict.verdict.reasons) out.push({ stage: name, ...entry });
      for (const file of stages.verdict.verdict.files) {
        for (const entry of file.reasons) out.push({ stage: name, code: entry.code, detail: { file: file.file, ...entry.detail } });
      }
    }
  }
  return out;
}

function eventIssueDetail(issue: UnitSuiteEventsIssue): ReasonDetail {
  const detail: Record<string, string | number> = {};
  if (issue.seq !== undefined) detail.seq = issue.seq;
  if (issue.line !== undefined) detail.line = issue.line;
  if (issue.detail !== undefined) detail.detail = issue.detail;
  return detail;
}

const EMPTY_INVENTORY: InventoryStage = { status: "FAIL", reasons: [], files: [], issues: [] };
const EMPTY_BASELINE: BaselineStage = { status: "FAIL", reasons: [], files: [], issues: [], provenance: null, sha256: null, attestation: "not_demonstrated" };
const EMPTY_INTEGRITY: IntegrityStage = { status: "FAIL", reasons: [], files: [] };
const EMPTY_ARGV: ArgvStage = { status: "FAIL", reasons: [], files: [] };
const EMPTY_RUN: RunStage = { status: "FAIL", reasons: [] };
const EMPTY_EVENTS: EventsStage = { status: "FAIL", reasons: [], records: 0, parseIssues: [] };
const EMPTY_ADAPTER: AdapterStage = { status: "FAIL", reasons: [], issues: [], observed: [], globalSummaries: 0 };
const EMPTY_VERDICT: VerdictStage = { status: "FAIL", reasons: [], verdict: null };

function blockedDecision(code: "UNIT_SUITE_GATE_INPUT_INVALID" | "UNIT_SUITE_GATE_INTERNAL_ERROR"): UnitSuiteDecision {
  const blocked = <S extends StageBase>(stage: StageName, base: S): S => ({
    ...base,
    status: "NOT_EVALUATED",
    reasons: [notEvaluated(stage, "input")],
  });
  return {
    version: UNIT_SUITE_DECISION_VERSION,
    decision: "FAIL",
    stages: {
      inventory: blocked("inventory", EMPTY_INVENTORY),
      baseline: blocked("baseline", EMPTY_BASELINE),
      integrity: blocked("integrity", EMPTY_INTEGRITY),
      argv: blocked("argv", EMPTY_ARGV),
      run: blocked("run", EMPTY_RUN),
      events: blocked("events", EMPTY_EVENTS),
      adapter: blocked("adapter", EMPTY_ADAPTER),
      verdict: blocked("verdict", EMPTY_VERDICT),
    },
    reasons: [{ stage: "input", code }],
    nodeVersion: null,
  };
}

function decide(input: UnitSuiteDecisionInput): UnitSuiteDecision {
  if (!isRecord(input)) return blockedDecision("UNIT_SUITE_GATE_INPUT_INVALID");
  const raw = input as Record<string, unknown>;
  const run = raw.run;

  const inventory = attempt("inventory", () => inventoryStage(raw.manifestText), EMPTY_INVENTORY);

  let expected: ExpectedFileBaseline[] | null = null;
  let declaredDigests: BaselineDigest[] | null = null;
  const baseline = attempt("baseline", () => {
    const result = baselineStage(raw.baselineText, raw.baselineSha256, inventory);
    expected = result.expected;
    declaredDigests = result.digests;
    return result.stage;
  }, EMPTY_BASELINE);
  if (baseline.status !== "OK") {
    expected = null;
    declaredDigests = null;
  }

  const integrity = attempt("integrity", () => integrityStage(raw.testFileDigests, run, declaredDigests, baseline), EMPTY_INTEGRITY);
  const argv = attempt("argv", () => argvStage(raw.argv, inventory), EMPTY_ARGV);
  const runResult = attempt("run", () => runStage(run), EMPTY_RUN);

  let records: unknown[] | null = null;
  const events = attempt("events", () => {
    const result = eventsStage(raw.eventsText);
    records = result.records;
    return result.stage;
  }, EMPTY_EVENTS);
  if (events.status === "FAIL" && events.reasons.some((entry) => entry.code === "UNIT_SUITE_GATE_INTERNAL_ERROR")) records = null;

  let nodeVersion: string | null = null;
  const adapter = attempt("adapter", () => {
    const result = adapterStage(records, raw.rootDir, raw.cwd);
    nodeVersion = result.nodeVersion;
    return result.stage;
  }, EMPTY_ADAPTER);
  const verdict = attempt("verdict", () => verdictStage(expected, adapter, run), EMPTY_VERDICT);

  const stages = { inventory, baseline, integrity, argv, run: runResult, events, adapter, verdict };
  const pass = STAGE_ORDER.every((name) => stages[name].status === "OK") && verdict.verdict?.status === "PASS";
  return {
    version: UNIT_SUITE_DECISION_VERSION,
    decision: pass ? "PASS" : "FAIL",
    stages,
    reasons: flattenReasons(stages),
    nodeVersion,
  };
}

export function decideUnitSuite(input: UnitSuiteDecisionInput): UnitSuiteDecision {
  try {
    return decide(input);
  } catch {
    return blockedDecision("UNIT_SUITE_GATE_INTERNAL_ERROR");
  }
}

// ---------------------------------------------------------------------------------------------
// Modo observe (informativo, SEM baseline)
// ---------------------------------------------------------------------------------------------
//
// Mesma composição pura (inventário -> integridade -> argv -> execução -> eventos -> adaptador), mas sem
// baseline: produz contagens e SHA-256 CANDIDATOS por arquivo para revisão humana. Nunca aprova, nunca
// libera, nunca grava nem ratifica baseline e nunca emite "PASS" (`approval` é sempre "NONE").
//
// Estados:
//   OBSERVED_UNATTESTED    inventário, integridade (digest antes == depois), argv, processo, eventos,
//                          adaptador e completude por arquivo válidos, e nenhum teste falhou. As contagens
//                          são só observadas: `attestation` é "not_demonstrated".
//   OBSERVATION_FAILED     observação estruturalmente válida, mas há teste/suite falho, cancelado ou saída
//                          não zero explicada por falha. As contagens são informativas, não são candidatas.
//   OBSERVATION_INCOMPLETE qualquer falha de inventário, argv, integridade, processo (timeout, sinal, saída
//                          desconhecida ou não explicada), eventos, adaptador ou completude por arquivo.
//
// A completude por arquivo reaproveita `evaluateUnitSuite` com a expectativa derivada da própria
// observação (consistência interna: início x resultado, resumo, sem item de arquivo, sem suite falha),
// acrescida de um item esperado por arquivo do inventário: arquivo nunca iniciado reprova. Como não há
// contagem de referência, esta camada NÃO detecta mudança de contagem entre execuções; isso é papel do
// baseline, que o modo gate exige.
//
// Cobertura: skip/todo nunca contam como teste executado. `executed` = passed - skipped - todo. Arquivos que
// dependem de banco real (`*.realPostgres.integration.test.ts[x]`) são marcados `conditional`; ignorados por
// ausência de banco ficam com cobertura NOT_DEMONSTRATED.

export const UNIT_SUITE_OBSERVATION_VERSION = "unit-suite-observation.v1";

export type ObservationStatus = "OBSERVED_UNATTESTED" | "OBSERVATION_FAILED" | "OBSERVATION_INCOMPLETE";
export type ObservationCoverage = "DEMONSTRATED" | "PARTIAL" | "NOT_DEMONSTRATED";

/** Arquivos cuja cobertura depende de um serviço externo (banco real) e que se ignoram sem ele. */
export const CONDITIONAL_COVERAGE_FILE_PATTERN = /\.realPostgres\.integration\.test\.tsx?$/;

export function isConditionalCoverageFile(file: string): boolean {
  return CONDITIONAL_COVERAGE_FILE_PATTERN.test(file);
}

export type ObservedFileRow = Readonly<{
  file: string;
  /** SHA-256 do arquivo de teste antes da execução (candidato; não é baseline). */
  sha256: string | null;
  conditional: boolean;
  /** passed + failed + cancelled. Inclui os ignorados (skip/todo). */
  tests: number;
  /** passed - skipped - todo: testes realmente executados e aprovados. Skip nunca entra aqui. */
  executed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
  suiteFailures: number;
  coverage: ObservationCoverage;
  /** true somente quando a observação inteira é OBSERVED_UNATTESTED e o arquivo não tem problema. */
  candidate: boolean;
  problems: readonly string[];
}>;

export type ObservationTotals = Readonly<{
  files: number;
  filesObserved: number;
  tests: number;
  executed: number;
  skipped: number;
  todo: number;
  failed: number;
  cancelled: number;
  suiteFailures: number;
  filesPartial: number;
  filesNotDemonstrated: number;
  conditionalFiles: number;
  conditionalNotDemonstrated: number;
}>;

export type CompletenessStage = StageBase & Readonly<{ filesChecked: number }>;

export type UnitSuiteObservation = Readonly<{
  version: typeof UNIT_SUITE_OBSERVATION_VERSION;
  mode: "observe";
  status: ObservationStatus;
  /** Fixo: observação nunca é aprovação nem liberação. */
  approval: "NONE";
  /** Fixo: este modo não lê, não gera, não altera e não ratifica baseline. */
  baseline: Readonly<{ used: false; generated: false; ratified: false }>;
  /** Fixo: a origem das contagens não é demonstrada. */
  attestation: "not_demonstrated";
  stages: Readonly<{
    inventory: InventoryStage;
    integrity: IntegrityStage;
    argv: ArgvStage;
    run: RunStage;
    events: EventsStage;
    adapter: AdapterStage;
    completeness: CompletenessStage;
  }>;
  reasons: readonly DecisionReason[];
  files: readonly ObservedFileRow[];
  totals: ObservationTotals;
  nodeVersion: string | null;
}>;

export type UnitSuiteObservationInput = Readonly<{
  manifestText: string;
  testFileDigests: TestFileDigests;
  argv: readonly string[];
  eventsText: string | null;
  run: RunObservation | null;
  rootDir: string;
  cwd?: string;
}>;

const OBSERVATION_FAILURE_CLASS = new Set<string>([
  "UNIT_SUITE_RUN_EXIT_NONZERO",
  "UNIT_SUITE_TEST_FAILED",
  "UNIT_SUITE_SUITE_FAILED",
]);
const EMPTY_COMPLETENESS: CompletenessStage = { status: "FAIL", reasons: [], filesChecked: 0 };
const EMPTY_TOTALS: ObservationTotals = {
  files: 0, filesObserved: 0, tests: 0, executed: 0, skipped: 0, todo: 0, failed: 0, cancelled: 0, suiteFailures: 0,
  filesPartial: 0, filesNotDemonstrated: 0, conditionalFiles: 0, conditionalNotDemonstrated: 0,
};

function observeIntegrityStage(digests: unknown, run: unknown, inventory: InventoryStage): IntegrityStage {
  if (inventory.status !== "OK") {
    return { status: "NOT_EVALUATED", reasons: [notEvaluated("integrity", "inventory")], files: [] };
  }
  const files = [...inventory.files].sort(compareCodeUnits);
  if (!isRecord(digests) || !("before" in digests) || !("after" in digests)) {
    return { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { problem: "testFileDigests_shape" })], files };
  }
  const reasons: GateReason[] = [];
  const declared = new Map(files.map((file) => [file, ""] as const));
  const executed = run !== null;
  if (digests.before === null || digests.before === undefined) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "before", problem: "required" }));
  }
  if (executed && (digests.after === null || digests.after === undefined)) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "after", problem: "required_when_run_present" }));
  }
  if (!executed && digests.after !== null) {
    reasons.push(gate("UNIT_SUITE_GATE_INTEGRITY_INPUT_INVALID", { phase: "after", problem: "present_without_run" }));
  }
  const before = digests.before === null || digests.before === undefined ? null : digestMap(digests.before, "before", declared, reasons);
  const after = !executed || digests.after === null || digests.after === undefined ? null : digestMap(digests.after, "after", declared, reasons);
  for (const file of files) {
    const seenBefore = before?.get(file);
    const seenAfter = after?.get(file);
    if (seenBefore !== undefined && seenAfter !== undefined && seenBefore !== seenAfter) {
      reasons.push(gate("UNIT_SUITE_GATE_FILES_CHANGED_DURING_RUN", { file }));
    }
  }
  return { status: reasons.length === 0 ? "OK" : "FAIL", reasons, files };
}

type CompletenessResult = {
  stage: CompletenessStage;
  /** Motivos globais do verificador (não pertencem a um arquivo). */
  globalReasons: readonly string[];
  /** Problemas por arquivo do inventário, por código do verificador (sem prefixo). */
  fileProblems: ReadonlyMap<string, readonly string[]>;
  /** Algum código fora da classe "falha de teste" (a observação não é confiável). */
  structural: boolean;
};

function observeCompleteness(inventory: InventoryStage, adapter: AdapterStage, run: unknown): CompletenessResult {
  const blocked = (blockedBy: StageName): CompletenessResult => ({
    stage: { status: "NOT_EVALUATED", reasons: [notEvaluated("verdict", blockedBy)], filesChecked: 0 },
    globalReasons: [],
    fileProblems: new Map(),
    structural: true,
  });
  if (inventory.status !== "OK") return blocked("inventory");
  if (adapter.status === "NOT_EVALUATED") return blocked("adapter");
  if (run === null) return blocked("run");

  const byFile = new Map<string, ObservedFile>();
  for (const entry of adapter.observed) byFile.set(entry.file, entry);
  const expected: ExpectedFileBaseline[] = inventory.files.map((file) => {
    const seen = byFile.get(file);
    const received = seen === undefined ? 0 : seen.passed + seen.failed + seen.cancelled;
    const usable = seen !== undefined && received >= 1 && seen.skipped <= received && seen.todo <= received;
    return usable ? { file, tests: received, skipped: seen.skipped, todo: seen.todo } : { file, tests: 1, skipped: 0 };
  });
  const verdict = evaluateUnitSuite({ expected, observed: adapter.observed, run: run as RunObservation });

  const strip = (code: string): string => code.replace(/^UNIT_SUITE_/, "");
  const fileProblems = new Map<string, readonly string[]>();
  const codes: string[] = verdict.reasons.map((entry) => entry.code);
  for (const entry of verdict.files) {
    fileProblems.set(entry.file, entry.reasons.map((item) => strip(item.code)));
    codes.push(...entry.reasons.map((item) => item.code));
  }
  const failed = verdict.status !== "PASS";
  return {
    stage: {
      status: failed ? "FAIL" : "OK",
      reasons: failed ? [gate("UNIT_SUITE_GATE_VERDICT_FAIL", { reasons: codes.length })] : [],
      filesChecked: verdict.files.length,
    },
    globalReasons: verdict.reasons.map((entry) => strip(entry.code)),
    fileProblems,
    structural: codes.some((code) => !OBSERVATION_FAILURE_CLASS.has(code)),
  };
}

function coverageOf(row: Omit<ObservedFileRow, "coverage" | "candidate">, status: ObservationStatus): ObservationCoverage {
  if (status === "OBSERVATION_INCOMPLETE") return "NOT_DEMONSTRATED";
  if (row.tests === 0 || row.executed === 0) return "NOT_DEMONSTRATED";
  if (row.skipped + row.todo + row.failed + row.cancelled + row.suiteFailures > 0 || row.problems.length > 0) return "PARTIAL";
  return "DEMONSTRATED";
}

function observedRows(
  inventory: InventoryStage, adapter: AdapterStage, completeness: CompletenessResult, before: Record<string, unknown>, status: ObservationStatus,
): ObservedFileRow[] {
  const byFile = new Map<string, ObservedFile>();
  const duplicated = new Set<string>();
  for (const entry of adapter.observed) {
    if (byFile.has(entry.file)) duplicated.add(entry.file);
    byFile.set(entry.file, entry);
  }
  const count = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0);
  return [...inventory.files].sort(compareCodeUnits).map((file) => {
    const seen = duplicated.has(file) ? undefined : byFile.get(file);
    const digest = before[file];
    const problems = completeness.fileProblems.get(file) ?? [];
    const passed = seen === undefined ? 0 : count(seen.passed);
    const skipped = seen === undefined ? 0 : count(seen.skipped);
    const todo = seen === undefined ? 0 : count(seen.todo);
    const failed = seen === undefined ? 0 : count(seen.failed);
    const cancelled = seen === undefined ? 0 : count(seen.cancelled);
    const base = {
      file,
      sha256: typeof digest === "string" && SHA256.test(digest) ? digest : null,
      conditional: isConditionalCoverageFile(file),
      tests: passed + failed + cancelled,
      executed: Math.max(0, passed - skipped - todo),
      failed,
      cancelled,
      skipped,
      todo,
      suiteFailures: seen === undefined ? 0 : count(seen.suiteFailures),
      problems,
    };
    return { ...base, coverage: coverageOf(base, status), candidate: status === "OBSERVED_UNATTESTED" && problems.length === 0 };
  });
}

function totalsOf(rows: readonly ObservedFileRow[], filesObserved: number): ObservationTotals {
  const sum = (pick: (row: ObservedFileRow) => number): number => rows.reduce((total, row) => total + pick(row), 0);
  return {
    files: rows.length,
    filesObserved,
    tests: sum((row) => row.tests),
    executed: sum((row) => row.executed),
    skipped: sum((row) => row.skipped),
    todo: sum((row) => row.todo),
    failed: sum((row) => row.failed),
    cancelled: sum((row) => row.cancelled),
    suiteFailures: sum((row) => row.suiteFailures),
    filesPartial: rows.filter((row) => row.coverage === "PARTIAL").length,
    filesNotDemonstrated: rows.filter((row) => row.coverage === "NOT_DEMONSTRATED").length,
    conditionalFiles: rows.filter((row) => row.conditional).length,
    conditionalNotDemonstrated: rows.filter((row) => row.conditional && row.coverage !== "DEMONSTRATED").length,
  };
}

function flattenObservationReasons(
  stages: UnitSuiteObservation["stages"], completeness: CompletenessResult, rows: readonly ObservedFileRow[],
): DecisionReason[] {
  const out: DecisionReason[] = [];
  const order = ["inventory", "integrity", "argv", "run", "events", "adapter"] as const;
  for (const name of order) {
    for (const entry of stages[name].reasons) out.push({ stage: name, ...entry });
    if (name === "inventory") {
      for (const issue of stages.inventory.issues) {
        const detail: Record<string, string | number> = { line: issue.line, entry: issue.entry };
        if (issue.detail !== undefined) detail.detail = issue.detail;
        out.push({ stage: name, code: issue.code, detail });
      }
    } else if (name === "events") {
      for (const issue of stages.events.parseIssues) out.push({ stage: name, code: issue.code, detail: eventIssueDetail(issue) });
    } else if (name === "adapter") {
      for (const issue of stages.adapter.issues) out.push({ stage: name, code: issue.code, detail: eventIssueDetail(issue) });
    }
  }
  for (const entry of stages.completeness.reasons) out.push({ stage: "verdict", ...entry });
  for (const code of completeness.globalReasons) out.push({ stage: "verdict", code });
  for (const row of rows) for (const code of row.problems) out.push({ stage: "verdict", code, detail: { file: row.file } });
  return out;
}

function blockedObservation(code: "UNIT_SUITE_GATE_INPUT_INVALID" | "UNIT_SUITE_GATE_INTERNAL_ERROR"): UnitSuiteObservation {
  const blocked = <S extends StageBase>(stage: StageName, base: S): S => ({ ...base, status: "NOT_EVALUATED", reasons: [notEvaluated(stage, "input")] });
  return {
    version: UNIT_SUITE_OBSERVATION_VERSION,
    mode: "observe",
    status: "OBSERVATION_INCOMPLETE",
    approval: "NONE",
    baseline: { used: false, generated: false, ratified: false },
    attestation: "not_demonstrated",
    stages: {
      inventory: blocked("inventory", EMPTY_INVENTORY),
      integrity: blocked("integrity", EMPTY_INTEGRITY),
      argv: blocked("argv", EMPTY_ARGV),
      run: blocked("run", EMPTY_RUN),
      events: blocked("events", EMPTY_EVENTS),
      adapter: blocked("adapter", EMPTY_ADAPTER),
      completeness: blocked("verdict", EMPTY_COMPLETENESS),
    },
    reasons: [{ stage: "input", code }],
    files: [],
    totals: EMPTY_TOTALS,
    nodeVersion: null,
  };
}

function observe(input: UnitSuiteObservationInput): UnitSuiteObservation {
  if (!isRecord(input)) return blockedObservation("UNIT_SUITE_GATE_INPUT_INVALID");
  const raw = input as Record<string, unknown>;
  const run = raw.run;

  const inventory = attempt("inventory", () => inventoryStage(raw.manifestText), EMPTY_INVENTORY);
  const integrity = attempt("integrity", () => observeIntegrityStage(raw.testFileDigests, run, inventory), EMPTY_INTEGRITY);
  const argv = attempt("argv", () => argvStage(raw.argv, inventory), EMPTY_ARGV);
  const runResult = attempt("run", () => runStage(run), EMPTY_RUN);

  let records: unknown[] | null = null;
  const events = attempt("events", () => {
    const result = eventsStage(raw.eventsText);
    records = result.records;
    return result.stage;
  }, EMPTY_EVENTS);
  if (events.status === "FAIL" && events.reasons.some((entry) => entry.code === "UNIT_SUITE_GATE_INTERNAL_ERROR")) records = null;

  let nodeVersion: string | null = null;
  const adapter = attempt("adapter", () => {
    const result = adapterStage(records, raw.rootDir, raw.cwd);
    nodeVersion = result.nodeVersion;
    return result.stage;
  }, EMPTY_ADAPTER);

  let completeness: CompletenessResult;
  try {
    completeness = observeCompleteness(inventory, adapter, run);
  } catch {
    completeness = {
      stage: { status: "FAIL", reasons: [gate("UNIT_SUITE_GATE_INTERNAL_ERROR", { stage: "verdict" })], filesChecked: 0 },
      globalReasons: [], fileProblems: new Map(), structural: true,
    };
  }

  const stages = { inventory, integrity, argv, run: runResult, events, adapter, completeness: completeness.stage };
  const allOk = Object.values(stages).every((stage) => stage.status === "OK");
  const digests = isRecord(raw.testFileDigests) && isRecord(raw.testFileDigests.before) ? raw.testFileDigests.before : {};

  // Primeira passada só para decidir estrutural x falha de teste; as linhas finais dependem do estado.
  const provisional = observedRows(inventory, adapter, completeness, digests, "OBSERVATION_FAILED");
  const failureEvidence = provisional.some((row) => row.failed > 0 || row.cancelled > 0 || row.suiteFailures > 0);
  const structural = [inventory, integrity, argv, events, adapter].some((stage) => stage.status !== "OK")
    || completeness.stage.status === "NOT_EVALUATED"
    || completeness.structural
    || runResult.reasons.some((entry) => entry.code !== "UNIT_SUITE_GATE_RUN_EXIT_NONZERO")
    // saída não zero sem nenhum teste/suite falho: falha não explicada pelos eventos
    || (!allOk && !failureEvidence);
  const status: ObservationStatus = allOk ? "OBSERVED_UNATTESTED" : structural ? "OBSERVATION_INCOMPLETE" : "OBSERVATION_FAILED";

  const rows = observedRows(inventory, adapter, completeness, digests, status);
  const observedFiles = new Set(adapter.observed.map((entry) => entry.file));
  return {
    version: UNIT_SUITE_OBSERVATION_VERSION,
    mode: "observe",
    status,
    approval: "NONE",
    baseline: { used: false, generated: false, ratified: false },
    attestation: "not_demonstrated",
    stages,
    reasons: flattenObservationReasons(stages, completeness, rows),
    files: rows,
    totals: totalsOf(rows, rows.filter((row) => observedFiles.has(row.file)).length),
    nodeVersion,
  };
}

export function observeUnitSuite(input: UnitSuiteObservationInput): UnitSuiteObservation {
  try {
    return observe(input);
  } catch {
    return blockedObservation("UNIT_SUITE_GATE_INTERNAL_ERROR");
  }
}
