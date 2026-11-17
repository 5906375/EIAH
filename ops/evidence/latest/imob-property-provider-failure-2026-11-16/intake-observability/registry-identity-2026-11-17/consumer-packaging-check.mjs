// Formal build outputs only. Static graph inspection never executes service entries.
// Run with the existing native ESM bootstrap from apps/api; no tsx source aliases.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, relative, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import ts from "typescript";

const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
const here = dirname(fileURLToPath(import.meta.url));
assert.equal(resolve(process.cwd()), resolve(root, "apps/api"));
assert.equal(typeof globalThis.resolveFromApi, "function");
const read = path => readFileSync(resolve(root, path), "utf8");
const hash = path => createHash("sha256").update(read(path)).digest("hex");
const rel = path => relative(root, path);
const prior = JSON.parse(readFileSync(resolve(here, "correction-results.json"), "utf8"));
for (const [path, digest] of Object.entries(prior.artifactsSha256)) assert.equal(hash(path), digest, path);
const coreDir = resolve(root, "packages/core/dist");
const apiPath = "apps/api/dist/index.js";
const parse = path => ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function imports(path) {
  const records = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      records.push({ specifier: node.moduleSpecifier.text, dynamic: false,
        bindings: ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          ? node.importClause.namedBindings.elements.map(item => (item.propertyName ?? item.name).text) : [] });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      records.push({ specifier: node.arguments[0].text, dynamic: true, bindings: [] });
    }
    ts.forEachChild(node, visit);
  }
  visit(parse(path));
  return records;
}
const manifestPaths = ["apps/api/package.json", "packages/providers/package.json", "packages/mcp-runner/package.json",
  "apps/cli/package.json", "apps/workers/action-runner/package.json", "apps/workers/maintenance-worker/package.json", "apps/workers/run-worker/package.json"];
const manifests = manifestPaths.map(path => {
  const value = JSON.parse(read(path));
  assert.ok(value.dependencies["@eiah/core"]);
  return { path, name: value.name, coreDependency: value.dependencies["@eiah/core"],
    includedInApiImage: path.startsWith("packages/") || path === "apps/api/package.json",
    role: path === "packages/mcp-runner/package.json" ? "manifest dependency; no runtime core imports in MCP sources; inlined into API" :
      path === "packages/providers/package.json" ? "provider leaves copied as package and inlined into API" :
      path.startsWith("apps/workers/") || path.startsWith("apps/cli/") ? "separate delivery; not in API image" : "API consumer" };
});
const providerFiles = readdirSync(resolve(root, "packages/providers/dist")).filter(file => file.endsWith(".js"))
  .map(file => `packages/providers/dist/${file}`);
const consumerFiles = [apiPath, ...providerFiles];
const consumerImports = consumerFiles.flatMap(file => imports(resolve(root, file))
  .filter(item => item.specifier === "@eiah/core" || item.specifier.startsWith("@eiah/core/"))
  .map(item => ({ consumer: file, ...item })));
const entries = [...new Set(consumerImports.map(item => item.specifier))];
const resolvedEntries = Object.fromEntries(entries.map(spec => [spec, fileURLToPath(globalThis.resolveFromApi(spec))]));
const graphs = {};
const edges = [];
const externals = [];
function graph(path, seen = new Set()) {
  if (seen.has(path)) return seen;
  assert.ok(existsSync(path), `Missing compiled module: ${rel(path)}`);
  assert.ok(path.startsWith(coreDir + "/"));
  seen.add(path);
  for (const item of imports(path)) {
    if (item.specifier.startsWith(".")) {
      const target = fileURLToPath(new URL(item.specifier, pathToFileURL(path)));
      edges.push({ from: rel(path), to: rel(target), dynamic: item.dynamic });
      graph(target, seen);
    } else externals.push({ from: rel(path), ...item });
  }
  return seen;
}
for (const [spec, path] of Object.entries(resolvedEntries)) graphs[spec] = [...graph(path)];
// Named bindings used by actual consumer bundles must exist at their public entries.
let namedBindingsChecked = 0;
for (const item of consumerImports) {
  const exported = new Set(parse(resolvedEntries[item.specifier]).statements.flatMap(node =>
    ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements.map(element => element.name.text) : []));
  for (const name of item.bindings) { assert.ok(exported.has(name), `${item.specifier} lacks ${name}`); namedBindingsChecked++; }
}
const allModules = [...new Set(Object.values(graphs).flat())];
const safeSpecs = ["@eiah/core/llm/LLMRegistry", "@eiah/core/llm/LLMRouter", "@eiah/core/llm/completionEngine",
  "@eiah/core/llm/LLMProviderError", "@eiah/core/llm/LLMProvider", "@eiah/core/utils/retry", "@eiah/core/queue/workerTopology"];
const safePaths = Object.fromEntries(safeSpecs.map(spec => [spec, fileURLToPath(globalThis.resolveFromApi(spec))]));
// Side-effect review: these leaves contain classes/functions, Maps and a pino logger.
// Forbid static or deferred project imports that could open DB/queue/Redis resources.
for (const path of Object.values(safePaths)) {
  for (const modulePath of graph(path)) {
    for (const item of imports(modulePath)) assert.doesNotMatch(item.specifier, /@repo\/db|bullmq|ioredis|dotenv/);
  }
}
const apiMap = JSON.parse(read(apiPath + ".map"));
const mcpSourcesInApi = apiMap.sources.filter(path => path.includes("packages/mcp-runner/src/"));
assert.ok(mcpSourcesInApi.length > 0);
const unsafeNotImported = ["apps/api/dist/index.js", "packages/core/dist/index.js", "packages/providers/dist/index.js"];
// Provider barrel contains extensionless sibling imports from tsc; API bundles it.
// Only explicit .js provider leaves are imported in runtime probes.
const sideEffectReview = {
  staticOnly: unsafeNotImported,
  reason: "API starts services; core barrel reaches DB/BullMQ/signer/queue modules; provider barrel is bundled into API and is not a plain-Node entry under its extensionless tsc output",
  executed: safeSpecs.concat(providerFiles.filter(path => !path.endsWith("/index.js"))),
  constructors: "provider constructors only with synthetic keys; HTTP transport always injected",
  mcp: "API source-map incorporation checked; no standalone MCP load (no local standalone dist)",
};

// Existing successful executor/registry proof is reused, not executed again.
assert.equal(prior.checks.passed, 5);
assert.equal(prior.syntheticAdapterCalls, 1);
assert.equal(prior.realProviderCalls, 0);
for (const key of Object.keys(process.env)) if (/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|REDIS_URL/i.test(key)) delete process.env[key];
process.env.LOG_PRETTY = "false";
process.env.LOG_LEVEL = "silent";
process.env.LLM_RETRIES = "1";
process.env.LLM_RETRY_DELAY_MS = "0";
process.env.LLM_RETRY_MAX_DELAY_MS = "0";
process.env.LLM_RETRY_JITTER_RATIO = "0";
let blockedNetworkAttempts = 0;
const deny = () => { blockedNetworkAttempts++; throw new Error("Network forbidden in packaging smoke"); };
const guards = [[http,"request"],[http,"get"],[https,"request"],[https,"get"],[net,"connect"],[net,"createConnection"],
  [net.Socket.prototype,"connect"],[tls,"connect"],[globalThis,"fetch"]].map(([object,key]) => ({object,key,value:object[key]}));
for (const {object,key} of guards) object[key] = deny;
const stdout = process.stdout.write;
const summaries = [];
process.stdout.write = function(chunk, encoding, callback) {
  for (const line of String(chunk).split("\n").filter(Boolean)) summaries.push(JSON.parse(line));
  if (typeof encoding === "function") encoding();
  if (typeof callback === "function") callback();
  return true;
};
let results;
try {
  // Reuse the existing formal-dist smoke; its old duplicated-class premise changes
  // after splitting. Preserve the original file and adapt only this invocation.
  const parentPath = resolve(here, "../../package-smoke.mjs");
  let source = readFileSync(parentPath, "utf8");
  const oldAssertion = "assert.equal(distinct instanceof LLMProviderError, false);";
  assert.ok(source.includes(oldAssertion));
  source = source.replace('const root = new URL("../../../../", import.meta.url);', `const root = new URL(${JSON.stringify(pathToFileURL(root + "/").href)});`)
    .replace(oldAssertion, "assert.equal(secondEntry.LLMProviderError, LLMProviderError); assert.equal(distinct instanceof LLMProviderError, true);")
    .replace("apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json", "packages/providers/tests/fixtures/openai-credit-balance-exhausted.json")
    .replace('await import(require.resolve("node-fetch"))', 'await import(pathToFileURL(require.resolve("node-fetch")).href)');
  await import(`data:text/javascript;base64,${Buffer.from('import { pathToFileURL } from "node:url";\n' + source).toString("base64")}`);
  const load = spec => import(pathToFileURL(fileURLToPath(globalThis.resolveFromApi(spec))).href);
  const { LLMProvider } = await load("@eiah/core/llm/LLMProvider");
  const providerInheritance = [];
  for (const name of ["OpenAI", "Anthropic", "Gemini", "DeepSeek"]) {
    const className = `${name}Provider`;
    const module = await import(pathToFileURL(resolve(root, `packages/providers/dist/${className}.js`)).href);
    assert.ok(new module[className]("synthetic-test-only") instanceof LLMProvider);
    providerInheritance.push(className);
  }
  const errorModule = await load("@eiah/core/llm/LLMProviderError");
  const { LLMProviderError } = errorModule;
  const { llmRegistry } = await load("@eiah/core/llm/LLMRegistry");
  const { resolveProvider } = await load("@eiah/core/llm/LLMRouter");
  const { runCompletion } = await load("@eiah/core/llm/completionEngine");
  const { OpenAIProvider } = await import(pathToFileURL(resolve(root, "packages/providers/dist/OpenAIProvider.js")).href);
  const require = createRequire(resolve(root, "packages/providers/package.json"));
  const { Response } = await import(pathToFileURL(require.resolve("node-fetch")).href);
  let transportCalls = 0;
  const provider = new OpenAIProvider("synthetic-test-only", async () => { transportCalls++;
    return new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), {status:429}); });
  llmRegistry.register(provider);
  assert.equal(resolveProvider({model:"gpt-4.1",messages:[]}),provider);
  await assert.rejects(runCompletion({model:"gpt-4.1",messages:[]}), error => error instanceof LLMProviderError && !error.diagnostic.retryable);
  assert.equal(transportCalls,1);
  const retryPath = fileURLToPath(globalThis.resolveFromApi("@eiah/core/utils/retry"));
  const retryModule = await import(pathToFileURL(retryPath).href);
  const secondRetry = await import(pathToFileURL(retryPath).href + "?identity-probe");
  assert.equal(secondRetry.RetryExhaustedError,retryModule.RetryExhaustedError);
  const cause = new LLMProviderError({provider:"openai",model:"synthetic",httpStatus:503,providerType:"server_error"});
  assert.equal(cause.diagnostic.retryable,true);
  await assert.rejects(retryModule.retry(async()=>{throw cause;},{retries:1,delayMs:0}),
    error=>error instanceof retryModule.RetryExhaustedError && error.cause===cause);
  let dispatches=0;
  llmRegistry.register({name:"openai",async chatCompletion(){dispatches++;throw cause;}});
  await assert.rejects(runCompletion({model:"gpt-4.1",messages:[]}), error=>error===cause && error instanceof LLMProviderError);
  assert.equal(dispatches,1);
  const topologyPath = fileURLToPath(globalThis.resolveFromApi("@eiah/core/queue/workerTopology"));
  const topology = await import(pathToFileURL(topologyPath).href);
  const topologyAgain = await import(pathToFileURL(topologyPath).href+"?identity-probe");
  assert.equal(topology.WorkerTopologyConfigError,topologyAgain.WorkerTopologyConfigError);
  assert.throws(()=>topology.resolveWorkerTopology({NODE_ENV:"synthetic"}),error=>error instanceof topologyAgain.WorkerTopologyConfigError);
  assert.equal(blockedNetworkAttempts,0);
  const modulesWithHashes = [...new Set([...allModules,...Object.values(safePaths),...providerFiles.map(path=>resolve(root,path))])];
  results = {
    date:"2026-11-17",executedAt:new Date().toISOString(),result:"APROVADO",exitCode:0,
    checks:{executed:7,passed:7,failed:0,skipped:0},
    probes:["Consumer entry paths and named exports", "Transitive core file/chunk graph", "Existing formal-dist smoke adapted for shared constructor",
      "Four provider subclasses share LLMProvider", "Adapter LLMProviderError identity through registry/router/completion",
      "RetryExhaustedError identity and completion cause unwrapping", "WorkerTopologyConfigError identity in pure leaf"],
    manifests,consumerFiles,consumerImports,resolvedEntries:Object.fromEntries(Object.entries(resolvedEntries).map(([k,v])=>[k,rel(v)])),
    namedBindingsChecked,graph:{modules:allModules.map(rel),chunks:allModules.filter(path=>/\/chunk-/.test(path)).map(rel),
      edges:[...new Map(edges.map(edge=>[JSON.stringify(edge),edge])).values()],externals:[...new Map(externals.map(item=>[JSON.stringify(item),item])).values()]},
    sideEffectReview,mcpSourcesInApi,providerInheritance,reusedSmoke:rel(parentPath),reusedSmokeSha256:hash(rel(parentPath)),
    reusedSmokeSummaries:summaries,syntheticAdapterTransportCalls:transportCalls,syntheticTransientDispatches:dispatches,
    priorRegistryExecutorResultReused:"correction-results.json (5/5; all 43 hashes checked, no repetition)",
    blockedNetworkAttempts,realProviderCalls:0,serviceStarts:0,buildsExecuted:0,
    artifactsSha256:Object.fromEntries(modulesWithHashes.map(path=>[rel(path),hash(rel(path))])),
    limitation:"Graph and export checks for whole API core surface are STATIC. Runtime imports only reviewed safe leaves; no barrel/API/MCP/worker startup, DB, queue, Docker image or staging proof."
  };
} finally {
  process.stdout.write=stdout;
  for (const {object,key,value} of guards) object[key]=value;
}
writeFileSync(resolve(here,"consumer-packaging-results.json"),JSON.stringify(results,null,2)+"\n");
console.log(JSON.stringify({result:results.result,checks:results.checks,consumerCoreEntries:entries.length,
  modules:allModules.length,chunks:results.graph.chunks.length,namedBindingsChecked,blockedNetworkAttempts,realProviderCalls:0}));
