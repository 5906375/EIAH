import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isConditionalCoverageFile } from "../ci/unitSuiteDecision";
import {
  parseUnitSuiteManifest,
  UNIT_SUITE_INVENTORY_VERSION,
  type InventoryIssue,
  type InventoryParseResult,
} from "../ci/unitSuiteInventory";

function issuesOf(result: InventoryParseResult): readonly InventoryIssue[] {
  assert.equal(result.ok, false, "esperava inventário inválido");
  return result.ok ? [] : result.issues;
}

test("inventário válido: ignora comentários e linhas vazias e devolve ordem determinística", () => {
  const result = parseUnitSuiteManifest([
    "# cabeçalho",
    "",
    "apps/web/src/b.test.tsx",
    "   ",
    "  # comentário indentado",
    "apps/api/src/tests/z.test.ts",
    "apps/api/src/tests/a.test.ts",
    "",
  ].join("\n"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.version, UNIT_SUITE_INVENTORY_VERSION);
  assert.deepEqual(result.files, [
    "apps/api/src/tests/a.test.ts",
    "apps/api/src/tests/z.test.ts",
    "apps/web/src/b.test.tsx",
  ]);
  assert.deepEqual(result.entries.map((entry) => [entry.line, entry.file]), [
    [3, "apps/web/src/b.test.tsx"],
    [6, "apps/api/src/tests/z.test.ts"],
    [7, "apps/api/src/tests/a.test.ts"],
  ]);
});

test("a ordem de saída não depende da ordem do manifesto nem do fim de linha", () => {
  const forward = parseUnitSuiteManifest("a/x.test.ts\r\nb/y.test.ts\r\n");
  const backward = parseUnitSuiteManifest("b/y.test.ts\na/x.test.ts");
  assert.equal(forward.ok && backward.ok, true);
  if (forward.ok && backward.ok) assert.deepEqual(forward.files, backward.files);
});

test("entrada duplicada é reprovada, inclusive após normalização", () => {
  const issues = issuesOf(parseUnitSuiteManifest([
    "apps/api/src/a.test.ts",
    "apps/api/src/a.test.ts",
    "./apps/api/src/a.test.ts",
    "apps//api/./src/a.test.ts",
  ].join("\n")));
  assert.deepEqual(issues.map((issue) => [issue.code, issue.line]), [
    ["INVENTORY_DUPLICATE_ENTRY", 2],
    ["INVENTORY_DUPLICATE_ENTRY", 3],
    ["INVENTORY_DUPLICATE_ENTRY", 4],
  ]);
  assert.match(issues[0].detail ?? "", /first at line 1/);
});

test("caminhos absolutos, travessia e caracteres inválidos são reprovados com códigos estáveis", () => {
  const cases: Array<[string, string]> = [
    ["/etc/passwd.test.ts", "INVENTORY_ABSOLUTE_PATH"],
    ["C:/repo/a.test.ts", "INVENTORY_ABSOLUTE_PATH"],
    ["../outside/a.test.ts", "INVENTORY_PATH_TRAVERSAL"],
    ["apps/../secrets/a.test.ts", "INVENTORY_PATH_TRAVERSAL"],
    ["apps\\api\\a.test.ts", "INVENTORY_INVALID_CHARACTERS"],
    ["apps/api/a*.test.ts", "INVENTORY_INVALID_CHARACTERS"],
    ["apps/api/ação.test.ts", "INVENTORY_INVALID_CHARACTERS"],
  ];
  for (const [entry, code] of cases) {
    const issues = issuesOf(parseUnitSuiteManifest(`ok/a.test.ts\n${entry}`));
    assert.deepEqual(issues.map((issue) => [issue.code, issue.line, issue.entry]), [[code, 2, entry]], entry);
  }
});

test("extensão fora de .test.ts/.test.tsx é reprovada", () => {
  for (const entry of ["apps/api/a.ts", "apps/api/a.spec.ts", "apps/api/a.test.js", "apps/api/a.test.mjs", "apps/api/.test.ts", "apps/api/dir/"]) {
    const issues = issuesOf(parseUnitSuiteManifest(entry));
    assert.deepEqual(issues.map((issue) => issue.code), ["INVENTORY_INVALID_EXTENSION"], entry);
  }
});

test("mais de um caminho na mesma linha ou comentário inline não é aceito", () => {
  const issues = issuesOf(parseUnitSuiteManifest("a/x.test.ts b/y.test.ts\nc/z.test.ts # nota"));
  assert.deepEqual(issues.map((issue) => [issue.code, issue.line]), [
    ["INVENTORY_MULTIPLE_OR_SPACED_ENTRY", 1],
    ["INVENTORY_MULTIPLE_OR_SPACED_ENTRY", 2],
  ]);
});

test("todos os problemas são reportados de uma vez, na ordem das linhas", () => {
  const issues = issuesOf(parseUnitSuiteManifest(["/abs/a.test.ts", "ok/b.test.ts", "../c.test.ts", "d.ts", "ok/b.test.ts"].join("\n")));
  assert.deepEqual(issues.map((issue) => [issue.line, issue.code]), [
    [1, "INVENTORY_ABSOLUTE_PATH"],
    [3, "INVENTORY_PATH_TRAVERSAL"],
    [4, "INVENTORY_INVALID_EXTENSION"],
    [5, "INVENTORY_DUPLICATE_ENTRY"],
  ]);
});

test("manifesto sem entradas é reprovado (fail-closed), mesmo com cabeçalho", () => {
  for (const content of ["", "\n\n", "# só comentários\n# outro"]) {
    assert.deepEqual(issuesOf(parseUnitSuiteManifest(content)).map((issue) => issue.code), ["INVENTORY_EMPTY"]);
  }
});

test("conteúdo que não é texto é reprovado sem lançar", () => {
  for (const content of [undefined, null, 42, {}, ["a.test.ts"]]) {
    const result = parseUnitSuiteManifest(content as unknown as string);
    assert.deepEqual(issuesOf(result).map((issue) => issue.code), ["INVENTORY_CONTENT_NOT_STRING"]);
  }
});

test("entradas aceitas cobrem o padrão usado pelo gate de órfãos (nomes com ponto e hífen)", () => {
  const result = parseUnitSuiteManifest([
    "apps/api/src/tests/imob.crm-turn-batch.test.ts",
    "apps/web/src/features/imob/charts/ImobBrokerChart.test.tsx",
    "packages/mcp-runner/src/executor/MCPExecutor.test.ts",
  ].join("\n"));
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------------------------
// Reconciliação manifesto x comando test:ci-unit-suite (somente leitura de arquivos; nenhum teste é executado)
// ---------------------------------------------------------------------------------------------

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_TEXT = fs.readFileSync(path.join(REPO, "scripts/unit-tests-manifest.txt"), "utf8");
const SCRIPT = (JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts["test:ci-unit-suite"];
const SCRIPT_FILES = SCRIPT.split(" ").filter((token) => /\.test\.tsx?$/.test(token));

test("manifesto versionado: válido, sem duplicatas e todos os caminhos existem no repositório", () => {
  const parsed = parseUnitSuiteManifest(MANIFEST_TEXT);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.issues.slice(0, 3)));
  if (!parsed.ok) return;
  assert.equal(new Set(parsed.files).size, parsed.entries.length, "sem entradas duplicadas");
  assert.deepEqual(parsed.files, [...parsed.files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), "files em ordem determinística por unidade de código");
  const missing = parsed.files.filter((file) => !fs.existsSync(path.join(REPO, file)));
  assert.deepEqual(missing, [], "arquivos do manifesto ausentes no disco");
});

test("manifesto == comando test:ci-unit-suite: mesmo conjunto, mesma ordem, nenhuma exclusão silenciosa", () => {
  const parsed = parseUnitSuiteManifest(MANIFEST_TEXT);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(new Set(SCRIPT_FILES).size, SCRIPT_FILES.length, "o comando não repete arquivos");
  const inManifestOnly = parsed.files.filter((file) => !SCRIPT_FILES.includes(file));
  const inScriptOnly = SCRIPT_FILES.filter((file) => !parsed.files.includes(file));
  assert.deepEqual({ inManifestOnly, inScriptOnly }, { inManifestOnly: [], inScriptOnly: [] }, "drift entre manifesto e comando");
  assert.deepEqual(parsed.entries.map((entry) => entry.file), SCRIPT_FILES, "a ordem do manifesto reproduz a do comando");
});

test("o comando é reproduzível a partir do manifesto, byte a byte, pelo snippet documentado no cabeçalho", () => {
  assert.equal(MANIFEST_TEXT.includes("filter(l=>l&&!l.startsWith('#')).join(' ')"), true, "snippet de geração presente no cabeçalho");
  const generated = `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test --test-force-exit ${MANIFEST_TEXT.split("\n").filter((line) => line && !line.startsWith("#")).join(" ")}`;
  assert.equal(generated, SCRIPT);
});

test("arquivos que dependem de Postgres real estão no manifesto e permanecem classificados como condicionais", () => {
  const parsed = parseUnitSuiteManifest(MANIFEST_TEXT);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const conditional = parsed.files.filter((file) => isConditionalCoverageFile(file));
  assert.deepEqual(conditional, [
    "apps/api/src/services/apeWeeklyCycleV3BillingCollector.realPostgres.integration.test.ts",
    "apps/api/src/services/apeWeeklyCycleV3BillingCycle.realPostgres.integration.test.ts",
  ]);
  const integrationSuffix = parsed.files.filter((file) => /\.integration\.test\.tsx?$/.test(file) && !isConditionalCoverageFile(file));
  assert.deepEqual(integrationSuffix, [], "nenhum arquivo *.integration.test.* fora da classificação condicional");
});
