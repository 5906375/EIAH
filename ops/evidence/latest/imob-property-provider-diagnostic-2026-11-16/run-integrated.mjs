// Controlled operator diagnostic: real intake/engine/executor/provider, synthetic data only.
// Does not invoke the HTTP router, authenticate as a tenant, mutate domain data, or change global configuration.
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import https from "node:https";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./", import.meta.url));
const source = "/home/jusall/projects/EIAH_BUILDER/apps/api/.env";
const configured = parseEnv(readFileSync(source, "utf8"));
const selectedEnvironment = ["OPENAI_API_KEY", "LLM_TIMEOUT_MS", "LLM_RETRIES", "LLM_RETRY_DELAY_MS", "LLM_RETRY_MAX_DELAY_MS", "LLM_RETRY_BACKOFF_FACTOR", "LLM_RETRY_JITTER_RATIO"];
for (const name of selectedEnvironment) if (!process.env[name] && configured[name]) process.env[name] = configured[name];
const secret = process.env.OPENAI_API_KEY;
if (!secret || /placeholder|your[_-]|changeme|synthetic|dummy/i.test(secret)) throw new Error("Configured real OpenAI credential unavailable; no provider request sent");

const sanitize = (value) => {
  let text = JSON.stringify(value);
  text = text.split(secret).join("[REDACTED]")
    .replace(/sk-[^\s"\\,]+/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [REDACTED]")
    .replace(/\/home\/[^/\s"\\]+\/projects\/EIAH[^\s"\\:]*/g, "[WORKSPACE]");
  return JSON.parse(text);
};
const report = {
  logicalCorrelationId: `imob-provider-diag-${randomUUID()}`,
  correlationKind: "operator diagnostic traceId; not an HTTP application request ID",
  startedAt: new Date().toISOString(),
  scope: "isolated application intake/engine and central runtime; not HTTP/staging or tenant authorization proof",
  requestedProvider: "openai", requestedModel: null,
  profileSource: "existing canonical EIAH profile; workspace database profile unavailable",
  configurationSource: "existing API local env, read in memory; only OpenAI and existing LLM retry/timeout settings loaded",
  logicalRequests: 1,
  retryConfiguration: Object.fromEntries(selectedEnvironment.filter((name) => name.startsWith("LLM_")).map((name) => [name, process.env[name] ?? null])),
  fallback: "none in executeLlmStep -> runCompletion -> resolveProvider",
  httpAttempts: [], diagnostics: [], runtime: null, result: null,
  cost: null, costNote: "No monetary cost field is exposed by this runtime; no estimate invented",
  otherProviders: { anthropic: "not configured in inspected local API env", gemini: "not configured in inspected local API env" },
};
const save = () => writeFileSync(directory + "openai-integrated.json", JSON.stringify(sanitize(report), null, 2) + "\n");
const nativeRequest = https.request;
https.request = function (...args) {
  const options = args[0];
  const hostname = options?.hostname ?? options?.host ?? (options instanceof URL ? options.hostname : "");
  const request = nativeRequest.apply(this, args);
  if (hostname !== "api.openai.com") return request;
  const start = Date.now();
  const attempt = { number: report.httpAttempts.length + 1, startedAt: new Date().toISOString(), host: hostname,
    path: String(options?.path ?? options?.pathname ?? "").split("?")[0], method: options?.method ?? null,
    responseReceived: false, status: null, providerRequestIdHeader: null, durationMs: null };
  report.httpAttempts.push(attempt); save();
  request.once("response", (response) => {
    attempt.responseReceived = true;
    attempt.status = response.statusCode;
    attempt.providerRequestIdHeader = response.headers["x-request-id"] ?? response.headers["request-id"] ?? null;
    const chunks = []; let bytes = 0;
    response.on("data", (chunk) => { bytes += chunk.length; if (bytes <= 256000) chunks.push(Buffer.from(chunk)); });
    response.once("end", () => {
      attempt.durationMs = Date.now() - start;
      attempt.finishedAt = new Date().toISOString();
      attempt.responseBytes = bytes;
      if (bytes <= 256000) {
        const text = Buffer.concat(chunks).toString("utf8");
        attempt.responseSha256 = createHash("sha256").update(text).digest("hex");
        try { attempt.syntheticResponse = sanitize(JSON.parse(text)); }
        catch { attempt.nonJsonResponse = true; }
      }
      save();
    });
  });
  request.once("error", (error) => {
    attempt.durationMs = Date.now() - start;
    attempt.finishedAt = new Date().toISOString();
    attempt.transportError = { name: error.name, code: error.code ?? null };
    save();
  });
  return request;
};

try {
  const { eiahProfile } = await import("../../../../packages/core/src/actions/agents/eiahAction.ts");
  const { executeLlmStep } = await import("../../../../apps/api/src/orchestrator/llmExecutor.ts");
  const { resolveImobPropertyCaptureTurn } = await import("../../../../apps/api/src/services/imob/crm/imobCrmTurnEngine.ts");
  report.requestedModel = eiahProfile.model;
  report.knowledgePolicy = { ...eiahProfile.knowledgePolicy, maskingPolicy: "required" };
  const fixture = {
    message: "São dois quartos e uma vaga. Pode me orientar no restante?",
    operation: "property.create", step: "editing_form", contextState: "active", pendingProposal: null,
    draft: { propertyType: "apartamento", goal: "locacao", city: "Balneário Camboriú", address: "", bedrooms: "", garageSpots: "" },
    origin: { formId: "diagnostic-synthetic-form", contextRef: "v1:diagnostic-synthetic-origin", draftVersion: 0, threadId: "diagnostic-synthetic-thread", caseId: null },
    history: [{ role: "user", text: "Quero cadastrar um apartamento para locação em Balneário Camboriú." }],
  };
  report.fixture = structuredClone(fixture);
  const before = JSON.stringify(fixture);
  save();
  report.result = await resolveImobPropertyCaptureTurn(fixture, {
    scope: { tenantId: "diagnostic-synthetic-tenant", workspaceId: "diagnostic-synthetic-workspace", userId: "diagnostic-synthetic-operator" },
    observe: (diagnostic) => { report.diagnostics.push({ ...diagnostic, at: new Date().toISOString() }); save(); },
    interpret: async ({ systemPrompt, userPrompt }) => {
      report.centralExecutorCalled = true;
      const started = Date.now();
      const result = await executeLlmStep({
        profile: { model: eiahProfile.model, maxTokens: 1000, systemPrompt,
          knowledgePolicy: { ...eiahProfile.knowledgePolicy, maskingPolicy: "required" } },
        userPrompt,
        metadata: { source: "imob-property-capture-intake", maskSensitiveBeforeLlm: true, traceId: report.logicalCorrelationId },
      });
      report.runtime = { provider: result.provider, model: result.model, traceId: result.traceId,
        requestId: result.requestId, tookMs: result.tookMs, durationMs: Date.now() - started,
        usage: result.usage, outputText: result.outputText, syntheticRawResponse: sanitize(result.rawResponse) };
      save();
      return result.outputText;
    },
  });
  const capture = report.result.propertyCapture;
  report.fixtureUnchanged = JSON.stringify(fixture) === before;
  report.noAppliedFields = Object.keys(capture.patch).length === 0;
  report.expectedProposal = capture.outcome === "proposed" && capture.proposal?.changes.bedrooms === "2" && capture.proposal?.changes.garageSpots === "1";
  report.finishedAt = new Date().toISOString();
  report.exitCode = report.expectedProposal && report.fixtureUnchanged && report.noAppliedFields ? 0 : 2;
  save();
  console.log(JSON.stringify({ report: "openai-integrated.json", correlationId: report.logicalCorrelationId,
    httpAttempts: report.httpAttempts.length, httpStatuses: report.httpAttempts.map((attempt) => attempt.status),
    outcome: capture.outcome, diagnostics: report.diagnostics, expectedProposal: report.expectedProposal,
    fixtureUnchanged: report.fixtureUnchanged, noAppliedFields: report.noAppliedFields, exitCode: report.exitCode }));
  process.exitCode = report.exitCode;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = sanitize({ name: error.name, message: error.message });
  report.exitCode = 1; save();
  console.log(JSON.stringify({ report: "openai-integrated.json", failure: report.failure, httpAttempts: report.httpAttempts.length, exitCode: 1 }));
  process.exitCode = 1;
}
