import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { imobPropertyCaptureRequestSchema, type ImobPropertyCaptureRequest } from "@eiah/contracts";
import { interpretImobPropertyCapture } from "../services/imob/intake/imobPropertyCaptureIntake";
import { resolveImobPropertyCaptureTurn } from "../services/imob/crm/imobCrmTurnEngine";

// Provider responses are injected fixtures. These checks prove dispatch/validation, never real semantic understanding.
const draft = { propertyType: "apartamento", goal: "locacao", city: "Balneário Camboriú", address: "", bedrooms: "", garageSpots: "" };
const request = (message: string, extra: Partial<ImobPropertyCaptureRequest> = {}): ImobPropertyCaptureRequest => ({ message, operation: "property.create", step: "editing_form", draft: { ...draft }, history: [], ...extra });
const model = (changes: unknown[] = [], extra = {}) => JSON.stringify({ intent: "continue", confidence: 0.95, changes, ...extra });
const change = (field: string, value: string, evidence: string, correction = false) => ({ field, value, evidence, correction });

test("reprodução e variações: provider recebe contexto atual e propõe quartos/vagas; engine é consultivo", async () => {
  for (const message of ["Esse imóvel tem dois quartos e uma vaga. O que mais preciso informar?", "Ele tem 2 dormitórios, cabe um carro; falta alguma coisa?", "São dois quartos; de garagem, uma vaga. Como sigo?"]) {
    const prompts: any[] = [];
    const result = await resolveImobPropertyCaptureTurn(request(message, { draft: { ...draft, neighborhood: "Centro" }, history: [{ role: "user", text: "Quero cadastrar um apartamento para locação em Balneário Camboriú." }] }), {
      interpret: async (prompt) => { prompts.push(JSON.parse(prompt.userPrompt)); return model([change("bedrooms", "2", message), change("garageSpots", "1", message)]); },
    });
    assert.equal(result.mode, "consult");
    assert.equal(result.action, "property.draft.intake");
    assert.deepEqual(result.propertyCapture.patch, { bedrooms: "2", garageSpots: "1" });
    assert.match(result.presentation.text, /Endereço/);
    assert.doesNotMatch(result.presentation.text, /caso jurídico/);
    assert.equal("executionRequest" in result, false);
    assert.deepEqual(prompts[0].draft, { ...draft, neighborhood: "Centro" });
    assert.equal(prompts[0].vertical, "IMOB");
    assert.equal(prompts[0].operation, "property.create");
    assert.equal(prompts[0].step, "editing_form");
    assert.equal(prompts[0].history.length, 1);
    assert.equal(prompts[0].options.propertyType.some((item: any) => item.value === "apartamento"), true);
  }
});

test("perguntas intermediárias preservam o rascunho; dados distribuídos e correção mudam só o campo solicitado", async () => {
  const before = request("Quais campos são obrigatórios?");
  const snapshot = JSON.stringify(before);
  const answer = await interpretImobPropertyCapture(before, { interpret: async () => model() });
  assert.equal(answer.outcome, "answered");
  assert.deepEqual(answer.patch, {});
  assert.equal(JSON.stringify(before), snapshot);
  const correction = request("Corrigindo: ele fica em Itajaí.");
  const result = await interpretImobPropertyCapture(correction, { interpret: async () => model([change("city", "Itajaí", "Corrigindo: ele fica em Itajaí.", true)]) });
  assert.deepEqual(result.patch, { city: "Itajaí" });
  assert.deepEqual({ ...correction.draft, ...result.patch }, { ...draft, city: "Itajaí" });
  const more = await interpretImobPropertyCapture(request("A área é 80 metros quadrados.", { draft: { ...draft, bedrooms: "2", garageSpots: "1" } }), {
    interpret: async () => model([change("areaM2", "80", "80 metros quadrados")]),
  });
  assert.deepEqual(more.patch, { areaM2: "80" });
});

test("ambiguidade, conflito, baixa confiança e saída explícita nunca aplicam parte do patch", async () => {
  for (const raw of [model([change("bedrooms", "2", "duas"), change("city", "Itajaí", "Itajaí")]), model([], { intent: "clarify", question: "A vaga pertence a este imóvel?" }), model([change("bedrooms", "2", "duas")], { confidence: 0.3 })]) {
    const result = await interpretImobPropertyCapture(request("duas em Itajaí"), { interpret: async () => raw });
    assert.equal(result.outcome, "clarify");
    assert.deepEqual(result.patch, {});
  }
  const leave = await interpretImobPropertyCapture(request("Guarde esse rascunho; agora quero falar de outro assunto."), { interpret: async () => model([], { intent: "change_subject" }) });
  assert.equal(leave.outcome, "leave");
  assert.deepEqual(leave.patch, {});
  assert.match(leave.content, /rascunho foram preservados/);
});

test("retorno inválido, campo sem suporte, evidência inventada, enum e quantidades inválidas falham sem alteração", async () => {
  for (const raw of ["não é JSON", model([change("ownerId", "inventado", "uma vaga")]), model([change("bedrooms", "2", "não foi dito")]), model([change("garageSpots", "-1", "uma vaga")]), model([change("garageSpots", "101", "uma vaga")]), model([change("bedrooms", "2.5", "uma vaga")]), model([change("goal", "contrato", "uma vaga")]), model([change("bedrooms", "2", "uma vaga"), change("bedrooms", "3", "uma vaga")])]) {
    const result = await interpretImobPropertyCapture(request("uma vaga"), { interpret: async () => raw });
    assert.equal(result.outcome, "invalid", raw);
    assert.deepEqual(result.patch, {});
  }
});

test("indisponibilidade, policy negada e timeout têm desfecho explícito; nenhum fallback de domínio", async () => {
  for (const [interpret, outcome] of [
    [async () => { throw new Error("No LLM providers configured"); }, "unavailable"],
    [async () => { throw new Error("knowledge_policy.blocked"); }, "unavailable"],
    [() => new Promise<string>(() => {}), "timeout"],
  ] as const) {
    const result = await interpretImobPropertyCapture(request("Ele tem uma vaga?"), { interpret, timeoutMs: 5 });
    assert.equal(result.outcome, outcome);
    assert.deepEqual(result.patch, {});
    assert.match(result.content, /preservados.*sem gravar/);
  }
});

test("rascunho completo orienta confirmação no botão; características ausentes do modelo são declaradas", async () => {
  const result = await interpretImobPropertyCapture(request("Tem vista mar; como salvo?", { draft: { ...draft, address: "Rua Sintética, 123" } }), {
    interpret: async () => model([], { unsupported: ["vista mar"] }),
  });
  assert.match(result.content, /Salvar cadastro no formulário/);
  assert.match(result.content, /não possui campo para: vista mar/);
  assert.deepEqual(result.patch, {});
});

test("contrato de transporte limita contexto e rejeita escopo/autorização e identificadores livres", () => {
  assert.equal(imobPropertyCaptureRequestSchema.safeParse(request("oi")).success, true);
  for (const bad of [{ ...request("oi"), tenantId: "outro" }, { ...request("oi"), permissions: ["*"] }, request("oi", { draft: { ...draft, ownerId: "outro" } as any }), request("oi", { history: Array.from({ length: 7 }, () => ({ role: "user", text: "x" })) }), request("oi", { step: "save" as any })]) {
    assert.equal(imobPropertyCaptureRequestSchema.safeParse(bad).success, false);
  }
});

/** Execute the real route callback with injected dependencies. Not an HTTP/DB/provider integration test. */
function routeHarness(options: { permission?: boolean; entitlement?: boolean; profile?: boolean } = {}) {
  const source = ts.createSourceFile("imob.ts", readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "imobRouter.post" && node.arguments[0]?.getText(source) === '"/chat/resolve-turn"') handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler);
  const calls: Array<{ kind: string; input: any }> = [];
  const injected = {
    asObject: (value: any) => value && typeof value === "object" ? value : null,
    asString: (value: any) => typeof value === "string" ? value.trim() : null,
    readImobWorkspaceAccessProfile: async (input: any) => { calls.push({ kind: "access", input }); return { permissions: ["imob.chat.use"] }; },
    ensureImobWorkspacePermission: (res: any) => options.permission === false ? (res.status(403).json({ ok: false }), false) : true,
    resolveImobEntitlements: async (input: any) => { calls.push({ kind: "entitlement", input }); return { REAL_ESTATE_CORE: options.entitlement !== false }; },
    imobPropertyCaptureRequestSchema, resolveImobPropertyCaptureTurn,
    getAgentProfile: async (...input: any[]) => { calls.push({ kind: "profile", input }); return { model: "configured:model", chatRuntime: { chatEnabled: options.profile !== false }, knowledgePolicy: { llmUsageMode: "grounded_reasoning", maskingPolicy: "required" } }; },
    executeLlmStep: async (input: any) => { calls.push({ kind: "provider", input }); return { outputText: model() }; },
  };
  const callback = new Function(...Object.keys(injected), ts.transpileModule(`return (${handler.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)(...Object.values(injected));
  return { calls, run: async (body: any) => {
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await callback({ authContext: { tenantId: "session-tenant", workspaceId: "session-workspace", userId: "session-user" }, prisma: {}, body }, res);
    return res;
  } };
}

test("rota real com dublês usa sessão e executor central, ignora escopo externo e retorna antes de efeitos operacionais", async () => {
  const harness = routeHarness();
  const input = request("O que falta?");
  const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input, tenantId: "evil", workspaceId: "evil", userId: "evil", caseId: "evil", actionId: "evil" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.action, "property.draft.intake");
  assert.deepEqual(harness.calls.map(({ kind }) => kind), ["access", "entitlement", "profile", "provider"]);
  assert.equal(harness.calls[1].input.tenantId, "session-tenant");
  assert.deepEqual(harness.calls[2].input.slice(0, 3), ["session-tenant", "session-workspace", "EIAH"]);
  const provider = harness.calls[3].input;
  assert.equal(provider.profile.model, "configured:model");
  assert.equal(provider.profile.knowledgePolicy.maskingPolicy, "required");
  assert.equal(provider.metadata.maskSensitiveBeforeLlm, true);
  assert.doesNotMatch(provider.userPrompt, /evil|session-tenant|session-user|caseId/);
  assert.equal("ownerId" in JSON.parse(provider.userPrompt).draft, false);
});

test("rota real com dublês bloqueia acesso, entitlement, contexto inválido e agente indisponível antes do provider", async () => {
  for (const [options, expected] of [[{ permission: false }, 403], [{ entitlement: false }, 403], [{ profile: false }, 200]] as const) {
    const harness = routeHarness(options);
    const input = request("O que falta?");
    const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input });
    assert.equal(response.statusCode, expected);
    assert.equal(harness.calls.some(({ kind }) => kind === "provider"), false);
    if (expected === 200) assert.equal(response.body.data.propertyCapture.outcome, "unavailable");
  }
  const harness = routeHarness();
  const response = await harness.run({ message: "Outra mensagem", intake: "property_draft", propertyCapture: request("O que falta?") });
  assert.equal(response.statusCode, 400);
  assert.equal(harness.calls.some(({ kind }) => kind === "provider"), false);
});
