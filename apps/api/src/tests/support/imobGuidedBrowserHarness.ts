import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";

import { ensureVerticalAccessStore } from "../../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../../services/workspaceResponsibility";
import { provisionWorkspaceAgentAssignments } from "../../services/workspaceAgentProvisioning";
import { FRONT_DOOR_AGENTS, WORKSPACE_AGENT_PROVISIONING_VERSION } from "@eiah/core/catalog/workspaceAgentProvisioning";
import { assertDisposableDatabase } from "./verticalEvaluationRealDb";

/**
 * Harness da validação INTEGRADA no navegador (frontend real → rotas HTTP reais da API → PostgreSQL descartável).
 * Somente o TRANSPORTE externo do provider é simulado: `globalThis.fetch` é interceptado ANTES de o app ser importado.
 *  - hosts de provider conhecidos → resposta determinística no formato do provider; cada invocação é registrada;
 *  - qualquer outro host que não seja loopback → BLOQUEADO e registrado (nunca liberado em silêncio);
 *  - nenhum código de produção é alterado e não há bypass de autorização: tokens `ApiToken`, vínculos e entitlements são os reais,
 *    semeados pelas MESMAS rotas HTTP usadas pelos testes de integração existentes.
 * O app é o `default export` de `src/index.ts` com NODE_ENV=test (não inicia workers/filas; o listen é feito aqui, em loopback).
 * Só roda contra banco descartável (mesma guarda dos demais testes de integração reais).
 */
assertDisposableDatabase();

const env = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} obrigatório`); return value; };
const providerLog = env("HARNESS_PROVIDER_LOG");
const blockedLog = env("HARNESS_BLOCKED_LOG");
const manifestPath = env("HARNESS_MANIFEST");
const port = Number(env("HARNESS_API_PORT"));
const log = (file: string, entry: Record<string, unknown>) => appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

// ─── Provider simulado ───────────────────────────────────────────────────────────────────────────────────────────────────
// Contratos SUPORTADOS (somente os usados pelos cenários), diferenciados:
//  (1) POST https://api.openai.com/v1/chat/completions — intake guiado ({message}) igual ao fixture de proposta → proposta determinística;
//  (2) POST https://api.openai.com/v1/responses com text.format.name = "imob_semantic_intent" (classificador de intenção do turno IMOB não guiado)
//      → ABSTENÇÃO válida pelo schema estrito (needsClarification=true, sem entidade/ação): o simulador NÃO inventa classificação; o produto segue
//      o caminho documentado de `parser_fallback`. Intake de unidades e validação de anexos (também /v1/responses) NÃO são simulados → 501.
// QUALQUER outro (host, caminho, método, texto sem fixture) falha de forma explícita (HTTP 501, sem corpo que pareça resultado válido do produto)
// e é registrado com `answered: "unsupported"`; o spec reprova o cenário em que isso ocorrer.
const MODEL_PROPOSAL = {
  intent: "continue", confidence: 0.95,
  changes: [
    { field: "bedrooms", value: "2", evidence: "dois quartos", correction: false },
    { field: "garageSpots", value: "1", evidence: "uma vaga", correction: false },
  ],
};
const PROVIDER_HOSTS = new Set(["api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "api.deepseek.com"]);
const PROPOSAL_FIXTURE = /dois quartos e uma vaga/i;
let invocation = 0;

function userTextOf(body: unknown): string {
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : {};
    const messages = (parsed.messages ?? []) as Array<{ role?: string; content?: unknown }>;
    const last = [...messages].reverse().find((message) => message.role !== "system" && message.role !== "assistant");
    return String((JSON.parse(typeof last?.content === "string" ? last.content : "") as { message?: unknown }).message ?? "");
  } catch { return ""; }
}
type Contract = { supported: true; contract: "chat_completions" | "responses_intent" } | { supported: false; contract: string; reason: string };
const parseBody = (raw: string): any => { try { return JSON.parse(raw); } catch { return null; } };
function classifyRequest(host: string, method: string | undefined, path: string | undefined, raw: string): Contract {
  const pathname = String(path ?? "").split("?")[0];
  const known = host === "api.openai.com" && (pathname === "/v1/chat/completions" || pathname === "/v1/responses");
  if (!known) return { supported: false, contract: `${host}${pathname}`, reason: "host/caminho de provider não simulado" };
  if (method !== "POST") return { supported: false, contract: pathname, reason: `método ${method} não suportado` };
  const body = parseBody(raw);
  if (pathname === "/v1/chat/completions") {
    return PROPOSAL_FIXTURE.test(userTextOf(raw)) ? { supported: true, contract: "chat_completions" } : { supported: false, contract: "chat_completions", reason: "sem fixture para este texto de intake" };
  }
  // /v1/responses: apenas o classificador de intenção; intake de unidades (unitsOnly) e validação de anexos têm outro propósito e não são simulados.
  const developerText = JSON.stringify(body?.input?.[0] ?? "");
  if (body?.text?.format?.name !== "imob_semantic_intent") return { supported: false, contract: "responses", reason: "/v1/responses fora do classificador imob_semantic_intent (ex.: validação de anexos) não simulado" };
  if (developerText.includes("intake de identificação de unidades")) return { supported: false, contract: "responses", reason: "intake de unidades via /v1/responses não simulado" };
  return { supported: true, contract: "responses_intent" };
}
function chatCompletion(): Record<string, unknown> {
  return { id: `sim-${invocation}`, model: "simulated-model", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(MODEL_PROPOSAL) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}
/** Formato da Responses API (output[].content[].output_text); conteúdo = abstenção válida pelo SemanticIntentJsonSchema. */
function responsesAbstention(): Record<string, unknown> {
  const abstention = { entity: null, action: null, confidence: null, needsClarification: true, composedIntents: [], propertyUnits: null };
  return { id: `sim-resp-${invocation}`, object: "response", status: "completed", model: "simulated-model",
    output: [{ type: "message", id: `sim-msg-${invocation}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(abstention), annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
}
const isLoopback = (host: string | undefined) => !host || ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);

// Os adaptadores de provider usam `node-fetch` (http/https do Node), NÃO o fetch global: por isso a simulação e o bloqueio ficam no nível de
// REDE. (1) o transporte HTTPS para hosts de provider é redirecionado a um simulador em loopback; (2) toda conexão TCP para destino que não
// seja loopback é recusada e registrada. Nada externo é liberado em silêncio.
const simulator = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    invocation += 1;
    const host = String(req.headers["x-sim-host"] ?? "unknown");
    const raw = Buffer.concat(chunks).toString("utf8");
    const text = userTextOf(raw);
    const verdict = classifyRequest(host, req.method, req.url, raw);
    log(providerLog, { seq: invocation, host, path: req.url, method: req.method, contract: verdict.contract, authorization: req.headers.authorization || req.headers["x-api-key"] ? "present" : "absent", messageChars: text.length,
      answered: !verdict.supported ? "unsupported" : verdict.contract === "responses_intent" ? "abstain" : "proposal", ...(verdict.supported ? {} : { reason: verdict.reason }) });
    if (!verdict.supported) {
      res.writeHead(501, { "content-type": "application/json", "x-request-id": `sim-${invocation}` });
      return res.end(JSON.stringify({ error: { message: `harness: requisição de provider não suportada (${verdict.contract}): ${verdict.reason}`, type: "harness_unsupported_contract" } }));
    }
    res.writeHead(200, { "content-type": "application/json", "x-request-id": `sim-${invocation}` });
    res.end(JSON.stringify(verdict.contract === "responses_intent" ? responsesAbstention() : chatCompletion()));
  });
});
await new Promise<void>((resolve) => simulator.listen(0, "127.0.0.1", resolve));
const simulatorPort = (simulator.address() as AddressInfo).port;

const originalHttpsRequest = https.request;
(https as { request: unknown }).request = function patchedHttpsRequest(this: unknown, ...args: unknown[]) {
  const first = args[0] as string | URL | (https.RequestOptions & { path?: string });
  const second = typeof args[1] === "object" && args[1] !== null ? (args[1] as https.RequestOptions) : undefined;
  const callback = args.find((arg) => typeof arg === "function") as ((res: http.IncomingMessage) => void) | undefined;
  const url = typeof first === "string" || first instanceof URL ? new URL(first) : null;
  const host = url?.hostname ?? (first as https.RequestOptions).hostname ?? (first as https.RequestOptions).host ?? "";
  if (PROVIDER_HOSTS.has(host)) {
    const options = (url ? second : first) as https.RequestOptions | undefined;
    return http.request({ host: "127.0.0.1", port: simulatorPort, path: url ? url.pathname + url.search : (first as { path?: string }).path,
      method: options?.method ?? "GET", headers: { ...(options?.headers as Record<string, string> | undefined), "x-sim-host": host }, signal: options?.signal }, callback);
  }
  return (originalHttpsRequest as (...a: unknown[]) => unknown).apply(this, args);
} as typeof https.request;

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
  const first = args[0];
  const target = typeof first === "object" && first !== null ? (first as { host?: string; path?: string | null }) : { host: typeof args[1] === "string" ? args[1] : undefined, path: typeof first === "string" ? first : undefined };
  if (!target.path && !isLoopback(target.host)) {
    log(blockedLog, { host: target.host, kind: "tcp-connect" });
    process.nextTick(() => this.destroy(new Error(`harness: conexão externa bloqueada (${target.host})`)));
    return this;
  }
  return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;

// Fetch global (caso algum código use): mesma regra.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
  if (isLoopback(url.hostname)) return realFetch(input, init);
  if (PROVIDER_HOSTS.has(url.hostname)) return realFetch(`http://127.0.0.1:${simulatorPort}${url.pathname}${url.search}`, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), "x-sim-host": url.hostname } });
  log(blockedLog, { host: url.hostname, path: url.pathname, method: init?.method ?? "GET", kind: "fetch" });
  throw new TypeError(`harness: chamada externa bloqueada (${url.hostname})`);
}) as typeof fetch;

// ─── App real + semeadura pelas rotas reais ─────────────────────────────────────────────────────────────────────────────
const tag = randomUUID().slice(0, 8);
const ids = { tenantId: `br-t-${tag}`, workspaceId: `br-w-${tag}`, owner: `br-owner-${tag}`, admin: `br-adm-${tag}`, other: `br-oth-${tag}` };
const token = { owner: `syn-br-owner-${tag}-${randomUUID()}`, admin: `syn-br-adm-${tag}-${randomUUID()}`, other: `syn-br-oth-${tag}-${randomUUID()}` };
const adminEmail = `${ids.admin}@example.com`;
process.env.EIAH_PLATFORM_ADMIN_EMAILS = adminEmail;
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY ??= "synthetic-not-a-real-key";
process.env.ANTHROPIC_API_KEY ??= "synthetic-not-a-real-key";
process.env.GEMINI_API_KEY ??= "synthetic-not-a-real-key";
process.env.DEEPSEEK_API_KEY ??= "synthetic-not-a-real-key";

const { default: app } = await import("../../index");
const request = supertest(app);
const auth = (value: string) => `Bearer ${value}`;

await prismaGlobal.tenant.create({ data: { id: ids.tenantId, name: "Synthetic browser tenant" } });
await prismaGlobal.workspace.create({ data: { id: ids.workspaceId, tenantId: ids.tenantId, name: "Synthetic browser workspace" } });
// Mesmo provisionamento que a rota real de criação de workspace (ADR-010): agentes do Front Door atribuídos ao workspace.
await provisionWorkspaceAgentAssignments({ tenantId: ids.tenantId, workspaceId: ids.workspaceId, agents: FRONT_DOOR_AGENTS, trigger: "workspace_create", catalogVersion: WORKSPACE_AGENT_PROVISIONING_VERSION });
await prismaGlobal.user.createMany({ data: [
  { id: ids.owner, tenantId: ids.tenantId, email: `${ids.owner}@example.com` },
  { id: ids.admin, tenantId: ids.tenantId, email: adminEmail },
  { id: ids.other, tenantId: ids.tenantId, email: `${ids.other}@example.com` },
] });
for (const [userId, roleKey] of [[ids.owner, "founder"], [ids.admin, "corretor"], [ids.other, "founder"]] as const) {
  await ensureWorkspaceMembershipForUser({ tenantId: ids.tenantId, workspaceId: ids.workspaceId, userId, roleKey });
}
await prismaGlobal.apiToken.createMany({ data: [
  { token: token.owner, tenantId: ids.tenantId, workspaceId: ids.workspaceId, userId: ids.owner },
  { token: token.admin, tenantId: ids.tenantId, workspaceId: ids.workspaceId, userId: ids.admin },
  { token: token.other, tenantId: ids.tenantId, workspaceId: ids.workspaceId, userId: ids.other },
] });
await ensureVerticalAccessStore(prismaGlobal);
async function enableImob(userToken: string) {
  const requested = await request.post("/api/vertical-access/request").set("Authorization", auth(userToken)).send({ vertical: "IMOB", channel: "marketplace" });
  if (requested.status !== 201 && requested.status !== 200) throw new Error(`vertical-access/request ${requested.status}`);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${ids.tenantId} AND workspace_id=${ids.workspaceId} AND vertical='IMOB'`;
  const decided = await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(token.admin)).send({ decision: "aprovar", note: "Synthetic" });
  if (decided.status !== 200) throw new Error(`approval decision ${decided.status}`);
  const activated = await request.post("/api/marketplace/installations/activate").set("Authorization", auth(userToken)).send({ product: "IMOB" });
  if (activated.status !== 200) throw new Error(`installations/activate ${activated.status}`);
}
await enableImob(token.owner);

const server = app.listen(port, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as AddressInfo;
// Controles negativos (autoverificação): um host externo qualquer deve ser BLOQUEADO; um host de provider deve cair no simulador em loopback.
const selfTest = { externalBlocked: false, providerRedirected: false, chatCompletionsSupported: false, responsesIntentSupported: false, responsesIntentShape: false, responsesOtherRejected: false, unknownTextRejected: false };
// Host reservado (.invalid, RFC 6761): nunca resolve. Só é considerado BLOQUEADO se a própria guarda o registrou (não por falha de DNS).
await new Promise<void>((resolve) => { const r = https.get("https://selftest-guard.invalid/", () => resolve()); r.on("error", () => resolve()); });
selfTest.externalBlocked = readFileSync(blockedLog, "utf8").includes("selftest-guard.invalid");
const probe = (path: string, body: unknown) => new Promise<{ status?: number; text: string }>((resolve) => {
  const r = https.request(`https://api.openai.com${path}`, { method: "POST", headers: { "content-type": "application/json" } }, (res) => { const parts: Buffer[] = []; res.on("data", (c) => parts.push(c)); res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(parts).toString("utf8") })); });
  r.on("error", () => resolve({ text: "" })); r.end(JSON.stringify(body));
});
const chat = (text: string) => ({ messages: [{ role: "user", content: JSON.stringify({ message: text }) }] });
const simBefore = invocation;
const okChat = await probe("/v1/chat/completions", chat("controle: dois quartos e uma vaga"));
const intent = await probe("/v1/responses", { input: [{ role: "developer", content: [{ type: "input_text", text: "controle de classificação" }] }], text: { format: { type: "json_schema", name: "imob_semantic_intent" } } });
const otherResponses = await probe("/v1/responses", { input: [], text: { format: { name: "outro_contrato" } } });
const unknownChat = await probe("/v1/chat/completions", chat("controle sem fixture"));
selfTest.providerRedirected = invocation === simBefore + 4;
selfTest.chatCompletionsSupported = okChat.status === 200 && JSON.parse(okChat.text).choices?.[0]?.message?.content?.includes("bedrooms") === true;
selfTest.responsesIntentSupported = intent.status === 200;
selfTest.responsesIntentShape = (() => { try { const payload = JSON.parse(intent.text); const out = JSON.parse(payload.output[0].content[0].text); return payload.object === "response" && out.needsClarification === true && out.entity === null && out.action === null && !("choices" in payload); } catch { return false; } })();
selfTest.responsesOtherRejected = otherResponses.status === 501 && !otherResponses.text.includes("choices") && !otherResponses.text.includes("output");
selfTest.unknownTextRejected = unknownChat.status === 501;
invocation = simBefore; // as chamadas de autoverificação não contam como invocação de teste
writeFileSync(providerLog, "");
writeFileSync(blockedLog, ""); // as tentativas da autoverificação já foram provadas pelo resultado; os logs passam a conter só ocorrências do teste
if (Object.values(selfTest).some((value) => !value)) throw new Error(`autoverificação do simulador/bloqueio de rede falhou: ${JSON.stringify(selfTest)}`);
writeFileSync(manifestPath, JSON.stringify({ apiPort: address.port, ...ids, tokens: token, selfTest }), { mode: 0o600 });
console.log(`HARNESS-READY api=127.0.0.1:${address.port} tenant=${ids.tenantId} workspace=${ids.workspaceId}`);

async function shutdown() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePrismaResources();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
