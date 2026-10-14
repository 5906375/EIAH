import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseUnitSuiteBaseline,
  UNIT_SUITE_BASELINE_ISSUE_CODES,
  UNIT_SUITE_BASELINE_SCHEMA_VERSION,
  type BaselineIssueCode,
  type BaselineParseResult,
} from "../ci/unitSuiteBaseline";
import { evaluateUnitSuite, type ExpectedFileBaseline } from "../ci/unitSuiteVerdict";

const SHA_A = "a".repeat(64);
const SHA_B = "0123456789abcdef".repeat(4);
const FILES = ["apps/api/src/a.test.ts", "apps/web/src/b.test.tsx"];

type Doc = {
  schemaVersion?: unknown;
  provenance?: Record<string, unknown> | unknown;
  files?: Array<Record<string, unknown>> | unknown;
  [extra: string]: unknown;
};

function validDoc(): Doc {
  return {
    schemaVersion: "unit-tests-baseline.v1",
    provenance: {
      status: "declared",
      recordedAt: "2026-10-12",
      recordedCommit: "f093ba0000000000000000000000000000000000".slice(0, 40),
      method: "contagens declaradas manualmente a partir de execução local sem --test-force-exit",
      nodeVersion: "v22.17.1",
    },
    files: [
      { file: "apps/api/src/a.test.ts", tests: 12, skipped: 1, todo: 2, sha256: SHA_A },
      { file: "apps/web/src/b.test.tsx", tests: 3, skipped: 0, todo: 0, sha256: SHA_B },
    ],
  };
}

function doc(mutate: (value: Doc) => void): string {
  const value = validDoc();
  mutate(value);
  return JSON.stringify(value, null, 2);
}

function files(value: Doc): Array<Record<string, unknown>> {
  return value.files as Array<Record<string, unknown>>;
}

function prov(value: Doc): Record<string, unknown> {
  return value.provenance as Record<string, unknown>;
}

function parse(text: string, expectedFiles: readonly string[] = FILES): BaselineParseResult {
  return parseUnitSuiteBaseline(text, { expectedFiles });
}

function codes(result: BaselineParseResult): string[] {
  assert.equal(result.ok, false, "esperava baseline reprovado");
  return result.ok ? [] : result.issues.map((entry) => entry.code.replace("UNIT_SUITE_BASELINE_", ""));
}

function expectCodes(text: string, wanted: string[], context: string, expectedFiles: readonly string[] = FILES): void {
  const result = parse(text, expectedFiles);
  const got = result.ok ? ["OK"] : result.issues.map((entry) => entry.code.replace("UNIT_SUITE_BASELINE_", ""));
  assert.deepEqual(got, wanted, `${context}: ${JSON.stringify(result.ok ? {} : result.issues)}`);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("baseline válido: dados compatíveis com ExpectedFileBaseline, digests e proveniência declarada", () => {
  const result = parse(doc(() => {}));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.version, UNIT_SUITE_BASELINE_SCHEMA_VERSION);
  assert.deepEqual(result.files, [
    { file: "apps/api/src/a.test.ts", tests: 12, skipped: 1, todo: 2 },
    { file: "apps/web/src/b.test.tsx", tests: 3, skipped: 0, todo: 0 },
  ]);
  assert.deepEqual(result.digests, [{ file: "apps/api/src/a.test.ts", sha256: SHA_A }, { file: "apps/web/src/b.test.tsx", sha256: SHA_B }]);
  assert.deepEqual(result.provenance, {
    status: "declared", recordedAt: "2026-10-12", recordedCommit: "f093ba0000000000000000000000000000000000",
    method: "contagens declaradas manualmente a partir de execução local sem --test-force-exit", nodeVersion: "v22.17.1",
  });
});

test("a saída é aceita diretamente pelo verificador (compatibilidade de contrato)", () => {
  const result = parse(doc(() => {}));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const expected: readonly ExpectedFileBaseline[] = result.files;
  const verdict = evaluateUnitSuite({
    expected,
    observed: expected.map((entry) => ({
      file: entry.file, started: entry.tests, passed: entry.tests, failed: 0, cancelled: 0, skipped: entry.skipped, todo: entry.todo ?? 0,
      suiteFailures: 0, fileLevelEntries: 0, summaryCount: 1,
      summary: { tests: entry.tests, passed: entry.tests - entry.skipped - (entry.todo ?? 0), failed: 0, cancelled: 0, skipped: entry.skipped, todo: entry.todo ?? 0 },
    })),
    run: { exitCode: 0, signal: null, timedOut: false },
  });
  assert.equal(verdict.status, "PASS", JSON.stringify(verdict.reasons));
});

test("JSON inválido ou texto que não é JSON de objeto: reprovado sem lançar", () => {
  const valid = doc(() => {});
  const cases: Array<[string, unknown]> = [
    ["vazio", ""], ["só espaços", "  \n "], ["truncado", valid.slice(0, valid.length - 10)], ["vírgula final", valid.replace(/\n}$/, ",\n}")],
    ["aspas simples", "{'schemaVersion': 'unit-tests-baseline.v1'}"], ["comentário", `// nota\n${valid}`], ["BOM", `\uFEFF${valid}`],
    ["lixo depois do documento", `${valid} x`], ["NaN", valid.replace('"tests": 12', '"tests": NaN')], ["chave sem aspas", "{schemaVersion: 1}"],
    ["escape inválido", valid.replace("declaradas", "decla\\xradas")], ["controle em string", valid.replace("declaradas", "decla\u0001radas")],
    ["string aberta", '{"schemaVersion": "abc'], ["número com zero à esquerda", valid.replace(": 12", ": 012")],
  ];
  for (const [label, text] of cases) {
    const result = parse(text as string);
    assert.equal(result.ok, false, label);
    assert.deepEqual(codes(result), ["JSON_INVALID"], label);
  }
  const deep = `${"[".repeat(40)}${"]".repeat(40)}`;
  assert.deepEqual(codes(parse(deep)), ["JSON_INVALID"], "aninhamento excessivo");
  for (const notText of [undefined, null, 42, {}, ["a"]]) {
    assert.deepEqual(codes(parse(notText as unknown as string)), ["TEXT_INVALID"], String(notText));
  }
});

test("raiz que não é objeto, ou objeto de outro tipo: TYPE_INVALID", () => {
  for (const text of ["[]", "42", '"x"', "null", "true"]) assert.deepEqual(codes(parse(text)), ["TYPE_INVALID"], text);
});

test("versão do schema: ausente, outra versão, tipo errado", () => {
  expectCodes(doc((d) => { d.schemaVersion = "unit-tests-baseline.v2"; }), ["SCHEMA_VERSION_INVALID"], "v2");
  expectCodes(doc((d) => { d.schemaVersion = "Unit-Tests-Baseline.v1"; }), ["SCHEMA_VERSION_INVALID"], "caixa");
  expectCodes(doc((d) => { d.schemaVersion = 1; }), ["SCHEMA_VERSION_INVALID"], "número");
  expectCodes(doc((d) => { d.schemaVersion = null; }), ["SCHEMA_VERSION_INVALID"], "null");
  expectCodes(doc((d) => { delete d.schemaVersion; }), ["KEY_MISSING"], "ausente");
});

test("chaves ausentes e inesperadas, na raiz, na proveniência e nas entradas", () => {
  expectCodes(doc((d) => { delete d.provenance; }), ["KEY_MISSING"], "sem provenance");
  expectCodes(doc((d) => { delete d.files; }), ["KEY_MISSING"], "sem files");
  expectCodes(doc((d) => { d.extra = 1; }), ["KEY_UNEXPECTED"], "chave extra na raiz");
  expectCodes(doc((d) => { d.runs = 3; }), ["KEY_UNEXPECTED"], "runs não faz parte do contrato");
  expectCodes(doc((d) => { delete prov(d).method; }), ["KEY_MISSING"], "sem method");
  expectCodes(doc((d) => { prov(d).verifiedBy = "ci"; }), ["KEY_UNEXPECTED"], "extra na proveniência");
  expectCodes(doc((d) => { delete files(d)[0].sha256; }), ["KEY_MISSING"], "sem sha256");
  expectCodes(doc((d) => { delete files(d)[0].todo; }), ["KEY_MISSING"], "sem todo (obrigatório)");
  expectCodes(doc((d) => { files(d)[1].comment = "x"; }), ["KEY_UNEXPECTED"], "extra na entrada");
});

test("tipos estritos: provenance, files e entradas", () => {
  expectCodes(doc((d) => { d.provenance = "declared"; }), ["TYPE_INVALID"], "provenance texto");
  expectCodes(doc((d) => { d.files = "x"; }), ["TYPE_INVALID"], "files texto");
  expectCodes(doc((d) => { d.files = { a: 1 }; }), ["TYPE_INVALID"], "files objeto");
  expectCodes(doc((d) => { d.files = [42, files(d)[1]]; }), ["TYPE_INVALID", "FILE_MISSING_FROM_BASELINE"], "entrada número (o arquivo fica sem entrada)");
  expectCodes(doc((d) => { prov(d).recordedAt = 20261012; }), ["TYPE_INVALID"], "recordedAt número");
  expectCodes(doc((d) => { files(d)[0].file = 7; }), ["TYPE_INVALID", "FILE_MISSING_FROM_BASELINE"], "file número");
  expectCodes(doc((d) => { files(d)[0].sha256 = 7; }), ["TYPE_INVALID"], "sha256 número");
});

test("proveniência: apenas 'declared' e formatos estritos; nada é tratado como prova", () => {
  for (const status of ["verified", "proven", "DECLARED", "", "declared ", 1, null]) {
    const text = doc((d) => { prov(d).status = status; });
    const got = codes(parse(text));
    assert.equal(got.length, 1, String(status));
    assert.equal(got[0] === "PROVENANCE_STATUS_INVALID" || got[0] === "TYPE_INVALID", true, `${String(status)}: ${got[0]}`);
  }
  const format: Array<[string, unknown]> = [
    ["recordedAt", "2026-13-01"], ["recordedAt", "2026-02-30"], ["recordedAt", "2025-02-29"], ["recordedAt", "2026-1-1"],
    ["recordedAt", "2026-10-12T10:00:00Z"], ["recordedAt", "2026-00-10"], ["recordedAt", "2026-10-00"], ["recordedAt", "0000-10-10"],
    ["recordedCommit", "F093BA0000000000000000000000000000000000"], ["recordedCommit", "f093ba0"], ["recordedCommit", "g".repeat(40)], ["recordedCommit", "a".repeat(41)],
    ["method", ""], ["method", " x"], ["method", "x "], ["method", "linha1\nlinha2"], ["method", "x".repeat(501)],
    ["nodeVersion", "22.17.1"], ["nodeVersion", "v22.17"], ["nodeVersion", "v22.17.1-beta"], ["nodeVersion", "v22.17.1 "],
  ];
  for (const [field, value] of format) {
    expectCodes(doc((d) => { prov(d)[field] = value; }), ["FORMAT_INVALID"], `${field}=${JSON.stringify(value)}`);
  }
  expectCodes(doc((d) => { prov(d).recordedAt = "2024-02-29"; }), ["OK"], "29/02 em ano bissexto é válido");
  expectCodes(doc((d) => { prov(d).recordedAt = "2000-02-29"; }), ["OK"], "ano 2000 é bissexto");
  expectCodes(doc((d) => { prov(d).recordedAt = "1900-02-29"; }), ["FORMAT_INVALID"], "ano 1900 não é bissexto");
  expectCodes(doc((d) => { prov(d).method = "x".repeat(500); }), ["OK"], "limite de 500 caracteres");
});

test("caminhos inválidos ou não canônicos", () => {
  const bad = ["/repo/a.test.ts", "../a.test.ts", "a/../b.test.ts", "./apps/api/src/a.test.ts", "apps//api/a.test.ts", "apps\\api\\a.test.ts",
    "apps/api/a.ts", "apps/api/a.spec.ts", "apps/api/.test.ts", "apps/api/dir/", " apps/api/a.test.ts", "apps/api/a b.test.ts", "", "C:/a.test.ts"];
  for (const file of bad) {
    expectCodes(doc((d) => { files(d)[0].file = file; }), ["FILE_PATH_INVALID", "FILE_MISSING_FROM_BASELINE"], JSON.stringify(file));
  }
});

test("arquivo duplicado, inclusive com chave repetida no JSON, e baseline vazio", () => {
  const duplicated = doc((d) => { files(d).push({ ...files(d)[1] }); });
  expectCodes(duplicated, ["FILE_DUPLICATE"], "mesmo caminho duas vezes");
  expectCodes(doc((d) => { d.files = []; }), ["FILES_EMPTY"], "baseline vazio");
});

test("ordenação determinística: fora de ordem reprova, e a ordem é por unidade de código", () => {
  expectCodes(doc((d) => { files(d).reverse(); }), ["FILES_NOT_SORTED"], "invertido");
  const mixed = ["a/B.test.ts", "a/a.test.ts"];
  const ordered = JSON.stringify({ ...validDoc(), files: mixed.map((file) => ({ file, tests: 1, skipped: 0, todo: 0, sha256: SHA_A })) });
  expectCodes(ordered, ["OK"], "maiúscula antes de minúscula (código de unidade)", mixed);
  const wrong = JSON.stringify({ ...validDoc(), files: [...mixed].reverse().map((file) => ({ file, tests: 1, skipped: 0, todo: 0, sha256: SHA_A })) });
  expectCodes(wrong, ["FILES_NOT_SORTED"], "minúscula antes de maiúscula", mixed);
});

test("contagens: negativa, fracionária, notação científica, '-0', acima do limite seguro, texto, null, booleano", () => {
  const raw = (field: string, literal: string) => doc((d) => { files(d)[0][field] = "__MARK__"; }).replace('"__MARK__"', literal);
  const invalid = ["-1", "1.5", "12.0", "1e2", "-0", "9007199254740992", "9007199254740993", "99999999999999999999", '"3"', "null", "true", "[]", "{}"];
  for (const field of ["tests", "skipped", "todo"]) {
    for (const literal of invalid) {
      const result = parse(raw(field, literal));
      assert.equal(result.ok, false, `${field}=${literal}`);
      const got = codes(result);
      assert.equal(got.includes("COUNT_INVALID"), true, `${field}=${literal}: ${got.join(",")}`);
    }
  }
  expectCodes(raw("skipped", "9007199254740991"), ["SKIP_TODO_EXCEEDS_TESTS"], "no limite seguro mas maior que tests");
  expectCodes(doc((d) => { files(d)[0].tests = 0; files(d)[0].skipped = 0; files(d)[0].todo = 0; }), ["TESTS_BELOW_ONE"], "tests = 0");
});

test("coerência: skipped + todo ≤ tests (igualdade é válida)", () => {
  expectCodes(doc((d) => { Object.assign(files(d)[0], { tests: 3, skipped: 2, todo: 2 }); }), ["SKIP_TODO_EXCEEDS_TESTS"], "2+2>3");
  expectCodes(doc((d) => { Object.assign(files(d)[0], { tests: 4, skipped: 2, todo: 2 }); }), ["OK"], "2+2=4");
  expectCodes(doc((d) => { Object.assign(files(d)[0], { tests: 1, skipped: 1, todo: 0 }); }), ["OK"], "todos os testes ignorados");
  expectCodes(doc((d) => { Object.assign(files(d)[0], { tests: 2, skipped: 3, todo: 0 }); }), ["SKIP_TODO_EXCEEDS_TESTS"], "skip > tests");
});

test("sha256: obrigatório e sintaticamente estrito (64 hex minúsculos)", () => {
  const invalid = ["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), "", ` ${"a".repeat(63)}`, `${"a".repeat(63)}\n`, `sha256:${"a".repeat(64)}`];
  for (const sha256 of invalid) expectCodes(doc((d) => { files(d)[0].sha256 = sha256; }), ["SHA256_INVALID"], JSON.stringify(sha256));
  expectCodes(doc((d) => { files(d)[0].sha256 = "F".repeat(64).toLowerCase(); }), ["OK"], "64 hex minúsculos");
});

test("correspondência com o inventário: ausentes, adicionais, ambos, e ordem do inventário irrelevante", () => {
  expectCodes(doc(() => {}), ["FILE_MISSING_FROM_BASELINE"], "inventário com mais um arquivo", [...FILES, "z/z.test.ts"]);
  const missing = parse(doc(() => {}), [...FILES, "z/z.test.ts"]);
  assert.deepEqual(missing.ok ? [] : missing.issues.map((entry) => entry.detail), ["z/z.test.ts"]);
  expectCodes(doc(() => {}), ["FILE_NOT_IN_INVENTORY"], "inventário com menos um arquivo", [FILES[0]]);
  expectCodes(doc(() => {}), ["FILE_MISSING_FROM_BASELINE", "FILE_NOT_IN_INVENTORY"], "troca de arquivo", [FILES[0], "z/z.test.ts"]);
  expectCodes(doc(() => {}), ["OK"], "ordem do inventário não importa", [...FILES].reverse());
});

test("opções inválidas (expectedFiles) reprovam, mesmo com baseline perfeito", () => {
  const text = doc(() => {});
  for (const expectedFiles of [undefined, null, "x", [], [""], [1], ["a.test.ts", "a.test.ts"]]) {
    const result = parseUnitSuiteBaseline(text, { expectedFiles } as unknown as { expectedFiles: string[] });
    assert.equal(result.ok, false, JSON.stringify(expectedFiles));
    assert.equal(codes(result).includes("OPTIONS_INVALID"), true, JSON.stringify(expectedFiles));
  }
  assert.deepEqual(codes(parseUnitSuiteBaseline(text, undefined as unknown as { expectedFiles: string[] })), ["OPTIONS_INVALID"]);
});

test("valores ambíguos: chaves repetidas em qualquer nível são rejeitadas (JSON.parse manteria a última)", () => {
  const valid = doc(() => {});
  const rootDup = valid.replace('"schemaVersion": "unit-tests-baseline.v1",', '"schemaVersion": "unit-tests-baseline.v1",\n  "schemaVersion": "unit-tests-baseline.v1",');
  const provDup = valid.replace('"status": "declared",', '"status": "declared",\n    "status": "declared",');
  const entryDup = valid.replace('"tests": 12,', '"tests": 12,\n      "tests": 99,');
  assert.equal(JSON.parse(entryDup).files[0].tests, 99, "premissa: JSON.parse ficaria com a última");
  for (const [label, text] of [["raiz", rootDup], ["proveniência", provDup], ["entrada", entryDup]] as const) {
    const result = parse(text);
    assert.equal(result.ok, false, label);
    assert.equal(codes(result).includes("DUPLICATE_KEY"), true, label);
  }
  const located = parse(entryDup);
  assert.deepEqual(located.ok ? [] : located.issues.map((entry) => entry.path), ["$.files[0]"]);
});

test("nenhuma entrada inválida produz ok:true: mutações sucessivas do documento válido", () => {
  const valid = validDoc();
  const mutations: Array<(d: Doc) => void> = [
    (d) => { d.schemaVersion = "x"; }, (d) => { prov(d).status = "verified"; }, (d) => { files(d)[0].tests = -1; },
    (d) => { files(d)[0].sha256 = "z"; }, (d) => { files(d).pop(); }, (d) => { files(d).push({ file: "n/n.test.ts", tests: 1, skipped: 0, todo: 0, sha256: SHA_A }); },
    (d) => { files(d)[0].file = "../x.test.ts"; }, (d) => { d.files = []; }, (d) => { d.extra = true; }, (d) => { delete prov(d).nodeVersion; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const copy = JSON.parse(JSON.stringify(valid)) as Doc;
    mutate(copy);
    assert.equal(parse(JSON.stringify(copy)).ok, false, `mutação ${index}`);
  }
  assert.equal(parse(JSON.stringify(valid)).ok, true, "controle");
});

test("função pura: determinística, não depende da ordem do inventário e aceita opções congeladas", () => {
  const text = doc(() => {});
  const options = deepFreeze({ expectedFiles: [...FILES] });
  const first = parseUnitSuiteBaseline(text, options);
  const second = parseUnitSuiteBaseline(text, options);
  assert.deepEqual(first, second);
  assert.deepEqual(parse(text, [...FILES].reverse()), first);
  assert.equal(first.ok, true);
  const bad = parseUnitSuiteBaseline(doc((d) => { files(d)[0].tests = 0; }), options);
  assert.deepEqual(bad, parseUnitSuiteBaseline(doc((d) => { files(d)[0].tests = 0; }), options));
  assert.deepEqual(options.expectedFiles, FILES, "as opções não são alteradas");
});

test("os dados devolvidos não compartilham referências com as opções", () => {
  const result = parse(doc(() => {}));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.notEqual(result.files as unknown, FILES as unknown);
});

test("higiene do módulo: sem disco, processo, rede, ambiente, relógio ou aleatoriedade; só importa módulos do gate", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("../ci/unitSuiteBaseline.ts", import.meta.url)), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  for (const forbidden of ["process.", "performance", "Math.random", "require(", "fetch(", "import(", "child_process", "readFileSync", "setTimeout", "globalThis", "JSON.parse"]) {
    assert.equal(source.includes(forbidden), false, `token proibido no módulo: ${forbidden}`);
  }
  assert.equal(/["']node:/.test(source), false, "nenhum módulo embutido do Node pode ser importado");
  assert.equal(/\bDate\b/.test(source), false, "o módulo não pode usar Date (relógio); a data é validada por aritmética");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ["./unitSuiteInventory", "./unitSuiteVerdict"]);
});

test("identificadores UNIT_SUITE_BASELINE_* são estáveis, únicos e todos usados no módulo", () => {
  assert.equal(new Set(UNIT_SUITE_BASELINE_ISSUE_CODES).size, UNIT_SUITE_BASELINE_ISSUE_CODES.length);
  assert.equal(UNIT_SUITE_BASELINE_ISSUE_CODES.every((code) => /^UNIT_SUITE_BASELINE_[A-Z0-9_]+$/.test(code)), true);
  assert.equal(UNIT_SUITE_BASELINE_ISSUE_CODES.length, 21);
  const source = fs.readFileSync(fileURLToPath(new URL("../ci/unitSuiteBaseline.ts", import.meta.url)), "utf8");
  const used = new Set([...source.matchAll(/"(UNIT_SUITE_BASELINE_[A-Z0-9_]+)"/g)].map((match) => match[1]));
  const declared: ReadonlySet<string> = new Set(UNIT_SUITE_BASELINE_ISSUE_CODES);
  for (const code of used) assert.equal(declared.has(code), true, `código usado e não declarado: ${code}`);
  for (const code of declared) assert.equal(used.has(code), true, `código declarado e não usado: ${code}`);
  const sample: BaselineIssueCode = "UNIT_SUITE_BASELINE_TEXT_INVALID";
  assert.equal(sample.startsWith("UNIT_SUITE_BASELINE_"), true);
});
