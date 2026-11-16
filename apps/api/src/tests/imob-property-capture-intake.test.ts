import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { imobPropertyCaptureRequestSchema, type ImobPropertyCaptureRequest, type ImobPropertyCaptureProposal } from "@eiah/contracts";
import { interpretImobPropertyCapture as intake, type ImobPropertyCaptureDeps } from "../services/imob/intake/imobPropertyCaptureIntake";
import { resolveImobPropertyCaptureTurn } from "../services/imob/crm/imobCrmTurnEngine";

// Injected model fixtures prove dispatch and deterministic protections, never real semantic understanding.
const scope = { tenantId: "session-tenant", workspaceId: "session-workspace", userId: "session-user" };
const origin = { formId: "form-1", contextRef: "v1:interaction-1", draftVersion: 0, threadId: "thread-1", caseId: null };
const draft = { propertyType: "apartamento", goal: "locacao", city: "Balneário Camboriú", address: "", bedrooms: "", garageSpots: "" };
const request = (message: string, extra: Partial<ImobPropertyCaptureRequest> = {}): ImobPropertyCaptureRequest => ({ message, operation: "property.create", step: "editing_form", draft: { ...draft }, origin, history: [], ...extra });
const model = (changes: unknown[] = [], extra = {}) => JSON.stringify({ intent: "continue", confidence: 0.95, changes, ...extra });
const change = (field: string, value: string, evidence: string, correction = false) => ({ field, value, evidence, correction });
const interpret = (input: ImobPropertyCaptureRequest, deps: ImobPropertyCaptureDeps) => intake(input, { scope, ...deps });
async function propose(input = request("São dois quartos e uma vaga.")): Promise<ImobPropertyCaptureProposal> {
  const result = await interpret(input, { interpret: async () => model([change("bedrooms", "2", input.message), change("garageSpots", "1", input.message)]) });
  assert.equal(result.outcome, "proposed"); assert.deepEqual(result.patch, {}); assert.ok(result.proposal);
  return result.proposal;
}

test("cadastro guiado: reprodução e variações propõem sem alterar formulário incompleto e recebem contexto mínimo", async () => {
  for (const message of ["Esse imóvel tem dois quartos e uma vaga. O que mais preciso informar?", "Ele tem 2 dormitórios, cabe um carro; falta alguma coisa?", "São dois quartos; de garagem, uma vaga. Como sigo?"]) {
    const prompts: any[] = [];
    const input = request(message, { draft: { ...draft, neighborhood: "Centro" }, providedFields: ["ownerId"], history: [{ role: "user", text: "Quero cadastrar um apartamento para locação em Balneário Camboriú." }] });
    const snapshot = JSON.stringify(input);
    const result = await resolveImobPropertyCaptureTurn(input, { scope,
      interpret: async (prompt) => { prompts.push(JSON.parse(prompt.userPrompt)); return model([change("bedrooms", "2", message), change("garageSpots", "1", message)]); },
    });
    assert.equal(result.mode, "consult"); assert.equal(result.action, "property.draft.intake");
    assert.deepEqual(result.propertyCapture.patch, {});
    assert.deepEqual(result.propertyCapture.proposal?.changes, { bedrooms: "2", garageSpots: "1" });
    assert.match(result.presentation.text, /Incluir Quartos: 2.*Incluir Vagas de garagem: 1/);
    assert.match(result.presentation.text, /Endereço/); assert.doesNotMatch(result.presentation.text, /caso jurídico/);
    assert.equal("executionRequest" in result, false); assert.equal(JSON.stringify(input), snapshot);
    const context = prompts[0];
    assert.deepEqual(context.draft, input.draft); assert.equal(context.vertical, "IMOB");
    assert.equal(context.operation, "property.create"); assert.equal(context.step, "editing_form");
    assert.equal(context.history.length, 1); assert.deepEqual(context.missingFields, ["address"]);
    assert.ok(context.filledFields.includes("ownerId"));
    assert.equal(context.fields.find((f: any) => f.name === "propertyType").options.some((item: any) => item.value === "apartamento"), true);
    assert.doesNotMatch(JSON.stringify(context), /session-tenant|session-user|form-1|thread-1|interaction-1/);
  }
});

test("cadastro guiado: concordância contextual aplica apenas a proposta vigente; recusa e dúvida não alteram campos", async () => {
  const proposal = await propose();
  for (const [message, intent, expected] of [
    ["Pode incluir os dois dados que você acabou de listar.", "confirm_changes", "updated"],
    ["Pensando melhor, prefiro deixar esses campos sem preencher.", "reject_changes", "rejected"],
    ["Talvez só um deles; qual vaga você entendeu?", "clarify", "clarify"],
  ]) {
    const result = await interpret(request(message, { pendingProposal: proposal }), { interpret: async () => model([], { intent, proposalRef: proposal.ref }) });
    assert.equal(result.outcome, expected);
    assert.deepEqual(result.patch, expected === "updated" ? proposal.changes : {});
    assert.equal(result.proposal?.ref ?? null, expected === "clarify" ? proposal.ref : null);
    if (expected === "updated") { assert.equal(result.confirmedProposalRef, proposal.ref); assert.match(result.content, /ainda não foi salvo/); }
    if (expected === "rejected") assert.match(result.content, /cadastro continua aberto/);
  }
  const noProposal = await interpret(request("Pode seguir"), { interpret: async () => model([], { intent: "confirm_changes", proposalRef: proposal.ref }) });
  assert.equal(noProposal.outcome, "clarify"); assert.deepEqual(noProposal.patch, {});
});

test("cadastro guiado: perguntas preservam proposta; mensagens distribuídas e correções exigem nova revisão integral", async () => {
  const first = await propose();
  const question = request("O proprietário precisa estar cadastrado agora?", { pendingProposal: first });
  const answer = await interpret(question, { interpret: async (prompt) => {
    const context = JSON.parse(prompt.userPrompt); assert.equal(context.pendingProposal.ref, first.ref);
    assert.equal(context.step, "review_draft_changes"); return model([], { topics: ["ownerId"] });
  } });
  assert.equal(answer.outcome, "answered"); assert.equal(answer.proposal?.ref, first.ref);
  assert.match(answer.content, /Proprietário: opcional/); assert.deepEqual(answer.patch, {});
  const next = await interpret(request("A área é 80 metros quadrados.", { pendingProposal: first }), { interpret: async () => model([change("areaM2", "80", "80 metros quadrados")]) });
  assert.equal(next.outcome, "proposed"); assert.notEqual(next.proposal?.ref, first.ref);
  assert.deepEqual(next.proposal?.changes, { bedrooms: "2", garageSpots: "1", areaM2: "80" });
  const correction = await interpret(request("Corrigindo a quantidade: são três quartos.", { pendingProposal: next.proposal }), {
    interpret: async () => model([change("bedrooms", "3", "Corrigindo a quantidade: são três quartos.", true)]),
  });
  assert.deepEqual(correction.proposal?.changes, { bedrooms: "3", garageSpots: "1", areaM2: "80" });
  const wrong = await interpret(request("Concordo com a anterior.", { pendingProposal: correction.proposal }), {
    interpret: async () => model([], { intent: "confirm_changes", proposalRef: first.ref }),
  });
  assert.equal(wrong.outcome, "clarify"); assert.deepEqual(wrong.patch, {});
});

test("cadastro guiado: edição manual, versão, origem, escopo e proposta adulterada impedem confirmação inteira", async () => {
  const proposal = await propose();
  const variants: Array<Partial<ImobPropertyCaptureRequest>> = [
    { draft: { ...draft, bedrooms: "4" } }, { origin: { ...origin, draftVersion: 1 } },
    ...["formId", "contextRef", "threadId", "caseId"].map((key) => ({ origin: { ...origin, [key]: "other" } })),
    { pendingProposal: { ...proposal, version: 2 } as any },
    { pendingProposal: { ...proposal, changes: { ...proposal.changes, city: "" } } },
    { pendingProposal: { ...proposal, changes: { bedrooms: "5" } } },
  ];
  for (const extra of variants) {
    const result = await interpret(request("Pode aplicar tudo.", { pendingProposal: proposal, ...extra }), {
      interpret: async () => model([], { intent: "confirm_changes", proposalRef: proposal.ref }),
    });
    assert.ok(["clarify", "invalid"].includes(result.outcome)); assert.deepEqual(result.patch, {});
  }
  const otherScope = await intake(request("Aplique.", { pendingProposal: proposal }), { scope: { ...scope, workspaceId: "other" },
    interpret: async () => model([], { intent: "confirm_changes", proposalRef: proposal.ref }),
  });
  assert.equal(otherScope.outcome, "clarify"); assert.deepEqual(otherScope.patch, {});
  const partial = await interpret(request("Aplique só os quartos.", { pendingProposal: proposal }), {
    interpret: async () => model([change("bedrooms", "2", "quartos")], { intent: "confirm_changes", proposalRef: proposal.ref }),
  });
  assert.equal(partial.outcome, "clarify"); assert.deepEqual(partial.patch, {});
});

test("cadastro guiado: correção que retira todas as diferenças encerra a proposta anterior", async () => {
  const proposal = await propose();
  const message = "Corrigindo: deixe quartos e vagas vazios como estavam.";
  const result = await interpret(request(message, { pendingProposal: proposal }), {
    interpret: async () => model([change("bedrooms", "", message, true), change("garageSpots", "", message, true)]),
  });
  assert.equal(result.outcome, "answered"); assert.equal(result.proposal, null); assert.deepEqual(result.patch, {});
  assert.match(result.content, /não restou diferença para aplicar/);
  const confirmed = await interpret(request("Pode aplicar.", { pendingProposal: result.proposal }), {
    interpret: async () => model([], { intent: "confirm_changes", proposalRef: proposal.ref }),
  });
  assert.equal(confirmed.outcome, "clarify"); assert.deepEqual(confirmed.patch, {});
});

test("cadastro guiado: correção mostra substituição, mas conflito sem significado inequívoco pede esclarecimento", async () => {
  const input = request("Corrigindo: ele fica em Itajaí.");
  const correction = await interpret(input, { interpret: async () => model([change("city", "Itajaí", input.message, true)]) });
  assert.deepEqual(correction.patch, {}); assert.deepEqual(correction.proposal?.changes, { city: "Itajaí" });
  assert.match(correction.content, /Substituir Cidade: Balneário Camboriú por Itajaí/);
  for (const raw of [model([change("bedrooms", "2", "duas"), change("city", "Itajaí", "Itajaí")]), model([], { intent: "clarify", question: "A vaga pertence a este imóvel?" }), model([change("bedrooms", "2", "duas")], { confidence: 0.3 })]) {
    const result = await interpret(request("duas em Itajaí"), { interpret: async () => raw });
    assert.equal(result.outcome, "clarify"); assert.deepEqual(result.patch, {});
  }
});

test("cadastro guiado: pausa e retomada livres preservam proposta e não são confirmações de salvar", async () => {
  const proposal = await propose();
  for (const [message, contextState, intent, expected] of [
    ["Guarde por enquanto, volto daqui a pouco.", "active", "pause", "leave"],
    ["Agora vamos voltar àquele apartamento.", "paused", "resume", "resumed"],
    ["Antes, quero conversar de outro assunto.", "paused", "change_subject", "leave"],
  ] as const) {
    const result = await interpret(request(message, { contextState, pendingProposal: proposal }), { interpret: async () => model([], { intent }) });
    assert.equal(result.outcome, expected); assert.deepEqual(result.patch, {}); assert.equal(result.proposal?.ref, proposal.ref);
  }
});

test("cadastro guiado: resultados inválidos preservam dados e diagnosticam a etapa sem prompt ou saída bruta", async () => {
  const cases = [
    ["não é JSON", "json_parse"], [model([], { intent: "continue|clarify|change_subject" }), "model_schema"],
    [model([change("ownerId", "inventado", "uma vaga")]), "model_schema"],
    [model([change("bedrooms", "2", "não foi dito")]), "evidence_mismatch"],
    ...["-1", "101", "2.5"].map((value) => [model([change("garageSpots", value, "uma vaga")]), "field_validation"]),
    [model([change("goal", "contrato", "uma vaga")]), "field_validation"],
    [model([change("bedrooms", "2", "uma vaga"), change("bedrooms", "3", "uma vaga")]), "field_validation"],
  ];
  for (const [raw, stage] of cases) {
    const diagnostics: any[] = [];
    const result = await interpret(request("uma vaga"), { interpret: async () => raw, observe: (event) => diagnostics.push(event) });
    assert.equal(result.outcome, "invalid"); assert.deepEqual(result.patch, {});
    assert.deepEqual(diagnostics, [{ stage, outcome: "invalid" }]);
  }
  const declaredNull = await interpret(request("O que falta?"), { interpret: async () => model([], { question: null, proposalRef: null, topics: [] }) });
  assert.equal(declaredNull.outcome, "answered");
});

test("cadastro guiado: indisponibilidade, policy e timeout encerram espera e preservam proposta válida", async () => {
  const proposal = await propose();
  for (const [interpretModel, outcome] of [
    [async () => { throw new Error("No LLM providers configured"); }, "unavailable"],
    [async () => { throw new Error("knowledge_policy.blocked"); }, "unavailable"],
    [() => new Promise<string>(() => {}), "timeout"],
  ] as const) {
    const result = await interpret(request("Posso perguntar antes de confirmar?", { pendingProposal: proposal }), { interpret: interpretModel, timeoutMs: 5 });
    assert.equal(result.outcome, outcome); assert.deepEqual(result.patch, {}); assert.equal(result.proposal?.ref, proposal.ref);
    assert.match(result.content, /preservados.*sem gravar/);
  }
});

test("cadastro guiado: campos realmente ausentes orientam o próximo dado, sem exigir save antes de conversar", async () => {
  const partial = await interpret(request("Como continuo?"), { interpret: async () => model() });
  assert.match(partial.content, /Ainda falta informar: Endereço/); assert.doesNotMatch(partial.content, /falta informar:.*Cidade/);
  const complete = await interpret(request("Tem vista mar; como salvo?", { draft: { ...draft, address: "Rua Sintética, 123" } }), {
    interpret: async () => model([], { unsupported: ["vista mar"] }),
  });
  assert.match(complete.content, /Salvar cadastro/); assert.match(complete.content, /não possui campo para: vista mar/); assert.deepEqual(complete.patch, {});
});

test("contrato de transporte limita contexto e rejeita autorização e identificadores livres", () => {
  assert.equal(imobPropertyCaptureRequestSchema.safeParse(request("oi")).success, true);
  for (const bad of [{ ...request("oi"), tenantId: "outro" }, { ...request("oi"), permissions: ["*"] }, request("oi", { draft: { ...draft, ownerId: "outro" } as any }), request("oi", { history: Array.from({ length: 7 }, () => ({ role: "user", text: "x" })) }), request("oi", { step: "save" as any })]) {
    assert.equal(imobPropertyCaptureRequestSchema.safeParse(bad).success, false);
  }
});

/** Real route callback, dependencies injected. Not HTTP/DB/provider integration. */
function routeHarness(options: { permission?: boolean; entitlement?: boolean; profile?: boolean } = {}) {
  const source = ts.createSourceFile("imob.ts", readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "imobRouter.post" && node.arguments[0]?.getText(source) === '"/chat/resolve-turn"') handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(handler);
  const calls: Array<{ kind: string; input: any }> = [];
  const injected = {
    asObject: (value: any) => value && typeof value === "object" ? value : null,
    asString: (value: any) => typeof value === "string" ? value.trim() : null,
    readImobWorkspaceAccessProfile: async (input: any) => { calls.push({ kind: "access", input }); return { permissions: ["imob.chat.use"] }; },
    ensureImobWorkspacePermission: (res: any) => options.permission === false ? (res.status(403).json({ ok: false }), false) : true,
    resolveImobEntitlements: async (input: any) => { calls.push({ kind: "entitlement", input }); return { REAL_ESTATE_CORE: options.entitlement !== false }; },
    imobPropertyCaptureRequestSchema, resolveImobPropertyCaptureTurn,
    createLogger: () => ({ info: (diagnostic: unknown) => calls.push({ kind: "diagnostic", input: diagnostic }) }),
    getAgentProfile: async (...input: any[]) => { calls.push({ kind: "profile", input }); return { model: "configured:model", chatRuntime: { chatEnabled: options.profile !== false }, knowledgePolicy: { llmUsageMode: "grounded_reasoning", maskingPolicy: "required" } }; },
    executeLlmStep: async (input: any) => { calls.push({ kind: "provider", input }); return { outputText: model() }; },
  };
  const callback = new Function(...Object.keys(injected), ts.transpileModule(`return (${handler.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)(...Object.values(injected));
  return { calls, run: async (body: any) => {
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await callback({ authContext: scope, prisma: {}, body }, res); return res;
  } };
}

test("rota com dublês usa sessão e executor central antes de efeitos; não envia escopo ou credencial ao provider", async () => {
  const harness = routeHarness(); const input = request("O que falta?");
  const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input, tenantId: "evil", workspaceId: "evil", userId: "evil", caseId: "evil", actionId: "evil" });
  assert.equal(response.statusCode, 200); assert.equal(response.body.data.action, "property.draft.intake");
  assert.deepEqual(harness.calls.map(({ kind }) => kind), ["access", "entitlement", "profile", "provider", "diagnostic"]);
  assert.equal(harness.calls[1].input.tenantId, scope.tenantId);
  assert.deepEqual(harness.calls[2].input.slice(0, 3), [scope.tenantId, scope.workspaceId, "EIAH"]);
  const provider = harness.calls[3].input;
  assert.equal(provider.profile.model, "configured:model"); assert.equal(provider.profile.knowledgePolicy.maskingPolicy, "required");
  assert.equal(provider.metadata.maskSensitiveBeforeLlm, true);
  assert.doesNotMatch(provider.userPrompt, /evil|session-tenant|session-user|caseId/);
  assert.equal("ownerId" in JSON.parse(provider.userPrompt).draft, false);
});

test("rota com dublês bloqueia acesso, entitlement, contexto inválido e agente indisponível", async () => {
  for (const [options, expected] of [[{ permission: false }, 403], [{ entitlement: false }, 403], [{ profile: false }, 200]] as const) {
    const harness = routeHarness(options); const input = request("O que falta?");
    const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input });
    assert.equal(response.statusCode, expected); assert.equal(harness.calls.some(({ kind }) => kind === "provider"), false);
    if (expected === 200) assert.equal(response.body.data.propertyCapture.outcome, "unavailable");
  }
  const harness = routeHarness();
  const response = await harness.run({ message: "Outra mensagem", intake: "property_draft", propertyCapture: request("O que falta?") });
  assert.equal(response.statusCode, 400); assert.equal(harness.calls.some(({ kind }) => kind === "provider"), false);
});
