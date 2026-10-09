import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
import { IMOB_ACTION_MENUS, type ImobActionMenuItem } from "@/features/imob/imobActionMenus";
import { createImobStructuredForms } from "./createImobStructuredForms";
import type { ImobFormState } from "./useImobFormState";
import type { ImobStructuredFormsHost, StructuredMessage } from "./types";
import { createImobFrontDoorForms, FRONT_DOOR_IMOB_THREAD } from "./useImobFrontDoorForms";
import { resolveImobTurn } from "../../../../../api/src/services/imob/imobTurnResolver";
import { resolveImobCrmTurnEngine } from "../../../../../api/src/services/imob/crm/imobCrmTurnEngine";
import { withInlineDocumentFields } from "@/pages/app/imob/documentAttachForm";
import type { apiResolveImobTurn, ImobResolveTurnResponse } from "@/lib/api";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImobFrontDoorPart } from "./ImobFrontDoorPart";
import { getSession, updateSession } from "@/state/sessionStore";
import { detectLauncherRouteIntent, resolveLauncherTurnDecision } from "@/components/agents/chatLauncherEngine";

/** Estado de formulário em memória (sem React), como um chat qualquer manteria. */
function fakeState() {
  let values: Record<string, Record<string, string>> = {};
  let errors: Record<string, Record<string, string>> = {};
  const state = {
    formValuesByMessageId: values,
    setFormValuesByMessageId: (update: unknown) => {
      values = typeof update === "function" ? (update as (prev: typeof values) => typeof values)(values) : (update as typeof values);
    },
    formErrorsByMessageId: errors,
    setFormErrorsByMessageId: (update: unknown) => {
      errors = typeof update === "function" ? (update as (prev: typeof errors) => typeof errors)(errors) : (update as typeof errors);
    },
    formLookupLoadingByMessageId: {},
    imobPropertyOptions: [],
    imobOwnerOptions: [],
    formSubmittingRef: { current: new Set<string>() },
    ownerNameConfirmedRef: { current: {} },
    ownerRecordsRef: { current: [] },
    ownerArchiveConfirmedRef: { current: {} },
    formFilesRef: { current: {} },
    pendingFormPrefillRef: { current: null as { submitTarget: string; values: Record<string, string> } | null },
    contractAfterLeaseRef: { current: null },
    propertyRecordsRef: { current: [] },
    resolveFormFieldOptions: () => [],
    resolveFormValuesForMessage: (message: StructuredMessage) => values[message.id] ?? {},
    updateFormFieldValue: () => undefined,
    applyCepLookupToForm: async () => null,
    prepareIncomingMessage: <M,>(message: M) => message,
  };
  return { state: state as unknown as ImobFormState, getValues: () => values, getErrors: () => errors, raw: state };
}

function fakeHost() {
  const appended: StructuredMessage[] = [];
  const updated: Array<[string, Partial<StructuredMessage>]> = [];
  const sent: Array<[string, string]> = [];
  const host: ImobStructuredFormsHost = {
    activeThreadId: "thread-1",
    appendMessage: (message) => appended.push(message),
    updateMessage: (id, patch) => updated.push([id, patch]),
    patchMessage: () => undefined,
    persistMessage: () => undefined,
    sendText: (text, options) => sent.push([text, options.displayText]),
  };
  return { host, appended, updated, sent };
}

const localItems = IMOB_ACTION_MENUS.flatMap((menu) => menu.items).filter(
  (item): item is Extract<ImobActionMenuItem, { kind: "local" }> => item.kind === "local",
);

test("todo item local dos menus abre um formulário estruturado na thread ativa do chat hospedeiro", () => {
  for (const item of localItems) {
    const { state } = fakeState();
    const { host, appended } = fakeHost();
    createImobStructuredForms(state, host).handleActionMenuSelect(item);
    assert.equal(appended.length, 1, item.id);
    assert.ok(appended[0].form?.submitTarget, `${item.id} sem submitTarget`);
    assert.equal(appended[0].thread?.id, "thread-1", item.id);
  }
});

test("itens de pedido (cadastrar) viram texto para o chat, com o rótulo exibido", () => {
  const { state } = fakeState();
  const { host, sent } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  forms.handleActionMenuSelect({ id: "owner-create", label: "Cadastrar proprietário", kind: "prompt", prompt: "cadastrar proprietário" });
  assert.deepEqual(sent, [["cadastrar proprietário", "Cadastrar proprietário"]]);
});

test("próximo passo prepara o formulário seguinte já ligado ao cadastro", () => {
  const { state, raw } = fakeState();
  const { host, sent } = fakeHost();
  createImobStructuredForms(state, host).startPropertyCreateFor("owner-9");
  assert.deepEqual(raw.pendingFormPrefillRef.current, { submitTarget: "imob.properties.create", values: { ownerId: "owner-9" } });
  assert.deepEqual(sent, [["cadastrar imóvel", "Cadastrar imóvel"]]);
});

test("formulário que não é do IMOB estruturado fica com o chat; cancelar um estruturado fecha sem gravar", async () => {
  const { state } = fakeState();
  const { host, appended, updated } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  const generic: StructuredMessage = {
    id: "m1",
    role: "assistant",
    text: "",
    form: { label: "Formulário genérico", entity: "anuncio", action: "publish", fields: [], actions: [] },
  };
  assert.equal(await forms.handleStructuredFormAction(generic, "submit"), false);

  forms.openRentalLifecycleForm("rental_history");
  const history = appended[0];
  assert.equal(await forms.handleStructuredFormAction(history, "cancel"), true);
  assert.deepEqual(updated, [[history.id, { form: undefined }]]);
  assert.equal(appended.at(-1)?.text, "Histórico fechado.");
});

test("enviar sem escolher o imóvel mostra o erro no campo, sem chamar a API", async () => {
  const { state, getErrors } = fakeState();
  const { host, appended } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  forms.openRentalLifecycleForm("rental_history");
  assert.equal(await forms.handleStructuredFormAction(appended[0], "submit"), true);
  assert.deepEqual(getErrors()[appended[0].id], { propertyId: "Selecione o imóvel." });
});

const access = { tenantId: "tenant-test", workspaceId: "workspace-test", entitlements: { REAL_ESTATE_CORE: true } };
const caseContext = { caseId: "case-proposal", threadId: "thread-server", flow: "proposal.create", stage: "proposal_collecting", status: "pending_data" };
function proposalTurn() {
  return { ...resolveImobTurn({ message: "Quero gerar uma proposta comercial para um cliente.", access }), caseContext } as unknown as ImobResolveTurnResponse;
}

function frontDoorHarness(resolve: typeof apiResolveImobTurn = async () => ({ ok: true, data: proposalTurn() }), conversationGenerationRef = { current: 0 }, prepareForms = false) {
  const { state, raw, getValues, getErrors } = fakeState();
  if (prepareForms) {
    // Executa o callback real do hook, com setters em memória, sem copiar a regra de prefill.
    const source = ts.createSourceFile("useImobFormState.ts", readFileSync(new URL("./useImobFormState.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    let callback: ts.Expression | undefined;
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === "prepareIncomingMessage") {
        callback = (node.initializer as ts.CallExpression).arguments[0];
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(callback);
    raw.prepareIncomingMessage = new Function("pendingFormPrefillRef", "setFormValuesByMessageId", "withInlineDocumentFields",
      ts.transpileModule(`return (${callback.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    )(raw.pendingFormPrefillRef, raw.setFormValuesByMessageId, withInlineDocumentFields);
  }
  let messages: StructuredMessage[] = [];
  const calls: Parameters<typeof apiResolveImobTurn>[0][] = [];
  const echoed: string[] = [];
  const adapter = createImobFrontDoorForms({
    imobForms: state, getMessages: () => messages,
    getConversationGeneration: () => conversationGenerationRef.current,
    appendStructured: (message) => { messages.push(raw.prepareIncomingMessage(message)); },
    patchStructured: (id, update) => { messages = messages.map((message) => message.id === id ? update(message) : message); },
    echoUser: (text) => echoed.push(text),
    resolveTurn: async (request) => { calls.push(JSON.parse(JSON.stringify(request))); return resolve(request); },
  });
  function fill(message: StructuredMessage, values: Record<string, string> = {}) {
    raw.setFormValuesByMessageId((previous: Record<string, Record<string, string>>) => ({
      ...previous, [message.id]: { propertyId: "4455", offerAmount: "100000", buyerName: "Maria", buyerPhone: "47999998888", contractType: "venda", ...values },
    }));
  }
  return { ...adapter, imobForms: state, messages: () => messages, calls, echoed, fill, getValues, getErrors, raw,
    setMessages: (next: StructuredMessage[]) => { messages = next; }, conversationGenerationRef };
}

test("paridade Front Door: proprietário → imóvel → locação → contrato preenchido, sem criar run", async (t) => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: {
    ...resolveImobTurn({ ...request, threadState: request.threadState as never, access }),
  } as unknown as ImobResolveTurnResponse }), { current: 0 }, true);
  let owner: Record<string, unknown> = {};
  let property: Record<string, unknown> = {};
  let rental: Record<string, unknown> = {};
  const requests: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ path, method, body });
    let data: unknown;
    if (path === "/imob/owners" && method === "GET") data = { items: [] };
    else if (path === "/imob/owners" && method === "POST") data = owner = { ...body, id: "owner-parity" };
    else if (path === "/imob/properties" && method === "GET") data = { items: [] };
    else if (path === "/imob/properties" && method === "POST") data = property = { ...body, id: "property-parity", owner };
    else if (path === "/imob/rentals" && method === "POST") {
      rental = body;
      data = { propertyId: body.propertyId, caseId: "lease-parity", propertyLabel: "Kit Paridade", tenantName: body.tenantName, pendingItems: [], tenantDocumentMasked: null };
    } else if (path === "/imob/contracts/rental/prefill" && method === "GET") {
      assert.equal(url.searchParams.get("propertyId"), property.id);
      data = {
        propertyId: property.id, leaseCaseId: "lease-parity", landlordName: owner.name, landlordDocument: owner.document,
        tenantName: rental.tenantName, tenantDocument: rental.tenantDocument, propertyAddress: property.address,
        purpose: "residencial", registryNumber: null, startDate: rental.startDate, durationMonths: 12,
        rentCents: rental.rentCents, dueDay: rental.dueDay, adjustmentIndex: null, adjustmentMonth: null,
        guaranteeType: null, guaranteeAmountCents: null, guarantorName: null, iptu: null, condominio: null,
        condominioAmountCents: null, forumCity: property.city, gaps: [],
      };
    } else throw new Error(`requisição indevida: ${method} ${path}`);
    return new Response(JSON.stringify({ ok: true, data }), { status: method === "POST" ? 201 : 200 });
  });
  const fill = (message: StructuredMessage, values: Record<string, string>) => harness.raw.setFormValuesByMessageId(
    (previous: Record<string, Record<string, string>>) => ({ ...previous, [message.id]: { ...previous[message.id], ...values } }),
  );
  const nextForm = () => harness.messages().at(-1)!;
  const follow = async (id: string) => {
    const reply = nextForm().quickReplies?.find((item) => item.id === id);
    assert.ok(reply?.onSelect, id);
    reply.onSelect();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  await harness.forwardToImob("cadastrar proprietário");
  const ownerForm = nextForm();
  assert.equal(ownerForm.form?.submitTarget, "imob.owners.create");
  fill(ownerForm, { ownerName: "Dona Paridade" });
  await harness.structuredForms.handleStructuredFormAction(ownerForm, "submit");
  assert.match(nextForm().text, /Proprietário cadastrado: Dona Paridade/);
  assert.equal(harness.messages().find((message) => message.id === ownerForm.id)?.form, undefined);

  await follow("next-property");
  const propertyForm = nextForm();
  assert.equal(propertyForm.form?.submitTarget, "imob.properties.create");
  assert.equal(harness.getValues()[propertyForm.id].ownerId, owner.id);
  fill(propertyForm, { propertyType: "kitnet", goal: "locacao", unitLabel: "Kit Paridade", city: "Cidade Paridade", address: "Rua Paridade, 10" });
  await harness.structuredForms.handleStructuredFormAction(propertyForm, "submit");
  assert.match(nextForm().text, /Imóvel cadastrado: Kit Paridade/);
  assert.equal(property.ownerId, owner.id);

  await follow("next-rental-contract");
  const leaseForm = nextForm();
  assert.equal(leaseForm.form?.submitTarget, "imob.rentals.create", "depois do imóvel, deve abrir locação, não repetir captação");
  assert.equal(harness.calls.at(-1)?.threadState?.operational, null);
  assert.equal(harness.getValues()[leaseForm.id].propertyId, property.id);
  fill(leaseForm, { tenantName: "Inquilino Paridade", startDate: "01/04/2025", endDate: "31/03/2026", rent: "900,00", dueDay: "10" });
  await harness.structuredForms.handleStructuredFormAction(leaseForm, "submit");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const contract = nextForm();
  assert.equal(contract.form?.submitTarget, "imob.contracts.rental");
  assert.equal(contract.thread?.id, leaseForm.thread?.id);
  assert.equal(harness.getConversationState()?.operational, null);
  assert.equal(harness.messages().find((message) => message.id === leaseForm.id)?.form, undefined);
  assert.deepEqual(Object.fromEntries(["propertyId", "landlordName", "tenantName", "propertyAddress", "startDate", "rentValue", "dueDay"].map((key) => [key, harness.getValues()[contract.id][key]])), {
    propertyId: "property-parity", landlordName: "Dona Paridade", tenantName: "Inquilino Paridade", propertyAddress: "Rua Paridade, 10", startDate: "01/04/2025", rentValue: "900,00", dueDay: "10",
  });
  const html = renderToStaticMarkup(React.createElement(ImobFrontDoorPart, { message: contract, frontDoor: harness, isLast: true }));
  assert.match(html, /Gerar minuta/);
  assert.match(html, /value="Dona Paridade"/);
  assert.match(html, /value="Inquilino Paridade"/);
  assert.equal(harness.calls.length, 3, "contrato aberto pelo handler compartilhado sem novo resolve-turn");
  assert.deepEqual(requests.filter((request) => request.method === "POST").map((request) => request.path), ["/imob/owners", "/imob/properties", "/imob/rentals"]);
  assert.equal(requests.filter((request) => request.path === "/imob/contracts/rental/prefill").length, 1);
  assert.equal(requests.filter((request) => request.path === "/runs").length, 0);
});

test("falha ao salvar cadastro mantém coleta, form e valores no Front Door", async (t) => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: resolveImobTurn({ ...request, threadState: request.threadState as never, access }) as unknown as ImobResolveTurnResponse }));
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { code: "UNAVAILABLE" } }), { status: 503 }));
  await harness.forwardToImob("cadastrar proprietário");
  const message = harness.messages()[0];
  harness.fill(message, { ownerName: "Dona Paridade" });
  await harness.structuredForms.handleStructuredFormAction(message, "submit");
  assert.deepEqual(harness.getConversationState(), message.conversationState);
  assert.ok(harness.messages()[0].form);
  assert.equal(harness.getValues()[message.id].ownerName, "Dona Paridade");
  assert.match(harness.getErrors()[message.id]._form, /Não foi possível salvar/);
});

test("encerrar cadastro antigo não limpa estado de outra thread no Front Door", async () => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: resolveImobTurn({ ...request, threadState: request.threadState as never, access }) as unknown as ImobResolveTurnResponse }));
  await harness.forwardToImob("cadastrar proprietário");
  const old = harness.messages()[0];
  const other: StructuredMessage = { ...old, id: "other-thread-context", thread: { id: "other-thread", label: "Outra conversa" }, conversationState: proposalTurn().conversationState };
  harness.setMessages([old, other]);
  await harness.structuredForms.handleStructuredFormAction(old, "cancel");
  assert.equal(harness.messages()[0].form, undefined);
  assert.deepEqual(harness.getConversationState(), other.conversationState);
});

test("regressão: Gerar proposta → sim oferece o segundo turno ao IMOB antes de help/preview/self-service", async () => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: {
    ...resolveImobTurn({ ...request, threadState: request.threadState as never, access }), caseContext,
  } as unknown as ImobResolveTurnResponse }));
  await harness.forwardToImob("Gerar proposta");
  const initial = harness.messages().at(-1)!;
  assert.equal(initial.conversationState?.operational?.status, "collecting");
  const decision = await resolveLauncherTurnDecision({
    input: "sim", trimmedInput: "sim", routeIntent: detectLauncherRouteIntent("sim", false),
    proposalMode: false, isUnifiedEiah: true, eiahMode: "help", agentProfile: null,
    catalogAgents: [], intentUnknown: true, confidence: 0,
    accessContext: { ...access, activeDomain: "imob" },
    imobOperationalContinuation: {
      threadState: initial.conversationState, available: true,
      consume: harness.consumeOperationalTurn,
    },
  });
  assert.equal(decision?.turnConsumed, true);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls[1].message, "continuar proposta", "coleta não usa o canal de confirmação de action");
  assert.equal(harness.messages().at(-1)?.conversationState?.operational?.flow, "proposal.create");
  assert.equal(harness.messages().at(-1)?.conversationState?.operational?.status, "collecting");
  assert.doesNotMatch(decision?.content ?? "", /Preview|self-service|rodar agora/i);
  const messages = harness.messages();
  const next = messages.at(-1)!;
  assert.equal(messages.length, 2, "um assistant por resolve-turn");
  assert.equal(messages[0].text, initial.text, "coleta inicial permanece no histórico");
  assert.match(initial.text, /Ainda preciso de:/);
  assert.equal(messages.filter((message) => message.text === initial.text).length, 1);
  assert.equal(next.text, "", "na continuação, o formulário apresenta a coleta sem repetir sua lista em texto");
  assert.equal(messages.filter((message) => message.form).length, 1);
  assert.deepEqual(next.form, initial.form, "campos, tipos, valores e ações preservados");
  assert.deepEqual(next.conversationState?.operational?.proposalDraft, initial.conversationState?.operational?.proposalDraft);
  const html = renderToStaticMarkup(React.createElement(ImobFrontDoorPart, { message: next, frontDoor: harness, isLast: true }));
  assert.equal(html.split(next.form!.label!).length - 1, 1);
  assert.ok(html.includes(next.form!.description!));
  assert.doesNotMatch(html, /Ainda preciso de:|Preview|self-service/);
  for (const field of next.form!.fields) assert.ok(html.includes(field.label));
  assert.match(html, /Cancelar/);
  assert.match(html, /Continuar proposta/);
});

test("presentation sem texto continua renderizando o formulário com rótulo e descrição", async () => {
  const turn = proposalTurn();
  turn.presentation.text = "";
  const harness = frontDoorHarness(async () => ({ ok: true, data: turn }));
  assert.equal(await harness.forwardToImob("Gerar proposta"), true);
  assert.equal(harness.messages().length, 1);
  const message = harness.messages()[0];
  const html = renderToStaticMarkup(React.createElement(ImobFrontDoorPart, { message, frontDoor: harness, isLast: true }));
  assert.ok(html.includes(turn.presentation.form!.label!));
  assert.ok(html.includes(turn.presentation.form!.description!));
  assert.match(html, /Continuar proposta/);
});

test("composição de coleta não suprime bloqueio, resposta sem form ou form sem introdução", async () => {
  for (const outcome of ["blocked", "no-form", "no-introduction"]) {
    const next = proposalTurn();
    next.presentation.text = "Resposta informativa do servidor.";
    if (outcome === "blocked") next.mode = "blocked";
    if (outcome === "no-form") next.presentation.form = undefined;
    if (outcome === "no-introduction") {
      next.presentation.form!.label = "";
      next.presentation.form!.description = "";
    }
    let count = 0;
    const harness = frontDoorHarness(async () => ({ ok: true, data: ++count === 1 ? proposalTurn() : next }));
    await harness.forwardToImob("Gerar proposta");
    await sendFrontDoorTurn(harness, "sim");
    assert.equal(harness.messages().at(-1)!.text, next.presentation.text, outcome);
    assert.equal(harness.messages().length, 2);
  }
});

test("nova coleta depois de proposta pronta preserva presentation.text junto do formulário", async () => {
  const ready = proposalTurn();
  ready.conversationState.operational!.status = "ready_for_review";
  ready.presentation.form = undefined;
  let count = 0;
  const harness = frontDoorHarness(async () => ({ ok: true, data: ++count === 1 ? ready : proposalTurn() }));
  await harness.forwardToImob("Gerar proposta");
  await harness.forwardToImob("Gerar proposta");
  assert.equal(harness.messages().length, 2);
  assert.equal(harness.messages().at(-1)!.text, proposalTurn().presentation.text);
  assert.deepEqual(harness.messages().at(-1)!.form, proposalTurn().presentation.form);
});

function sendFrontDoorTurn(harness: ReturnType<typeof frontDoorHarness>, input: string, options: {
  activeDomain?: "core" | "imob"; available?: boolean; selectedAgent?: string;
} = {}) {
  return resolveLauncherTurnDecision({
    input, trimmedInput: input, routeIntent: detectLauncherRouteIntent(input, false),
    proposalMode: false, isUnifiedEiah: !options.selectedAgent, eiahMode: "help",
    agentProfile: options.selectedAgent ? { id: options.selectedAgent, name: options.selectedAgent } as never : null,
    catalogAgents: [], intentUnknown: true, confidence: 0,
    accessContext: { ...access, activeDomain: options.activeDomain ?? "imob" },
    imobOperationalContinuation: { threadState: harness.getConversationState(), available: options.available ?? true,
      consume: harness.consumeOperationalTurn },
  });
}

test("coleta textual no Front Door preserva draft, campos curtos, caso e thread até revisão, sem executar run", async () => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: {
    ...resolveImobTurn({ ...request, threadState: request.threadState as never, access }), caseContext,
  } as unknown as ImobResolveTurnResponse }));
  await harness.forwardToImob("Gerar proposta");
  for (const [input, expected] of [
    ["sim", {}], ["Carlos", { buyerName: "Carlos" }],
    ["47999999999", { buyerName: "Carlos", buyerPhone: "47999999999" }],
    ["4455", { propertyId: "4455", buyerName: "Carlos", buyerPhone: "47999999999" }],
    ["100000", { propertyId: "4455", offerAmount: 100000, buyerName: "Carlos", buyerPhone: "47999999999" }],
  ] as const) {
    const previous = harness.getConversationState();
    const decision = await sendFrontDoorTurn(harness, input);
    assert.equal(decision?.turnConsumed, true, input);
    assert.equal(decision?.shouldCreateRun, false, input);
    assert.equal(decision?.verticalHandoffRequest, undefined);
    assert.equal(harness.calls.at(-1)?.message, input === "sim" ? "continuar proposta" : input);
    assert.deepEqual(harness.calls.at(-1)?.threadState, previous);
    assert.equal(harness.calls.at(-1)?.threadId, caseContext.threadId);
    assert.equal(harness.calls.at(-1)?.caseId, caseContext.caseId);
    const next = harness.messages().at(-1)!;
    assert.equal(next.conversationState?.operational?.flow, "proposal.create");
    assert.equal(next.thread?.id, caseContext.threadId);
    assert.deepEqual(next.caseContext, caseContext);
    for (const [key, value] of Object.entries(expected)) assert.equal(
      next.conversationState?.operational?.proposalDraft?.[key as keyof typeof expected], value, `${input}/${key}`);
    assert.doesNotMatch(next.text, /Preview|self-service|rodar agora/i);
  }
  assert.equal(harness.getConversationState()?.operational?.status, "ready_for_review");
  assert.deepEqual(harness.getConversationState()?.operational?.pendingFields, []);
  assert.equal(harness.calls.length, 6);
  assert.ok(harness.messages().every((message) => !message.form), "respostas aceitas fecham formulários anteriores, inclusive ao concluir coleta");
  assert.equal(harness.echoed.length, 0, "o launcher faz o único echo dos turnos de texto");
  await sendFrontDoorTurn(harness, "sim");
  assert.equal(harness.calls.length, 6, "coleta concluída não aprisiona os turnos seguintes");
});

test("Front Door → engine CRM real: sim continua coleta sem passar pelo gate de confirmação de action", async () => {
  const harness = frontDoorHarness(async (request) => {
    const result = await resolveImobCrmTurnEngine({
      prisma: {} as never, authContext: { tenantId: access.tenantId, workspaceId: access.workspaceId, userId: "user-test" },
      body: request, entitlements: access.entitlements, workspaceResponsibleLabel: "Corretor",
      helpers: {
        asString: (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null,
        hydrateThreadStateWithPersistedLead: async ({ threadState }: { threadState: unknown }) => threadState,
        resolveImobOperationalUpdate: async () => null,
        resolveImobOperationalConsult: async () => null,
        applyCanonicalJourneyToResolvedData: (data: unknown) => data,
        applyExistingRegistrationResolution: async ({ resolved }: { resolved: unknown }) => resolved,
        injectResolvedPendingSuggestion: (resolved: unknown) => resolved,
        upsertImobCaseFromResolvedTurn: async () => caseContext,
        normalizeImobRouteText: (value: string) => value.toLowerCase(),
        formatImobCaseFlowLabel: (flow: string) => flow,
      } as never,
    });
    return { ok: true, data: result as unknown as ImobResolveTurnResponse };
  });
  await harness.forwardToImob("Gerar proposta");
  const draft = harness.getConversationState()?.operational?.proposalDraft;
  const decision = await sendFrontDoorTurn(harness, "sim");
  assert.equal(decision?.turnConsumed, true);
  assert.equal(harness.calls[1].message, "continuar proposta");
  assert.equal(harness.calls[1].threadId, caseContext.threadId);
  assert.equal(harness.calls[1].caseId, caseContext.caseId);
  assert.equal(harness.getConversationState()?.operational?.status, "collecting");
  assert.deepEqual(harness.getConversationState()?.operational?.proposalDraft, draft);
  assert.ok(harness.messages().at(-1)?.form);
  assert.equal(harness.messages().length, 2);
  assert.equal(harness.messages().filter((message) => message.form).length, 1);
  assert.equal(harness.messages().at(-1)?.text, "", "engine CRM real: form e descrição são a resposta de coleta na continuação");
  assert.doesNotMatch(harness.messages().at(-1)?.text ?? "", /ação pendente|Preview|self-service/i);
  for (const input of ["Carlos", "47999999999", "4455", "100000"]) {
    assert.equal((await sendFrontDoorTurn(harness, input))?.turnConsumed, true);
    assert.equal(harness.calls.at(-1)?.threadId, caseContext.threadId);
    assert.equal(harness.calls.at(-1)?.caseId, caseContext.caseId);
  }
  assert.equal(harness.getConversationState()?.operational?.status, "ready_for_review");
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.buyerName, "Carlos");
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.buyerPhone, "47999999999");
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.propertyId, "4455");
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.offerAmount, 100000);
});

for (const input of ["como criar um run?", "quero falar sobre billing", "voltar para core"]) {
  test(`assunto explícito libera coleta: ${input}`, async () => {
    const harness = frontDoorHarness();
    await harness.forwardToImob("Gerar proposta");
    const previous = harness.messages()[0];
    const decision = await sendFrontDoorTurn(harness, input);
    assert.notEqual(decision?.turnConsumed, true);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.getConversationState()?.operational, null);
    assert.equal(harness.messages()[0].form, undefined);
    assert.equal(harness.messages()[0].conversationState, previous.conversationState, "histórico preservado");
    await sendFrontDoorTurn(harness, "sim");
    assert.equal(harness.calls.length, 1, "a coleta antiga não volta depois do novo assunto");
  });
}

for (const input of ["cancelar proposta", "cancelar", "não quero continuar"]) {
  test(`cancelamento textual reutiliza fechamento local sem chamar a API: ${input}`, async () => {
    const harness = frontDoorHarness();
    await harness.forwardToImob("Gerar proposta");
    const initial = harness.messages()[0];
    harness.fill(initial);
    const decision = await sendFrontDoorTurn(harness, input);
    assert.equal(decision?.turnConsumed, true);
    assert.equal(decision?.shouldCreateRun, false);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.getConversationState()?.operational, null);
    assert.equal(harness.messages()[0].form, undefined);
    assert.match(harness.messages().at(-1)!.text, /Nada foi gravado/);
    await harness.structuredForms.handleStructuredFormAction(initial, "submit");
    await sendFrontDoorTurn(harness, "sim");
    assert.equal(harness.calls.length, 1, "nem callback antigo nem texto posterior submete");
  });
}

test("domínio core ou disponibilidade não confirmada não consome continuidade histórica", async () => {
  for (const options of [{ activeDomain: "core" as const }, { available: false }]) {
    const harness = frontDoorHarness();
    await harness.forwardToImob("Gerar proposta");
    const decision = await sendFrontDoorTurn(harness, "sim", options);
    assert.notEqual(decision?.turnConsumed, true);
    assert.equal(harness.calls.length, 1);
  }
  const harness = frontDoorHarness();
  await harness.forwardToImob("Gerar proposta");
  for (const input of ["cancelar proposta", "como criar um run?"]) {
    const decision = await sendFrontDoorTurn(harness, input, { activeDomain: "core" });
    assert.notEqual(decision?.turnConsumed, true);
    assert.equal(harness.getConversationState()?.operational?.status, "collecting", "estado histórico não participa do turno core");
  }
});

test("seleção de especialista não altera continuidade da vertical ativa", async () => {
  const harness = frontDoorHarness();
  await harness.forwardToImob("Gerar proposta");
  const decision = await sendFrontDoorTurn(harness, "Carlos", { selectedAgent: "J_360" });
  assert.equal(decision?.turnConsumed, true);
  assert.equal(harness.calls.at(-1)?.message, "Carlos");
});

test("continuidade textual funciona quando backend não entrega form; erro mantém coleta sem fallback genérico", async () => {
  let count = 0;
  const harness = frontDoorHarness(async () => {
    if (++count > 1) throw new Error("falha controlada");
    const turn = proposalTurn();
    delete turn.presentation.form;
    return { ok: true, data: turn };
  });
  await harness.forwardToImob("Gerar proposta");
  const previous = harness.getConversationState();
  assert.equal(harness.messages()[0].form, undefined);
  const decision = await sendFrontDoorTurn(harness, "sim");
  assert.equal(decision?.turnConsumed, true);
  assert.deepEqual(harness.getConversationState(), previous);
  assert.equal(harness.calls.length, 2);
  assert.doesNotMatch(decision?.content ?? "", /Preview|self-service|rodar agora/i);
});

test("resposta tardia após cancelamento não reabre coleta e envio duplicado não repete query", async () => {
  let complete!: (response: Awaited<ReturnType<typeof apiResolveImobTurn>>) => void;
  let count = 0;
  const harness = frontDoorHarness(async () => ++count === 1 ? { ok: true, data: proposalTurn() }
    : new Promise((resolve) => { complete = resolve; }));
  await harness.forwardToImob("Gerar proposta");
  const pending = sendFrontDoorTurn(harness, "sim");
  await sendFrontDoorTurn(harness, "sim");
  assert.equal(harness.calls.length, 2);
  await sendFrontDoorTurn(harness, "cancelar proposta");
  complete({ ok: true, data: proposalTurn() });
  await pending;
  assert.equal(harness.getConversationState()?.operational, null);
  assert.equal(harness.messages().at(-1)?.form, undefined);
});

test("Negócios → Gerar proposta usa o dispatcher existente e abre proposal.create no Front Door vazio", async () => {
  const harness = frontDoorHarness();
  const item = IMOB_ACTION_MENUS.find((menu) => menu.id === "deals")!.items.find((entry) => entry.id === "deal-proposal")!;
  harness.structuredForms.handleActionMenuSelect(item);
  // O menu é fire-and-forget; deixa sua resposta imediata terminar antes das assertions.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].message, "Quero gerar uma proposta comercial para um cliente.");
  assert.equal(harness.messages()[0].form?.entity, "proposta");
  assert.equal(harness.messages()[0].form?.submitTarget, undefined);
  assert.equal(harness.messages()[0].conversationState?.operational?.flow, "proposal.create");
  assert.deepEqual(harness.echoed, ["Gerar proposta"]);
});

test("Front Door preserva e renderiza proposal.create sem submitTarget, texto e contexto do servidor", async () => {
  const harness = frontDoorHarness();
  await harness.forwardToImob("gerar proposta", { displayText: "Gerar proposta" });
  assert.equal(harness.calls[0].threadId, FRONT_DOOR_IMOB_THREAD.id);
  const message = harness.messages()[0];
  assert.deepEqual(message.form, proposalTurn().presentation.form);
  assert.equal(message.form?.submitTarget, undefined);
  assert.equal(message.text, proposalTurn().presentation.text);
  assert.deepEqual(message.conversationState, proposalTurn().conversationState);
  assert.deepEqual(message.caseContext, caseContext);
  assert.equal(message.thread?.id, caseContext.threadId);
  const html = renderToStaticMarkup(React.createElement(ImobFrontDoorPart, { message, frontDoor: harness, isLast: true }));
  assert.match(html, /Imóvel da proposta/);
  assert.match(html, /name="offerAmount"|Valor ofertado|Valor da proposta/);
  assert.match(html, /Continuar proposta/);
  assert.doesNotMatch(html, /Para este pedido, use a barra/);
});

test("Front Door mantém o dispatcher de form com submitTarget", async () => {
  const turn = proposalTurn();
  turn.presentation.form = { entity: "proprietario", action: "create", label: "Cadastro", submitTarget: "imob.owners.create", fields: [] };
  const harness = frontDoorHarness(async () => ({ ok: true, data: turn }));
  await harness.forwardToImob("cadastrar proprietário");
  const message = harness.messages()[0];
  assert.deepEqual(message.form, turn.presentation.form);
  assert.equal(await harness.structuredForms.handleStructuredFormAction(message, "cancel"), true);
  assert.equal(harness.messages()[0].form, undefined);
  assert.match(harness.messages().at(-1)!.text, /Nada foi gravado/);
  assert.equal(harness.calls.length, 1);
});

test("form desconhecido sem submitTarget mantém apresentação informativa sem inventar submissão", async () => {
  const turn = proposalTurn();
  turn.presentation.form = { entity: "desconhecido", action: "create", label: "Sem suporte", fields: [] };
  const harness = frontDoorHarness(async () => ({ ok: true, data: turn }));
  assert.equal(await harness.forwardToImob("pedido desconhecido"), false);
  const message = harness.messages()[0];
  assert.equal(message.form, undefined);
  assert.ok(message.text.startsWith(turn.presentation.text));
  assert.match(message.text, /Nenhum envio foi efetuado/);
  assert.equal(await harness.structuredForms.handleStructuredFormAction(message, "submit"), false);
  assert.equal(harness.calls.length, 1);
});

for (const [propertyId, amount, expected] of [["4455", "100000", 100000], ["98765", "450000", 450000], ["imovel-AB12", "R$ 100.000,75", 100000.75], ["4455", "100000.50", 100000.5]] as const) {
  test(`Front Door → builder compartilhado → resolver mantém ${propertyId}/${amount} e continuidade`, async () => {
    const harness = frontDoorHarness(async (request) => ({ ok: true, data: {
      ...resolveImobTurn({ ...request, threadState: request.threadState as never, access }), caseContext,
    } as unknown as ImobResolveTurnResponse }));
    await harness.forwardToImob("Quero gerar uma proposta comercial para um cliente.");
    const message = harness.messages()[0];
    harness.fill(message, { propertyId, offerAmount: amount });
    await harness.structuredForms.handleStructuredFormAction(message, "submit");
    assert.equal(harness.calls.length, 2);
    const request = harness.calls[1];
    assert.equal(request.threadId, caseContext.threadId);
    assert.equal(request.caseId, caseContext.caseId);
    assert.equal(request.threadState?.operational?.proposalDraft?.propertyId, propertyId);
    assert.equal(request.threadState?.operational?.proposalDraft?.offerAmount, expected);
    assert.doesNotMatch(request.message, /\d/);
    const next = harness.messages().at(-1)!;
    assert.equal(next.conversationState?.operational?.proposalDraft?.propertyId, propertyId);
    assert.equal(next.conversationState?.operational?.proposalDraft?.offerAmount, expected);
    assert.equal(next.conversationState?.operational?.status, "ready_for_review");
    assert.equal(harness.messages()[0].form, undefined);
    assert.equal(next.thread?.id, caseContext.threadId);
    assert.equal(next.caseContext?.caseId, caseContext.caseId);
    assert.deepEqual(harness.echoed, []);
    await harness.forwardToImob("consultar proposta");
    assert.deepEqual(harness.calls[2].threadState, next.conversationState);
    assert.equal(harness.calls[2].threadId, caseContext.threadId);
    assert.equal(harness.calls[2].caseId, caseContext.caseId);
  });
}

test("cancelamento fecha e limpa erros sem chamar resolver, preservando valores e contexto", async () => {
  const harness = frontDoorHarness();
  await harness.forwardToImob("gerar proposta");
  const message = harness.messages()[0];
  harness.fill(message);
  harness.raw.setFormErrorsByMessageId({ [message.id]: { offerAmount: "erro anterior" } });
  await harness.structuredForms.handleStructuredFormAction(message, "cancel");
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.messages()[0].form, undefined);
  assert.deepEqual(harness.getErrors()[message.id], {});
  assert.equal(harness.getValues()[message.id].propertyId, "4455");
  assert.deepEqual(harness.messages()[0].conversationState, message.conversationState);
  assert.deepEqual(harness.messages()[0].caseContext, message.caseContext);
  assert.equal(harness.getConversationState()?.operational, null, "fechar formulário também encerra continuidade futura");
  assert.match(harness.messages().at(-1)!.text, /Nada foi gravado/);
  await harness.structuredForms.handleStructuredFormAction(message, "submit");
  assert.equal(harness.calls.length, 1, "callback antigo de formulário fechado não submete");
});

for (const values of [{ propertyId: "" }, { offerAmount: "" }, { offerAmount: "inválido" }, { offerAmount: "-100" }] as Record<string, string>[]) {
  test(`campos ausentes/inválidos no Front Door bloqueiam envio: ${JSON.stringify(values)}`, async () => {
    const harness = frontDoorHarness();
    await harness.forwardToImob("gerar proposta");
    const message = harness.messages()[0];
    harness.fill(message, values);
    await harness.structuredForms.handleStructuredFormAction(message, "submit");
    assert.equal(harness.calls.length, 1);
    assert.ok(Object.keys(harness.getErrors()[message.id]).length);
    assert.ok(harness.messages()[0].form);
  });
}

test("sem conversationState, proposal.create não submete", async () => {
  const turn = proposalTurn();
  delete (turn as Partial<ImobResolveTurnResponse>).conversationState;
  const harness = frontDoorHarness(async () => ({ ok: true, data: turn }));
  await harness.forwardToImob("gerar proposta");
  const message = harness.messages()[0];
  harness.fill(message);
  await harness.structuredForms.handleStructuredFormAction(message, "submit");
  assert.equal(harness.calls.length, 1);
  assert.match(harness.getErrors()[message.id]._form, /contexto/);
});

test("thread sintética continua consistente quando resposta não contém caseContext", async () => {
  const turn = proposalTurn();
  turn.caseContext = null;
  const harness = frontDoorHarness(async () => ({ ok: true, data: turn }));
  await harness.forwardToImob("gerar proposta");
  const message = harness.messages()[0];
  harness.fill(message);
  await harness.structuredForms.handleStructuredFormAction(message, "submit");
  assert.equal(harness.calls[1].threadId, FRONT_DOOR_IMOB_THREAD.id);
  assert.equal(harness.calls[1].caseId, null);
});

test("erro HTTP ou bloqueio do engine não fecha formulário nem perde campos; duplo submit envia uma vez", async () => {
  for (const outcome of ["http", "blocked", "allow"]) {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    let count = 0;
    const harness = frontDoorHarness(async () => {
      if (++count === 1) return { ok: true, data: proposalTurn() };
      await gate;
      if (outcome === "http") throw new Error("HTTP 403");
      return { ok: true, data: { ...proposalTurn(), mode: outcome === "blocked" ? "blocked" : "execute" } };
    });
    await harness.forwardToImob("gerar proposta");
    const message = harness.messages()[0];
    harness.fill(message);
    const pending = harness.structuredForms.handleStructuredFormAction(message, "submit");
    await harness.structuredForms.handleStructuredFormAction(message, "submit");
    assert.equal(harness.calls.length, 2);
    finish();
    await pending;
    assert.equal(Boolean(harness.messages()[0].form), outcome !== "allow");
    assert.equal(harness.getValues()[message.id].offerAmount, "100000");
    assert.equal(harness.raw.formSubmittingRef.current.size, 0);
  }
});


// Callbacks canônicos do launcher: inclui reset, chave e hidratação reais, sem rede/SSE.
const launcherAst = ts.createSourceFile("ChatAgentLauncher.tsx", readFileSync(new URL("../../../components/agents/ChatAgentLauncher.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function launcherCallback(name: "threadKey" | "handleNewConversation" | "hydrate" | "persist") {
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(launcherAst) === name) {
      callback = name === "threadKey" ? (node.initializer as ts.CallExpression).arguments[0] : node.initializer;
    }
    if (name === "hydrate" && ts.isCallExpression(node) && node.expression.getText(launcherAst) === "useEffect"
        && node.arguments[0]?.getText(launcherAst).includes("window.sessionStorage.getItem(threadKey)")) callback = node.arguments[0];
    if (name === "persist" && ts.isCallExpression(node) && node.expression.getText(launcherAst) === "useEffect"
        && node.arguments[0]?.getText(launcherAst).includes("window.sessionStorage.setItem(threadKey")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(launcherAst);
  assert.ok(callback, name);
  return new Function("environment", `with (environment) { ${ts.transpileModule(`return (${callback.getText(launcherAst)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText} }`);
}
function launcherEnvironment(harness: ReturnType<typeof frontDoorHarness>, storage = new Map<string, string>()) {
  const env: Record<string, unknown> = {
    session: { ...access, activeDomain: "imob" }, effectiveWorkspaceId: access.workspaceId,
    activeAgentId: "EIAH", historyScope: "conversation", FALLBACK_AGENT: { id: "EIAH" }, launcherContext: undefined,
    skipHistoryPersistRef: { current: false }, runId: null, messages: [],
    conversationGenerationRef: harness.conversationGenerationRef, setMessages: harness.setMessages,
    threadKey: "", baseLedger: () => [],
    window: { sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } },
  };
  for (const key of ["stopStreaming", "setRunId", "onRunIdChange", "setLedger", "onLedgerChange", "setEvidenceEvent", "setCopyToast", "setLastRouteIntent", "clearAttachmentComposer", "setAttachmentDocumentType", "setAttachmentAnalysisMode"]) env[key] = () => undefined;
  for (const key of ["seenEventsRef", "lastEventIdRef", "runSummaryLoadedRef", "runPromptRef", "runIntentRef", "runPresentationRef", "runGuardrailRef"]) env[key] = { current: null };
  return env;
}

for (const requestNumber of [1, 2, 3]) {
  test(`Nova conversa descarta resposta IMOB pendente da solicitação ${requestNumber}, sem reabrir form`, async () => {
    let complete!: (response: Awaited<ReturnType<typeof apiResolveImobTurn>>) => void;
    let count = 0;
    const harness = frontDoorHarness(async () => ++count < requestNumber ? { ok: true, data: proposalTurn() }
      : new Promise((resolve) => { complete = resolve; }));
    for (let i = 1; i < requestNumber; i++) await harness.forwardToImob("Gerar proposta");
    const pending = harness.forwardToImob("Gerar proposta");
    launcherCallback("handleNewConversation")(launcherEnvironment(harness))();
    complete({ ok: true, data: proposalTurn() });
    assert.equal(await pending, false);
    assert.deepEqual(harness.messages(), []);
    assert.equal(harness.getConversationState(), null);
    const current = harness.forwardToImob("Gerar proposta");
    complete({ ok: true, data: proposalTurn() });
    assert.equal(await current, true, "resposta da conversa atual continua entrando");
    assert.equal(harness.messages().length, 1);
    assert.ok(harness.messages()[0].form);
  });
}

test("erro IMOB tardio após Nova conversa também não escreve na conversa nova", async () => {
  let fail!: (error: Error) => void;
  const harness = frontDoorHarness(() => new Promise((_, reject) => { fail = reject; }));
  const pending = harness.forwardToImob("Gerar proposta");
  launcherCallback("handleNewConversation")(launcherEnvironment(harness))();
  fail(new Error("synthetic late error"));
  assert.equal(await pending, false);
  assert.deepEqual(harness.messages(), []);
});

test("troca real de agente e hidratação mantêm draft na conversa Front Door, sem compartilhar outro workspace", async () => {
  const harness = frontDoorHarness(async (request) => ({ ok: true, data: {
    ...resolveImobTurn({ ...request, threadState: request.threadState as never, access }), caseContext,
  } as unknown as ImobResolveTurnResponse }));
  await harness.forwardToImob("Gerar proposta");
  await sendFrontDoorTurn(harness, "Carlos");
  const draft = harness.getConversationState()?.operational?.proposalDraft;
  const storage = new Map<string, string>();
  const env = launcherEnvironment(harness, storage);
  const key = launcherCallback("threadKey")(env)();
  env.threadKey = key;
  env.messages = harness.messages();
  launcherCallback("persist")(env)();
  // Mesmo callback do AgentSelect no Front Door: onChange={setAgentId}.
  const page = ts.createSourceFile("index.tsx", readFileSync(new URL("../../../pages/app/agents/index.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let onChange: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(page) === "onChange" && ts.isJsxExpression(node.initializer!)
        && node.initializer.expression?.getText(page) === "setAgentId") onChange = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(page); assert.ok(onChange);
  const select = new Function("setAgentId", `return (${onChange.getText(page)});`)((id: string) => { env.activeAgentId = id; });
  for (const agent of ["J_360", "EIAH"]) {
    select(agent);
    env.threadKey = launcherCallback("threadKey")(env)();
    assert.equal(env.threadKey, key, "agente sem histórico próprio mantém identidade da conversa");
    launcherCallback("hydrate")(env)();
    assert.equal(harness.getConversationState()?.operational?.status, "collecting");
    assert.deepEqual(harness.getConversationState()?.operational?.proposalDraft, draft);
    assert.equal((env.session as typeof access & { activeDomain: string }).activeDomain, "imob");
  }
  await sendFrontDoorTurn(harness, "47999999999", { selectedAgent: "J_360" });
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.buyerName, "Carlos");
  assert.equal(harness.getConversationState()?.operational?.proposalDraft?.buyerPhone, "47999999999");
  env.messages = harness.messages(); // renderização anterior, antes de aplicar setMessages da hidratação.
  env.effectiveWorkspaceId = "workspace-other";
  env.threadKey = launcherCallback("threadKey")(env)();
  launcherCallback("hydrate")(env)();
  assert.deepEqual(harness.messages(), []);
  assert.equal(harness.getConversationState(), null, "proposta não migra de workspace");
  launcherCallback("persist")(env)();
  assert.equal(storage.has(env.threadKey as string), false, "persistência não grava mensagens antigas na chave nova");
  env.historyScope = "agent";
  env.activeAgentId = "EIAH";
  const agentKey = launcherCallback("threadKey")(env)();
  env.activeAgentId = "J_360";
  assert.notEqual(launcherCallback("threadKey")(env)(), agentKey, "uso explicitamente agent-scoped preservado");
});


test("geração de Nova conversa protege também cadastro IMOB, sem regra específica de proposta", async () => {
  let complete!: (response: Awaited<ReturnType<typeof apiResolveImobTurn>>) => void;
  const harness = frontDoorHarness(() => new Promise((resolve) => { complete = resolve; }));
  const pending = harness.forwardToImob("cadastrar proprietário");
  launcherCallback("handleNewConversation")(launcherEnvironment(harness))();
  complete({ ok: true, data: resolveImobTurn({ message: "cadastrar proprietário", access }) as unknown as ImobResolveTurnResponse });
  assert.equal(await pending, false);
  assert.deepEqual(harness.messages(), []);
});

test("resposta IMOB não escreve após troca de workspace, mesmo antes de renderizar a chave nova", async () => {
  const initial = getSession();
  let complete!: (response: Awaited<ReturnType<typeof apiResolveImobTurn>>) => void;
  const harness = frontDoorHarness(() => new Promise((resolve) => { complete = resolve; }));
  const pending = harness.forwardToImob("Gerar proposta");
  updateSession({ workspaceId: "workspace-other" });
  complete({ ok: true, data: proposalTurn() });
  try {
    assert.equal(await pending, false);
    assert.deepEqual(harness.messages(), []);
  } finally { updateSession(initial); }
});
