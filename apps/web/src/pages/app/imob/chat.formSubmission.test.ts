import test from "node:test";
import assert from "node:assert/strict";
import type { ImobPresentationForm, ImobThreadConversationState } from "@/lib/api";
import { buildPresentationFormSubmission, buildPersistedImobChatMessageMetadata, mapStoredMessageToChat, buildImobFrontdoorStatePresentation } from "./chat";
import { ApiError } from "@/lib/api";
import { isRentalLeaseForm } from "./rentalLeaseForm";
import { isPropertyCreateForm } from "./propertyCreateForm";
import { isOwnerCreateForm } from "./ownerCreateForm";
import { shouldUseDirectedActionFlow } from "@/features/imob/imobChatDirectedAction";
import { buildProposalTextContinuation, hasPendingProposalReview, hasProposalReviewCarrier, buildProposalFormContinuation } from "./proposalForm";
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
const wireBody = new Function("associatedReview", "buildProposalTextContinuation", "requestContextRef", "currentThreadState", "reviewPending", "latestQuestionRef", "text", "currentThreadId", "currentThreadLabel", "resolvedCaseId", "options", "conversationStateByThreadRef", "requestedRecipeId", "actionIdConsumedRef", "requestedActionId",
  `return (${resolveRequest.getText(source)});`);
const buildWireBody = (...args: any[]) => wireBody(false, buildProposalTextContinuation, "v1:dedicated-interaction", args[4]?.threadState ?? args[5]?.current[args[1]], null, null, ...args);

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

import { proposalDraftRef } from "../../../../../api/src/services/imob/crm/imobProposalReviewContinuity";
import { resolveImobTurn as dedicatedApi } from "@/features/imob/imobApiClient";
import { parseImobPendingAction, buildImobExecuteResolutionFromPendingAction } from "../../../../../api/src/services/imob/crm/imobPendingActionRuntime";
import { recordImobResolveTurnSemanticTelemetry } from "../../../../../api/src/services/imob/imobTelemetry";

function dedicatedResolveTurnRoute() {
  const routeSource = ts.createSourceFile("imob.ts", readFileSync(new URL("../../../../../api/src/routes/imob.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let callback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(routeSource) === "imobRouter.post"
      && node.arguments[0]?.getText(routeSource) === '"/chat/resolve-turn"') callback = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(routeSource);
  assert.ok(callback);
  const code = ts.transpileModule(`return (${callback.getText(routeSource)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("env", `with(env) { ${code} }`);
}

function dedicatedReviewHarness() {
  let sender: ts.Expression | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "sendMessageText") sender = node.initializer;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(sender);
  const code = ts.transpileModule(`return (${sender.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const messages: any[] = [];
  const bodies: any[] = [];
  const operationalHelpers: string[] = [];
  const stateRef: any = { current: {} };
  const caseIds: any = { current: {} };
  const origin = { current: { ref: "v1:dedicated-interaction", sequence: 0 } };
  const auth = { ...access, userId: "dedicated-user" };
  let canonical: any = null;
  let canonicalDraft: any = null;
  let draftRef: string | null = null;
  const helpers: any = {
    asString: (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null,
    hydrateThreadStateWithPersistedLead: async ({ threadState }: any) => { operationalHelpers.push("hydrate"); return threadState; },
    resolveImobOperationalUpdate: async () => { operationalHelpers.push("update"); return null; },
    resolveImobOperationalConsult: async () => { operationalHelpers.push("consult"); return null; },
    applyCanonicalJourneyToResolvedData: (data: any) => data,
    applyExistingRegistrationResolution: async ({ resolved }: any) => { operationalHelpers.push("registration"); return resolved; },
    injectResolvedPendingSuggestion: (data: any) => data,
    upsertImobCaseFromResolvedTurn: async () => { operationalHelpers.push("upsert"); return {
      caseId: "case-test", threadId: "thread-test", flow: "proposal.create", stage: "ready_for_review", status: "ready_for_review",
      blockers: ["Aprovação necessária"], pendingItems: ["Revisão humana"] }; },
    normalizeImobRouteText: (value: string) => value.toLowerCase(), formatImobCaseFlowLabel: (value: string) => value,
  };
  const forbidden = () => assert.fail("review must not execute, negotiate or change an interview/approval");
  const env: any = {
    selectedThreadId: null, threads: [], activeThread: { id: "thread-test", label: "Proposta" }, messages,
    latestAssistantMessageRef: { get current() { return [...messages].reverse().find((message) => message.role === "assistant") ?? null; } },
    ApiError, buildImobFrontdoorStatePresentation,
    resolveImobFrontdoorErrorStateKind: (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status) ? "entitlement" : "error",
    isRentalLeaseForm, isPropertyCreateForm, isOwnerCreateForm, shouldUseDirectedActionFlow,
    canonicalPendingAction: null,
    useRoute: false,
    shouldEchoImobUserMessage: () => true, makeId: (prefix: string) => `${prefix}-${messages.length}`,
    appendMessage: (message: any) => messages.push(message), setInput: () => undefined, setState: () => undefined,
    requestedCaseId: "case-test", requestedRecipeId: null, requestedActionId: null,
    actionIdConsumedRef: { current: false }, caseIdByThreadRef: caseIds, conversationStateByThreadRef: stateRef,
    caseContextByThreadRef: { current: {} }, reviewOriginRef: origin, buildProposalTextContinuation, hasPendingProposalReview, hasProposalReviewCarrier,
    resolveImobTurn: async (body: any) => {
      bodies.push(JSON.parse(JSON.stringify(body)));
      // Same canonical carrier injected by the route, including the no-client-state case.
      const canonicalPendingAction = env.canonicalPendingAction;
      const engineBody = canonicalPendingAction ? { ...body, canonicalPendingAction,
        threadState: { ...(body.threadState ?? {}), operational: { ...(body.threadState?.operational ?? {}), pendingAction: canonicalPendingAction } } } : body;
      let result: any;
      if (env.useRoute) {
        const prisma = { imobCase: { findFirst: async (query: any) => {
          assert.deepEqual(query.where, { id: "case-test", tenantId: auth.tenantId, workspaceId: auth.workspaceId });
          assert.deepEqual(query.select.events.where, { tenantId: auth.tenantId, workspaceId: auth.workspaceId });
          return { ...canonical, id: canonical.caseId, metadata: { pendingAction: canonicalPendingAction },
            events: [{ payload: { flow: "proposal.create", operationalStatus: "ready_for_review", proposalDraft: canonicalDraft } }] };
        } } };
        const routeEnv = { ...helpers, asObject: (value: any) => value && typeof value === "object" && !Array.isArray(value) ? value : null,
          parseImobPendingAction, proposalDraftRef, resolveImobCrmTurnEngine, recordImobResolveTurnSemanticTelemetry,
          readImobWorkspaceAccessProfile: async () => ({ permissions: ["imob.chat.use", "imob.stage.*"], responsibleLabel: "Corretor" }),
          ensureImobWorkspacePermission: () => true, ensureImobStagePermission: () => true,
          resolveImobEntitlements: async () => access.entitlements, resolveImobTenantRecipeForWorkspace: async () => null,
          resolveImobRecipeMissionContext: () => null, IMOB_CHAT_AGENT_ID: "IMOB_CRM",
          imobCrmBusinessRead: { applyCanonicalJourneyToResolvedData: helpers.applyCanonicalJourneyToResolvedData } };
        const res: any = { json: (value: any) => { result = value.data; return res; }, status: () => res };
        await dedicatedResolveTurnRoute()(routeEnv)({ authContext: auth, prisma, body }, res);
      } else result = await resolveImobCrmTurnEngine({ prisma: {}, authContext: auth, body: engineBody,
        reviewCase: canonical, reviewDraftRef: draftRef, helpers, workspaceResponsibleLabel: "Corretor", entitlements: access.entitlements });
      if (result.mode === "execute") { canonical = result.caseContext; canonicalDraft = result.conversationState.operational.proposalDraft; draftRef = proposalDraftRef(canonicalDraft); }
      return result;
    },
    emitChatRouteTelemetry: () => undefined, searchParams: new URLSearchParams(), getSession: () => ({ ...auth }), session: auth, activeVerticalId: "imob",
    setAttachmentMenuOpen: () => undefined, isOpenAttachmentMenuAction: () => false,
    conversationId: "conversation-test", persistMessage: async () => undefined, updateMessageById: () => undefined,
    // A pre-existing interview must not capture a review reply and apply edits.
    contractInterviewState: { status: "review" }, singleEditFieldId: "amount", persistInterviewState: forbidden,
    setContractInterviewState: forbidden, applySingleFieldEditAnswer: forbidden,
    resolveTurnPresentationProof: () => undefined, buildPresentationBlocks: () => undefined,
    mapPresentationWidget: () => undefined, mapApiPresentationForm: (value: any) => value,
    mapReplyCardFromPresentation: (presentation: any) => presentation.card,
    apiCreateImobChatTelemetry: async () => undefined, buildJourneyTelemetryMetadata: () => ({}), setActiveThread: () => undefined,
    startPlanExecution: forbidden, prepareDirectedActionExecution: forbidden,
    apiAgentsExecute: forbidden, apiAgentsNegotiate: forbidden, apiAgentsDiscovery: forbidden,
  };
  const send: (text: string, options?: any) => Promise<void> = new Function("env", `with (env) { ${code} }`)(env);
  const built = buildProposalFormContinuation(form(), { propertyId: "4455", offerAmount: "100000", buyerName: "Maria", buyerPhone: "47999998888", contractType: "venda" }, initialState());
  assert.ok(built.ok);
  return { send, env, messages, bodies, stateRef, origin, operationalHelpers,
    ready: () => send(built.request.message, { thread: { id: "thread-test", label: "Proposta" }, threadState: built.request.threadState }) };
}

for (const answer of ["Sim", "Não", "Cancelar proposta"]) {
  test(`FDC-03A-R1 dedicated actual sender: emitted review → presentation → ${answer} → validation, zero execution`, async () => {
    const h = dedicatedReviewHarness();
    await h.ready();
    const question = h.messages.at(-1);
    assert.match(question.text, /dados apresentados estão corretos/);
    assert.match(question.card.lines.join("\n"), /100\.000,00/);
    assert.ok(hasPendingProposalReview(question.conversationState));
    const pending = question.conversationState.operational.continuity.pending;
    const original = structuredClone(question.conversationState.operational.proposalDraft);
    const before = [...h.operationalHelpers];
    await h.send(answer);
    assert.equal(h.bodies.at(-1).message, answer);
    assert.equal(h.bodies.at(-1).continuityReplyRef, pending.ref);
    assert.equal(h.bodies.at(-1).continuityContextRef, pending.contextRef);
    assert.deepEqual(h.operationalHelpers, before);
    assert.deepEqual(h.stateRef.current["thread-test"].operational.proposalDraft, original);
    if (answer === "Não") {
      assert.equal(h.stateRef.current["thread-test"].operational.continuity.phase, "clarification");
      await h.send("O valor precisa ser 90000");
      assert.match(h.messages.at(-1).text, /Nenhum dado foi alterado.*Gerar proposta/);
      assert.deepEqual(h.operationalHelpers, before);
    }
    if (answer === "Não") {
      assert.ok(h.stateRef.current["thread-test"].operational.continuity.pending);
      assert.match(h.messages.at(-1).text, /Continuar revisão da proposta.*Mudar de assunto/);
    } else assert.equal(h.stateRef.current["thread-test"].operational.continuity.pending, null);
    assert.deepEqual(h.messages.at(-1).caseContext.blockers, ["Aprovação necessária"]);
  });
}

for (const scenario of ["history_remount", "another_conversation", "another_vertical", "another_assistant"]) {
  test(`FDC-03A-R1 dedicated stale ${scenario} fails closed`, async () => {
    const h = dedicatedReviewHarness();
    await h.ready();
    const before = [...h.operationalHelpers];
    if (scenario === "another_assistant") h.messages.push({ id: "billing", role: "assistant", text: "Ver fatura?" });
    else h.origin.current.ref = `v1:${scenario}`;
    await h.send("Sim");
    assert.match(h.messages.at(-1).text, /Não há uma pergunta/);
    assert.deepEqual(h.operationalHelpers, before);
    assert.equal(h.stateRef.current["thread-test"].operational.continuity, null);
  });
}

test("FDC-03A-R1 dedicated delayed response cannot replace a switched conversation", async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  let finish!: (result: any) => void;
  const response = structuredClone(h.messages.at(-1).conversationState);
  h.env.resolveImobTurn = () => new Promise((resolve) => { finish = resolve; });
  const pending = h.send("Sim");
  h.origin.current.ref = "v1:next-conversation";
  const snapshot = structuredClone(h.messages);
  finish({ mode: "consult", action: "crm.proposal.review", conversationState: response, presentation: { text: "late" } });
  await pending;
  assert.deepEqual(h.messages, snapshot);
});

test("FDC-03A-R1 dedicated transport preserves correlation over HTTP; legacy fields remain optional", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const received: any[] = [];
  globalThis.fetch = (async (_url, init) => {
    received.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, data: { mode: "consult", presentation: { text: "ok" } } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await dedicatedApi({ message: "Sim", continuityReplyRef: "q:test", continuityContextRef: "v1:live" });
  await dedicatedApi({ message: "consulta legada" });
  assert.deepEqual(received[0], { message: "Sim", continuityReplyRef: "q:test", continuityContextRef: "v1:live" });
  assert.deepEqual(received[1], { message: "consulta legada" });
});

test("FDC-03A-R1 dedicated concurrent replies present latest only and neither authorizes execution", async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  const before = [...h.operationalHelpers];
  const resolver = h.env.resolveImobTurn;
  const complete: Array<() => void> = [];
  h.env.resolveImobTurn = async (body: any) => {
    const result = await resolver(body);
    return new Promise((resolve) => { complete.push(() => resolve(result)); });
  };
  const first = h.send("Sim");
  const second = h.send("Não");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(complete.length, 2);
  complete[1]();
  await second;
  const snapshot = structuredClone(h.messages);
  complete[0]();
  await first;
  assert.deepEqual(h.messages, snapshot);
  assert.equal(h.stateRef.current["thread-test"].operational.continuity.phase, "clarification");
  assert.deepEqual(h.operationalHelpers, before);
});

for (const change of ["tenantId", "workspaceId", "userId", "token", "activeDomain"]) {
  test(`FDC-03A-R1 dedicated response after session ${change} switch is discarded before render`, async () => {
    const h = dedicatedReviewHarness();
    await h.ready();
    let finish!: (value: any) => void;
    h.env.resolveImobTurn = () => new Promise((resolve) => { finish = resolve; });
    let live = { ...h.env.session };
    h.env.getSession = () => live;
    const pending = h.send("Sim");
    live = { ...live, [change]: "changed" };
    const snapshot = structuredClone(h.messages);
    finish({ mode: "consult", action: "crm.proposal.review", presentation: { text: "late" } });
    await pending;
    assert.deepEqual(h.messages, snapshot);
  });
}

for (const answer of ["Sim", "ok", "confirmo", "pode executar", "Não"]) {
  test(`FDC-03A-R3 actual persisted review → restored history → ${answer} never confirms canonical action`, async () => {
    const h = dedicatedReviewHarness();
    await h.ready();
    const question = h.messages.at(-1);
    const stored: any = { id: "stored-review", role: "assistant", content: question.text, action: "realestate.create_contract",
      threadId: "thread-test", threadLabel: "Proposta", metadata: buildPersistedImobChatMessageMetadata(question) };
    const metadataText = JSON.stringify(stored.metadata);
    assert.doesNotMatch(metadataText, /Maria|47999998888|q:/, "persist only identification, never draft or question credentials");
    const restored = mapStoredMessageToChat(JSON.parse(JSON.stringify(stored)));
    h.messages.length = 0;
    h.messages.push(restored);
    h.stateRef.current = {};
    h.origin.current.ref = "v1:restored-history";
    h.env.contractInterviewState = null;
    const pendingAction = { actionId: "proposal.create", sourceActionId: "proposal.create", caseId: "case-test", threadId: "thread-test",
      reasonCode: "PENDING_ITEMS_PRESENT", status: "awaiting_confirmation", createdAt: "2026-10-09T00:00:00Z", expiresAt: null,
      entityType: "proposal", journey: "proposal", source: "command-center" };
    h.env.canonicalPendingAction = pendingAction;
    h.env.useRoute = true;
    const before = [...h.operationalHelpers];
    assert.doesNotMatch(restored.text, /estão corretos\?/);
    assert.match(restored.text, /Reabra.*proposta/);
    await h.send(answer);
    assert.ok(Object.hasOwn(h.bodies.at(-1), "continuityReplyRef"));
    assert.equal(h.bodies.at(-1).continuityReplyRef, null);
    assert.match(h.messages.at(-1).text, /Não há uma pergunta/);
    assert.deepEqual(h.operationalHelpers, before);
    assert.equal(h.stateRef.current["thread-test"].operational.pendingAction.status, "awaiting_confirmation");
    assert.deepEqual(h.env.canonicalPendingAction, pendingAction);
  });
}

test("FDC-03A-R3 legacy review action and malformed stored marker restore only a tombstone", () => {
  for (const metadata of [{}, { operationalContinuity: { version: "v9", pending: { ref: "untrusted" } } }]) {
    const restored = mapStoredMessageToChat({ id: "old", role: "assistant", action: "crm.proposal.review", content: "Old question",
      metadata, threadId: "thread-test", threadLabel: "Proposta" } as any);
    assert.equal(restored.conversationState?.operational?.continuity, null);
    assert.equal(hasPendingProposalReview(restored.conversationState), false);
  }
  const legacy = mapStoredMessageToChat({ id: "action", role: "assistant", action: "crm.action.confirm", content: "Confirme esta ação", metadata: {} } as any);
  assert.equal(legacy.conversationState, undefined);
});

for (const replacement of ["another_assistant", "same_message_new_question", "same_message_invalidated_question"]) {
test(`FDC-03A-R3 dedicated ${replacement} during request cannot resurrect review or change state maps`, async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  const resolver = h.env.resolveImobTurn;
  let complete!: () => void;
  h.env.resolveImobTurn = async (body: any) => {
    const result = await resolver(body);
    return new Promise((resolve) => { complete = () => resolve(result); });
  };
  const request = h.send("Não");
  await new Promise((resolve) => setImmediate(resolve));
  if (replacement === "another_assistant") {
    h.messages.push({ id: "replacement", role: "assistant", text: "Qual o proprietário?", form: { submitTarget: "imob.owners.create" } });
  } else {
    const question = [...h.messages].reverse().find((message) => message.role === "assistant");
    question.conversationState = structuredClone(question.conversationState);
    question.conversationState.operational.continuity.pending = replacement === "same_message_new_question"
      ? { ...question.conversationState.operational.continuity.pending, ref: "replacement-question" } : null;
  }
  const messages = structuredClone(h.messages);
  const states = structuredClone(h.stateRef.current);
  complete();
  await request;
  assert.deepEqual(h.messages, messages);
  assert.deepEqual(h.stateRef.current, states);
});
}

test("FDC-03A-R3 dedicated transport failure → safe retry preserves reference, draft and blockers", async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  const question = h.messages.at(-1);
  const resolver = h.env.resolveImobTurn;
  const before = [...h.operationalHelpers];
  h.env.resolveImobTurn = async () => { throw new Error("transport unavailable"); };
  await h.send("Sim");
  assert.equal(h.messages.at(-1).conversationState?.operational?.continuity?.pending?.ref, question.conversationState.operational.continuity.pending.ref);
  assert.match(h.messages.at(-1).text, /preservado.*tente novamente/);
  h.env.resolveImobTurn = resolver;
  await h.send("Sim");
  assert.match(h.messages.at(-1).text, /confirmou os dados/);
  assert.deepEqual(h.operationalHelpers, before);
  assert.deepEqual(h.stateRef.current["thread-test"].operational.proposalDraft, question.conversationState.operational.proposalDraft);
  assert.deepEqual(h.messages.at(-1).caseContext.blockers, ["Aprovação necessária"]);
});

test("FDC-03A-R3 a separate explicit action presentation remains confirmable without a review carrier", async () => {
  const h = dedicatedReviewHarness();
  const pendingAction = { actionId: "proposal.create", sourceActionId: "proposal.create", caseId: "case-test", threadId: "thread-test",
    status: "awaiting_confirmation", createdAt: "2026-10-09T00:00:00Z", expiresAt: null, entityType: "proposal", journey: "proposal", source: "command-center" };
  const action = buildImobExecuteResolutionFromPendingAction({ pendingAction: pendingAction as any })!;
  h.env.canonicalPendingAction = pendingAction;
  h.env.contractInterviewState = null;
  h.stateRef.current["thread-test"] = action.conversationState;
  h.messages.push({ id: "explicit-action", role: "assistant", text: "Confirme a ação proposal.create deste caso", conversationState: action.conversationState });
  const requests: any[] = [];
  h.env.startPlanExecution = async (request: any) => { requests.push(request); };
  await h.send("Sim");
  assert.equal(Object.hasOwn(h.bodies.at(-1), "continuityReplyRef"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input.actionId, "proposal.create");
  assert.equal(h.stateRef.current["thread-test"].operational.pendingAction.status, "confirmed");
});

test("FDC mínimo: sender dedicado preserva dúvida e correção até uma escolha explícita, sem execução", async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  await h.send("Não");
  const state = structuredClone(h.stateRef.current["thread-test"]);
  const before = [...h.operationalHelpers];
  for (const input of ["Mude para COMEX", "Quero revisar o prazo de pagamento da proposta", "O valor precisa ser 90000"]) {
    await h.send(input);
    assert.match(h.messages.at(-1).text, /Continuar revisão da proposta.*Mudar de assunto/);
    assert.deepEqual(h.stateRef.current["thread-test"].operational, state.operational);
    assert.deepEqual(h.operationalHelpers, before);
  }
  await h.send("Continuar revisão da proposta");
  assert.notEqual(h.stateRef.current["thread-test"].operational.continuity.pending.ref, state.operational.continuity.pending.ref);
  assert.equal(h.stateRef.current["thread-test"].operational.continuity.phase, "review");
  await h.send("Sim");
  assert.match(h.messages.at(-1).text, /confirmou os dados/);
  assert.equal(h.stateRef.current["thread-test"].operational.continuity.pending, null);
  assert.deepEqual(h.stateRef.current["thread-test"].operational.proposalDraft, state.operational.proposalDraft);
  assert.deepEqual(h.operationalHelpers, before);
});

test("FDC mínimo: mudar de assunto não autoriza action e permite novo pedido independente no chat dedicado", async () => {
  const h = dedicatedReviewHarness();
  await h.ready();
  const before = [...h.operationalHelpers];
  await h.send("Mudar de assunto");
  assert.equal(h.stateRef.current["thread-test"].operational.continuity.pending, null);
  assert.deepEqual(h.operationalHelpers, before);
  await h.send("Sim");
  assert.match(h.messages.at(-1).text, /Não há uma pergunta/);
  assert.deepEqual(h.operationalHelpers, before);
  const next = dedicatedReviewHarness();
  await next.ready();
  const previousRef = next.stateRef.current["thread-test"].operational.continuity.pending.ref;
  await next.send("Mudar de assunto");
  await next.send("Criar proposta");
  assert.ok(hasPendingProposalReview(next.stateRef.current["thread-test"]));
  assert.notEqual(next.stateRef.current["thread-test"].operational.continuity.pending.ref, previousRef);
  assert.match(next.messages.at(-1).text, /dados apresentados estão corretos/);
});
