// Lançador supervisionado do gate de completude da suíte unitária.
//
// Camada de E/S fina sobre os módulos puros do gate (inventário, baseline, reporter NDJSON, adaptador,
// verificador e decisão). Não é um runner: executa o `node --test` existente, com o reporter NDJSON, e
// entrega todas as evidências a `decideUnitSuite`. O código de saída vem só do envelope final.
//
// Fluxo (cada passo falha fechado):
//   1. valida opções, plataforma, caminhos e limites; falha aqui => exit 2, sem artefatos
//   2. cria o diretório de execução de forma exclusiva (colisão => exit 2, nada é sobrescrito)
//   3. lê manifesto e baseline (teto de 1 MiB), calcula o SHA-256 dos bytes do baseline e dos arquivos
//      de teste (teto de 16 MiB cada); o baseline só é aberto para leitura
//   4. pré-verificação com `decideUnitSuite` (run: null): inventário, baseline, integridade e argv; se
//      algo reprova, NENHUM teste é iniciado
//   5. executa `node --import <tsx> --test --test-reporter=<reporter> <arquivos>` com `spawn`, grupo de
//      processos próprio (detached), ambiente mínimo e stdout/stderr direto em arquivos
//   6. timeout global: SIGTERM ao grupo, tolerância, SIGKILL; espera `close`; confere se sobraram
//      processos no grupo (sobra => encerra à força e registra falha)
//   7. lê o NDJSON (teto de 64 MiB), recalcula os SHA-256 dos testes e chama `decideUnitSuite`
//   8. grava `decision.json` (envelope launcher/decision/final) com `wx` e confere a gravação
//
// Evidências por execução, em <outDir>/<runId>/: events.ndjson (criado pelo reporter), stdout.txt,
// stderr.txt e decision.json. Campo não disponível é registrado como { available:false, reason }.
//
// Códigos de saída: 0 = PASS; 1 = FAIL com evidências gravadas; 2 = erro de lançamento (opções ou
// configuração inválidas, colisão de runId, diretório indisponível, falha ao gravar o envelope).
//
// Limitações conhecidas: só o grupo de processos próprio é supervisionado; um descendente que crie
// novo grupo/sessão escapa do encerramento e da verificação. O Node não oferece teto portável de memória.
//
// Modo observe (`runUnitSuiteObserve`, CLI `--mode observe`): MESMO executor supervisionado, SEM baseline.
// Não lê nem aceita baseline (`--baseline` é rejeitado), não grava nem ratifica baseline e nunca emite
// "PASS": o envelope tem `mode: "observe"`, `observation` (contagens e SHA-256 candidatos por arquivo) e
// `final` ∈ { OBSERVED_UNATTESTED, OBSERVATION_FAILED, OBSERVATION_INCOMPLETE }. Qualquer issue do lançador
// (processo remanescente, artefato ausente, eventos ilegíveis...) rebaixa o `final` para
// OBSERVATION_INCOMPLETE. Códigos de saída: 0 = OBSERVED_UNATTESTED (observação completa; NÃO é aprovação);
// 1 = observação falha ou incompleta, com evidências gravadas; 2 = erro de lançamento.

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseUnitSuiteManifest } from "./unitSuiteInventory";
import {
  decideUnitSuite,
  observeUnitSuite,
  type ObservationStatus,
  type TestFileDigests,
  type UnitSuiteDecision,
  type UnitSuiteDecisionInput,
  type UnitSuiteObservation,
} from "./unitSuiteDecision";
import type { RunObservation } from "./unitSuiteVerdict";

export const UNIT_SUITE_GATE_RESULT_SCHEMA = "unit-suite-gate-result.v1";
export const UNIT_SUITE_OBSERVE_RESULT_SCHEMA = "unit-suite-observe-result.v1";

export type LauncherMode = "gate" | "observe";

export const MAX_TEXT_INPUT_BYTES = 1024 * 1024;
export const MAX_TEST_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_EVENTS_BYTES = 64 * 1024 * 1024;
const MAX_CAPTURE_HASH_BYTES = 256 * 1024 * 1024;
export const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_KILL_GRACE_MS = 2000;
const REMAINING_POLL_TIMEOUT_MS = 1500;

/** Variáveis herdadas do processo pai, e somente estas. Nada de segredos nem URLs de serviços. */
export const ENV_ALLOWLIST = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"] as const;
/** Mesmo valor do job CiUnitSuite: banco deliberadamente inalcançável. */
export const DATABASE_URL_SENTINEL = "postgresql://user:pass@127.0.0.1:1/test";

export const ARTIFACT_NAMES = { events: "events.ndjson", stdout: "stdout.txt", stderr: "stderr.txt", decision: "decision.json" } as const;

export const LAUNCHER_ISSUE_CODES = [
  "UNIT_SUITE_LAUNCHER_INTERNAL_ERROR",
  "UNIT_SUITE_LAUNCHER_INPUT_UNREADABLE",
  "UNIT_SUITE_LAUNCHER_INPUT_TOO_LARGE",
  "UNIT_SUITE_LAUNCHER_INPUT_NOT_UTF8",
  "UNIT_SUITE_LAUNCHER_TEST_FILE_UNREADABLE",
  "UNIT_SUITE_LAUNCHER_TEST_FILE_TOO_LARGE",
  "UNIT_SUITE_LAUNCHER_TEST_FILE_OUTSIDE_ROOT",
  "UNIT_SUITE_LAUNCHER_PREFLIGHT_FAILED",
  "UNIT_SUITE_LAUNCHER_STDIO_CAPTURE_FAILED",
  "UNIT_SUITE_LAUNCHER_EVENTS_PREEXISTING",
  "UNIT_SUITE_LAUNCHER_SPAWN_ERROR",
  "UNIT_SUITE_LAUNCHER_SIGNAL_ERROR",
  "UNIT_SUITE_LAUNCHER_PROCESSES_REMAINING",
  "UNIT_SUITE_LAUNCHER_EVENTS_UNREADABLE",
  "UNIT_SUITE_LAUNCHER_EVENTS_TOO_LARGE",
  "UNIT_SUITE_LAUNCHER_ARTIFACT_MISSING",
] as const;

export type LauncherIssueCode = (typeof LAUNCHER_ISSUE_CODES)[number];
export type LauncherIssue = Readonly<{ code: LauncherIssueCode; detail?: string }>;

export const LAUNCH_ERROR_CODES = [
  "UNIT_SUITE_LAUNCHER_OPTIONS_INVALID",
  "UNIT_SUITE_LAUNCHER_RUN_DIR_EXISTS",
  "UNIT_SUITE_LAUNCHER_RUN_DIR_UNAVAILABLE",
  "UNIT_SUITE_LAUNCHER_PERSIST_FAILED",
  "UNIT_SUITE_LAUNCHER_UNEXPECTED_ERROR",
] as const;

export type LaunchErrorCode = (typeof LAUNCH_ERROR_CODES)[number];
export type LaunchError = Readonly<{ code: LaunchErrorCode; detail: string }>;

export type Evidence<T> = Readonly<{ available: true; value: T }> | Readonly<{ available: false; reason: string }>;

export type UnitSuiteGateOptions = Readonly<{
  /** Raiz do repositório (ou da fixture): caminho absoluto de um diretório existente. */
  rootDir: string;
  /** Caminhos absolutos ou relativos à raiz. */
  manifestPath: string;
  /** Obrigatório no modo gate. No modo observe NÃO é aceito (observe não usa baseline). */
  baselinePath?: string;
  /** Diretório pai das execuções. Criado se não existir; cada execução usa <outDir>/<runId>. */
  outDir: string;
  /** Padrão ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$. Gerado quando omitido. */
  runId?: string;
  /** Timeout global de relógio, inteiro em (0, MAX_TIMEOUT_MS]. Obrigatório (sem padrão). */
  timeoutMs: number;
  /** Arquivos de teste passados ao runner, relativos à raiz (o mesmo `argv` verificado pela decisão). */
  files: readonly string[];
  /** Caminho absoluto de unitSuiteReporter.mjs. */
  reporterPath: string;
  /** Caminho absoluto (ou URL file:) do loader tsx. Padrão: resolvido a partir da raiz. */
  tsxLoader?: string;
  /** Caminho de tsconfig (relativo à raiz) exportado como TSX_TSCONFIG_PATH. */
  tsconfigPath?: string;
  /** Executável do Node. Padrão: process.execPath. */
  nodeExecutable?: string;
  killGraceMs?: number;
  /** Ambiente de origem da allowlist. Padrão: process.env. */
  parentEnv?: NodeJS.ProcessEnv;
  /** Somente para testes: pontos de injeção de falha. Não usar em produção. */
  testHooks?: Readonly<{
    beforeSpawn?: (runDir: string) => void;
    beforePersist?: (runDir: string) => void;
  }>;
}>;

export type ProcessEvidence = Readonly<{
  pid: number | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  spawnError: string | null;
  durationMs: number;
  /** Havia processos no grupo depois do encerramento do líder (foram encerrados à força). */
  remainingAfterClose: boolean;
  forcedKill: boolean;
}>;

export type FileDigest = Readonly<{ sha256: string; bytes: number }>;

export type GateLauncherEvidence = Readonly<{
  runId: string;
  platform: string;
  launcherNodeVersion: string;
  rootDir: string;
  timeoutMs: number;
  killGraceMs: number;
  files: readonly string[];
  /** Somente nomes: valores de ambiente nunca são gravados. */
  env: Readonly<{ allowlist: readonly string[]; inherited: readonly string[]; injected: readonly string[]; droppedCount: number }>;
  inputs: Readonly<{ manifest: Evidence<{ path: string; bytes: number; sha256: string }>; baseline: Evidence<{ path: string; bytes: number; sha256: string }> }>;
  testFileDigests: Readonly<{ before: Evidence<Record<string, string>>; after: Evidence<Record<string, string>> }>;
  process: Evidence<ProcessEvidence>;
  artifacts: Readonly<{
    events: Evidence<{ path: string; bytes: number; sha256: string }>;
    stdout: Evidence<{ path: string; bytes: number; sha256: string }>;
    stderr: Evidence<{ path: string; bytes: number; sha256: string }>;
  }>;
  issues: readonly LauncherIssue[];
}>;

export type GateEnvelope = Readonly<{
  schema: typeof UNIT_SUITE_GATE_RESULT_SCHEMA;
  startedAt: string;
  finishedAt: string;
  launcher: GateLauncherEvidence;
  decision: UnitSuiteDecision;
  final: "PASS" | "FAIL";
}>;

export type UnitSuiteGateResult = Readonly<{
  exitCode: 0 | 1 | 2;
  final: "PASS" | "FAIL" | "ERROR";
  runDir: string | null;
  envelope: GateEnvelope | null;
  persisted: boolean;
  errors: readonly LaunchError[];
}>;

/** Envelope do modo observe: sem decisão de aprovação e sem baseline. `final` nunca é "PASS". */
export type ObserveEnvelope = Readonly<{
  schema: typeof UNIT_SUITE_OBSERVE_RESULT_SCHEMA;
  mode: "observe";
  startedAt: string;
  finishedAt: string;
  launcher: GateLauncherEvidence;
  observation: UnitSuiteObservation;
  final: ObservationStatus;
}>;

export type UnitSuiteObserveResult = Readonly<{
  exitCode: 0 | 1 | 2;
  final: ObservationStatus | "ERROR";
  runDir: string | null;
  envelope: ObserveEnvelope | null;
  persisted: boolean;
  errors: readonly LaunchError[];
}>;

// ---------------------------------------------------------------------------------------------
// Utilitários de E/S
// ---------------------------------------------------------------------------------------------

type HashOutcome =
  | { ok: true; sha256: string; bytes: number; data?: Buffer }
  | { ok: false; code: "UNREADABLE" | "TOO_LARGE"; detail: string };

/** Lê o arquivo por descritor, com teto de bytes, calculando o SHA-256 dos bytes lidos. */
function readAndHash(file: string, maxBytes: number, keep: boolean): HashOutcome {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { ok: false, code: "UNREADABLE", detail: "not a regular file" };
    if (stat.size > maxBytes) return { ok: false, code: "TOO_LARGE", detail: `${stat.size} bytes > ${maxBytes}` };
    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      total += read;
      if (total > maxBytes) return { ok: false, code: "TOO_LARGE", detail: `grew beyond ${maxBytes} bytes while reading` };
      const slice = buffer.subarray(0, read);
      hash.update(slice);
      if (keep) chunks.push(Buffer.from(slice));
    }
    return { ok: true, sha256: hash.digest("hex"), bytes: total, ...(keep ? { data: Buffer.concat(chunks) } : {}) };
  } catch (error) {
    return { ok: false, code: "UNREADABLE", detail: errorCode(error) };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* o descritor já foi lido ou falhou */ }
    }
  }
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name : "unknown";
}

function unavailable(reason: string): { available: false; reason: string } {
  return { available: false, reason };
}

function available<T>(value: T): { available: true; value: T } {
  return { available: true, value };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------------------------
// Supervisão do processo
// ---------------------------------------------------------------------------------------------

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

type Supervised = {
  evidence: ProcessEvidence;
  signalErrors: string[];
  stillRemaining: boolean;
  /** O runner não fechou nem após SIGKILL e a espera máxima: o lançador desistiu de esperar. */
  abandoned: boolean;
};

async function waitGroupGone(pid: number, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (groupAlive(pid) && Date.now() < deadline) await sleep(25);
}

async function superviseNodeTest(spec: {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdoutFd: number;
  stderrFd: number;
  timeoutMs: number;
  killGraceMs: number;
}): Promise<Supervised> {
  const started = Date.now();
  const signalErrors: string[] = [];
  let timedOut = false;
  let forcedKill = false;
  let spawnError: string | null = null;
  let killTimer: NodeJS.Timeout | undefined;

  const child = spawn(spec.executable, [...spec.args], {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ["ignore", spec.stdoutFd, spec.stderrFd],
    detached: true,
  });
  const pid = child.pid ?? null;

  const signalGroup = (signal: NodeJS.Signals) => {
    if (pid === null) return;
    try {
      process.kill(-pid, signal);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ESRCH") signalErrors.push(`${signal}:${code}`);
    }
  };

  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null; abandoned: boolean }>((resolve) => {
    child.on("error", (error) => {
      spawnError = errorCode(error);
      if (child.pid === undefined) resolve({ code: null, signal: null, abandoned: false });
    });
    child.on("close", (code, signal) => resolve({ code, signal, abandoned: false }));
  });

  // O escalonamento SIGTERM -> SIGKILL não depende de o runner fechar: um runner que ignora SIGTERM é morto.
  const timer = setTimeout(() => {
    timedOut = true;
    signalGroup("SIGTERM");
    killTimer = setTimeout(() => {
      forcedKill = true;
      signalGroup("SIGKILL");
    }, spec.killGraceMs);
  }, spec.timeoutMs);
  // Limite rígido: se nem o SIGKILL fizer o runner fechar, o lançador desiste em vez de ficar pendurado.
  let hardTimer: NodeJS.Timeout | undefined;
  const hardLimit = new Promise<{ code: null; signal: null; abandoned: true }>((resolve) => {
    hardTimer = setTimeout(() => resolve({ code: null, signal: null, abandoned: true }), spec.timeoutMs + spec.killGraceMs + REMAINING_POLL_TIMEOUT_MS + 1000);
  });

  const outcome = await Promise.race([closed, hardLimit]);
  clearTimeout(timer);
  clearTimeout(hardTimer);

  let remainingAfterClose = false;
  let stillRemaining = outcome.abandoned;
  if (pid !== null) {
    if (timedOut) {
      // O SIGKILL agendado ainda pode disparar: esperar o grupo inteiro sumir antes de concluir.
      await waitGroupGone(pid, spec.killGraceMs + REMAINING_POLL_TIMEOUT_MS);
      clearTimeout(killTimer);
      if (groupAlive(pid)) {
        forcedKill = true;
        signalGroup("SIGKILL");
        await waitGroupGone(pid, REMAINING_POLL_TIMEOUT_MS);
      }
    } else {
      clearTimeout(killTimer);
      if (groupAlive(pid)) {
        remainingAfterClose = true;
        forcedKill = true;
        signalGroup("SIGKILL");
        await waitGroupGone(pid, REMAINING_POLL_TIMEOUT_MS);
      }
    }
    stillRemaining = stillRemaining || groupAlive(pid);
  }

  return {
    evidence: {
      pid,
      exitCode: outcome.code,
      signal: outcome.signal,
      timedOut,
      spawnError,
      durationMs: Date.now() - started,
      remainingAfterClose,
      forcedKill,
    },
    signalErrors,
    stillRemaining,
    abandoned: outcome.abandoned,
  };
}

// ---------------------------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------------------------

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type ResolvedOptions = {
  rootDir: string;
  manifestPath: string;
  baselinePath: string;
  outDir: string;
  runId: string;
  timeoutMs: number;
  killGraceMs: number;
  files: string[];
  reporterPath: string;
  tsxLoaderUrl: string;
  tsconfigPath: string | null;
  nodeExecutable: string;
  parentEnv: NodeJS.ProcessEnv;
  testHooks: UnitSuiteGateOptions["testHooks"];
};

function resolveOptions(options: UnitSuiteGateOptions, mode: LauncherMode): { ok: true; value: ResolvedOptions } | { ok: false; errors: LaunchError[] } {
  const errors: LaunchError[] = [];
  const bad = (detail: string) => errors.push({ code: "UNIT_SUITE_LAUNCHER_OPTIONS_INVALID", detail });
  if (typeof options !== "object" || options === null) return { ok: false, errors: [{ code: "UNIT_SUITE_LAUNCHER_OPTIONS_INVALID", detail: "options must be an object" }] };

  if (process.platform !== "linux" && process.platform !== "darwin") bad(`unsupported platform: ${process.platform}`);

  let rootDir = "";
  if (typeof options.rootDir !== "string" || !path.isAbsolute(options.rootDir)) bad("rootDir must be an absolute path");
  else {
    try {
      rootDir = fs.realpathSync(options.rootDir);
      if (!fs.statSync(rootDir).isDirectory()) bad("rootDir is not a directory");
    } catch {
      bad("rootDir does not exist");
    }
  }

  const within = (value: unknown, label: string): string => {
    if (typeof value !== "string" || value === "") {
      bad(`${label} must be a non-empty string`);
      return "";
    }
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(rootDir || "/", value);
  };
  const manifestPath = within(options.manifestPath, "manifestPath");
  let baselinePath = "";
  if (mode === "observe") {
    // observe não usa baseline: aceitar o caminho permitiria misturar os dois contratos.
    if (options.baselinePath !== undefined) bad("baselinePath is not accepted in observe mode");
  } else {
    baselinePath = within(options.baselinePath, "baselinePath");
  }
  const outDir = within(options.outDir, "outDir");

  if (typeof options.reporterPath !== "string" || !path.isAbsolute(options.reporterPath)) bad("reporterPath must be an absolute path");

  if (typeof options.timeoutMs !== "number" || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > MAX_TIMEOUT_MS) {
    bad(`timeoutMs must be an integer in (0, ${MAX_TIMEOUT_MS}]`);
  }
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  if (!Number.isSafeInteger(killGraceMs) || killGraceMs < 0 || killGraceMs > 60_000) bad("killGraceMs must be an integer in [0, 60000]");

  const runId = options.runId ?? `${Date.now().toString(36)}-${process.pid}-${randomBytes(4).toString("hex")}`;
  if (typeof runId !== "string" || !RUN_ID.test(runId)) bad("runId must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");

  const files: string[] = [];
  if (!Array.isArray(options.files) || options.files.length === 0) bad("files must be a non-empty array");
  else {
    const seen = new Set<string>();
    for (const entry of options.files as unknown[]) {
      const parsed = typeof entry === "string" && entry !== "" && !/\s/.test(entry) ? parseUnitSuiteManifest(entry) : null;
      if (parsed === null || !parsed.ok || parsed.files.length !== 1) {
        bad(`unsafe test file path: ${String(entry)}`);
        continue;
      }
      if (seen.has(parsed.files[0])) {
        bad(`duplicate test file: ${parsed.files[0]}`);
        continue;
      }
      seen.add(parsed.files[0]);
      files.push(parsed.files[0]);
    }
  }

  let tsxLoaderUrl = "";
  if (options.tsxLoader !== undefined) {
    if (typeof options.tsxLoader !== "string" || options.tsxLoader === "") bad("tsxLoader must be a non-empty string");
    else if (options.tsxLoader.startsWith("file:")) tsxLoaderUrl = options.tsxLoader;
    else if (!path.isAbsolute(options.tsxLoader)) bad("tsxLoader must be an absolute path or a file: URL");
    else tsxLoaderUrl = pathToFileURL(options.tsxLoader).href;
  } else if (rootDir !== "") {
    try {
      tsxLoaderUrl = pathToFileURL(createRequire(path.join(rootDir, "noop.cjs")).resolve("tsx")).href;
    } catch {
      bad("tsx loader could not be resolved from rootDir; pass tsxLoader explicitly");
    }
  }

  let tsconfigPath: string | null = null;
  if (options.tsconfigPath !== undefined) {
    if (typeof options.tsconfigPath !== "string" || options.tsconfigPath === "") bad("tsconfigPath must be a non-empty string");
    else tsconfigPath = path.isAbsolute(options.tsconfigPath) ? options.tsconfigPath : path.resolve(rootDir || "/", options.tsconfigPath);
  }

  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  if (typeof nodeExecutable !== "string" || nodeExecutable === "") bad("nodeExecutable must be a non-empty string");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      rootDir, manifestPath, baselinePath, outDir, runId, timeoutMs: options.timeoutMs, killGraceMs, files,
      reporterPath: options.reporterPath, tsxLoaderUrl, tsconfigPath, nodeExecutable,
      parentEnv: options.parentEnv ?? process.env, testHooks: options.testHooks,
    },
  };
}

function buildEnvironment(parentEnv: NodeJS.ProcessEnv, eventsFile: string, tsconfigPath: string | null) {
  const env: NodeJS.ProcessEnv = {};
  const inherited: string[] = [];
  for (const name of ENV_ALLOWLIST) {
    const value = parentEnv[name];
    if (typeof value === "string") {
      env[name] = value;
      inherited.push(name);
    }
  }
  const injected = ["DATABASE_URL", "UNIT_SUITE_EVENTS_FILE"];
  env.DATABASE_URL = DATABASE_URL_SENTINEL;
  env.UNIT_SUITE_EVENTS_FILE = eventsFile;
  if (tsconfigPath !== null) {
    env.TSX_TSCONFIG_PATH = tsconfigPath;
    injected.push("TSX_TSCONFIG_PATH");
  }
  const droppedCount = Object.keys(parentEnv).filter((name) => !(ENV_ALLOWLIST as readonly string[]).includes(name)).length;
  return { env, report: { allowlist: [...ENV_ALLOWLIST], inherited, injected, droppedCount } };
}

// ---------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------

type DigestMap = { map: Record<string, string>; issues: LauncherIssue[] };

function digestTestFiles(rootReal: string, files: readonly string[]): DigestMap {
  const map: Record<string, string> = {};
  const issues: LauncherIssue[] = [];
  for (const file of files) {
    const full = path.join(rootReal, file);
    let real: string;
    try {
      real = fs.realpathSync(full);
    } catch {
      issues.push({ code: "UNIT_SUITE_LAUNCHER_TEST_FILE_UNREADABLE", detail: `${file}: ENOENT` });
      continue;
    }
    if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) {
      issues.push({ code: "UNIT_SUITE_LAUNCHER_TEST_FILE_OUTSIDE_ROOT", detail: file });
      continue;
    }
    const outcome = readAndHash(full, MAX_TEST_FILE_BYTES, false);
    if (!outcome.ok) {
      issues.push({ code: outcome.code === "TOO_LARGE" ? "UNIT_SUITE_LAUNCHER_TEST_FILE_TOO_LARGE" : "UNIT_SUITE_LAUNCHER_TEST_FILE_UNREADABLE", detail: `${file}: ${outcome.detail}` });
      continue;
    }
    map[file] = outcome.sha256;
  }
  return { map, issues };
}

type TextInput = { text: string | undefined; evidence: Evidence<{ path: string; bytes: number; sha256: string }>; sha256: string | undefined; issues: LauncherIssue[] };

function readTextInput(file: string, label: string): TextInput {
  const outcome = readAndHash(file, MAX_TEXT_INPUT_BYTES, true);
  if (!outcome.ok) {
    return {
      text: undefined,
      sha256: undefined,
      evidence: unavailable(`${outcome.code === "TOO_LARGE" ? "too large" : "unreadable"}: ${outcome.detail}`),
      issues: [{ code: outcome.code === "TOO_LARGE" ? "UNIT_SUITE_LAUNCHER_INPUT_TOO_LARGE" : "UNIT_SUITE_LAUNCHER_INPUT_UNREADABLE", detail: `${label}: ${outcome.detail}` }],
    };
  }
  const evidence = available({ path: file, bytes: outcome.bytes, sha256: outcome.sha256 });
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(outcome.data);
    return { text, sha256: outcome.sha256, evidence, issues: [] };
  } catch {
    return { text: undefined, sha256: outcome.sha256, evidence, issues: [{ code: "UNIT_SUITE_LAUNCHER_INPUT_NOT_UTF8", detail: label }] };
  }
}

function artifactEvidence(file: string, maxBytes: number): { evidence: Evidence<{ path: string; bytes: number; sha256: string }>; outcome: HashOutcome | null } {
  if (!fs.existsSync(file)) return { evidence: unavailable("file was not created"), outcome: null };
  const outcome = readAndHash(file, maxBytes, false);
  if (!outcome.ok) return { evidence: unavailable(`${outcome.code}: ${outcome.detail}`), outcome };
  return { evidence: available({ path: file, bytes: outcome.bytes, sha256: outcome.sha256 }), outcome };
}

function closeQuietly(fd: number | null): void {
  if (fd === null) return;
  try { fs.closeSync(fd); } catch { /* já fechado */ }
}

/** Resultado interno do executor único, antes de virar o resultado do modo gate ou observe. */
type ExecuteOutcome = {
  runDir: string | null;
  envelope: GateEnvelope | ObserveEnvelope | null;
  persisted: boolean;
  errors: readonly LaunchError[];
};

export async function runUnitSuiteGate(options: UnitSuiteGateOptions): Promise<UnitSuiteGateResult> {
  const outcome = await execute(options, "gate");
  const envelope = outcome.envelope as GateEnvelope | null;
  if (outcome.errors.length > 0 || envelope === null) {
    return { exitCode: 2, final: "ERROR", runDir: outcome.runDir, envelope, persisted: false, errors: outcome.errors };
  }
  return { exitCode: envelope.final === "PASS" ? 0 : 1, final: envelope.final, runDir: outcome.runDir, envelope, persisted: outcome.persisted, errors: [] };
}

/** Modo observe: mesmo executor, sem baseline e sem aprovação. Ver o cabeçalho do arquivo. */
export async function runUnitSuiteObserve(options: UnitSuiteGateOptions): Promise<UnitSuiteObserveResult> {
  const outcome = await execute(options, "observe");
  const envelope = outcome.envelope as ObserveEnvelope | null;
  if (outcome.errors.length > 0 || envelope === null) {
    return { exitCode: 2, final: "ERROR", runDir: outcome.runDir, envelope, persisted: false, errors: outcome.errors };
  }
  return { exitCode: envelope.final === "OBSERVED_UNATTESTED" ? 0 : 1, final: envelope.final, runDir: outcome.runDir, envelope, persisted: outcome.persisted, errors: [] };
}

async function execute(options: UnitSuiteGateOptions, mode: LauncherMode): Promise<ExecuteOutcome> {
  const observing = mode === "observe";
  const resolved = resolveOptions(options, mode);
  if (!resolved.ok) return { runDir: null, envelope: null, persisted: false, errors: resolved.errors };
  const opts = resolved.value;

  const runDir = path.join(opts.outDir, opts.runId);
  try {
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.mkdirSync(runDir);
  } catch (error) {
    const code = errorCode(error);
    return {
      runDir: null, envelope: null, persisted: false,
      errors: [{ code: code === "EEXIST" ? "UNIT_SUITE_LAUNCHER_RUN_DIR_EXISTS" : "UNIT_SUITE_LAUNCHER_RUN_DIR_UNAVAILABLE", detail: `${opts.runId}: ${code}` }],
    };
  }

  const startedAt = new Date().toISOString();
  const issues: LauncherIssue[] = [];
  const eventsFile = path.join(runDir, ARTIFACT_NAMES.events);
  const stdoutFile = path.join(runDir, ARTIFACT_NAMES.stdout);
  const stderrFile = path.join(runDir, ARTIFACT_NAMES.stderr);
  const decisionFile = path.join(runDir, ARTIFACT_NAMES.decision);
  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;

  try {
    // Entradas
    const manifest = readTextInput(opts.manifestPath, "manifest");
    // observe não abre o baseline: nem o caminho é lido.
    const baseline = observing ? null : readTextInput(opts.baselinePath, "baseline");
    issues.push(...manifest.issues, ...(baseline === null ? [] : baseline.issues));

    const before = digestTestFiles(opts.rootDir, opts.files);
    issues.push(...before.issues);

    const baseInput = {
      manifestText: manifest.text as string,
      baselineText: baseline === null ? "" : baseline.text as string,
      baselineSha256: baseline === null ? "" : baseline.sha256 as string,
      argv: opts.files,
      rootDir: opts.rootDir,
      cwd: opts.rootDir,
    };
    // Uma única composição para os dois modos: gate (baseline obrigatório, PASS/FAIL) ou observe (sem baseline).
    const evaluate = (digests: TestFileDigests, eventsText: string | null, run: RunObservation | null): UnitSuiteDecision | UnitSuiteObservation => (
      observing
        ? observeUnitSuite({ manifestText: baseInput.manifestText, testFileDigests: digests, argv: opts.files, rootDir: opts.rootDir, cwd: opts.rootDir, eventsText, run })
        : decideUnitSuite({ ...baseInput, testFileDigests: digests, eventsText, run } as UnitSuiteDecisionInput)
    );

    // Pré-verificação: nenhum teste é iniciado se o inventário, o baseline (só no gate), a integridade ou o argv reprovam.
    const preflight = evaluate({ before: before.map, after: null }, null, null);
    const preflightStages: readonly string[] = observing ? ["inventory", "integrity", "argv"] : ["inventory", "baseline", "integrity", "argv"];
    const preflightBlocked = issues.length > 0
      || preflightStages.some((stage) => (preflight.stages as Record<string, { status: string }>)[stage].status !== "OK");

    let runObservation: RunObservation | null = null;
    let processEvidence: Evidence<ProcessEvidence> = unavailable("tests were not executed");
    let eventsText: string | null | undefined = null;
    let after: DigestMap | null = null;
    const envReport = buildEnvironment(opts.parentEnv, eventsFile, opts.tsconfigPath);

    if (preflightBlocked) {
      issues.push({ code: "UNIT_SUITE_LAUNCHER_PREFLIGHT_FAILED", detail: "no test was started" });
    } else {
      try {
        opts.testHooks?.beforeSpawn?.(runDir);
      } catch (error) {
        issues.push({ code: "UNIT_SUITE_LAUNCHER_INTERNAL_ERROR", detail: `beforeSpawn hook: ${errorCode(error)}` });
      }
      let captureReady = true;
      try {
        stdoutFd = fs.openSync(stdoutFile, "wx");
        stderrFd = fs.openSync(stderrFile, "wx");
      } catch (error) {
        captureReady = false;
        issues.push({ code: "UNIT_SUITE_LAUNCHER_STDIO_CAPTURE_FAILED", detail: errorCode(error) });
      }
      if (captureReady && fs.existsSync(eventsFile)) {
        captureReady = false;
        issues.push({ code: "UNIT_SUITE_LAUNCHER_EVENTS_PREEXISTING", detail: ARTIFACT_NAMES.events });
      }
      if (captureReady && issues.length === 0) {
        const args = [
          "--import", opts.tsxLoaderUrl,
          "--test", `--test-reporter=${opts.reporterPath}`,
          ...opts.files,
        ];
        const supervised = await superviseNodeTest({
          executable: opts.nodeExecutable, args, cwd: opts.rootDir, env: envReport.env,
          stdoutFd: stdoutFd as number, stderrFd: stderrFd as number, timeoutMs: opts.timeoutMs, killGraceMs: opts.killGraceMs,
        });
        processEvidence = available(supervised.evidence);
        runObservation = { exitCode: supervised.evidence.exitCode, signal: supervised.evidence.signal, timedOut: supervised.evidence.timedOut };
        if (supervised.evidence.spawnError !== null) issues.push({ code: "UNIT_SUITE_LAUNCHER_SPAWN_ERROR", detail: supervised.evidence.spawnError });
        for (const entry of supervised.signalErrors) issues.push({ code: "UNIT_SUITE_LAUNCHER_SIGNAL_ERROR", detail: entry });
        if (supervised.stillRemaining) {
          issues.push({ code: "UNIT_SUITE_LAUNCHER_PROCESSES_REMAINING", detail: supervised.abandoned ? "runner did not close after SIGKILL; gave up waiting" : "processes survived SIGKILL" });
        } else if (supervised.evidence.remainingAfterClose) {
          issues.push({ code: "UNIT_SUITE_LAUNCHER_PROCESSES_REMAINING", detail: "descendants outlived the test runner and were killed" });
        }
        if (supervised.evidence.spawnError !== null && supervised.evidence.pid === null) {
          runObservation = { exitCode: null, signal: null, timedOut: false };
        }
        after = digestTestFiles(opts.rootDir, opts.files);
        issues.push(...after.issues.filter((entry) => !before.issues.some((previous) => previous.code === entry.code && previous.detail === entry.detail)));

        if (fs.existsSync(eventsFile)) {
          const events = readAndHash(eventsFile, MAX_EVENTS_BYTES, true);
          if (events.ok) {
            try {
              eventsText = new TextDecoder("utf-8", { fatal: true }).decode(events.data);
            } catch {
              eventsText = undefined;
              issues.push({ code: "UNIT_SUITE_LAUNCHER_EVENTS_UNREADABLE", detail: "not valid UTF-8" });
            }
          } else {
            eventsText = undefined;
            issues.push({ code: events.code === "TOO_LARGE" ? "UNIT_SUITE_LAUNCHER_EVENTS_TOO_LARGE" : "UNIT_SUITE_LAUNCHER_EVENTS_UNREADABLE", detail: events.detail });
          }
        }
      } else if (captureReady || issues.length > 0) {
        issues.push({ code: "UNIT_SUITE_LAUNCHER_PREFLIGHT_FAILED", detail: "execution was not started" });
      }
    }
    closeQuietly(stdoutFd);
    closeQuietly(stderrFd);
    stdoutFd = null;
    stderrFd = null;

    const decision = evaluate(
      { before: before.map, after: after === null ? null : after.map },
      eventsText as string | null,
      runObservation,
    );

    const events = artifactEvidence(eventsFile, MAX_EVENTS_BYTES);
    const stdout = artifactEvidence(stdoutFile, MAX_CAPTURE_HASH_BYTES);
    const stderr = artifactEvidence(stderrFile, MAX_CAPTURE_HASH_BYTES);
    const executed = runObservation !== null;
    if (executed) {
      for (const [name, artifact] of [["events", events], ["stdout", stdout], ["stderr", stderr]] as const) {
        if (!artifact.evidence.available) issues.push({ code: "UNIT_SUITE_LAUNCHER_ARTIFACT_MISSING", detail: name });
      }
    }

    const launcher: GateLauncherEvidence = {
      runId: opts.runId,
      platform: process.platform,
      launcherNodeVersion: process.version,
      rootDir: opts.rootDir,
      timeoutMs: opts.timeoutMs,
      killGraceMs: opts.killGraceMs,
      files: opts.files,
      env: envReport.report,
      inputs: { manifest: manifest.evidence, baseline: baseline === null ? unavailable("not used in observe mode") : baseline.evidence },
      testFileDigests: {
        before: available(before.map),
        after: after === null ? unavailable("tests were not executed") : available(after.map),
      },
      process: processEvidence,
      artifacts: { events: events.evidence, stdout: stdout.evidence, stderr: stderr.evidence },
      issues,
    };

    let envelope: GateEnvelope | ObserveEnvelope;
    if (observing) {
      const observation = decision as UnitSuiteObservation;
      // Issue do lançador (processo remanescente, artefato ausente...) torna a observação não confiável.
      const final: ObservationStatus = issues.length > 0 ? "OBSERVATION_INCOMPLETE" : observation.status;
      envelope = {
        schema: UNIT_SUITE_OBSERVE_RESULT_SCHEMA,
        mode: "observe",
        startedAt,
        finishedAt: new Date().toISOString(),
        launcher,
        observation,
        final,
      };
    } else {
      const gateDecision = decision as UnitSuiteDecision;
      const final: "PASS" | "FAIL" = gateDecision.decision === "PASS" && issues.length === 0 ? "PASS" : "FAIL";
      envelope = {
        schema: UNIT_SUITE_GATE_RESULT_SCHEMA,
        startedAt,
        finishedAt: new Date().toISOString(),
        launcher,
        decision: gateDecision,
        final,
      };
    }
    return persist(runDir, decisionFile, envelope, opts);
  } catch (error) {
    closeQuietly(stdoutFd);
    closeQuietly(stderrFd);
    return {
      runDir, envelope: null, persisted: false,
      errors: [{ code: "UNIT_SUITE_LAUNCHER_UNEXPECTED_ERROR", detail: errorCode(error) }],
    };
  }
}

function persist(runDir: string, decisionFile: string, envelope: GateEnvelope | ObserveEnvelope, opts: ResolvedOptions): ExecuteOutcome {
  try {
    opts.testHooks?.beforePersist?.(runDir);
    const data = `${JSON.stringify(envelope, null, 2)}\n`;
    fs.writeFileSync(decisionFile, data, { flag: "wx" });
    const written = fs.readFileSync(decisionFile, "utf8");
    if (written !== data) throw Object.assign(new Error("mismatch"), { code: "READBACK_MISMATCH" });
  } catch (error) {
    return {
      runDir, envelope, persisted: false,
      errors: [{ code: "UNIT_SUITE_LAUNCHER_PERSIST_FAILED", detail: errorCode(error) }],
    };
  }
  return { runDir, envelope, persisted: true, errors: [] };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

type CliParse = { ok: true; mode: LauncherMode; options: UnitSuiteGateOptions } | { ok: false; message: string };

export function parseCliArguments(argv: readonly string[], cwd: string): CliParse {
  const values = new Map<string, string>();
  const files: string[] = [];
  const flags = new Set(["--mode", "--root", "--manifest", "--baseline", "--out", "--run-id", "--timeout-ms", "--reporter", "--tsconfig", "--tsx-loader", "--kill-grace-ms"]);
  let positional = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (positional) {
      files.push(arg);
    } else if (arg === "--") {
      positional = true;
    } else if (flags.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || values.has(arg)) return { ok: false, message: `missing or repeated value for ${arg}` };
      values.set(arg, value);
      index += 1;
    } else {
      return { ok: false, message: `unknown argument: ${arg}` };
    }
  }
  // Modo explícito: o padrão continua sendo gate; qualquer valor desconhecido é rejeitado.
  const modeRaw = values.get("--mode") ?? "gate";
  if (modeRaw !== "gate" && modeRaw !== "observe") return { ok: false, message: `unknown --mode: ${modeRaw}` };
  const mode: LauncherMode = modeRaw;
  if (mode === "observe" && values.has("--baseline")) return { ok: false, message: "--baseline is not accepted with --mode observe" };
  const rootDir = path.resolve(cwd, values.get("--root") ?? ".");
  const required = (name: string): string | null => values.get(name) ?? null;
  const out = required("--out");
  const timeout = required("--timeout-ms");
  const reporter = required("--reporter");
  if (out === null || timeout === null || reporter === null) return { ok: false, message: "--out, --timeout-ms and --reporter are required" };
  const timeoutMs = /^\d+$/.test(timeout) ? Number(timeout) : Number.NaN;
  const graceRaw = values.get("--kill-grace-ms");
  const killGraceMs = graceRaw === undefined ? undefined : /^\d+$/.test(graceRaw) ? Number(graceRaw) : Number.NaN;
  return {
    ok: true,
    mode,
    options: {
      rootDir,
      manifestPath: values.get("--manifest") ?? "scripts/unit-tests-manifest.txt",
      ...(mode === "gate" ? { baselinePath: values.get("--baseline") ?? "scripts/unit-tests-baseline.v1.json" } : {}),
      outDir: path.resolve(cwd, out),
      ...(values.has("--run-id") ? { runId: values.get("--run-id") as string } : {}),
      timeoutMs,
      files,
      reporterPath: path.resolve(cwd, reporter),
      ...(values.has("--tsx-loader") ? { tsxLoader: path.resolve(cwd, values.get("--tsx-loader") as string) } : {}),
      ...(values.has("--tsconfig") ? { tsconfigPath: values.get("--tsconfig") as string } : {}),
      ...(killGraceMs === undefined ? {} : { killGraceMs }),
    },
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArguments(argv, process.cwd());
  if (!parsed.ok) {
    process.stderr.write(`${JSON.stringify({ ok: false, check: "unit-suite-gate", message: parsed.message })}\n`);
    return 2;
  }
  if (parsed.mode === "observe") {
    const observed = await runUnitSuiteObserve(parsed.options);
    // Sem campo "ok" e sem "PASS": observar não é aprovar. O código de saída 0 só indica observação completa.
    const observeSummary = {
      check: "unit-suite-observe",
      final: observed.final,
      approval: "NONE",
      runDir: observed.runDir,
      persisted: observed.persisted,
      errors: observed.errors,
      issues: observed.envelope?.launcher.issues ?? [],
      reasons: observed.envelope?.observation.reasons.map((reason) => `${reason.stage}:${reason.code}`) ?? [],
      totals: observed.envelope?.observation.totals ?? null,
    };
    (observed.exitCode === 0 ? process.stdout : process.stderr).write(`${JSON.stringify(observeSummary, null, 2)}\n`);
    return observed.exitCode;
  }
  const result = await runUnitSuiteGate(parsed.options);
  const summary = {
    ok: result.exitCode === 0,
    check: "unit-suite-gate",
    final: result.final,
    runDir: result.runDir,
    persisted: result.persisted,
    errors: result.errors,
    issues: result.envelope?.launcher.issues ?? [],
    reasons: result.envelope?.decision.reasons.map((reason) => `${reason.stage}:${reason.code}`) ?? [],
  };
  (result.exitCode === 0 ? process.stdout : process.stderr).write(`${JSON.stringify(summary, null, 2)}\n`);
  return result.exitCode;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    () => { process.exitCode = 2; },
  );
}
