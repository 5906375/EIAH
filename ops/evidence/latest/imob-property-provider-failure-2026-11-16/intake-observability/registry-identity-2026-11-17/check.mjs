// Diagnostic of existing formal build outputs. No production source/config mutation.
// Use the documented ESM bootstrap from apps/api: do not load tsx path aliases.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import vm from "node:vm";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
const here = dirname(fileURLToPath(import.meta.url));
// Historical results.json stays immutable; this authorized increment has its own result.
const historical = JSON.parse(readFileSync(resolve(here, "results.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const apiPath = "apps/api/dist/index.js";
const api = read(apiPath);
const sourceFiles = [
  "apps/api/src/orchestrator/llmExecutor.ts",
  "apps/api/tsup.config.ts",
  "packages/core/src/llm/LLMRegistry.ts",
  "packages/core/src/llm/LLMRouter.ts",
  "packages/core/src/llm/completionEngine.ts",
  "packages/core/tsup.config.ts",
  "packages/core/package.json",
];
const protectedFiles = ["CLAUDE.md", "CODEX.md",
  "ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff"];
const protectedBefore = Object.fromEntries(protectedFiles.map(path => [path, sha256(read(path))]));
assert.equal(typeof globalThis.resolveFromApi, "function", "Use the ESM bootstrap documented in README.md");
assert.equal(resolve(process.cwd()), resolve(root, "apps/api"));
const specifiers = {
  registry: "@eiah/core/llm/LLMRegistry",
  completion: "@eiah/core/llm/completionEngine",
  router: "@eiah/core/llm/LLMRouter",
  diagnostic: "@eiah/core/llm/LLMProviderError",
};
const paths = Object.fromEntries(Object.entries(specifiers).map(([name, spec]) =>
  [name, fileURLToPath(globalThis.resolveFromApi(spec))]));
// Confirm the published API bundle actually imports these independent entries.
for (const name of ["registry", "completion"]) {
  assert.ok(api.includes(`from "${specifiers[name]}";`));
}
const embeddedSources = [];
// Follow the emitted ESM graph rather than requiring sources inline in entry files.
const graphs = {};
const edges = [];
function visit(outputPath, seen = new Set()) {
  if (seen.has(outputPath)) return seen;
  assert.ok(existsSync(outputPath), `Missing emitted module: ${relative(root, outputPath)}`);
  seen.add(outputPath);
  const code = readFileSync(outputPath, "utf8");
  // tsup emits static import/from clauses, including side-effect-only imports.
  for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+\.js)["']/g)) {
    const target = fileURLToPath(new URL(match[1], pathToFileURL(outputPath)));
    assert.ok(target.startsWith(resolve(root, "packages/core/dist") + "/"));
    edges.push({ from: relative(root, outputPath), specifier: match[1], to: relative(root, target) });
    visit(target, seen);
  }
  return seen;
}
for (const [name, path] of Object.entries(paths)) graphs[name] = [...visit(path)];
for (const [outputs, expected] of [
  [[resolve(root, apiPath)], [sourceFiles[0]]],
  [graphs.registry, [sourceFiles[2]]],
  [graphs.router, [sourceFiles[2], sourceFiles[3]]],
  [graphs.completion, [sourceFiles[2], sourceFiles[3], sourceFiles[4]]],
]) {
  for (const source of expected) {
    const matches = [];
    for (const outputPath of outputs) {
      const map = JSON.parse(readFileSync(outputPath + ".map", "utf8"));
      const index = map.sources.findIndex(path => resolve(dirname(outputPath), path) === resolve(root, source));
      if (index < 0) continue;
      assert.equal(map.sourcesContent[index], read(source), `Stale build source: ${source}`);
      matches.push(relative(root, outputPath));
    }
    assert.equal(matches.length, 1, `Expected exactly one compiled copy of ${source} in entry graph`);
    embeddedSources.push({ output: matches[0], source, matchesWorkingTree: true });
  }
}
const registryAllocations = Object.fromEntries([...new Set(Object.values(graphs).flat())].map(path => {
  const count = [...readFileSync(path, "utf8").matchAll(/new LLMRegistry\(\)/g)].length;
  return [relative(root, path), count];
}));
const registryChunks = Object.entries(registryAllocations).filter(([, count]) => count > 0);
assert.equal(registryChunks.length, 1);
assert.equal(registryChunks[0][1], 1);
for (const name of ["registry", "router", "completion"]) {
  assert.ok(graphs[name].some(path => relative(root, path) === registryChunks[0][0]));
}
// Existing delivery recipe copies the whole builder packages tree, including dist chunks.
const dockerfile = read("apps/api/Dockerfile.prod");
assert.match(dockerfile, /RUN pnpm --filter @eiah\/api\.\.\. run build/);
assert.match(dockerfile, /COPY --from=builder \/app\/packages \.\/packages/);
assert.match(dockerfile, /COPY --from=builder \/app\/apps\/api\/dist \.\/apps\/api\/dist/);
const delivery = {
  dockerfile: "apps/api/Dockerfile.prod", dockerignore: ".dockerignore",
  build: "pnpm --filter @eiah/api... run build",
  runtimeCopy: "COPY --from=builder /app/packages ./packages",
  chunksIncludedByRecipe: true, localGraphFilesPresent: true,
  contextDistIgnored: true, distRebuiltInBuilder: true,
  imageBuilt: false, deployedArtifactInspected: false,
};

// Execute the exact emitted executor body, without booting the bundled server,
// queues, DB or provider transports. Only provider constructors/logger are doubles.
const marker = "// src/orchestrator/llmExecutor.ts\n";
const bodyStart = api.indexOf(marker + "var providersRegistered = false;");
const bodyEnd = api.indexOf("\n// src/services/capabilityExecution.ts\n", bodyStart);
assert.ok(bodyStart >= 0 && bodyEnd > bodyStart);
const executorBody = api.slice(bodyStart + marker.length, bodyEnd);
assert.ok(executorBody.includes("llmRegistry.register(new OpenAIProvider(process.env.OPENAI_API_KEY))"));
assert.ok(executorBody.includes("const response = await runCompletion({"));

// No environment file is loaded and no real key is inspected or passed to code.
for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY"]) delete process.env[key];
process.env.LOG_PRETTY = "false";
let blockedNetworkAttempts = 0;
const denyNetwork = () => { blockedNetworkAttempts++; throw new Error("Network forbidden in registry diagnostic"); };
const originals = [
  [http, "request"], [http, "get"], [https, "request"], [https, "get"],
  [net, "connect"], [net, "createConnection"], [net.Socket.prototype, "connect"],
  [tls, "connect"], [globalThis, "fetch"],
].map(([target, key]) => ({ target, key, value: target[key] }));
for (const { target, key } of originals) target[key] = denyNetwork;
const events = [];
const stdoutWrite = process.stdout.write;
process.stdout.write = function (chunk, encoding, callback) {
  for (const line of String(chunk).split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    // Keep only controlled observability fields, never raw prompt/output/error.
    events.push(Object.fromEntries(["component", "msg", "stage", "attempt", "traceId", "failure"]
      .filter(key => Object.hasOwn(event, key)).map(key => [key, event[key]])));
  }
  if (typeof encoding === "function") encoding();
  if (typeof callback === "function") callback();
  return true;
};
let calls = 0;
let instance;
let result;
try {
  const { llmRegistry } = await import(pathToFileURL(paths.registry).href);
  const { runCompletion } = await import(pathToFileURL(paths.completion).href);
  const { resolveProvider } = await import(pathToFileURL(paths.router).href);
  const { llmFailureDiagnostic, llmDiagnosticIdentifier } = await import(pathToFileURL(paths.diagnostic).href);
  assert.equal(llmRegistry.has("openai"), false, "Fresh process must have an empty registry");
  class SyntheticOpenAIProvider {
    name = "openai";
    constructor(value) { assert.equal(value, "synthetic-test-only"); instance = this; }
    async chatCompletion(request) {
      assert.equal(this, instance);
      assert.equal(llmRegistry.get("openai"), this);
      assert.equal(request.model, "gpt-4.1");
      calls++;
      return { id: "synthetic", output: "synthetic", raw: {}, provider: "openai", model: "gpt-4.1" };
    }
  }
  const unexpected = class { constructor() { throw new Error("Unexpected provider constructor"); } };
  const diagnosticLogger = { info(fields, msg) { events.push({ component: "llm-executor", msg, ...fields }); } };
  const context = vm.createContext({
    process: { env: { OPENAI_API_KEY: "synthetic-test-only" } },
    llmRegistry, runCompletion, llmFailureDiagnostic, llmDiagnosticIdentifier2: llmDiagnosticIdentifier,
    createLogger4: () => diagnosticLogger,
    OpenAIProvider: SyntheticOpenAIProvider,
    AnthropicProvider: unexpected, GeminiProvider: unexpected, DeepSeekProvider: unexpected,
    fullMask: () => { throw new Error("Masking not in this diagnostic scope"); },
    maskText: () => { throw new Error("Masking not in this diagnostic scope"); },
  });
  new vm.Script(executorBody + "\nglobalThis.diagnosticExecute = executeLlmStep;", {
    filename: "formal-api-executor-excerpt.js",
  }).runInContext(context);
  const completionResult = await context.diagnosticExecute({
      profile: { model: "gpt-4.1", systemPrompt: "synthetic" }, userPrompt: "synthetic",
      metadata: { source: "imob-property-capture-intake", traceId: "synthetic-registry-identity" },
  });
  assert.ok(instance, "Actual emitted ensureProvidersRegistered must construct the double");
  assert.equal(llmRegistry.get("openai"), instance);
  assert.equal(calls, 1);
  assert.equal(completionResult.provider, "openai");
  assert.equal(completionResult.outputText, "synthetic");
  assert.equal(resolveProvider({ model: "gpt-4.1", messages: [] }), instance);
  const completionEvent = events.find(event => event.msg === "llm.completion.success");
  assert.ok(completionEvent, "Capture actual formal completion diagnostic");
  assert.equal(completionEvent.stage, "completion");
  assert.equal(completionEvent.attempt, 1);
  assert.equal(completionEvent.traceId, "synthetic-registry-identity");
  assert.equal(blockedNetworkAttempts, 0);
  assert.equal(events.filter(event => event.msg === "llm.completion.attempt").length, 1);
  assert.equal(events.some(event => event.msg === "llm.completion.error"), false);
  for (const path of protectedFiles) assert.equal(sha256(read(path)), protectedBefore[path]);
  for (const path of protectedFiles) assert.equal(protectedBefore[path], historical.protectedFiles[path]);
  result = {
    date: "2026-11-17", executedAt: new Date().toISOString(),
    command: `node --input-type=module -e 'globalThis.resolveFromApi = specifier => import.meta.resolve(specifier); await import("../../${relative(root, fileURLToPath(import.meta.url))}")'`,
    workingDirectory: "apps/api",
    scope: "Existing formal API executor excerpt and actual imported core dist modules; no app boot or real provider",
    localHead: "97c23a9bca690f5cd6b0fdc909c7359ed4ea25d6",
    inspectedMerge: "f6617e1f2ded9ac0d5c8b0c1336b450b3de6d999",
    hypothesis: "CONFIRMED_LOCALLY_BEFORE_FIX", invariant: "APROVADO", exitCode: 0,
    checks: { executed: 5, passed: 5, failed: 0, skipped: 0 },
    probes: [
      { name: "Emitted executor registration visible in directly imported registry", result: "APROVADO" },
      { name: "Same registered provider visible through formal LLMRouter entry", result: "APROVADO", sameProviderObject: true },
      { name: "Emitted executor dispatch through formal completionEngine entry", result: "APROVADO", sameProviderObjectInvoked: true, calls },
      { name: "All relevant entry graphs share one emitted registry allocation", result: "APROVADO" },
      { name: "Transitive chunk files exist and delivery recipe includes whole packages tree", result: "APROVADO" },
    ],
    resolvedPaths: Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, relative(root, path)])),
    registryAllocations, embeddedSources, sharedRegistryChunk: registryChunks[0][0],
    graphs: Object.fromEntries(Object.entries(graphs).map(([name, files]) => [name, files.map(path => relative(root, path))])),
    edges: [...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()], delivery,
    executorExcerpt: { origin: apiPath, startLine: api.slice(0, bodyStart).split("\n").length,
      sha256: sha256(executorBody), mutationsToExcerpt: 0,
      doubles: ["provider constructors", "executor logger", "isolated synthetic environment"],
      masking: "not exercised", completionAndRegistry: "actual dist imports, not doubles" },
    events, syntheticAdapterCalls: calls, blockedNetworkAttempts, realProviderCalls: 0,
    protectedFiles: protectedBefore,
    artifactsSha256: Object.fromEntries([...new Set([apiPath, apiPath + ".map", ...Object.values(graphs).flat().flatMap(path =>
      [relative(root, path), relative(root, path) + ".map"]), ...sourceFiles,
      "apps/api/Dockerfile.prod", ".dockerignore", ".github/workflows/release.yml", ".github/workflows/deploy.yml",
      relative(root, fileURLToPath(import.meta.url)), relative(root, resolve(here, "results.json"))])].map(path => [path, sha256(read(path))])),
    buildsExecuted: 2, sourceOrConfigEdits: 1,
    limits: ["No new staging capture or deployed artifact inspection", "No real provider, HTTP/DB/browser, intake proposal or persistence validation",
      "Historical pre-instrumentation cause remains unknown", "Local reproduction does not independently prove the deployed artifact identity"],
  };
} finally {
  process.stdout.write = stdoutWrite;
  for (const { target, key, value } of originals) target[key] = value;
}
writeFileSync(resolve(here, "correction-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ hypothesis: result.hypothesis, invariant: result.invariant,
  checks: result.checks, syntheticAdapterCalls: calls, realProviderCalls: 0, exitCode: 0 }));
