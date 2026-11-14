import ts from "typescript";
import path from "node:path";
const roots = [
  "apps/web/src/vite-env.d.ts",
  "packages/contracts/src/imobPropertyCapture.ts", "apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts",
  "apps/api/src/services/imob/crm/imobCrmTurnEngine.ts", "apps/api/src/services/imob/imobAgentContract.ts", "apps/api/src/services/imob/imobTurnResolver.ts",
  "apps/api/src/routes/imob.ts", "apps/web/src/features/imob/structured/useImobFrontDoorForms.ts",
  "apps/web/src/features/imob/structured/useImobFormState.ts", "apps/web/src/components/agents/chatLauncherEngine.ts",
  "apps/web/src/lib/api.ts", "apps/web/src/components/agents/ChatAgentLauncher.tsx"
].map(p => path.resolve(p));
const cfg = ts.readConfigFile("tsconfig.base.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, process.cwd());
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, rootDir: undefined,
  jsx: ts.JsxEmit.ReactJSX, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  paths: { ...parsed.options.paths, "@/*": ["apps/web/src/*"], "@repo/utils": ["packages/utils/src"] } });
const diagnostics = ts.getPreEmitDiagnostics(program);
const focused = diagnostics.filter(d => d.file && roots.includes(path.resolve(d.file.fileName)));
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(focused, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
console.log(JSON.stringify({ check: "typecheck-focused", roots: roots.length, focusedDiagnostics: focused.length, dependencyDiagnostics: diagnostics.length - focused.length, scope: "Changed production roots; dependency diagnostics excluded and not certified" }));
process.exitCode = focused.length ? 1 : 0;
