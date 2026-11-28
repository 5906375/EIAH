import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_NAMES,
  DATABASE_URL_SENTINEL,
  ENV_ALLOWLIST,
  LAUNCHER_ISSUE_CODES,
  MAX_TEXT_INPUT_BYTES,
  MAX_TEST_FILE_BYTES,
  parseCliArguments,
  runUnitSuiteGate,
  runUnitSuiteObserve,
  UNIT_SUITE_GATE_RESULT_SCHEMA,
  UNIT_SUITE_OBSERVE_RESULT_SCHEMA,
  type GateEnvelope,
  type ObserveEnvelope,
  type UnitSuiteGateOptions,
  type UnitSuiteGateResult,
  type UnitSuiteObserveResult,
} from "../ci/unitSuiteGate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const REPORTER = path.join(REPO, "scripts/ci/unitSuiteReporter.mjs");
const GATE_CLI = path.join(REPO, "scripts/ci/unitSuiteGate.ts");
const TSX = createRequire(import.meta.url).resolve("tsx");

let parent = "";
let counter = 0;

before(() => {
  parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "eiah-unit-suite-gate-")));
});
after(() => {
  fs.rmSync(parent, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

type FixtureFile = { name: string; content: string; tests: number; skipped?: number };
type Fixture = { dir: string; root: string; out: string; manifest: string; baseline: string; files: string[] };

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const passing = (marker: string | null, tests: number) =>
  `import test from "node:test"; import fs from "node:fs";\n${marker ? `fs.writeFileSync("${marker}", "ran");\n` : ""}${Array.from({ length: tests }, (_, i) => `test("t${i + 1}", () => {});`).join("\n")}\n`;

function defaultFiles(): FixtureFile[] {
  return [
    { name: "pkg/a.test.ts", content: passing("marker-a.txt", 2), tests: 2 },
    { name: "pkg/b.test.ts", content: passing(null, 3), tests: 3 },
  ];
}

function baselineJson(files: FixtureFile[]): string {
  const sorted = [...files].sort((l, r) => (l.name < r.name ? -1 : l.name > r.name ? 1 : 0));
  return JSON.stringify({
    schemaVersion: "unit-tests-baseline.v1",
    provenance: { status: "declared", recordedAt: "2026-10-12", recordedCommit: "f093ba0000000000000000000000000000000000", method: "fixture local; contagens declaradas", nodeVersion: "v22.17.1" },
    files: sorted.map((file) => ({ file: file.name, tests: file.tests, skipped: file.skipped ?? 0, todo: 0, sha256: sha(file.content) })),
  }, null, 2);
}

function makeFixture(files: FixtureFile[] = defaultFiles()): Fixture {
  counter += 1;
  const dir = path.join(parent, `case-${counter}`);
  const root = path.join(dir, "root");
  const out = path.join(dir, "out");
  fs.mkdirSync(root, { recursive: true });
  for (const file of files) {
    const full = path.join(root, file.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content);
  }
  const names = files.map((file) => file.name).sort();
  const manifest = path.join(root, "manifest.txt");
  const baseline = path.join(root, "baseline.json");
  fs.writeFileSync(manifest, `# fixture\n${names.join("\n")}\n`);
  fs.writeFileSync(baseline, baselineJson(files));
  return { dir, root, out, manifest, baseline, files: names };
}

function minimalEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "C.UTF-8" };
  return { ...env, ...extra };
}

function options(fx: Fixture, overrides: Partial<UnitSuiteGateOptions> = {}): UnitSuiteGateOptions {
  counter += 1;
  return {
    rootDir: fx.root, manifestPath: fx.manifest, baselinePath: fx.baseline, outDir: fx.out, runId: `run-${counter}`,
    timeoutMs: 40_000, files: fx.files, reporterPath: REPORTER, tsxLoader: TSX, parentEnv: minimalEnv(), ...overrides,
  };
}

function readEnvelope(result: UnitSuiteGateResult): GateEnvelope {
  assert.notEqual(result.runDir, null, "esperava diretório de execução");
  const text = fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision), "utf8");
  return JSON.parse(text) as GateEnvelope;
}

function reasonCodes(envelope: GateEnvelope): string[] {
  return envelope.decision.reasons.map((reason) => `${reason.stage}:${reason.code.replace(/^UNIT_SUITE_(GATE_)?/, "")}`);
}

function issueCodes(envelope: GateEnvelope): string[] {
  return envelope.launcher.issues.map((issue) => issue.code.replace("UNIT_SUITE_LAUNCHER_", ""));
}

function has(list: readonly string[], wanted: string, context = ""): void {
  assert.equal(list.includes(wanted), true, `esperava ${wanted}${context ? ` (${context})` : ""}; obtido: [${list.join(", ")}]`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid: number, ms = 3000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (alive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  return !alive(pid);
}

function writeExecutable(name: string, content: string): string {
  const file = path.join(parent, name);
  fs.writeFileSync(file, content, { mode: 0o755 });
  return file;
}

// ---------------------------------------------------------------------------------------------
// PASS e evidências
// ---------------------------------------------------------------------------------------------

test("PASS integral: código 0, quatro artefatos, hashes e envelope launcher/decision/final", async () => {
  const fx = makeFixture();
  const baselineBytes = fs.readFileSync(fx.baseline);
  const baselineStat = fs.statSync(fx.baseline);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  assert.equal(result.final, "PASS");
  assert.equal(result.persisted, true);
  const envelope = readEnvelope(result);
  assert.equal(envelope.schema, UNIT_SUITE_GATE_RESULT_SCHEMA);
  assert.equal(envelope.final, "PASS");
  assert.equal(envelope.decision.decision, "PASS");
  assert.deepEqual(envelope.launcher.issues, []);
  assert.deepEqual(fs.readdirSync(result.runDir as string).sort(), Object.values(ARTIFACT_NAMES).sort());

  const baselineEvidence = envelope.launcher.inputs.baseline;
  assert.equal(baselineEvidence.available && baselineEvidence.value.sha256, sha(baselineBytes), "SHA-256 dos bytes originais do baseline");
  assert.equal(envelope.decision.stages.baseline.sha256, sha(baselineBytes));
  assert.equal(envelope.decision.stages.baseline.attestation, "not_demonstrated");
  const before = envelope.launcher.testFileDigests.before;
  const afterDigests = envelope.launcher.testFileDigests.after;
  assert.deepEqual(before.available && before.value, { "pkg/a.test.ts": sha(defaultFiles()[0].content), "pkg/b.test.ts": sha(defaultFiles()[1].content) });
  assert.deepEqual(afterDigests.available && afterDigests.value, before.available ? before.value : null);
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.exitCode, 0);
  assert.equal(proc.available && proc.value.timedOut, false);
  assert.equal(proc.available && proc.value.signal, null);
  for (const name of ["events", "stdout", "stderr"] as const) assert.equal(envelope.launcher.artifacts[name].available, true, name);
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), true, "o teste de fixture rodou de fato");

  assert.equal(Buffer.compare(fs.readFileSync(fx.baseline), baselineBytes), 0, "bytes do baseline preservados");
  assert.equal(fs.statSync(fx.baseline).mtimeMs, baselineStat.mtimeMs, "baseline não foi reescrito");
});

test("os dois campos de ambiente e de proveniência não vazam valores nem alegam atestação", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { parentEnv: minimalEnv({ SECRET_TOKEN: "supersecret-value-123" }) }));
  const text = fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision), "utf8");
  assert.equal(text.includes("supersecret-value-123"), false, "valores de ambiente nunca são gravados");
  const envelope = JSON.parse(text) as GateEnvelope;
  assert.deepEqual(envelope.launcher.env.allowlist, [...ENV_ALLOWLIST]);
  assert.equal(envelope.launcher.env.droppedCount >= 1, true);
  assert.equal(envelope.decision.stages.baseline.attestation, "not_demonstrated");
});

// ---------------------------------------------------------------------------------------------
// Falhas antes da execução: nenhum teste é iniciado
// ---------------------------------------------------------------------------------------------

test("baseline inválido: nenhum teste é iniciado, evidências preservadas, código 1", async () => {
  const fx = makeFixture();
  fs.writeFileSync(fx.baseline, "{ isto não é JSON");
  const bytes = fs.readFileSync(fx.baseline);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  assert.equal(envelope.final, "FAIL");
  has(issueCodes(envelope), "PREFLIGHT_FAILED");
  has(reasonCodes(envelope), "baseline:BASELINE_JSON_INVALID");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), false, "nenhum teste foi iniciado");
  assert.deepEqual(envelope.launcher.process, { available: false, reason: "tests were not executed" });
  assert.equal(envelope.launcher.testFileDigests.after.available, false);
  assert.equal(envelope.decision.stages.run.status, "FAIL");
  has(reasonCodes(envelope), "run:RUN_NOT_EXECUTED");
  assert.equal(Buffer.compare(fs.readFileSync(fx.baseline), bytes), 0);
  assert.equal(fs.existsSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision)), true);
});

test("SHA-256 divergente do arquivo de teste: reprova antes de executar", async () => {
  const fx = makeFixture();
  fs.appendFileSync(path.join(fx.root, "pkg/a.test.ts"), "\n// alterado depois de gerar o baseline\n");
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(reasonCodes(envelope), "integrity:DIGEST_MISMATCH");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), false, "nenhum teste foi iniciado");
  const detail = envelope.decision.reasons.find((reason) => reason.code === "UNIT_SUITE_GATE_DIGEST_MISMATCH")?.detail;
  assert.deepEqual(detail, { phase: "before", file: "pkg/a.test.ts" });
});

test("arquivo de teste ausente, manifesto ilegível e entradas acima do teto: falham sem iniciar testes", async () => {
  const missing = makeFixture();
  fs.rmSync(path.join(missing.root, "pkg/b.test.ts"));
  const missingResult = await runUnitSuiteGate(options(missing));
  assert.equal(missingResult.exitCode, 1);
  const missingEnvelope = readEnvelope(missingResult);
  has(issueCodes(missingEnvelope), "TEST_FILE_UNREADABLE");
  has(reasonCodes(missingEnvelope), "integrity:DIGEST_MISSING");

  const noManifest = makeFixture();
  fs.rmSync(noManifest.manifest);
  const noManifestEnvelope = readEnvelope(await runUnitSuiteGate(options(noManifest)));
  has(issueCodes(noManifestEnvelope), "INPUT_UNREADABLE");
  assert.deepEqual(noManifestEnvelope.launcher.inputs.manifest.available, false);
  has(reasonCodes(noManifestEnvelope), "inventory:INVENTORY_INVALID");

  const bigManifest = makeFixture();
  fs.writeFileSync(bigManifest.manifest, Buffer.alloc(MAX_TEXT_INPUT_BYTES + 1, 0x23));
  const bigEnvelope = readEnvelope(await runUnitSuiteGate(options(bigManifest)));
  has(issueCodes(bigEnvelope), "INPUT_TOO_LARGE");
  assert.equal(fs.existsSync(path.join(bigManifest.root, "marker-a.txt")), false);

  const bigBaseline = makeFixture();
  fs.writeFileSync(bigBaseline.baseline, Buffer.alloc(MAX_TEXT_INPUT_BYTES + 1, 0x20));
  has(issueCodes(readEnvelope(await runUnitSuiteGate(options(bigBaseline)))), "INPUT_TOO_LARGE");

  const bigTest = makeFixture();
  fs.writeFileSync(path.join(bigTest.root, "pkg/b.test.ts"), Buffer.alloc(MAX_TEST_FILE_BYTES + 1, 0x20));
  const bigTestEnvelope = readEnvelope(await runUnitSuiteGate(options(bigTest)));
  has(issueCodes(bigTestEnvelope), "TEST_FILE_TOO_LARGE");
  assert.equal(fs.existsSync(path.join(bigTest.root, "marker-a.txt")), false);

  const notUtf8 = makeFixture();
  fs.writeFileSync(notUtf8.baseline, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
  has(issueCodes(readEnvelope(await runUnitSuiteGate(options(notUtf8)))), "INPUT_NOT_UTF8");
});

test("arquivo de teste que é link simbólico para fora da raiz é recusado", async () => {
  const fx = makeFixture();
  const outside = path.join(fx.dir, "outside.test.ts");
  fs.writeFileSync(outside, passing(null, 3));
  fs.rmSync(path.join(fx.root, "pkg/b.test.ts"));
  fs.symlinkSync(outside, path.join(fx.root, "pkg/b.test.ts"));
  const envelope = readEnvelope(await runUnitSuiteGate(options(fx)));
  has(issueCodes(envelope), "TEST_FILE_OUTSIDE_ROOT");
  assert.equal(envelope.final, "FAIL");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), false);
});

// ---------------------------------------------------------------------------------------------
// Falhas durante e depois da execução
// ---------------------------------------------------------------------------------------------

test("arquivo alterado durante a execução: reprova pela integridade, mesmo com os testes passando", async () => {
  const files = defaultFiles();
  files[0] = { name: "pkg/a.test.ts", content: `import fs from "node:fs";\nfs.appendFileSync("pkg/b.test.ts", "\\n// alterado durante a execução\\n");\n${passing(null, 2)}`, tests: 2 };
  const fx = makeFixture(files);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  assert.equal(envelope.decision.stages.verdict.status, "OK", "os testes em si passaram");
  has(reasonCodes(envelope), "integrity:FILES_CHANGED_DURING_RUN");
  has(reasonCodes(envelope), "integrity:DIGEST_MISMATCH");
  const before = envelope.launcher.testFileDigests.before;
  const afterDigests = envelope.launcher.testFileDigests.after;
  assert.notDeepEqual(afterDigests.available && afterDigests.value, before.available && before.value);
});

test("falha de teste e código de saída ≠ 0 reprovam com código 1 e preservam stdout/stderr", async () => {
  const files = defaultFiles();
  files[1] = { name: "pkg/b.test.ts", content: `import test from "node:test"; import assert from "node:assert/strict";\ntest("t1", () => {}); test("t2", () => {}); test("t3", () => assert.equal(1, 2));\n`, tests: 3 };
  const fx = makeFixture(files);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(reasonCodes(envelope), "run:RUN_EXIT_NONZERO");
  has(reasonCodes(envelope), "verdict:TEST_FAILED");
  assert.equal(fs.statSync(path.join(result.runDir as string, ARTIFACT_NAMES.stderr)).isFile(), true);
});

test("falha de suite (hook) com código 0 e resumo de sucesso reprova", async () => {
  const files = defaultFiles();
  files[1] = { name: "pkg/b.test.ts", content: `import { describe, it, after } from "node:test";\ndescribe("s", () => { after(() => { throw new Error("hook"); }); it("x1", () => {}); it("x2", () => {}); it("x3", () => {}); });\n`, tests: 3 };
  const fx = makeFixture(files);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(reasonCodes(envelope), "verdict:SUITE_FAILED");
  const proc = envelope.launcher.process;
  if (process.version === "v22.17.1") assert.equal(proc.available && proc.value.exitCode, 0, "no Node v22.17.1 o runner sai com 0");
});

test("timeout: encerra o grupo inteiro, inclusive descendentes, e reprova", async () => {
  const hang = `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";\ntest("hang", async () => { const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); fs.writeFileSync("grandchild.pid", String(child.pid)); await new Promise(() => {}); });\n`;
  const fx = makeFixture([{ name: "pkg/hang.test.ts", content: hang, tests: 1 }]);
  const started = Date.now();
  const result = await runUnitSuiteGate(options(fx, { timeoutMs: 5000 }));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.timedOut, true);
  has(reasonCodes(envelope), "run:RUN_TIMED_OUT");
  assert.equal(Date.now() - started < 20_000, true, "o lançador não ficou pendurado");
  const pid = Number(fs.readFileSync(path.join(fx.root, "grandchild.pid"), "utf8"));
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  assert.equal(await waitDead(pid), true, "o descendente foi encerrado junto com o grupo");
  assert.equal(proc.available && proc.value.pid !== null && (await waitDead(proc.value.pid)), true);
  assert.equal(issueCodes(envelope).includes("PROCESSES_REMAINING"), false, "SIGTERM bastou; não sobrou nada");
  assert.equal(envelope.launcher.artifacts.stdout.available, true);
});

test("timeout: runner que ignora SIGTERM é encerrado por SIGKILL após a tolerância", async () => {
  const fakeNode = writeExecutable("fake-node-ignores-term.sh", "#!/bin/sh\ntrap '' TERM\nsleep 60\n");
  const fx = makeFixture();
  const started = Date.now();
  const result = await runUnitSuiteGate(options(fx, { nodeExecutable: fakeNode, timeoutMs: 1500, killGraceMs: 400 }));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.timedOut, true);
  assert.equal(proc.available && proc.value.forcedKill, true, "houve escalonamento para SIGKILL");
  assert.equal(proc.available && proc.value.signal, "SIGKILL");
  has(reasonCodes(envelope), "run:RUN_TIMED_OUT");
  assert.equal(Date.now() - started < 15_000, true);
  assert.equal(proc.available && proc.value.pid !== null && (await waitDead(proc.value.pid)), true);
});

test("descendente que sobrevive ao runner após saída normal: é encerrado e a execução reprova", async () => {
  const leaker = `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nchild.unref();\nfs.writeFileSync("leaked.pid", String(child.pid));\ntest("t1", () => {});\n`;
  const fx = makeFixture([{ name: "pkg/leak.test.ts", content: leaker, tests: 1 }]);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  assert.equal(envelope.decision.decision, "PASS", "os testes em si passaram");
  has(issueCodes(envelope), "PROCESSES_REMAINING");
  assert.equal(envelope.final, "FAIL");
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.remainingAfterClose, true);
  assert.equal(await waitDead(Number(fs.readFileSync(path.join(fx.root, "leaked.pid"), "utf8"))), true, "o descendente foi encerrado");
});

test("limitação conhecida: descendente que abre nova sessão escapa da supervisão (não é detectado)", async () => {
  const escaper = `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore", detached: true });\nchild.unref();\nfs.writeFileSync("escaped.pid", String(child.pid));\ntest("t1", () => {});\n`;
  const fx = makeFixture([{ name: "pkg/escape.test.ts", content: escaper, tests: 1 }]);
  let pid = 0;
  try {
    const result = await runUnitSuiteGate(options(fx));
    pid = Number(fs.readFileSync(path.join(fx.root, "escaped.pid"), "utf8"));
    const envelope = readEnvelope(result);
    assert.equal(alive(pid), true, "o descendente em outro grupo continua vivo");
    assert.equal(issueCodes(envelope).includes("PROCESSES_REMAINING"), false, "e o lançador não o enxerga");
  } finally {
    if (pid > 0) {
      try { process.kill(pid, "SIGKILL"); } catch { /* já encerrou */ }
    }
  }
});

test("erro de spawn: reprova com evidências e campos indisponíveis explícitos", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { nodeExecutable: path.join(parent, "nao-existe", "node") }));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(issueCodes(envelope), "SPAWN_ERROR");
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.spawnError, "ENOENT");
  assert.equal(proc.available && proc.value.pid, null);
  has(reasonCodes(envelope), "run:RUN_EXIT_UNKNOWN");
  assert.deepEqual(envelope.launcher.artifacts.events, { available: false, reason: "file was not created" });
  assert.equal(envelope.launcher.artifacts.stdout.available, true, "stdout/stderr foram criados antes do spawn");
});

// ---------------------------------------------------------------------------------------------
// Reporter e eventos
// ---------------------------------------------------------------------------------------------

test("reporter ausente: o runner falha, a execução reprova e o stderr preserva a causa", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { reporterPath: path.join(parent, "reporter-que-nao-existe.mjs") }));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(reasonCodes(envelope), "events:EVENTS_MISSING");
  has(reasonCodes(envelope), "run:RUN_EXIT_NONZERO");
  assert.match(fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.stderr), "utf8"), /ERR_MODULE_NOT_FOUND/);
});

test("reporter inválido: sem eventos, linhas corrompidas, fluxo incompleto e arquivo grande demais reprovam", async () => {
  const noop = writeExecutable("reporter-noop.mjs", "export default async function* (source) { for await (const _ of source) void _; }\n");
  const garbage = writeExecutable("reporter-garbage.mjs", 'import fs from "node:fs";\nexport default async function* (source) { for await (const _ of source) void _; fs.writeFileSync(process.env.UNIT_SUITE_EVENTS_FILE, "isto não é json\\n", { flag: "wx" }); }\n');
  const headerOnly = writeExecutable("reporter-header-only.mjs", 'import fs from "node:fs";\nexport default async function* (source) { for await (const _ of source) void _; fs.writeFileSync(process.env.UNIT_SUITE_EVENTS_FILE, JSON.stringify({ v: 1, kind: "header", seq: 1, node: process.version }) + "\\n", { flag: "wx" }); }\n');
  const huge = writeExecutable("reporter-huge.mjs", 'import fs from "node:fs";\nexport default async function* (source) { for await (const _ of source) void _; fs.writeFileSync(process.env.UNIT_SUITE_EVENTS_FILE, Buffer.alloc(64 * 1024 * 1024 + 1, 0x20), { flag: "wx" }); }\n');

  const cases: Array<[string, string, string, string]> = [
    ["sem eventos", noop, "events:EVENTS_MISSING", "runner ok, mas sem NDJSON"],
    ["linha corrompida", garbage, "events:EVENTS_INVALID", "linha que não é JSON"],
    ["fluxo incompleto", headerOnly, "adapter:EVENTS_END_MISSING", "só o cabeçalho"],
    ["grande demais", huge, "events:EVENTS_INVALID", "acima de 64 MiB"],
  ];
  for (const [label, reporterPath, wanted, context] of cases) {
    const fx = makeFixture();
    const result = await runUnitSuiteGate(options(fx, { reporterPath }));
    assert.equal(result.exitCode, 1, label);
    const envelope = readEnvelope(result);
    assert.equal(envelope.final, "FAIL", label);
    has(reasonCodes(envelope), wanted, `${label}: ${context}`);
    if (label === "grande demais") has(issueCodes(envelope), "EVENTS_TOO_LARGE");
  }
});

test("NDJSON truncado com registro end presente é reprovado pelos resumos por arquivo", async () => {
  const dropSummaries = writeExecutable("reporter-no-file-summary.mjs", [
    'import fs from "node:fs";',
    'import real from "' + REPORTER + '";',
    "export default async function* (source) {",
    "  async function* filtered() { for await (const event of source) { if (event.type === 'test:summary' && event.data && event.data.file) continue; yield event; } }",
    "  yield* real(filtered());",
    "}",
    "",
  ].join("\n"));
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { reporterPath: dropSummaries }));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(reasonCodes(envelope), "verdict:SUMMARY_MISSING");
  assert.equal(envelope.decision.stages.adapter.status, "OK", "o fluxo parece íntegro (end presente); só o resumo por arquivo denuncia");
});

// ---------------------------------------------------------------------------------------------
// Artefatos, persistência, concorrência
// ---------------------------------------------------------------------------------------------

test("artefatos pré-existentes: events/stdout colidindo impedem a execução; nada é sobrescrito", async () => {
  const stale = makeFixture();
  const staleResult = await runUnitSuiteGate(options(stale, { testHooks: { beforeSpawn: (dir) => fs.writeFileSync(path.join(dir, ARTIFACT_NAMES.events), "evento velho\n") } }));
  assert.equal(staleResult.exitCode, 1);
  const staleEnvelope = readEnvelope(staleResult);
  has(issueCodes(staleEnvelope), "EVENTS_PREEXISTING");
  assert.equal(fs.existsSync(path.join(stale.root, "marker-a.txt")), false, "nenhum teste foi iniciado");
  assert.equal(fs.readFileSync(path.join(staleResult.runDir as string, ARTIFACT_NAMES.events), "utf8"), "evento velho\n", "o artefato velho não foi tocado nem lido como evidência");

  const collide = makeFixture();
  const collideResult = await runUnitSuiteGate(options(collide, { testHooks: { beforeSpawn: (dir) => fs.writeFileSync(path.join(dir, ARTIFACT_NAMES.stdout), "stdout velho\n") } }));
  assert.equal(collideResult.exitCode, 1);
  has(issueCodes(readEnvelope(collideResult)), "STDIO_CAPTURE_FAILED");
  assert.equal(fs.existsSync(path.join(collide.root, "marker-a.txt")), false);
  assert.equal(fs.readFileSync(path.join(collideResult.runDir as string, ARTIFACT_NAMES.stdout), "utf8"), "stdout velho\n");
});

test("falha de persistência: código 2, evidências já gravadas preservadas, sem aprovação", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { testHooks: { beforePersist: (dir) => fs.mkdirSync(path.join(dir, ARTIFACT_NAMES.decision)) } }));
  assert.equal(result.exitCode, 2);
  assert.equal(result.final, "ERROR");
  assert.equal(result.persisted, false);
  assert.deepEqual(result.errors.map((error) => error.code), ["UNIT_SUITE_LAUNCHER_PERSIST_FAILED"]);
  assert.equal(result.envelope?.decision.decision, "PASS", "o envelope existe em memória, mas não foi persistido");
  assert.equal(fs.existsSync(path.join(result.runDir as string, ARTIFACT_NAMES.events)), true);
  assert.equal(fs.statSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision)).isDirectory(), true);
});

test("decision.json pré-existente nunca é sobrescrito: gravação exclusiva, código 2", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteGate(options(fx, { testHooks: { beforePersist: (dir) => fs.writeFileSync(path.join(dir, ARTIFACT_NAMES.decision), "resultado anterior\n") } }));
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.errors.map((error) => error.code), ["UNIT_SUITE_LAUNCHER_PERSIST_FAILED"]);
  assert.equal(fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision), "utf8"), "resultado anterior\n");
});

test("colisão de runId: a segunda execução falha com código 2 e não altera a primeira", async () => {
  const fx = makeFixture();
  const first = await runUnitSuiteGate(options(fx, { runId: "mesmo-id" }));
  assert.equal(first.exitCode, 0);
  const snapshot = fs.readFileSync(path.join(first.runDir as string, ARTIFACT_NAMES.decision));
  const second = await runUnitSuiteGate(options(fx, { runId: "mesmo-id" }));
  assert.equal(second.exitCode, 2);
  assert.deepEqual(second.errors.map((error) => error.code), ["UNIT_SUITE_LAUNCHER_RUN_DIR_EXISTS"]);
  assert.equal(second.runDir, null);
  assert.equal(Buffer.compare(fs.readFileSync(path.join(first.runDir as string, ARTIFACT_NAMES.decision)), snapshot), 0);
});

test("concorrência: execuções simultâneas com ids distintos passam; com o mesmo id só uma prossegue", async () => {
  const left = makeFixture();
  const right = makeFixture();
  const [a, b] = await Promise.all([runUnitSuiteGate(options(left, { runId: "conc-a" })), runUnitSuiteGate(options(right, { runId: "conc-b" }))]);
  assert.deepEqual([a.exitCode, b.exitCode], [0, 0]);
  assert.notEqual(a.runDir, b.runDir);

  const shared = makeFixture();
  const results = await Promise.all([runUnitSuiteGate(options(shared, { runId: "disputa" })), runUnitSuiteGate(options(shared, { runId: "disputa" }))]);
  assert.deepEqual(results.map((entry) => entry.exitCode).sort(), [0, 2]);
  const loser = results.find((entry) => entry.exitCode === 2);
  assert.equal(loser?.errors[0].code, "UNIT_SUITE_LAUNCHER_RUN_DIR_EXISTS");
});

test("execuções simultâneas no mesmo diretório de saída não misturam artefatos", async () => {
  const left = makeFixture();
  const right = makeFixture();
  const shared = path.join(parent, "out-compartilhado");
  const [a, b] = await Promise.all([
    runUnitSuiteGate(options(left, { outDir: shared, runId: "um" })),
    runUnitSuiteGate(options(right, { outDir: shared, runId: "dois" })),
  ]);
  assert.deepEqual([a.exitCode, b.exitCode], [0, 0]);
  assert.deepEqual(fs.readdirSync(shared).sort(), ["dois", "um"]);
  assert.equal(readEnvelope(a).launcher.runId, "um");
  assert.equal(readEnvelope(b).launcher.runId, "dois");
});

// ---------------------------------------------------------------------------------------------
// Isolamento de ambiente
// ---------------------------------------------------------------------------------------------

test("ambiente mínimo: segredos e URLs de serviços do pai não chegam aos testes; DATABASE_URL é o sentinela", async () => {
  const dumper = `import test from "node:test"; import fs from "node:fs";\nfs.writeFileSync("env-dump.json", JSON.stringify({ keys: Object.keys(process.env).sort(), databaseUrl: process.env.DATABASE_URL ?? null, secret: process.env.SECRET_TOKEN ?? null, redis: process.env.REDIS_URL ?? null }));\ntest("t1", () => {});\n`;
  const fx = makeFixture([{ name: "pkg/env.test.ts", content: dumper, tests: 1 }]);
  const hostile = minimalEnv({
    SECRET_TOKEN: "supersecret-value-123", REDIS_URL: "redis://real-host:6379", GITHUB_TOKEN: "ghp_xxx", AWS_SECRET_ACCESS_KEY: "aws",
    DATABASE_URL: "postgresql://real:real@db.example.com/prod", REAL_POSTGRES_INTEGRATION_DATABASE_URL: "postgresql://real@db/it",
    NODE_OPTIONS: "--max-old-space-size=64", NODE_TEST_CONTEXT: "child-v8", DIRECT_URL: "postgresql://x", RENDER_API_KEY: "rk",
  });
  const result = await runUnitSuiteGate(options(fx, { parentEnv: hostile }));
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  const dump = JSON.parse(fs.readFileSync(path.join(fx.root, "env-dump.json"), "utf8")) as { keys: string[]; databaseUrl: string; secret: string | null; redis: string | null };
  assert.equal(dump.databaseUrl, DATABASE_URL_SENTINEL);
  assert.equal(dump.secret, null);
  assert.equal(dump.redis, null);
  for (const forbidden of ["SECRET_TOKEN", "REDIS_URL", "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "REAL_POSTGRES_INTEGRATION_DATABASE_URL", "NODE_OPTIONS", "DIRECT_URL", "RENDER_API_KEY"]) {
    assert.equal(dump.keys.includes(forbidden), false, `${forbidden} não pode chegar aos testes`);
  }
  assert.equal(dump.keys.includes("UNIT_SUITE_EVENTS_FILE"), true);
  assert.equal(dump.keys.includes("PATH"), true);
  const allowed = new Set<string>([...ENV_ALLOWLIST, "DATABASE_URL", "UNIT_SUITE_EVENTS_FILE", "NODE_TEST_CONTEXT"]);
  const unexpected = dump.keys.filter((key) => !allowed.has(key));
  assert.deepEqual(unexpected, [], `variáveis fora da allowlist: ${unexpected.join(",")}`);
  const envelope = readEnvelope(result);
  assert.equal(envelope.launcher.env.droppedCount >= 8, true);
  assert.equal(JSON.stringify(envelope).includes("supersecret-value-123"), false);
});

// ---------------------------------------------------------------------------------------------
// Opções, plataforma e códigos de saída
// ---------------------------------------------------------------------------------------------

test("opções inválidas ou inseguras: código 2, sem criar diretório de execução", async () => {
  const fx = makeFixture();
  const bad: Array<[string, Partial<UnitSuiteGateOptions>]> = [
    ["timeout ausente", { timeoutMs: undefined as unknown as number }],
    ["timeout zero", { timeoutMs: 0 }],
    ["timeout fracionário", { timeoutMs: 1.5 }],
    ["timeout acima do máximo", { timeoutMs: 3 * 60 * 60 * 1000 }],
    ["runId inválido", { runId: "../fuga" }],
    ["arquivo fora da raiz", { files: ["../fora.test.ts"] }],
    ["arquivo absoluto", { files: ["/etc/x.test.ts"] }],
    ["arquivo com extensão errada", { files: ["pkg/a.ts"] }],
    ["arquivo duplicado", { files: ["pkg/a.test.ts", "./pkg/a.test.ts"] }],
    ["lista vazia", { files: [] }],
    ["raiz relativa", { rootDir: "relativa" }],
    ["raiz inexistente", { rootDir: path.join(parent, "nao-existe") }],
    ["reporter relativo", { reporterPath: "unitSuiteReporter.mjs" }],
    ["loader relativo", { tsxLoader: "tsx" }],
    ["tolerância inválida", { killGraceMs: -1 }],
  ];
  for (const [label, override] of bad) {
    const result = await runUnitSuiteGate(options(fx, override));
    assert.equal(result.exitCode, 2, label);
    assert.equal(result.final, "ERROR", label);
    assert.equal(result.errors[0].code, "UNIT_SUITE_LAUNCHER_OPTIONS_INVALID", label);
    assert.equal(result.runDir, null, label);
  }
  assert.equal(fs.existsSync(fx.out), false, "nenhuma opção inválida cria diretório de saída");
  const notObject = await runUnitSuiteGate(undefined as unknown as UnitSuiteGateOptions);
  assert.equal(notObject.exitCode, 2);
});

test("loader tsx não resolvível a partir da raiz e diretório de saída indisponível: código 2", async () => {
  const fx = makeFixture();
  const noLoader = await runUnitSuiteGate(options(fx, { tsxLoader: undefined }));
  assert.equal(noLoader.exitCode, 2);
  assert.match(noLoader.errors[0].detail, /tsx loader/);

  const unavailable = await runUnitSuiteGate(options(fx, { outDir: path.join(fx.manifest, "dentro-de-arquivo") }));
  assert.equal(unavailable.exitCode, 2);
  assert.equal(unavailable.errors[0].code, "UNIT_SUITE_LAUNCHER_RUN_DIR_UNAVAILABLE");
});

test("códigos de saída 0, 1 e 2 em sequência, sempre derivados do envelope", async () => {
  const pass = await runUnitSuiteGate(options(makeFixture()));
  const failFx = makeFixture();
  fs.writeFileSync(failFx.baseline, "{}");
  const fail = await runUnitSuiteGate(options(failFx));
  const error = await runUnitSuiteGate(options(makeFixture(), { timeoutMs: 0 }));
  assert.deepEqual([pass.exitCode, fail.exitCode, error.exitCode], [0, 1, 2]);
  assert.deepEqual([pass.final, fail.final, error.final], ["PASS", "FAIL", "ERROR"]);
  assert.equal(pass.exitCode === 0 && pass.envelope?.final === "PASS" && pass.envelope.launcher.issues.length === 0 && pass.envelope.decision.decision === "PASS", true);
});

test("baseline com permissão somente leitura e execução repetida: bytes e mtime inalterados em PASS e FAIL", async () => {
  const fx = makeFixture();
  fs.chmodSync(fx.baseline, 0o444);
  const bytes = fs.readFileSync(fx.baseline);
  const mtime = fs.statSync(fx.baseline).mtimeMs;
  const first = await runUnitSuiteGate(options(fx));
  fs.appendFileSync(path.join(fx.root, "pkg/a.test.ts"), "\n// mudou\n");
  const second = await runUnitSuiteGate(options(fx));
  assert.deepEqual([first.exitCode, second.exitCode], [0, 1]);
  assert.equal(Buffer.compare(fs.readFileSync(fx.baseline), bytes), 0);
  assert.equal(fs.statSync(fx.baseline).mtimeMs, mtime);
});

test("identificadores do lançador são estáveis, únicos e todos usados", () => {
  assert.equal(new Set(LAUNCHER_ISSUE_CODES).size, LAUNCHER_ISSUE_CODES.length);
  assert.equal(LAUNCHER_ISSUE_CODES.every((code) => /^UNIT_SUITE_LAUNCHER_[A-Z0-9_]+$/.test(code)), true);
  const source = fs.readFileSync(GATE_CLI, "utf8");
  for (const code of LAUNCHER_ISSUE_CODES) {
    const occurrences = source.split(`"${code}"`).length - 1;
    assert.equal(occurrences >= 2, true, `código declarado e não usado fora da própria lista: ${code}`);
  }
  assert.equal(source.includes("--test-force-exit"), false, "o lançador não usa --test-force-exit");
  assert.deepEqual(ENV_ALLOWLIST, ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"]);
});

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

test("CLI: argumentos desconhecidos, ausentes ou repetidos são rejeitados antes de qualquer execução", () => {
  assert.equal(parseCliArguments(["--out", "o"], "/x").ok, false);
  assert.equal(parseCliArguments(["--bogus"], "/x").ok, false);
  assert.equal(parseCliArguments(["--out", "o", "--out", "p", "--timeout-ms", "5", "--reporter", "r"], "/x").ok, false);
  assert.equal(parseCliArguments(["--out"], "/x").ok, false);
  const ok = parseCliArguments(["--out", "o", "--timeout-ms", "5", "--reporter", "r", "--", "a.test.ts", "b.test.ts"], "/x");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.options.files, ["a.test.ts", "b.test.ts"]);
    assert.equal(ok.options.manifestPath, "scripts/unit-tests-manifest.txt");
    assert.equal(ok.options.baselinePath, "scripts/unit-tests-baseline.v1.json");
    assert.equal(ok.options.timeoutMs, 5);
  }
  const nan = parseCliArguments(["--out", "o", "--timeout-ms", "abc", "--reporter", "r"], "/x");
  assert.equal(nan.ok && Number.isNaN(nan.options.timeoutMs), true, "timeout inválido é repassado e reprovado pelas opções");
});

function runCli(args: string[]) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
  return spawnSync(process.execPath, ["--import", "tsx", GATE_CLI, ...args], { cwd: REPO, env, encoding: "utf8", timeout: 90_000, killSignal: "SIGKILL" });
}

test("CLI de ponta a ponta: códigos 0, 1 e 2", () => {
  const good = makeFixture();
  const common = (fx: Fixture, id: string) => ["--root", fx.root, "--manifest", fx.manifest, "--baseline", fx.baseline, "--out", fx.out, "--run-id", id, "--timeout-ms", "40000", "--reporter", REPORTER, "--tsx-loader", TSX];
  const pass = runCli([...common(good, "cli-ok"), "--", ...good.files]);
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal((JSON.parse(pass.stdout) as { final: string }).final, "PASS");

  const bad = makeFixture();
  fs.writeFileSync(bad.baseline, "{}");
  const fail = runCli([...common(bad, "cli-fail"), "--", ...bad.files]);
  assert.equal(fail.status, 1, fail.stderr);
  assert.equal((JSON.parse(fail.stderr) as { final: string }).final, "FAIL");

  const usage = runCli(["--out", good.out]);
  assert.equal(usage.status, 2);
  const collision = runCli([...common(good, "cli-ok"), "--", ...good.files]);
  assert.equal(collision.status, 2, "mesmo runId já usado");
});

// ---------------------------------------------------------------------------------------------
// Modo observe (informativo, sem baseline) - fixtures sintéticas; nenhum arquivo real da suíte
// ---------------------------------------------------------------------------------------------

function observeOptions(fx: Fixture, overrides: Partial<UnitSuiteGateOptions> = {}): UnitSuiteGateOptions {
  const { baselinePath: _ignored, ...rest } = options(fx);
  return { ...rest, ...overrides };
}

function readObserveEnvelope(result: UnitSuiteObserveResult): ObserveEnvelope {
  assert.notEqual(result.runDir, null, "esperava diretório de execução");
  return JSON.parse(fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision), "utf8")) as ObserveEnvelope;
}

function observeCodes(envelope: ObserveEnvelope): string[] {
  return envelope.observation.reasons.map((reason) => `${reason.stage}:${reason.code.replace(/^UNIT_SUITE_(GATE_)?/, "")}`);
}

test("observe: execução completa => OBSERVED_UNATTESTED (código 0), sem baseline, sem PASS, quatro artefatos", async () => {
  const fx = makeFixture();
  fs.rmSync(fx.baseline); // não existe baseline: observe não pode depender dele
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  assert.equal(result.final, "OBSERVED_UNATTESTED");
  assert.equal(result.persisted, true);
  const envelope = readObserveEnvelope(result);
  assert.equal(envelope.schema, UNIT_SUITE_OBSERVE_RESULT_SCHEMA);
  assert.equal(envelope.mode, "observe");
  assert.equal(envelope.final, "OBSERVED_UNATTESTED");
  assert.equal(envelope.observation.status, "OBSERVED_UNATTESTED");
  assert.equal(envelope.observation.approval, "NONE");
  assert.deepEqual(envelope.observation.baseline, { used: false, generated: false, ratified: false });
  assert.equal(envelope.launcher.inputs.baseline.available, false, "baseline não usado");
  assert.deepEqual(envelope.launcher.issues, []);
  assert.deepEqual(fs.readdirSync(result.runDir as string).sort(), Object.values(ARTIFACT_NAMES).sort(), "somente os quatro artefatos");
  const text = fs.readFileSync(path.join(result.runDir as string, ARTIFACT_NAMES.decision), "utf8");
  assert.equal(text.includes('"PASS"'), false, "observe nunca emite PASS");
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "decision"), false);
  const rows = envelope.observation.files;
  assert.deepEqual(rows.map((row) => [row.file, row.tests, row.executed, row.sha256, row.candidate]), [
    ["pkg/a.test.ts", 2, 2, sha(defaultFiles()[0].content), true],
    ["pkg/b.test.ts", 3, 3, sha(defaultFiles()[1].content), true],
  ]);
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), true, "o teste de fixture rodou de fato");
  assert.deepEqual(fs.readdirSync(fx.root).filter((name) => /baseline/i.test(name)), [], "observe não cria baseline");
});

test("observe: não aceita caminho de baseline (código 2, nenhum diretório criado) e não lê o baseline mesmo existente", async () => {
  const fx = makeFixture();
  const rejected = await runUnitSuiteObserve({ ...observeOptions(fx), baselinePath: fx.baseline });
  assert.equal(rejected.exitCode, 2);
  assert.deepEqual(rejected.errors.map((error) => error.code), ["UNIT_SUITE_LAUNCHER_OPTIONS_INVALID"]);
  assert.equal(rejected.runDir, null);
  assert.equal(fs.existsSync(fx.out), false, "nada foi criado");

  fs.writeFileSync(fx.baseline, "{ isto não é um baseline válido");
  const before = fs.readFileSync(fx.baseline);
  const ok = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(ok.exitCode, 0, "baseline inválido no disco é irrelevante para observe");
  assert.equal(Buffer.compare(fs.readFileSync(fx.baseline), before), 0, "bytes do arquivo preservados");
  assert.equal(readObserveEnvelope(ok).launcher.inputs.baseline.available, false);

  const gate = await runUnitSuiteGate(options(fx));
  assert.equal(gate.exitCode, 1, "o modo gate continua exigindo baseline válido (fail-closed)");
  assert.equal(readEnvelope(gate).decision.stages.baseline.status, "FAIL");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), true);
});

test("observe: gate sem baseline continua fail-closed e não inicia testes", async () => {
  const fx = makeFixture();
  fs.rmSync(fx.baseline);
  const result = await runUnitSuiteGate(options(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readEnvelope(result);
  has(issueCodes(envelope), "INPUT_UNREADABLE");
  has(issueCodes(envelope), "PREFLIGHT_FAILED");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), false, "nenhum teste foi iniciado");
});

test("observe: teste falho => OBSERVATION_FAILED (código 1) com contagens informativas e sem candidatos", async () => {
  const files = defaultFiles();
  files[1] = { name: "pkg/b.test.ts", content: `import test from "node:test"; import assert from "node:assert/strict";\ntest("t1", () => {}); test("t2", () => {}); test("t3", () => assert.equal(1, 2));\n`, tests: 3 };
  const fx = makeFixture(files);
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 1);
  assert.equal(result.final, "OBSERVATION_FAILED");
  const envelope = readObserveEnvelope(result);
  has(observeCodes(envelope), "run:RUN_EXIT_NONZERO");
  has(observeCodes(envelope), "verdict:TEST_FAILED");
  assert.equal(envelope.observation.files.every((row) => row.candidate === false), true);
  const rowB = envelope.observation.files.find((row) => row.file === "pkg/b.test.ts");
  assert.deepEqual([rowB?.tests, rowB?.executed, rowB?.failed], [3, 2, 1]);
});

test("observe: falha de suite (hook) com saída 0 não é observação bem-sucedida", async () => {
  const files = defaultFiles();
  files[1] = { name: "pkg/b.test.ts", content: `import { describe, it, after } from "node:test";\ndescribe("s", () => { after(() => { throw new Error("hook"); }); it("x1", () => {}); it("x2", () => {}); it("x3", () => {}); });\n`, tests: 3 };
  const fx = makeFixture(files);
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 1);
  assert.equal(result.final, "OBSERVATION_FAILED");
  has(observeCodes(readObserveEnvelope(result)), "verdict:SUITE_FAILED");
});

test("observe: timeout => OBSERVATION_INCOMPLETE; o grupo inteiro é encerrado", async () => {
  const hang = `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";\ntest("hang", async () => { const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); fs.writeFileSync("grandchild.pid", String(child.pid)); await new Promise(() => {}); });\n`;
  const fx = makeFixture([{ name: "pkg/hang.test.ts", content: hang, tests: 1 }]);
  const started = Date.now();
  const result = await runUnitSuiteObserve(observeOptions(fx, { timeoutMs: 5000 }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.final, "OBSERVATION_INCOMPLETE");
  const envelope = readObserveEnvelope(result);
  const proc = envelope.launcher.process;
  assert.equal(proc.available && proc.value.timedOut, true);
  has(observeCodes(envelope), "run:RUN_TIMED_OUT");
  assert.equal(Date.now() - started < 20_000, true, "o lançador não ficou pendurado");
  assert.equal(await waitDead(Number(fs.readFileSync(path.join(fx.root, "grandchild.pid"), "utf8"))), true, "o descendente foi encerrado");
  assert.equal(envelope.observation.files.every((row) => row.candidate === false && row.coverage === "NOT_DEMONSTRATED"), true);
});

test("observe: descendente que sobrevive ao runner rebaixa para OBSERVATION_INCOMPLETE mesmo com testes aprovados", async () => {
  const leaker = `import test from "node:test"; import { spawn } from "node:child_process"; import fs from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nchild.unref();\nfs.writeFileSync("leaked.pid", String(child.pid));\ntest("t1", () => {});\n`;
  const fx = makeFixture([{ name: "pkg/leak.test.ts", content: leaker, tests: 1 }]);
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 1);
  const envelope = readObserveEnvelope(result);
  assert.equal(envelope.observation.status, "OBSERVED_UNATTESTED", "a avaliação pura dos eventos estava completa");
  has(envelope.launcher.issues.map((issue) => issue.code.replace("UNIT_SUITE_LAUNCHER_", "")), "PROCESSES_REMAINING");
  assert.equal(envelope.final, "OBSERVATION_INCOMPLETE", "o final prevalece: issue do lançador torna a observação não confiável");
  assert.equal(await waitDead(Number(fs.readFileSync(path.join(fx.root, "leaked.pid"), "utf8"))), true);
});

test("observe: arquivo de teste alterado durante a execução => OBSERVATION_INCOMPLETE", async () => {
  const mutator = `import test from "node:test"; import fs from "node:fs";\nfs.appendFileSync("pkg/b.test.ts", "\\n// alterado durante a execução\\n");\ntest("t1", () => {}); test("t2", () => {});\n`;
  const fx = makeFixture([
    { name: "pkg/a.test.ts", content: mutator, tests: 2 },
    { name: "pkg/b.test.ts", content: passing(null, 3), tests: 3 },
  ]);
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 1);
  assert.equal(result.final, "OBSERVATION_INCOMPLETE");
  has(observeCodes(readObserveEnvelope(result)), "integrity:FILES_CHANGED_DURING_RUN");
});

test("observe: arquivo condicional ignorado (sem banco) => cobertura NOT_DEMONSTRATED; skip nunca conta como executado", async () => {
  const skipped = `import test from "node:test";\ntest("exige banco real", { skip: "REAL_POSTGRES_INTEGRATION_DATABASE_URL ausente" }, () => {});\ntest("tambem exige banco real", { skip: "ausente" }, () => {});\n`;
  const fx = makeFixture([
    { name: "pkg/a.test.ts", content: passing(null, 2), tests: 2 },
    { name: "pkg/ciclo.realPostgres.integration.test.ts", content: skipped, tests: 2, skipped: 2 },
  ]);
  const result = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  const rows = readObserveEnvelope(result).observation;
  const db = rows.files.find((row) => row.file === "pkg/ciclo.realPostgres.integration.test.ts")!;
  assert.deepEqual([db.conditional, db.tests, db.executed, db.skipped, db.coverage], [true, 2, 0, 2, "NOT_DEMONSTRATED"]);
  assert.equal(rows.files.find((row) => row.file === "pkg/a.test.ts")?.coverage, "DEMONSTRATED");
  assert.deepEqual([rows.totals.executed, rows.totals.skipped, rows.totals.conditionalNotDemonstrated], [2, 2, 1]);
});

test("observe: ambiente mínimo - segredos do pai não chegam aos testes e nada de ambiente é gravado", async () => {
  const dumper = `import test from "node:test"; import fs from "node:fs";\nfs.writeFileSync("env-dump.json", JSON.stringify({ keys: Object.keys(process.env).sort(), databaseUrl: process.env.DATABASE_URL ?? null }));\ntest("t1", () => {});\n`;
  const fx = makeFixture([{ name: "pkg/env.test.ts", content: dumper, tests: 1 }]);
  const hostile = minimalEnv({ SECRET_TOKEN: "supersecret-value-123", GITHUB_TOKEN: "ghp_xxx", AWS_SECRET_ACCESS_KEY: "aws", DATABASE_URL: "postgresql://real:real@db.example.com/prod", NODE_OPTIONS: "--max-old-space-size=64" });
  const result = await runUnitSuiteObserve(observeOptions(fx, { parentEnv: hostile }));
  assert.equal(result.exitCode, 0, JSON.stringify(result.errors));
  const dump = JSON.parse(fs.readFileSync(path.join(fx.root, "env-dump.json"), "utf8")) as { keys: string[]; databaseUrl: string };
  assert.equal(dump.databaseUrl, DATABASE_URL_SENTINEL);
  const allowed = new Set<string>([...ENV_ALLOWLIST, "DATABASE_URL", "UNIT_SUITE_EVENTS_FILE", "NODE_TEST_CONTEXT"]);
  assert.deepEqual(dump.keys.filter((key) => !allowed.has(key)), []);
  const all = [...fs.readdirSync(result.runDir as string)].map((name) => fs.readFileSync(path.join(result.runDir as string, name), "utf8")).join("\n");
  for (const forbidden of ["supersecret-value-123", "ghp_xxx", "postgresql://real:real@db.example.com/prod"]) assert.equal(all.includes(forbidden), false, forbidden);
});

test("observe: execução repetida produz a mesma observação (determinística) e nunca sobrescreve execuções", async () => {
  const fx = makeFixture();
  const first = await runUnitSuiteObserve(observeOptions(fx));
  const second = await runUnitSuiteObserve(observeOptions(fx));
  assert.equal(first.exitCode, 0);
  assert.equal(second.exitCode, 0);
  assert.notEqual(first.runDir, second.runDir);
  assert.deepEqual(readObserveEnvelope(first).observation, readObserveEnvelope(second).observation);
  const collision = await runUnitSuiteObserve(observeOptions(fx, { runId: path.basename(first.runDir as string) }));
  assert.equal(collision.exitCode, 2);
  assert.deepEqual(collision.errors.map((error) => error.code), ["UNIT_SUITE_LAUNCHER_RUN_DIR_EXISTS"]);
});

test("observe: manifesto e argv divergentes reprovam antes de executar (nenhum teste iniciado)", async () => {
  const fx = makeFixture();
  const result = await runUnitSuiteObserve(observeOptions(fx, { files: [fx.files[0]] }));
  assert.equal(result.exitCode, 1);
  const envelope = readObserveEnvelope(result);
  assert.equal(envelope.final, "OBSERVATION_INCOMPLETE");
  has(observeCodes(envelope), "argv:ARGV_MISSING_FILE");
  has(envelope.launcher.issues.map((issue) => issue.code.replace("UNIT_SUITE_LAUNCHER_", "")), "PREFLIGHT_FAILED");
  assert.equal(fs.existsSync(path.join(fx.root, "marker-a.txt")), false, "nenhum teste foi iniciado");
});

test("CLI: --mode padrão é gate; observe rejeita --baseline e modos desconhecidos", () => {
  const base = ["--out", "o", "--timeout-ms", "5", "--reporter", "r"];
  const gate = parseCliArguments(base, "/x");
  assert.equal(gate.ok && gate.mode, "gate");
  const observe = parseCliArguments(["--mode", "observe", ...base, "--", "a.test.ts"], "/x");
  assert.equal(observe.ok && observe.mode, "observe");
  if (observe.ok) assert.equal("baselinePath" in observe.options, false, "observe não carrega caminho de baseline");
  assert.equal(parseCliArguments(["--mode", "observe", "--baseline", "b.json", ...base], "/x").ok, false);
  assert.equal(parseCliArguments(["--mode", "bogus", ...base], "/x").ok, false);
  assert.equal(parseCliArguments(["--mode", "observe", "--mode", "gate", ...base], "/x").ok, false, "modo repetido");
  const explicitGate = parseCliArguments(["--mode", "gate", "--baseline", "b.json", ...base], "/x");
  assert.equal(explicitGate.ok && explicitGate.options.baselinePath, "b.json");
});

test("CLI observe de ponta a ponta: 0 (observação completa), 1 (falha), 2 (uso); saída sem ok/PASS", () => {
  const good = makeFixture();
  const common = (fx: Fixture, id: string) => ["--mode", "observe", "--root", fx.root, "--manifest", fx.manifest, "--out", fx.out, "--run-id", id, "--timeout-ms", "40000", "--reporter", REPORTER, "--tsx-loader", TSX];
  const done = runCli([...common(good, "obs-ok"), "--", ...good.files]);
  assert.equal(done.status, 0, done.stderr);
  const summary = JSON.parse(done.stdout) as Record<string, unknown>;
  assert.equal(summary.final, "OBSERVED_UNATTESTED");
  assert.equal(summary.approval, "NONE");
  assert.equal("ok" in summary, false, "sem campo ok: observar não é aprovar");
  assert.equal(done.stdout.includes("PASS"), false);

  const bad = makeFixture([{ name: "pkg/f.test.ts", content: `import test from "node:test"; import assert from "node:assert/strict";\ntest("t1", () => assert.equal(1, 2));\n`, tests: 1 }]);
  const failed = runCli([...common(bad, "obs-fail"), "--", ...bad.files]);
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal((JSON.parse(failed.stderr) as { final: string }).final, "OBSERVATION_FAILED");

  assert.equal(runCli(["--mode", "observe", "--baseline", good.baseline, "--out", good.out, "--timeout-ms", "5", "--reporter", REPORTER]).status, 2);
  assert.equal(runCli(["--mode", "observe", "--out", good.out]).status, 2);
});
