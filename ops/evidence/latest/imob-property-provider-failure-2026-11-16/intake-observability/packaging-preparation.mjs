// Reuse the earlier formal-dist smoke without editing its historical source/results.
// Adds only the two instrumentation exports and the packaged OpenAI transport events.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const parent = new URL("../package-smoke.mjs", import.meta.url);
let source = readFileSync(parent, "utf8");
source = source.replace('const root = new URL("../../../../", import.meta.url);',
  `const root = new URL(${JSON.stringify(pathToFileURL(process.cwd() + "/").href)});`)
  .replace('apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json',
    'packages/providers/tests/fixtures/openai-credit-balance-exhausted.json')
  .replace('await import(require.resolve("node-fetch"))',
    'await import(pathToFileURL(require.resolve("node-fetch")).href)');
source = 'import { pathToFileURL } from "node:url";\n' + source;
source += `
const instrumentation = await import(core.href);
assert.equal(typeof instrumentation.llmFailureDiagnostic, "function");
assert.equal(typeof instrumentation.llmDiagnosticIdentifier, "function");
assert.deepEqual(instrumentation.llmFailureDiagnostic(new Error("synthetic-private-package-secret"), "profile_resolution"),
  { category: "internal", code: "profile_resolution_failed" });
const loggerModule = await import(new URL("packages/core/dist/logging/logger.js", root));
const loggerRoot = loggerModule.getRootStructuredLogger();
const streamKey = Object.getOwnPropertySymbols(loggerRoot).find(key => key.description === "pino.stream");
assert.ok(streamKey);
const stream = loggerRoot[streamKey];
const previousWrite = stream.write;
const events = [];
stream.write = line => { events.push(JSON.parse(line)); return true; };
const originalRequest = https.request;
https.request = () => { throw new Error("Real transport forbidden in instrumented package smoke"); };
try {
  const synthetic = new OpenAIProvider("synthetic-test-only", async () => new Response(JSON.stringify({
    choices: [{ message: { content: "synthetic-private-package-output" } }],
  }), { status: 200 }));
  const result = await synthetic.chatCompletion({ model: "synthetic-model", messages: [],
    metadata: { source: "imob-property-capture-intake", traceId: "package-synthetic-correlation", llmAttempt: 1 } });
  assert.equal(result.providerRequestId, undefined);
  assert.equal(result.modelUsed, undefined);
  assert.deepEqual(events.map(event => event.stage), ["transport_attempt", "response_received"]);
  assert.ok(events.every(event => event.traceId === "package-synthetic-correlation"));
  assert.equal(events[1].providerHttpStatus, 200);
  assert.equal(Object.hasOwn(events[1], "providerRequestId"), false);
  assert.doesNotMatch(JSON.stringify(events), /synthetic-private-package-output/);
} finally { stream.write = previousWrite; https.request = originalRequest; }
const declaration = readFileSync(new URL("packages/core/dist/llm/LLMProviderError.d.ts", root), "utf8");
assert.match(declaration, /llmFailureDiagnostic/);
assert.match(declaration, /llmDiagnosticIdentifier/);
console.log(JSON.stringify({ ok: true, instrumentationExports: true, declarations: true,
  packagedTransportStages: events.map(event => event.stage), realProviderCalls: 0,
  scope: "formal dist only; synthetic injected transport, not HTTP/DB/browser or deployment" }));
`;
await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
