import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import crypto from "node:crypto";
import { imobPropertyCaptureRequestSchema, type ImobPropertyCaptureRequest, type ImobPropertyCaptureProposal } from "@eiah/contracts";
import { interpretImobPropertyCapture as intake, type ImobPropertyCaptureDeps } from "../services/imob/intake/imobPropertyCaptureIntake";
import { resolveImobPropertyCaptureTurn } from "../services/imob/crm/imobCrmTurnEngine";
import { llmFailureDiagnostic, llmDiagnosticIdentifier, LLMProviderError } from "@eiah/core/llm/LLMProviderError";

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
    if (outcome === "unavailable") assert.match(result.content, /assistência por IA está indisponível.*mantidos.*nenhuma alteração foi aplicada.*não foi salvo/);
    else assert.match(result.content, /preservados.*sem gravar/);
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
function routeHarness(options: { permission?: boolean; entitlement?: boolean; profile?: boolean; profileError?: Error; executorError?: Error; prisma?: ReturnType<typeof guidedPropertyFixture>["prisma"];
  /** P-04: resultado do estágio transversal do `claimOnly` (dublê que registra a chamada); null = não reivindica. */ claimStage?: () => unknown } = {}) {
  const source = ts.createSourceFile("imob.ts", readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "imobRouter.post" && node.arguments[0]?.getText(source) === '"/chat/resolve-turn"') handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(handler);
  const calls: Array<{ kind: string; input: any }> = [];
  const injected = {
    crypto,
    // Without a persistence double the guard sees no session; with one it runs the REAL implementation (guard 409 coverage).
    openPropertyCapture: options.prisma ? realOpenPropertyCapture : async () => null, PropertyCaptureActiveError, propertyCaptureActiveBody,
    llmFailureDiagnostic, llmDiagnosticIdentifier,
    asObject: (value: any) => value && typeof value === "object" ? value : null,
    asString: (value: any) => typeof value === "string" ? value.trim() : null,
    readImobWorkspaceAccessProfile: async (input: any) => { calls.push({ kind: "access", input }); return { permissions: ["imob.chat.use"], responsibleLabel: "responsável" }; },
    // Ramo `claimOnly` (P11): o estágio real é coberto pelos testes P11; aqui só a ORDEM guard × claim e a ausência de efeitos na sessão.
    resolveImobTransversalTurnStage: async (input: any) => { calls.push({ kind: "claim", input: { claimOnly: input.claimOnly, message: input.message } }); return (options.claimStage ?? (() => null))(); },
    resolveImobOperationalConsult: async () => null, imobCrmBusinessRead: { applyCanonicalJourneyToResolvedData: (data: unknown) => data },
    discoverImobTransversalCapabilitiesForTurn: async () => [], readVerticalRegistryFacts: async () => ({}),
    evaluateImobFrontDoorCapabilityAccess: () => ({ allowed: true }), IMOB_CASE_CONSULT_CAPABILITY: "crm.case.consult", canWorkspaceOperateImobStage: () => true,
    ensureImobWorkspacePermission: (res: any) => options.permission === false ? (res.status(403).json({ ok: false }), false) : true,
    resolveImobEntitlements: async (input: any) => { calls.push({ kind: "entitlement", input }); return { REAL_ESTATE_CORE: options.entitlement !== false }; },
    imobPropertyCaptureRequestSchema, resolveImobPropertyCaptureTurn,
    createLogger: (context: Record<string, unknown>) => ({ info: (diagnostic: Record<string, unknown>, message: string) => calls.push({ kind: message === "imob.property_capture.intake" ? "diagnostic" : "runtime", input: { ...context, ...diagnostic } }) }),
    getAgentProfile: async (...input: any[]) => { calls.push({ kind: "profile", input }); if (options.profileError) throw options.profileError; return { model: "configured:model", chatRuntime: { chatEnabled: options.profile !== false }, knowledgePolicy: { llmUsageMode: "grounded_reasoning", maskingPolicy: "required" } }; },
    executeLlmStep: async (input: any) => { calls.push({ kind: "provider", input }); if (options.executorError) throw options.executorError; return { outputText: model() }; },
  };
  const callback = new Function(...Object.keys(injected), ts.transpileModule(`return (${handler.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)(...Object.values(injected));
  return { calls, run: async (body: any) => {
    const res = { statusCode: 200, body: null as any, getHeader: () => "http-synthetic-correlation", status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await callback({ authContext: scope, prisma: options.prisma ?? {}, body }, res); return res;
  } };
}

test("rota com dublês usa sessão e executor central antes de efeitos; não envia escopo ou credencial ao provider", async () => {
  const harness = routeHarness(); const input = request("O que falta?");
  const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input, tenantId: "evil", workspaceId: "evil", userId: "evil", caseId: "evil", actionId: "evil" });
  assert.equal(response.statusCode, 200); assert.equal(response.body.data.action, "property.draft.intake");
  const calls = harness.calls.filter(({ kind }) => kind !== "runtime");
  assert.deepEqual(calls.map(({ kind }) => kind), ["access", "entitlement", "profile", "provider", "diagnostic"]);
  assert.equal(harness.calls[1].input.tenantId, scope.tenantId);
  assert.deepEqual(calls[2].input.slice(0, 3), [scope.tenantId, scope.workspaceId, "EIAH"]);
  const provider = calls[3].input;
  assert.equal(provider.profile.model, "configured:model"); assert.equal(provider.profile.knowledgePolicy.maskingPolicy, "required");
  assert.equal(provider.metadata.maskSensitiveBeforeLlm, true);
  assert.equal(provider.metadata.traceId, "http-synthetic-correlation");
  assert.equal(calls.at(-1)?.input.traceId, "http-synthetic-correlation");
  assert.doesNotMatch(provider.userPrompt, /evil|session-tenant|session-user|caseId/);
  assert.equal("ownerId" in JSON.parse(provider.userPrompt).draft, false);
});

test("diagnóstico: falha de perfil antes do executor é correlacionada e não vaza erro genérico", async () => {
  const secret = "Bearer synthetic-private-profile-secret";
  const harness = routeHarness({ profileError: Object.assign(new Error(secret), { code: secret, privateData: secret }) });
  const proposal = await propose();
  const input = request("Posso perguntar?", { pendingProposal: proposal });
  const snapshot = JSON.stringify(input);
  const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.propertyCapture.outcome, "unavailable");
  assert.equal(response.body.data.presentation.text, response.body.data.propertyCapture.content);
  assert.deepEqual(response.body.data.propertyCapture.patch, {});
  assert.deepEqual(response.body.data.propertyCapture.proposal, proposal);
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal("executionRequest" in response.body.data, false);
  assert.equal(harness.calls.some(({ kind }) => kind === "provider"), false);
  const failures = harness.calls.filter(({ kind, input }) => kind === "runtime" && input.failure);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].input.traceId, "http-synthetic-correlation");
  assert.equal(failures[0].input.stage, "profile_resolution");
  assert.deepEqual(failures[0].input.failure, { category: "internal", code: "profile_resolution_failed" });
  const terminal = harness.calls.filter(({ kind }) => kind === "diagnostic");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].input.traceId, "http-synthetic-correlation");
  assert.equal(terminal[0].input.internalFailure.code, "interpretation_failed");
  assert.doesNotMatch(JSON.stringify([...failures, ...terminal, response.body]), /synthetic-private-profile-secret|privateData|stack/);
});

test("diagnóstico: HTTP da aplicação permanece separado do status do provider e de IDs ausentes", async () => {
  for (const signals of [{ httpStatus: 429, providerRequestId: "req_synthetic_real_header" }, {}]) {
    const failure = new LLMProviderError({ provider: "openai", model: "synthetic-model", code: "credit_balance_exhausted", ...signals });
    const harness = routeHarness({ executorError: failure });
    const input = request("O que falta?");
    const response = await harness.run({ message: input.message, intake: "property_draft", propertyCapture: input });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.propertyCapture.outcome, "unavailable");
    const events = harness.calls.filter(({ kind }) => kind === "diagnostic");
    assert.equal(events.length, 1);
    assert.equal(events[0].input.traceId, "http-synthetic-correlation");
    assert.equal(events[0].input.providerFailure.httpStatus, signals.httpStatus);
    assert.equal(events[0].input.providerFailure.providerRequestId, signals.providerRequestId);
    assert.equal(Object.hasOwn(events[0].input.providerFailure, "modelUsed"), false);
    assert.doesNotMatch(JSON.stringify(response.body), /req_synthetic|credit_balance|synthetic-model/);
  }
});

test("diagnóstico: parsing e schema têm conclusão única correlacionada sem registrar conteúdo", async () => {
  const proposal = await propose();
  for (const [raw, stage] of [["synthetic-private-invalid-json", "json_parse"], ['{"private":"synthetic-private-schema"}', "model_schema"]]) {
    const diagnostics: unknown[] = [];
    const input = request("Pergunta privada", { pendingProposal: proposal });
    const snapshot = JSON.stringify(input);
    const result = await resolveImobPropertyCaptureTurn(input, { scope, traceId: "http-synthetic-correlation",
      interpret: async () => raw, observe: (event) => diagnostics.push(event) });
    assert.deepEqual(diagnostics, [{ stage, outcome: "invalid", traceId: "http-synthetic-correlation" }]);
    assert.deepEqual(result.propertyCapture.patch, {});
    assert.deepEqual(result.propertyCapture.proposal, proposal);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal("executionRequest" in result, false);
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic-private|Pergunta privada/);
  }
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

// New guided mode is separate from the legacy contextual form tests above.
import { guidedPropertyFixture } from "./fixtures/imob/guided-property-capture.fixture";
import { PropertyCaptureActiveError, openPropertyCapture as realOpenPropertyCapture, propertyCaptureActiveBody } from "../services/imob/imobChatConversationManagement";
import { withGuidedPropertySave } from "../services/imob/intake/imobPropertyGuidedCapture";
import { IMOB_PROPERTY_GUIDED_POLICY as guidedPolicy, imobPropertyGuidedErrors } from "@eiah/contracts";
import { buildPropertyCreateForm } from "../services/imob/imobTurnResolver";

function guidedSession(fixture = guidedPropertyFixture()) {
  let latest: Awaited<ReturnType<typeof fixture.run>>["propertyCapture"];
  let values: ImobPropertyCaptureRequest["draft"] = {};
  const ownOrigin = { ...origin };
  async function send(action: NonNullable<ImobPropertyCaptureRequest["guided"]>["action"], options: {
    message?: string; field?: string; value?: string; interpret?: () => Promise<string>; extra?: Partial<ImobPropertyCaptureRequest>;
  } = {}) {
    const response = await fixture.run(request(options.message ?? action, { draft: values, origin: ownOrigin,
      pendingProposal: latest?.proposal ?? null, guided: { action, sessionRef: latest?.guided?.sessionRef ?? undefined,
        revision: latest?.guided?.revision, field: options.field, value: options.value }, ...options.extra }), options.interpret);
    latest = response.propertyCapture;
    values = { ...values, ...latest.patch };
    return latest;
  }
  return { fixture, send, get latest() { return latest; }, get values() { return values; } };
}

test("coleta guiada v1: abertura sem IA; sequenciamento, zero, inválido, pular, retomar e revisão", async () => {
  const h = guidedSession();
  const opened = await h.send("start");
  assert.equal(opened.guided?.phase, "start"); assert.equal(opened.guided.showFullForm, false);
  assert.equal(h.fixture.control.transports, 0);
  let state = await h.send("collect"); assert.equal(state.guided?.currentField, "propertyType");
  state = await h.send("set", { field: "propertyType", value: "apartamento" });
  assert.deepEqual(state.patch, { propertyType: "apartamento" }); assert.equal(state.guided?.currentField, "goal");
  await h.send("focus", { field: "bedrooms" });
  state = await h.send("set", { field: "bedrooms", value: "zero" });
  assert.deepEqual(state.patch, {}); assert.match(state.content, /inteiro.*Corrija/);
  state = await h.send("set", { field: "bedrooms", value: "0" }); assert.deepEqual(state.patch, { bedrooms: "0" });
  await h.send("focus", { field: "city" });
  state = await h.send("skip"); assert.ok(state.guided?.skipped.includes("city"));
  state = await h.send("focus", { field: "city" }); assert.ok(!state.guided?.skipped.includes("city"));
  await h.send("set", { field: "city", value: "Joinville" });
  state = await h.send("review"); assert.equal(state.guided?.showFullForm, true);
  assert.ok(state.guided.errors.address); assert.equal(state.guided.errors.goal, undefined);
  assert.equal(state.guided.errors.bedrooms, undefined); assert.equal(h.fixture.control.transports, 0);
});

test("coleta guiada v1: proposta 2/1, confirmação contextual uma vez e adulteração bloqueada sem outra IA", async () => {
  const h = guidedSession(); await h.send("start");
  const first = await h.send("interpret", { message: "São dois quartos e uma vaga", interpret: async () => model([
    change("bedrooms", "2", "dois quartos"), change("garageSpots", "1", "uma vaga"),
  ]) });
  assert.equal(first.outcome, "proposed"); assert.deepEqual(first.patch, {}); assert.deepEqual(h.values, {});
  assert.deepEqual(first.proposal?.changes, { bedrooms: "2", garageSpots: "1" });
  const applied = await h.send("confirm"); assert.deepEqual(applied.patch, { bedrooms: "2", garageSpots: "1" });
  assert.equal(applied.confirmedProposalRef, first.proposal?.ref);
  assert.deepEqual((await h.send("confirm", { extra: { pendingProposal: first.proposal } })).patch, {});
  await h.send("interpret"); assert.equal(h.fixture.control.transports, 1);
  const other = guidedSession(); await other.send("start");
  const proposal = await other.send("interpret", { message: "dois quartos", interpret: async () => model([change("bedrooms", "2", "dois quartos")]) });
  const bad = await other.send("confirm", { extra: { pendingProposal: { ...proposal.proposal!, changes: { bedrooms: "5" } } } });
  assert.deepEqual(bad.patch, {}); assert.equal(other.fixture.control.transports, 1);
});

test("coleta guiada v1: admissão concorrente/repetida, formId arbitrário, falha, timeout e resultado desconhecido não renovam", async () => {
  for (const failure of ["unavailable", "timeout", "invalid"]) {
    const fixture = guidedPropertyFixture(), h = guidedSession(fixture); await h.send("start");
    const initial = h.latest;
    const input = request("dois quartos", { draft: {}, guided: { action: "interpret", sessionRef: initial.guided!.sessionRef!, revision: initial.guided!.revision } });
    const run = () => fixture.run(input, async () => {
      if (failure === "unavailable") throw new Error("synthetic unknown outcome after admission");
      if (failure === "timeout") return new Promise(() => {});
      return "invalid JSON";
    });
    const outcomes = await Promise.all([run(), run(), run()]);
    assert.equal(fixture.control.transports, 1); assert.ok(outcomes.some((item) => item.propertyCapture.outcome === failure));
    await fixture.run(input); assert.equal(fixture.control.transports, 1);
    // P-02: outra origem com sessão aberta recebe o conflito (referência do servidor), não um 200 sem saída; nada é renovado.
    await assert.rejects(fixture.run(request("novo", { guided: { action: "start" }, origin: { ...origin, formId: "arbitrary-other-form" } })),
      (error: unknown) => error instanceof PropertyCaptureActiveError && error.open.sessionRef === [...fixture.events.keys()][0]);
    assert.equal(fixture.events.size, 1, "formId arbitrário não abre outra admissão");
    const stored = [...fixture.events.values()][0].metadata;
    assert.equal(stored.interpretation, "consumed");
  }
});

test("coleta guiada v1: pausa/reload conservador, escopo antigo, cancelamento e resposta tardia não restauram autoridade", async () => {
  const h = guidedSession(); await h.send("start"); const first = h.latest;
  await h.send("collect"); await h.send("skip"); await h.send("pause");
  const paused = h.latest; await h.send("resume");
  assert.equal(h.latest.guided?.interpretation, "declined"); assert.deepEqual(h.latest.guided?.skipped, paused.guided?.skipped);
  const stale = await h.fixture.run(request("sync", { guided: { action: "sync", sessionRef: first.guided!.sessionRef!, revision: 0 } }));
  assert.equal(stale.propertyCapture.guided?.interpretation, "declined");
  const cancelled = await h.send("cancel"); assert.equal(cancelled.guided?.status, "cancelled");
  assert.equal((await h.fixture.run(request("resume", { guided: { action: "resume", sessionRef: first.guided!.sessionRef!, revision: first.guided!.revision } }))).propertyCapture.guided?.status, "cancelled");
  const late = guidedSession(); await late.send("start");
  let release!: (value: string) => void;
  const interpreting = late.send("interpret", { message: "dois quartos", interpret: () => new Promise((resolve) => { release = resolve; }) });
  while (!release) await new Promise<void>((resolve) => setImmediate(resolve));
  const stored = [...late.fixture.events.values()][0].metadata;
  await late.fixture.run(request("cancel", { draft: {}, guided: { action: "cancel", sessionRef: stored.sessionRef, revision: stored.revision } }));
  release(model([change("bedrooms", "2", "dois quartos")]));
  assert.equal((await interpreting).guided, undefined);
  assert.equal([...late.fixture.events.values()][0].metadata.status, "cancelled");
});

test("coleta guiada v1: indisponibilidade persistente mantém coleta estruturada e bloqueia só interpretação", async () => {
  const fixture = guidedPropertyFixture(); fixture.control.available = false;
  const start = await fixture.run(request("start", { draft: {}, guided: { action: "start" } }));
  assert.equal(start.propertyCapture.guided?.interpretation, "blocked");
  const next = await fixture.run(request("apartamento", { draft: {}, guided: { action: "set", field: "propertyType", value: "apartamento",
    fallbackView: { phase: "collecting", skipped: [], currentField: "propertyType" } } }));
  assert.deepEqual(next.propertyCapture.patch, { propertyType: "apartamento" });
  assert.equal(next.propertyCapture.guided?.currentField, "goal"); assert.equal(fixture.control.transports, 0);
});

test("coleta guiada v1: save revalida domínio no caminho existente, flags omitidas/adulteradas, legado separado", async () => {
  const h = guidedSession(); let writes = 0;
  const create = async () => { writes++; return { status: "created" as const, data: { id: "synthetic-property" } }; };
  // Legacy permissive schema remains accepted outside a guided session.
  assert.equal((await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, {}, create)).status, "created");
  await h.send("start");
  assert.equal((await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, {}, create)).status, "guided_invalid");
  await h.send("review");
  const base = { metadata: { propertyCaptureSessionRef: h.latest.guided!.sessionRef } };
  const blocked = await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, base, create);
  assert.equal(blocked.status, "guided_invalid"); if (blocked.status === "guided_invalid") assert.deepEqual(Object.keys(blocked.errors), ["propertyType", "city", "address"]);
  const values = { propertyType: "apartamento", city: "Joinville", address: "Rua Sintética 123" };
  assert.deepEqual(Object.keys(imobPropertyGuidedErrors(buildPropertyCreateForm().fields, values)), []);
  assert.equal((await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, { ...values, metadata: { propertyCaptureSessionRef: crypto.randomUUID() } }, create)).status, "guided_invalid");
  assert.equal((await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, { ...values, ...base }, create)).status, "created");
  assert.equal(writes, 2); assert.equal([...h.fixture.events.values()][0].metadata.status, "saved");
  assert.equal((await withGuidedPropertySave(h.fixture.prisma, h.fixture.scope, { ...values, ...base }, create)).status, "guided_invalid");
  assert.equal(h.fixture.control.transports, 0);
});

test("coleta guiada v1: isolamento autenticado, correção invalida proposta e nova tentativa só em cadastro explicitamente novo", async () => {
  const h = guidedSession(); await h.send("start");
  const proposed = await h.send("interpret", { message: "dois quartos", interpret: async () => model([change("bedrooms", "2", "dois quartos")]) });
  const ref = proposed.guided!.sessionRef!;
  for (const changed of [{ tenantId: "other" }, { workspaceId: "other" }, { userId: "other" }]) {
    const result = await resolveImobPropertyCaptureTurn(request("confirm", { draft: {}, pendingProposal: proposed.proposal,
      guided: { action: "confirm", sessionRef: ref, revision: proposed.guided!.revision } }),
      { prisma: h.fixture.prisma, scope: { ...h.fixture.scope, ...changed }, interpret: async () => { throw new Error("forbidden"); } });
    assert.deepEqual(result.propertyCapture.patch, {}); assert.equal(result.propertyCapture.guided, undefined);
  }
  await h.send("focus", { field: "bedrooms" });
  await h.send("set", { field: "bedrooms", value: "3" });
  const obsolete = await h.send("confirm", { extra: { pendingProposal: proposed.proposal } });
  assert.deepEqual(obsolete.patch, {}); assert.equal(h.values.bedrooms, "3");
  await h.send("cancel");
  const newOrigin = { ...origin, formId: "explicit-new-capture" };
  const newSession = await h.fixture.run(request("Cadastrar imóvel", { draft: {}, origin: newOrigin, guided: { action: "start" } }));
  assert.notEqual(newSession.propertyCapture.guided?.sessionRef, ref);
  assert.equal(newSession.propertyCapture.guided?.interpretation, "available"); assert.equal(h.fixture.control.transports, 1);
});

test("coleta guiada v1: recuperação do controle indisponível preserva preenchimento e não concede interpretação", async () => {
  const fixture = guidedPropertyFixture(); fixture.control.available = false;
  const initial = await fixture.run(request("start", { draft: {}, guided: { action: "start" } }));
  fixture.control.available = true;
  const recovered = await fixture.run(request("Revisar cadastro", { draft: { propertyType: "apartamento", city: "Joinville" },
    guided: { action: "review", revision: initial.propertyCapture.guided!.revision,
      fallbackView: { phase: "collecting", skipped: ["goal"], currentField: "address" } } }));
  assert.equal(recovered.propertyCapture.guided?.phase, "review"); assert.equal(recovered.propertyCapture.guided?.interpretation, "declined");
  assert.ok(recovered.propertyCapture.guided?.sessionRef); assert.equal(fixture.control.transports, 0);
  assert.equal([...fixture.events.values()][0].metadata.draft.city, "Joinville");
});

test("coleta guiada v1: callback real POST /properties usa requisitos de servidor e preserva createProperty legado", async () => {
  const fixture = guidedPropertyFixture();
  const source = ts.createSourceFile("imobCrmRouter.ts", readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "router.post" && node.arguments[0]?.getText(source) === '"/properties"') handler = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(handler);
  const { imobPropertyCreateSchema } = await import("../routes/imobCrmSchemas");
  let writes = 0;
  const injected = { schemas: { imobPropertyCreateSchema }, withGuidedPropertySave,
    readImobEntityAccess: async () => ["imob.chat.use"], requestedEntityStage: () => null,
    ensureImobEntityStage: () => true,
    ImobCrmMutationService: class { async createProperty(_scope: unknown, input: unknown) { writes++; return { status: "created", data: { id: "synthetic-property", input } }; } },
  };
  const callback = new Function(...Object.keys(injected), ts.transpileModule(`return (${handler.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(injected));
  async function save(body: unknown) {
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await callback({ authContext: fixture.scope, prisma: fixture.prisma, body }, res); return res;
  }
  assert.equal((await save({})).statusCode, 201); assert.equal(writes, 1);
  const h = guidedSession(fixture); await h.send("start"); await h.send("review");
  assert.equal((await save({ metadata: { guided: false } })).statusCode, 400);
  assert.equal((await save({ metadata: { propertyCaptureSessionRef: h.latest.guided!.sessionRef } })).statusCode, 400);
  assert.equal(writes, 1);
  const saved = await save({ propertyType: "apartamento", city: "Joinville", address: "Rua Sintética, 123",
    metadata: { propertyCaptureSessionRef: h.latest.guided!.sessionRef } });
  assert.equal(saved.statusCode, 201); assert.equal(writes, 2); assert.equal(fixture.control.transports, 0);
});

test("coleta guiada v1: rota real admite antes do executor e exclui chamadas indiretas nos controles", async () => {
  const fixture = guidedPropertyFixture(); const route = routeHarness({ prisma: fixture.prisma });
  const start = request("Cadastrar imóvel", { draft: {}, guided: { action: "start" } });
  const opening = await route.run({ message: start.message, intake: "property_draft", propertyCapture: start });
  assert.equal(opening.statusCode, 200); assert.equal(route.calls.filter((call) => call.kind === "provider").length, 0);
  const state = opening.body.data.propertyCapture.guided;
  const initial = request("dois quartos", { draft: {}, guided: { action: "interpret", sessionRef: state.sessionRef, revision: state.revision } });
  const interpreted = await route.run({ message: initial.message, intake: "property_draft", propertyCapture: initial });
  const providers = route.calls.filter((call) => call.kind === "provider");
  assert.equal(providers.length, 1); assert.equal(providers[0].input.transportPolicy, "imob_guided_single_attempt");
  let current = interpreted.body.data.propertyCapture.guided;
  for (const action of ["confirm", "collect", "skip", "review"] as const) {
    const input = request(action, { draft: {}, guided: { action, sessionRef: current.sessionRef, revision: current.revision } });
    current = (await route.run({ message: action, intake: "property_draft", propertyCapture: input })).body.data.propertyCapture.guided;
  }
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, 1);
  assert.equal([...fixture.events.values()][0].metadata.interpretation, "consumed");
});

// ── Revisão F-01..F-05: recuperação explícita, cancelar/pausar com revisão antiga, resultado compatível, save legado e guard 409 ──
// Persistência: dublê transacional em memória. Prova sequência/guardas; NÃO prova atomicidade em PostgreSQL nem entre processos.
type GuidedFixture = ReturnType<typeof guidedPropertyFixture>;
const originOf = (formId: string) => ({ ...origin, formId });
const guidedReq = (formId: string | null, guided: NonNullable<ImobPropertyCaptureRequest["guided"]>, extra: Partial<ImobPropertyCaptureRequest> = {}) =>
  request(guided.action, { draft: {}, origin: formId ? originOf(formId) : undefined, guided, ...extra });
const stored = (fixture: GuidedFixture, ref: string) => fixture.events.get(ref)!.metadata as { status: string; interpretation: string; revision: number; pending: unknown; draft: Record<string, string>; sessionRef: string };
async function openSession(fixture: GuidedFixture, formId: string) {
  const opened = (await fixture.run(guidedReq(formId, { action: "start" }))).propertyCapture;
  return { ref: opened.guided!.sessionRef!, revision: opened.guided!.revision };
}
const proposalJson = JSON.stringify({ intent: "continue", confidence: 0.95, changes: [{ field: "bedrooms", value: "2", evidence: "dois quartos", correction: false }] });
const gate = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

test("F-01 recuperação: sessão perdida é encerrada por referência explícita, sem origem, sem atingir cadastro mais novo", async () => {
  const fixture = guidedPropertyFixture();
  const a = await openSession(fixture, "form-A");
  assert.deepEqual(await realOpenPropertyCapture(fixture.prisma, fixture.scope), { sessionRef: a.ref, status: "active" });
  // Outra aba/formId não retoma nem cancela por origem; o início não renova nada.
  await assert.rejects(fixture.run(guidedReq("form-B", { action: "start" })), (error: unknown) => error instanceof PropertyCaptureActiveError
    && error.open.sessionRef === a.ref && error.open.status === "active", "P-02: o conflito nomeia a sessão aberta (antes: 200 clarify sem referência)");
  const byOrigin = (await fixture.run(guidedReq("form-B", { action: "cancel" }))).propertyCapture;
  assert.match(byOrigin.content, /Outro cadastro pendente.*não foi alterado/);
  assert.equal(stored(fixture, a.ref).status, "active", "cancelamento por outra origem não atinge a sessão aberta");
  // Recuperação explícita: nomeia a sessão; sem origem e com revisão e rascunho antigos.
  const closed = (await fixture.run(guidedReq(null, { action: "cancel", sessionRef: a.ref, revision: 99 }, { draft: { city: "Antiga" } }))).propertyCapture;
  assert.equal(closed.guided?.status, "cancelled"); assert.equal(stored(fixture, a.ref).status, "cancelled");
  assert.equal(stored(fixture, a.ref).draft.city, undefined, "rascunho antigo enviado junto da ação não é aplicado");
  assert.equal(await realOpenPropertyCapture(fixture.prisma, fixture.scope, true), null, "sessão terminal não bloqueia mais");
  assert.equal(fixture.control.transports, 0);
  // Novo cadastro exige início explícito; uma ação atrasada sobre a sessão antiga não atinge o novo.
  const b = await openSession(fixture, "form-C"); assert.notEqual(b.ref, a.ref);
  const late = (await fixture.run(guidedReq(null, { action: "cancel", sessionRef: a.ref }))).propertyCapture;
  assert.equal(late.guided?.status, "cancelled", "a resposta reflete o estado persistido da sessão antiga");
  assert.equal(stored(fixture, b.ref).status, "active"); assert.equal(stored(fixture, b.ref).interpretation, "available");
  // Terminal não é reativada por snapshot/sync/pausa tardios.
  for (const action of ["sync", "resume", "pause", "set"] as const) {
    const result = (await fixture.run(guidedReq(null, { action, sessionRef: a.ref, revision: 0, value: "x" }))).propertyCapture;
    assert.notEqual(result.guided?.status, "active", action);
  }
  assert.equal(stored(fixture, a.ref).status, "cancelled");
  // Referência inexistente: nada muda e não há estado guiado fabricado.
  const unknown = (await fixture.run(guidedReq(null, { action: "cancel", sessionRef: crypto.randomUUID() }))).propertyCapture;
  assert.equal(unknown.guided, undefined); assert.equal(stored(fixture, b.ref).status, "active");
});

test("F-01 recuperação: encerrar/expirar não renova o consumo; a mesma abertura não vira nova oportunidade", async () => {
  const fixture = guidedPropertyFixture();
  const a = await openSession(fixture, "form-A");
  await fixture.run(guidedReq("form-A", { action: "interpret", sessionRef: a.ref, revision: a.revision }, { message: "dois quartos" }), async () => proposalJson);
  assert.equal(fixture.control.transports, 1);
  await fixture.run(guidedReq(null, { action: "cancel", sessionRef: a.ref }));
  assert.equal(stored(fixture, a.ref).interpretation, "consumed");
  const again = (await fixture.run(guidedReq("form-A", { action: "start" }))).propertyCapture;
  assert.equal(again.guided?.status, "cancelled"); assert.equal(fixture.control.transports, 1);
});

test("F-01 isolamento: a referência de um ator/escopo não encerra a sessão de outro", async () => {
  const fixture = guidedPropertyFixture();
  const a = await openSession(fixture, "form-A");
  for (const other of [{ ...fixture.scope, userId: "other-user" }, { ...fixture.scope, workspaceId: "other-workspace" }, { ...fixture.scope, tenantId: "other-tenant" }]) {
    const result = await resolveImobPropertyCaptureTurn(guidedReq(null, { action: "cancel", sessionRef: a.ref }), { prisma: fixture.prisma, scope: other,
      interpret: async () => { throw new Error("unexpected LLM"); } });
    assert.equal(result.propertyCapture.guided, undefined);
    assert.equal(await realOpenPropertyCapture(fixture.prisma, other), null);
  }
  assert.equal(stored(fixture, a.ref).status, "active");
});

test("F-02 cancelar/pausar com revisão antiga: valida a sessão, não exige a revisão mais recente, é idempotente e não aplica rascunho", async () => {
  const fixture = guidedPropertyFixture();
  const a = await openSession(fixture, "form-A");
  await fixture.run(guidedReq("form-A", { action: "collect", sessionRef: a.ref, revision: a.revision })); // a revisão avança
  const staleDraft = { city: "Antiga" };
  const paused = (await fixture.run(guidedReq("form-A", { action: "pause", sessionRef: a.ref, revision: a.revision }, { draft: staleDraft }))).propertyCapture;
  assert.equal(paused.guided?.status, "paused"); assert.equal(stored(fixture, a.ref).draft.city, undefined);
  const revisionAfterPause = stored(fixture, a.ref).revision;
  await fixture.run(guidedReq("form-A", { action: "pause", sessionRef: a.ref, revision: 0 }));
  assert.equal(stored(fixture, a.ref).revision, revisionAfterPause, "pausa repetida é idempotente");
  const cancelled = (await fixture.run(guidedReq("form-A", { action: "cancel", sessionRef: a.ref, revision: 0 }, { draft: staleDraft }))).propertyCapture;
  assert.equal(cancelled.guided?.status, "cancelled"); assert.equal(cancelled.proposal ?? null, null);
  const revisionAfterCancel = stored(fixture, a.ref).revision;
  const repeated = (await fixture.run(guidedReq("form-A", { action: "cancel", sessionRef: a.ref, revision: 0 }))).propertyCapture;
  assert.equal(repeated.guided?.status, "cancelled"); assert.equal(stored(fixture, a.ref).revision, revisionAfterCancel);
  const pauseTerminal = (await fixture.run(guidedReq("form-A", { action: "pause", sessionRef: a.ref }))).propertyCapture;
  assert.equal(pauseTerminal.guided?.status, "cancelled");
  assert.equal(fixture.control.transports, 0);
});

test("F-02 cancelamento antes da admissão impede transporte; depois dela não renova consumo nem aceita resposta tardia", async () => {
  const before = guidedPropertyFixture();
  const a = await openSession(before, "form-A");
  await before.run(guidedReq("form-A", { action: "cancel", sessionRef: a.ref, revision: 7 }));
  await before.run(guidedReq("form-A", { action: "interpret", sessionRef: a.ref, revision: a.revision }, { message: "dois quartos" }), async () => proposalJson);
  assert.equal(before.control.transports, 0); assert.equal(stored(before, a.ref).interpretation, "available");

  const fixture = guidedPropertyFixture();
  const b = await openSession(fixture, "form-B");
  const release = gate<string>(), dispatched = gate<void>();
  const inflight = fixture.run(guidedReq("form-B", { action: "interpret", sessionRef: b.ref, revision: b.revision }, { message: "dois quartos" }),
    async () => { dispatched.resolve(); return release.promise; });
  await dispatched.promise;
  const cancelled = (await fixture.run(guidedReq(null, { action: "cancel", sessionRef: b.ref, revision: b.revision }))).propertyCapture;
  assert.equal(cancelled.guided?.status, "cancelled");
  release.resolve(proposalJson);
  const late = (await inflight).propertyCapture;
  assert.equal(fixture.control.transports, 1, "o transporte já autorizado não é recolhido");
  assert.equal(late.proposal ?? null, null);
  const row = stored(fixture, b.ref);
  assert.equal(row.status, "cancelled"); assert.equal(row.pending, null); assert.equal(row.interpretation, "consumed");
});

test("F-03 revisão alterada durante o transporte: sincronização sem mudança preserva a proposta; mudança real a descarta sem nova interpretação", async () => {
  // (a) sincronização sem alteração de dados durante o transporte
  const quiet = guidedPropertyFixture();
  const a = await openSession(quiet, "form-A");
  const release = gate<string>(), dispatched = gate<void>();
  const inflight = quiet.run(guidedReq("form-A", { action: "interpret", sessionRef: a.ref, revision: a.revision }, { message: "dois quartos" }), async () => { dispatched.resolve(); return release.promise; });
  await dispatched.promise;
  const revisionBefore = stored(quiet, a.ref).revision;
  await quiet.run(guidedReq("form-A", { action: "sync", sessionRef: a.ref, revision: revisionBefore }));
  assert.ok(stored(quiet, a.ref).revision > revisionBefore, "a sincronização avançou a revisão");
  release.resolve(proposalJson);
  const kept = (await inflight).propertyCapture;
  assert.equal(kept.outcome, "proposed"); assert.deepEqual(kept.proposal?.changes, { bedrooms: "2" });
  assert.ok(stored(quiet, a.ref).pending, "proposta ainda válida preservada");

  // (b) alteração real do contexto durante o transporte
  const changed = guidedPropertyFixture();
  const b = await openSession(changed, "form-A");
  const release2 = gate<string>(), dispatched2 = gate<void>();
  const inflight2 = changed.run(guidedReq("form-A", { action: "interpret", sessionRef: b.ref, revision: b.revision }, { message: "dois quartos" }), async () => { dispatched2.resolve(); return release2.promise; });
  await dispatched2.promise;
  const rev = stored(changed, b.ref).revision;
  const set = (await changed.run(guidedReq("form-A", { action: "set", sessionRef: b.ref, revision: rev, field: "propertyType", value: "apartamento" }))).propertyCapture;
  assert.deepEqual(set.patch, { propertyType: "apartamento" });
  release2.resolve(proposalJson);
  const discarded = (await inflight2).propertyCapture;
  assert.equal(discarded.outcome, "clarify"); assert.equal(discarded.proposal ?? null, null);
  assert.match(discarded.content, /mudou enquanto a interpretação/); assert.ok(discarded.guided, "estado vigente informado ao cliente");
  const row = stored(changed, b.ref);
  assert.equal(row.pending, null); assert.equal(row.interpretation, "consumed"); assert.equal(row.draft.propertyType, "apartamento", "dado confirmado pelo usuário preservado");
  const second = await changed.run(guidedReq("form-A", { action: "interpret", sessionRef: b.ref, revision: row.revision }, { message: "dois quartos", draft: { propertyType: "apartamento" } }), async () => proposalJson);
  assert.equal(changed.control.transports, 1, "sem segunda interpretação"); assert.equal(second.propertyCapture.guided?.currentField, "goal");
});

test("F-04 save legado sem sessão guiada não usa lock/transação; com sessão aberta continua exigindo a revisão vigente", async () => {
  const fixture = guidedPropertyFixture();
  const create = async () => { created += 1; return { status: "created" as const }; };
  let created = 0;
  const input = { propertyType: "apartamento", city: "Itajaí", address: "Rua Sintética, 100" };
  assert.equal((await withGuidedPropertySave(fixture.prisma, fixture.scope, input, create)).status, "created");
  assert.equal(fixture.control.commits, 0, "nenhuma transação aberta para o caminho legado");
  const a = await openSession(fixture, "form-A");
  const commitsBefore = fixture.control.commits;
  assert.equal((await withGuidedPropertySave(fixture.prisma, fixture.scope, input, create)).status, "guided_invalid");
  assert.equal(created, 1, "sessão aberta bloqueia o contorno pelo caminho legado");
  assert.ok(fixture.control.commits > commitsBefore);
  assert.equal(stored(fixture, a.ref).status, "active");
});

test("F-05 guard 409 com a implementação real: sessão ativa/pausada bloqueia e nomeia a sessão; encerrada e outros escopos não bloqueiam", async () => {
  const fixture = guidedPropertyFixture();
  const route = routeHarness({ prisma: fixture.prisma });
  const startBody = (formId: string) => ({ message: "start", intake: "property_draft", propertyCapture: guidedReq(formId, { action: "start" }) });
  // Sessão de OUTRO escopo (tenant/ator do dublê) não bloqueia o escopo da rota.
  await fixture.run(guidedReq("form-X", { action: "start" }));
  const free = await route.run({ message: "O que falta?", intake: "property_draft", propertyCapture: request("O que falta?") });
  assert.equal(free.statusCode, 200, "isolamento entre escopos");
  const openedResponse = await route.run(startBody("form-A")); assert.equal(openedResponse.statusCode, 200, JSON.stringify(openedResponse.body));
  const opened = openedResponse.body.data.propertyCapture.guided;
  assert.equal(opened.status, "active");
  const providerCallsBefore = route.calls.filter((call) => call.kind === "provider").length;
  for (const body of [{ message: "oi", intake: "property_draft", propertyCapture: request("oi") }, { message: "lote", intake: "property_units" }, { message: "oi" }]) {
    const blocked = await route.run(body);
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.body.error.code, "IMOB_PROPERTY_CAPTURE_ACTIVE");
    assert.deepEqual(blocked.body.error.details, { sessionRef: opened.sessionRef, status: "active" });
  }
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, providerCallsBefore, "o 409 nunca chama LLM");
  // Pausada: ainda bloqueia os intakes de cadastro, mas não outros turnos.
  await route.run({ message: "pause", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "pause", sessionRef: opened.sessionRef, revision: opened.revision }) });
  assert.equal((await route.run({ message: "oi", intake: "property_draft", propertyCapture: request("oi") })).statusCode, 409);
  // Recuperação autorizada pela rota: referência explícita, sem origem, revisão antiga.
  const recovered = await route.run({ message: "cancel", intake: "property_draft", propertyCapture: guidedReq(null, { action: "cancel", sessionRef: opened.sessionRef, revision: 0 }) });
  assert.equal(recovered.statusCode, 200); assert.equal(recovered.body.data.propertyCapture.guided.status, "cancelled");
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, providerCallsBefore, "recuperar não chama LLM");
  assert.equal((await route.run({ message: "O que falta?", intake: "property_draft", propertyCapture: request("O que falta?") })).statusCode, 200, "sessão encerrada não bloqueia");
});


// ── P-04: `claimOnly` é consulta (não escreve a sessão guiada) e não pode ser bloqueado pelo guard 409; os demais bloqueios permanecem ──
test("P-04 claimOnly com sessão guiada aberta chega ao claim (200), sem LLM e sem tocar a sessão; reivindicado e não reivindicado", async () => {
  for (const [label, stage, expected] of [["reivindicado", () => ({ data: { action: "crm.case.transversal.agent_engagement", presentation: { text: "Ainda não." } }, caseContext: null }), true],
    ["não reivindicado", () => null, false]] as const) {
    const fixture = guidedPropertyFixture();
    const route = routeHarness({ prisma: fixture.prisma, claimStage: stage });
    const opened = (await route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "start" }) })).body.data.propertyCapture.guided;
    const before = JSON.stringify([...fixture.events.values()]);
    const response = await route.run({ message: "Isso já contratou o Marketing?", claimOnly: true });
    assert.equal(response.statusCode, 200, `${label}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.claimed, expected, label);
    assert.deepEqual(route.calls.filter((call) => call.kind === "claim").map((call) => call.input.claimOnly), [true], `${label}: o estágio foi chamado em modo claimOnly`);
    assert.equal(route.calls.filter((call) => call.kind === "provider").length, 0, "claim nunca chama LLM");
    assert.equal(JSON.stringify([...fixture.events.values()]), before, `${label}: a sessão guiada não foi lida-para-escrita nem alterada`);
    assert.equal(stored(fixture, opened.sessionRef).status, "active");
  }
});

test("P-04 o guard continua bloqueando o que não é claim; autorização do claim é preservada", async () => {
  const fixture = guidedPropertyFixture();
  const route = routeHarness({ prisma: fixture.prisma, claimStage: () => ({ data: { action: "x", presentation: { text: "x" } }, caseContext: null }) });
  const opened = (await route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "start" }) })).body.data.propertyCapture.guided;
  // Somente `claimOnly === true` (booleano) é consulta; qualquer outro valor segue bloqueado.
  for (const claimOnly of [false, "true", 1, null, undefined]) {
    const blocked = await route.run({ message: "oi", claimOnly, intake: "property_draft", propertyCapture: request("oi") });
    assert.equal(blocked.statusCode, 409, String(claimOnly)); assert.equal(blocked.body.error.code, "IMOB_PROPERTY_CAPTURE_ACTIVE");
    assert.deepEqual(blocked.body.error.details, { sessionRef: opened.sessionRef, status: "active" });
  }
  assert.equal((await route.run({ message: "oi", claimOnly: false })).statusCode, 409, "turno comum sem claim continua bloqueado");
  assert.equal(route.calls.filter((call) => call.kind === "claim").length, 0, "nenhum desses chegou ao estágio de claim");
  // `claimOnly:true` combinado com um intake de cadastro NÃO é claim: esses ramos vêm antes do claim e (sem o guard) chamariam o provider.
  const providerBefore = route.calls.filter((call) => call.kind === "provider").length;
  for (const intake of ["property_draft", "property_units"]) {
    const mixed = await route.run({ message: "oi", claimOnly: true, intake, propertyCapture: request("oi") });
    assert.equal(mixed.statusCode, 409, `claimOnly + ${intake}`); assert.equal(mixed.body.error.code, "IMOB_PROPERTY_CAPTURE_ACTIVE");
  }
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, providerBefore, "nenhum LLM nesses bloqueios");
  assert.equal(route.calls.filter((call) => call.kind === "claim").length, 0);
  // Autenticação/autorização antes do guard e do claim: sem permissão, 403 mesmo com claimOnly e sessão aberta.
  const denied = routeHarness({ prisma: fixture.prisma, permission: false });
  assert.equal((await denied.run({ message: "oi", claimOnly: true })).statusCode, 403);
  assert.equal(denied.calls.filter((call) => call.kind === "claim").length, 0);
});

// ── P-02: início guiado com sessão aberta de OUTRA origem reutiliza o contrato 409 (referência do servidor, escopo autenticado) ──
test("P-02 início guiado com sessão de outra origem: 409 com a referência da sessão aberta; mesma origem retoma; nada é cancelado nem renovado", async () => {
  const fixture = guidedPropertyFixture();
  const route = routeHarness({ prisma: fixture.prisma });
  const start = (formId: string) => route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq(formId, { action: "start" }) });
  const a = (await start("form-A")).body.data.propertyCapture.guided;
  const rowBefore = JSON.stringify(stored(fixture, a.sessionRef));
  const conflict = await start("form-B");
  assert.equal(conflict.statusCode, 409, JSON.stringify(conflict.body));
  assert.equal(conflict.body.error.code, "IMOB_PROPERTY_CAPTURE_ACTIVE");
  assert.deepEqual(conflict.body.error.details, { sessionRef: a.sessionRef, status: "active" });
  assert.equal(fixture.events.size, 1, "nenhuma segunda sessão foi criada");
  assert.equal(JSON.stringify(stored(fixture, a.sessionRef)), rowBefore, "sessão aberta não foi cancelada, renovada nem alterada");
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, 0);
  // Recuperação sem origem (comando sem referência) de outra origem: mesmo conflito.
  const recovery = await route.run({ message: "collect", intake: "property_draft", propertyCapture: guidedReq("form-B", { action: "collect" }) });
  assert.equal(recovery.statusCode, 409); assert.equal(recovery.body.error.details.sessionRef, a.sessionRef);
  // Mesma origem: retomada preservada (200, mesma sessão, sem nova admissão).
  const resumed = await start("form-A");
  assert.equal(resumed.statusCode, 200); assert.equal(resumed.body.data.propertyCapture.guided.sessionRef, a.sessionRef); assert.equal(fixture.events.size, 1);
  // Pausada: o conflito informa o estado pausado.
  await route.run({ message: "pause", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "pause", sessionRef: a.sessionRef, revision: resumed.body.data.propertyCapture.guided.revision }) });
  const paused = await start("form-B"); assert.equal(paused.statusCode, 409); assert.deepEqual(paused.body.error.details, { sessionRef: a.sessionRef, status: "paused" });
  // A referência recebida cancela exatamente essa sessão; um cadastro posterior não é atingido por referência antiga.
  const cancelled = await route.run({ message: "cancel", intake: "property_draft", propertyCapture: guidedReq(null, { action: "cancel", sessionRef: a.sessionRef, revision: 0 }) });
  assert.equal(cancelled.body.data.propertyCapture.guided.status, "cancelled");
  const b = (await start("form-B")).body.data.propertyCapture.guided; assert.notEqual(b.sessionRef, a.sessionRef); assert.equal(b.status, "active");
  const stale = await route.run({ message: "cancel", intake: "property_draft", propertyCapture: guidedReq(null, { action: "cancel", sessionRef: a.sessionRef, revision: 0 }) });
  assert.equal(stale.statusCode, 200); assert.equal(stale.body.data.propertyCapture.guided.sessionRef, a.sessionRef);
  assert.equal(stored(fixture, b.sessionRef).status, "active", "referência antiga não cancela a sessão posterior");
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, 0, "nenhuma interpretação foi consumida");
});

test("P-02 isolamento: sessão de outro escopo não gera conflito nem vaza referência; sem escopo de usuário não há conflito inventado", async () => {
  const fixture = guidedPropertyFixture();
  await fixture.run(guidedReq("form-X", { action: "start" })); // escopo do dublê (outro tenant/ator)
  const route = routeHarness({ prisma: fixture.prisma });
  const own = await route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "start" }) });
  assert.equal(own.statusCode, 200, "sessão de outro escopo não bloqueia"); assert.equal(own.body.data.propertyCapture.guided.status, "active");
  assert.equal(fixture.events.size, 2);
  const conflict = await route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq("form-B", { action: "start" }) });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.error.details.sessionRef, own.body.data.propertyCapture.guided.sessionRef, "a referência é da sessão do próprio escopo");
  assert.ok(!JSON.stringify(conflict.body).includes([...fixture.events.keys()][0]!), "a sessão do outro escopo não aparece");
});

test("P-04 claimOnly carregando payload de captura guiada (sem intake) só chega ao claim: o propertyCapture é ignorado, a sessão e o provider não são tocados", async () => {
  const fixture = guidedPropertyFixture();
  const route = routeHarness({ prisma: fixture.prisma, claimStage: () => null });
  const opened = (await route.run({ message: "start", intake: "property_draft", propertyCapture: guidedReq("form-A", { action: "start" }) })).body.data.propertyCapture.guided;
  const before = JSON.stringify([...fixture.events.values()]);
  for (const guided of [{ action: "cancel", sessionRef: opened.sessionRef, revision: 0 }, { action: "start" }, { action: "interpret", sessionRef: opened.sessionRef, revision: opened.revision }] as const) {
    const response = await route.run({ message: "oi", claimOnly: true, propertyCapture: guidedReq("form-A", guided as any, { message: "oi" }) });
    assert.equal(response.statusCode, 200); assert.equal(response.body.claimed, false);
  }
  assert.equal(JSON.stringify([...fixture.events.values()]), before, "nenhuma ação do payload foi executada");
  assert.equal(route.calls.filter((call) => call.kind === "provider").length, 0);
  assert.deepEqual(route.calls.filter((call) => call.kind === "claim").map((call) => call.input.claimOnly), [true, true, true]);
});
