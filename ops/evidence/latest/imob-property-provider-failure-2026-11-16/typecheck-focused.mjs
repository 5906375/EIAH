import ts from "typescript";
import path from "node:path";
const roots = [
  "apps/web/src/vite-env.d.ts",
  "packages/core/src/llm/LLMProviderError.ts",
  "packages/core/src/llm/completionEngine.ts",
  "packages/core/src/utils/retry.ts",
  "packages/providers/src/OpenAIProvider.ts",
  "apps/api/src/orchestrator/llmExecutor.ts",
  "packages/contracts/src/imobPropertyCapture.ts",
  "apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts",
  "apps/api/src/routes/imob.ts",
  "apps/api/src/tests/imob-property-capture-intake.test.ts",
  "apps/api/src/tests/llm-provider-failure.test.ts",
  "apps/web/src/features/imob/structured/createImobStructuredForms.test.ts",
].map(p => path.resolve(p));
const cfg = ts.readConfigFile("tsconfig.base.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, process.cwd());
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, rootDir: undefined,
  jsx: ts.JsxEmit.ReactJSX, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  paths: { ...parsed.options.paths, "@/*": ["apps/web/src/*"], "@repo/utils": ["packages/utils/src"] } });
const diagnostics = ts.getPreEmitDiagnostics(program);
const dependency = diagnostics.filter(d => !d.file || !roots.includes(path.resolve(d.file.fileName)));
console.log(ts.formatDiagnosticsWithColorAndContext(dependency, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
const focused = diagnostics.filter(d => d.file && roots.includes(path.resolve(d.file.fileName)));
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(focused, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
console.log(JSON.stringify({ check: "typecheck-focused", roots: roots.length, focusedDiagnostics: focused.length, dependencyDiagnostics: diagnostics.length - focused.length, scope: "12 selected roots (including 3 tests and vite-env); dependency diagnostics printed separately, excluded and not certified" }));
process.exitCode = focused.length ? 1 : 0;
