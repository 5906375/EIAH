// Same compiler settings for current tree and a virtual HEAD baseline. No checkout or source mutation.
import ts from "typescript";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const dir = path.dirname(new URL(import.meta.url).pathname);
const roots = ["apps/web/src/vite-env.d.ts", "packages/core/src/llm/LLMProviderError.ts", "packages/core/src/llm/types.ts",
  "packages/core/src/llm/completionEngine.ts", "packages/core/src/utils/retry.ts", "packages/providers/src/OpenAIProvider.ts",
  "apps/api/src/orchestrator/llmExecutor.ts", "packages/contracts/src/imobPropertyCapture.ts",
  "apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts", "apps/api/src/routes/imob.ts",
  "apps/api/src/tests/imob-property-capture-intake.test.ts", "apps/api/src/tests/llm-provider-failure.test.ts",
  "apps/web/src/features/imob/structured/createImobStructuredForms.test.ts", "apps/web/src/features/imob/structured/useImobFrontDoorForms.ts",
  "apps/api/src/services/capabilityExecution.ts", "apps/api/src/tests/capability-execution.test.ts"].map(p => path.resolve(p));
const cfg = ts.readConfigFile("tsconfig.base.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, process.cwd());
const options = { ...parsed.options, noEmit: true, rootDir: undefined, jsx: ts.JsxEmit.ReactJSX,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  paths: { ...parsed.options.paths, "@/*": ["apps/web/src/*"], "@repo/utils": ["packages/utils/src"] } };
const tracked = new Set(execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n"));
const changes = new Set(execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split("\n"));
function check(baseline) {
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const cache = new Map();
  if (baseline) host.readFile = (file) => {
    const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
    if (relative.includes("node_modules/") || relative.startsWith("../")) return read(file);
    if (changes.has(relative) && tracked.has(relative)) {
      if (!cache.has(relative)) cache.set(relative, execFileSync("git", ["show", `HEAD:${relative}`], { encoding: "utf8" }));
      return cache.get(relative);
    }
    if (roots.includes(path.resolve(file)) && !tracked.has(relative)) return "export {};";
    return read(file);
  };
  const program = ts.createProgram(roots, options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  console.log(baseline ? "HEAD VIRTUAL BASELINE" : "CURRENT TREE");
  console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
  return diagnostics.map(d => ({ file: d.file ? path.relative(process.cwd(), d.file.fileName) : null, code: d.code,
    line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"), focused: Boolean(d.file && roots.includes(path.resolve(d.file.fileName))) }));
}
const reuseBaseline = process.argv.includes("--reuse-baseline");
const baseline = reuseBaseline ? JSON.parse(readFileSync(path.join(dir, "delta-typecheck.json"), "utf8")).baseline : check(true);
const current = check(false);
const key = d => JSON.stringify([d.file, d.code, d.message]);
const known = new Set(baseline.map(key));
const result = { roots: roots.map(p => path.relative(process.cwd(), p)), baseline, current,
  introduced: current.filter(d => !known.has(key(d))),
  focusedDiagnostics: current.filter(d => d.focused).length, dependencyDiagnostics: current.filter(d => !d.focused).length,
  scope: "16 selected roots, no integral API/web certification; all diagnostics preserved, no filtering of the exit status for focused errors" };
result.baselineSource = reuseBaseline ? "delta-typecheck.json (same HEAD and compiler settings; not rerun)" : "virtual HEAD evaluated in this run";
writeFileSync(path.join(dir, reuseBaseline ? "delta-typecheck-final.json" : "delta-typecheck.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ focusedDiagnostics: result.focusedDiagnostics, dependencyDiagnostics: result.dependencyDiagnostics, introduced: result.introduced.length }));
process.exitCode = result.focusedDiagnostics ? 1 : 0;
