import test from "node:test";
import assert from "node:assert/strict";
import type { ImobPresentationForm, ImobThreadConversationState } from "@/lib/api";
import { buildPresentationFormSubmission } from "./chat";
import { buildProposalFormContinuation } from "./proposalForm";
import { resolveImobTurn } from "../../../../../api/src/services/imob/imobTurnResolver";
import { resolveImobCrmTurnEngine } from "../../../../../api/src/services/imob/crm/imobCrmTurnEngine";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("proposta usa draft estruturado e não serializa campos como texto", () => {
  const form: ImobPresentationForm = {
    entity: "proposta",
    action: "create",
    label: "Proposta",
    description: "Continuar proposta comercial.",
    fields: [
      { name: "propertyId", label: "Imóvel da proposta", type: "text", required: true, value: "4455" },
      { name: "buyerName", label: "Nome do comprador", type: "text", required: true, value: "Maria" },
      { name: "buyerPhone", label: "Telefone do comprador", type: "tel", required: true, value: "47999998888" },
      { name: "buyerEmail", label: "E-mail do comprador", type: "email", value: "maria@gmail.com" },
      { name: "offerAmount", label: "Valor da proposta", type: "text", required: true, value: "100000" },
      { name: "contractType", label: "Tipo de proposta", type: "text", required: true, value: "venda" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Continuar proposta", kind: "primary" },
    ],
  };

  const built = buildProposalFormContinuation(form, {}, initialState());
  assert.ok(built.ok);
  assert.equal(built.request.message, "continuar proposta");
  assert.equal(built.request.threadState.operational.proposalDraft.propertyId, "4455");
  assert.equal(built.request.threadState.operational.proposalDraft.offerAmount, 100000);
  assert.equal(buildPresentationFormSubmission(form, {}), "");
});

const access = { tenantId: "tenant-test", workspaceId: "workspace-test", entitlements: { REAL_ESTATE_CORE: true } };
function initialTurn() {
  return resolveImobTurn({ message: "Quero gerar uma proposta comercial para um cliente.", access });
}
function initialState() { return initialTurn().conversationState as unknown as ImobThreadConversationState; }
function form() { return initialTurn().presentation.form! as ImobPresentationForm; }

const cases = [
  ["4455", "100000", 100000],
  ["98765", "450000", 450000],
  ["imovel-AB12", "450000", 450000],
  ["4455", "R$ 100.000,75", 100000.75],
  ["4455", "100000.50", 100000.5],
  ["4455", "", null],
  ["", "100000", 100000],
  ["", "", null],
] as const;

for (const [propertyId, offerAmount, expectedAmount] of cases) {
  test(`form values → builder → resolver mantém imóvel ${propertyId || "ausente"} e valor ${offerAmount || "ausente"} independentes`, () => {
    const previous = initialState();
    const built = buildProposalFormContinuation(form(), { propertyId, offerAmount }, previous);
    assert.ok(built.ok);
    const wire = JSON.parse(JSON.stringify(built.request));
    assert.doesNotMatch(wire.message, /\d/);
    const next = resolveImobTurn({ ...wire, access });
    const draft = next.conversationState.operational?.proposalDraft;
    assert.equal(draft?.propertyId, propertyId || null);
    assert.equal(draft?.offerAmount, expectedAmount);
    if (propertyId) assert.equal(next.executionRequest?.input.propertyId, propertyId);
    assert.equal(next.executionRequest?.input.offerAmount, expectedAmount);
    assert.equal(previous.operational?.proposalDraft?.propertyId, null, "builder não muta estado anterior");
  });
}

for (const offerAmount of ["inválido", "-10", "0", "Infinity", "100000.001", "900719925474099100"]) {
  test(`valor inválido ${offerAmount} bloqueia construção`, () => {
    const built = buildProposalFormContinuation(form(), { propertyId: "4455", offerAmount }, initialState());
    assert.equal(built.ok, false);
    if (!built.ok) assert.ok(built.errors.offerAmount);
  });
}

test("contexto ausente ou de outro fluxo não produz request de proposta", () => {
  assert.equal(buildProposalFormContinuation(form(), {}, null).ok, false);
  const state = initialState();
  state.operational!.flow = "lead.qualify";
  assert.equal(buildProposalFormContinuation(form(), {}, state).ok, false);
});

for (const [contractType, expected] of [["venda", "sale"], ["locação", "rent"], ["administração", "management"]] as const) {
  test(`continuidade preserva o tipo ${contractType}`, () => {
    const built = buildProposalFormContinuation(form(), { propertyId: "4455", offerAmount: "3500", contractType }, initialState());
    assert.ok(built.ok);
    const next = resolveImobTurn({ ...built.request, threadState: built.request.threadState as never, access });
    assert.equal(next.conversationState.operational?.proposalDraft?.contractType, expected);
  });
}

// Executa o handler real com o estado da página e envio controlados.
const source = ts.createSourceFile("chat.tsx", readFileSync(new URL("./chat.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.FunctionDeclaration | undefined;
let resolveRequest: ts.ObjectLiteralExpression | undefined;
function findHandler(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handlePresentationFormAction") handler = node;
  if (ts.isCallExpression(node) && node.expression.getText(source) === "resolveImobTurn" && ts.isObjectLiteralExpression(node.arguments[0])) resolveRequest = node.arguments[0];
  ts.forEachChild(node, findHandler);
}
findHandler(source);
assert.ok(handler);
assert.ok(resolveRequest);
const compiled = ts.transpileModule(`${handler.getText(source)}\nexports.execute=handlePresentationFormAction;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const buildWireBody = new Function("text", "currentThreadId", "currentThreadLabel", "resolvedCaseId", "options", "conversationStateByThreadRef", "requestedRecipeId", "actionIdConsumedRef", "requestedActionId",
  `return (${resolveRequest.getText(source)});`);

test("submit dedicado envia draft ao CRM engine no mesmo contexto; cancelamento não envia criação", async () => {
  const previous = initialState();
  const message = { id: "form-test", form: form(), thread: { id: "thread-test", label: "Proposta" } };
  const values = { propertyId: "4455", offerAmount: "100000", buyerName: "Maria", buyerPhone: "47999998888", buyerEmail: "maria@gmail.com", contractType: "venda" };
  const sent: Array<{ text: string; options: any }> = [];
  const updates: unknown[] = [];
  const deps = {
    structuredForms: { handleStructuredFormAction: async () => false },
    resolveFormValuesForMessage: () => ({ ...values }),
    setFormValuesByMessageId: () => undefined, setFormErrorsByMessageId: () => undefined,
    normalizeImobFormValue: (value: string) => value.trim(),
    normalizeCepValue: (value: string) => value, resolveFieldAutofillTarget: () => null,
    allowsPartialCreateSave: () => false,
    isLikelyEmail: () => true, isLikelyPhone: () => true,
    isConversationalProposalForm: (candidate: ImobPresentationForm) => candidate.entity === "proposta" && candidate.action === "create" && !candidate.submitTarget,
    buildProposalFormContinuation, buildPresentationFormSubmission,
    buildPresentationFormDisplayText: () => "Continuar proposta",
    conversationStateByThreadRef: { current: { "thread-test": previous } },
    sendMessageText: async (text: string, options: any) => { sent.push({ text, options }); },
    updateMessageById: (...args: unknown[]) => { updates.push(args); },
  };
  const exported = {} as { execute: (message: unknown, action: string) => Promise<void> };
  new Function(...Object.keys(deps), "exports", compiled)(...Object.values(deps), exported);
  await exported.execute(message, "cancel");
  assert.equal(sent.length, 0);
  assert.equal(updates.length, 0);
  await exported.execute(message, "submit");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].options.thread, message.thread);
  assert.equal(sent[0].options.suppressUserEcho, true);
  const body = buildWireBody(sent[0].text, message.thread.id, message.thread.label, "case-test", sent[0].options,
    { current: { "thread-test": previous } }, null, { current: true }, null);
  assert.equal(body.threadId, message.thread.id);
  assert.equal(body.caseId, "case-test");
  assert.deepEqual(body.threadState, sent[0].options.threadState);
  let observedScope: unknown;
  const helpers = {
    asString: (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null,
    hydrateThreadStateWithPersistedLead: async (params: any) => { observedScope = [params.tenantId, params.workspaceId, params.caseId]; return params.threadState; },
    resolveImobOperationalUpdate: async () => null, resolveImobOperationalConsult: async () => null,
    applyCanonicalJourneyToResolvedData: (data: any) => data,
    applyExistingRegistrationResolution: async (params: any) => params.resolved,
    injectResolvedPendingSuggestion: (data: any) => data,
    upsertImobCaseFromResolvedTurn: async () => ({ caseId: "case-test", threadId: message.thread.id }),
    normalizeImobRouteText: (value: string) => value.toLowerCase(), formatImobCaseFlowLabel: (value: string) => value,
  };
  const next = await resolveImobCrmTurnEngine({ prisma: {}, authContext: access, body, workspaceResponsibleLabel: "Corretor", entitlements: access.entitlements, helpers });
  assert.deepEqual(observedScope, [access.tenantId, access.workspaceId, "case-test"]);
  assert.equal(next.conversationState.operational.proposalDraft.propertyId, "4455");
  assert.equal(next.conversationState.operational.proposalDraft.offerAmount, 100000);
  assert.equal(next.executionRequest.input.propertyId, "4455");
  assert.equal(next.executionRequest.input.offerAmount, 100000);
  assert.equal(next.conversationState.operational.status, "ready_for_review");
  assert.deepEqual(updates, [[message.id, { form: undefined, card: null }]]);
});

test("demais formulários legados mantêm a serialização textual", () => {
  assert.equal(buildPresentationFormSubmission({ entity: "imovel", action: "create", label: "Imóvel", fields: [{ name: "city", type: "text", label: "Cidade" }] }, { city: "Itajaí" }), "cidade do imóvel Itajaí");
});

test("tipo de proposta inválido não produz request", () => {
  for (const contractType of ["inválido", "constructor", "__proto__"]) {
    const built = buildProposalFormContinuation(form(), { propertyId: "4455", offerAmount: "100000", contractType }, initialState());
    assert.equal(built.ok, false);
    if (!built.ok) assert.ok(built.errors.contractType);
  }
});

test("campo vazio é mantido ausente mesmo quando o draft anterior possuía dados", () => {
  const previous = initialState();
  previous.operational!.proposalDraft!.propertyId = "imovel-anterior";
  previous.operational!.proposalDraft!.offerAmount = 900000;
  const built = buildProposalFormContinuation(form(), { propertyId: "", offerAmount: "" }, previous);
  assert.ok(built.ok);
  const next = resolveImobTurn({ ...built.request, threadState: built.request.threadState as never, access });
  assert.equal(next.conversationState.operational?.proposalDraft?.propertyId, null);
  assert.equal(next.conversationState.operational?.proposalDraft?.offerAmount, null);
});
