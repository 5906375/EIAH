import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type FrontDoorBillingState, type VerticalAccessNotice } from "@/lib/api";
import {
  asActivatableVertical,
  describeAccessRequestFailure,
  describeAccessRequestResult,
  describeActivationConfirmation,
  describeActivationFailure,
  describeActivationPreview,
  enrichLauncherDecisionWithVerticalActivation,
  resolveVerticalActivationStep,
  type VerticalActivationSnapshot,
} from "./verticalActivationEngine";
import { billingCardRows, enrichLauncherDecisionWithFrontDoorBilling, resolveFrontDoorBillingStep, type FrontDoorBillingSnapshot } from "./frontDoorBillingEngine";
import { describeUnshownNotices } from "./verticalAccessNoticeEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// EIAH-FD-ADR010-M1: os engines compartilhados derivam texto, botões e snapshot da vertical efetivamente resolvida.
// A paridade byte a byte do IMOB com a versão anterior foi verificada à parte (225 comparações); aqui ficam os invariantes da Logística.

const plans: FrontDoorBillingState["plans"] = [
  { code: "solo", label: "Solo", monthlyPriceCents: 49_000, includedUsers: 3, includedRuns: 1_500, includedWorkspaces: 1 },
  { code: "starter", label: "Starter B2B", monthlyPriceCents: 149_000, includedUsers: 10, includedRuns: 5_000, includedWorkspaces: 2 },
];
const planOptions = plans.map(({ code, label, monthlyPriceCents, includedUsers, includedRuns }) => ({ code, label, monthlyPriceCents, includedUsers, includedRuns }));
const billingState = (over: Partial<FrontDoorBillingState> = {}): FrontDoorBillingState => ({
  canManage: true, account: null, accountActive: false, firstPayment: null, paymentMode: "simulated", plans, ...over,
});
const account = { planCode: "starter" as const, planLabel: "Starter B2B", monthlyPriceCents: 149_000, status: "active", currency: "BRL", createdAt: "2026-10-03T12:00:00.000Z" };
const billingApi = (read: FrontDoorBillingState, calls: string[] = []) => ({
  read: async () => ({ ok: true as const, data: read }),
  createAccount: async (body: { planCode: string }) => { calls.push(`create:${body.planCode}`); return { ok: true as const, data: { outcome: "created" as const, account } }; },
  pay: async () => { calls.push("pay"); return { ok: true as const, data: { outcome: "paid" as const, account, payment: { mode: "simulated" as const, paidAt: "x", description: null } } }; },
});
const noImob = (text: string) => assert.equal(/imob/i.test(text), false, `não pode citar IMOB: ${text.slice(0, 120)}`);

test("Logística: nenhum texto ou botão de ativação/liberação cita o IMOB, em qualquer resultado", () => {
  const previews = [
    { status: "available" as const, verticalId: "log", product: "LOGISTICA", registryVersion: "vr1-x", effects: ["instala Logística & Comex"] },
    { status: "already_active" as const, verticalId: "log", registryVersion: "vr1-x" },
    { status: "not_permitted" as const, verticalId: "log" },
    ...([true, false, undefined] as const).map((canRequest) => ({
      status: "approval_required" as const, verticalId: "log", canRequest,
      approval: { code: "VERTICAL_NOT_APPROVED" as const, message: "Esta vertical precisa ser liberada pela EIAH antes de ativar. Solicite a liberação.", accessStatus: null },
    })),
  ];
  for (const preview of previews) {
    const view = describeActivationPreview(preview);
    noImob(view.content);
    view.quickReplies.forEach(noImob);
    assert.equal(view.activation.verticalId, "log");
  }
  for (const result of [{ status: "already_active" as const, verticalId: "log", registryVersion: "v" }, { status: "activated" as const, verticalId: "log", registryVersion: "v", releasedRoutes: [] }]) {
    const view = describeActivationConfirmation(result);
    noImob(view.content);
    assert.equal(view.activation.verticalId, "log");
  }
  for (const outcome of ["requested", "already_requested", "already_approved"] as const) {
    const view = describeAccessRequestResult(outcome, "log");
    noImob(view.content);
    view.quickReplies.forEach(noImob);
    assert.equal(view.activation.verticalId, "log");
  }
  const errors = [undefined, new Error("x"), new ApiError(409, "S", { error: { code: "ACTIVATION_PROPOSAL_STALE" } }),
    new ApiError(403, "F", { error: { code: "PRODUCT_ACTIVATION_FORBIDDEN" } }), new ApiError(403, "N", { error: { code: "VERTICAL_APPROVAL_PENDING", message: "em análise" } }),
    new ApiError(403, "R", { error: { code: "VERTICAL_ACCESS_REQUEST_FORBIDDEN" } })];
  for (const error of errors) {
    for (const view of [describeActivationFailure(error, "log"), describeAccessRequestFailure(error, "log")]) {
      noImob(view.content);
      view.quickReplies.forEach(noImob);
      assert.equal(view.activation.verticalId, "log", "a falha não troca a vertical silenciosamente");
    }
  }
});

test("Logística: os botões anunciados são os comandos que o engine entende para essa vertical (e só para ela)", () => {
  const preview = describeActivationPreview({ status: "available", verticalId: "log", product: "LOGISTICA", registryVersion: "vr1-log", effects: ["e"] });
  assert.deepEqual(preview.quickReplies, ["Confirmar ativação de Logística", "Cancelar ativação"]);
  assert.deepEqual(resolveVerticalActivationStep(preview.quickReplies[0]!, preview.activation), { step: "confirm", verticalId: "log", registryVersion: "vr1-log" });
  assert.equal(resolveVerticalActivationStep("Confirmar ativação do IMOB", preview.activation), null, "texto do IMOB não confirma Logística");

  const offer = describeActivationPreview({ status: "approval_required", verticalId: "log", canRequest: true, approval: { code: "VERTICAL_NOT_APPROVED", message: "m", accessStatus: null } });
  assert.deepEqual(offer.quickReplies, ["Pedir liberação de Logística", "Agora não"]);
  assert.deepEqual(resolveVerticalActivationStep(offer.quickReplies[0]!, offer.activation), { step: "request_access", verticalId: "log" });
  assert.equal(resolveVerticalActivationStep("Pedir liberação do IMOB", offer.activation), null, "texto do IMOB não pede a liberação da Logística");
  assert.deepEqual(resolveVerticalActivationStep("Agora não", offer.activation), { step: "cancel_access_request", verticalId: "log" });

  const approved = describeAccessRequestResult("already_approved", "log");
  assert.deepEqual(resolveVerticalActivationStep(approved.quickReplies[0]!, null), { step: "preview", verticalId: "log" });
});

test("Logística: cada passo do enrich usa a vertical do pedido; vertical desconhecida não vira IMOB", async () => {
  const api = {
    preview: async () => ({ ok: true as const, data: { status: "available" as const, verticalId: "log", product: "LOGISTICA", registryVersion: "vr1-l", effects: ["e"] } }),
    confirm: async () => ({ ok: true as const, data: { status: "activated" as const, verticalId: "log", registryVersion: "vr1-l", releasedRoutes: [] } }),
    requestAccess: async () => ({ ok: true as const, data: { outcome: "requested" } }) as never,
    syncSession: async (domain: string) => { synced.push(domain); },
  };
  const synced: string[] = [];
  for (const step of [
    { step: "preview" as const, verticalId: "log" as const }, { step: "confirm" as const, verticalId: "log" as const, registryVersion: "vr1-l" },
    { step: "cancel" as const, verticalId: "log" as const }, { step: "request_access" as const, verticalId: "log" as const }, { step: "cancel_access_request" as const, verticalId: "log" as const },
  ]) {
    const out = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: step }, api as never);
    noImob(out?.content ?? "");
    assert.equal(out?.verticalActivation?.verticalId, "log", step.step);
  }
  assert.deepEqual(synced, ["core"], "ativar a instalação não promove a sessão ao domínio logística");

  assert.equal(asActivatableVertical("mkt"), null);
  assert.throws(() => describeActivationPreview({ status: "available", verticalId: "mkt", product: "X", registryVersion: "v", effects: [] }), /vertical_not_activatable/);
  const failed = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "preview" as const, verticalId: "log" as const } },
    { ...api, preview: async () => ({ ok: true as const, data: { status: "available" as const, verticalId: "outra", product: "X", registryVersion: "v", effects: [] } }) } as never,
  );
  assert.equal(failed?.verticalActivation?.verticalId, "log", "a vertical pedida prevalece sobre a devolvida");
});

test("J03: a sequência de billing da Logística preserva a vertical e os botões pedem a liberação de Logística", async () => {
  const calls: string[] = [];
  const api = billingApi(billingState(), calls);
  const proposal = { content: "c", resolvedQuickReplies: ["x"], verticalActivationRequest: { step: "preview" as const }, verticalActivation: { status: "access_request_proposed" as const, verticalId: "log" as const } };
  const intro = await enrichLauncherDecisionWithFrontDoorBilling(proposal, api);
  noImob(intro!.content!);
  assert.match(intro!.content!, /Para usar Logística & Comex/);
  assert.equal(intro!.frontDoorBilling?.status, "intro");
  assert.equal(intro!.frontDoorBilling?.verticalId, "log");
  assert.equal(intro!.verticalActivation?.verticalId, "log");

  const rows = billingCardRows(intro!.frontDoorBilling)!;
  const requestReply = rows[0]!.actions.find((action) => action.label === "Pedir a liberação sem conta")!.reply;
  assert.equal(requestReply, "Pedir liberação de Logística");
  assert.equal(resolveVerticalActivationStep(requestReply, intro!.verticalActivation)?.step, "request_access");
  assert.equal(resolveVerticalActivationStep(requestReply, intro!.verticalActivation)?.verticalId, "log");

  // sequência completa: cada etapa mantém a vertical no pedido, no snapshot e na proposta de liberação
  let snapshot: FrontDoorBillingSnapshot | undefined = intro!.frontDoorBilling;
  for (const label of ["Sim, criar a conta", "Escolher", "Sim, criar a conta"]) {
    const action = billingCardRows(snapshot)!.flatMap((row) => row.actions).find((item) => item.label === label);
    const reply = label === "Escolher" ? billingCardRows(snapshot)![1]!.actions[0]!.reply : action!.reply;
    const request = resolveFrontDoorBillingStep(reply, snapshot);
    assert.equal(request?.verticalId, "log", `o pedido de "${label}" carrega a vertical`);
    const out = await enrichLauncherDecisionWithFrontDoorBilling({ frontDoorBillingRequest: request! }, api);
    noImob(out!.content!);
    assert.equal(out!.verticalActivation?.verticalId, "log", "nunca volta a propor o pedido do IMOB");
    assert.equal(out!.frontDoorBilling?.verticalId, "log");
    snapshot = out!.frontDoorBilling;
  }
  assert.equal(snapshot?.status, "pay_offer");
  const later = resolveFrontDoorBillingStep("Pagar depois", snapshot);
  const end = await enrichLauncherDecisionWithFrontDoorBilling({ frontDoorBillingRequest: later! }, api);
  assert.equal(end!.frontDoorBilling?.status, "request_offer");
  const endRows = billingCardRows(end!.frontDoorBilling)!;
  assert.equal(endRows[0]!.actions[0]!.reply, "Pedir liberação de Logística");
  assert.equal(resolveVerticalActivationStep(endRows[0]!.actions[0]!.reply, end!.verticalActivation)?.step, "request_access");
  assert.deepEqual(calls, ["create:starter"]);

  const failing = { ...api, createAccount: async () => { throw new ApiError(403, "F", { error: { code: "FRONT_DOOR_BILLING_FORBIDDEN" } }); } };
  const refused = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: { step: "create" as const, plan: planOptions[0]!, verticalId: "log" as const } }, failing);
  noImob(refused!.content!);
  assert.match(refused!.content!, /pedido de liberação de Logística & Comex/);
});

test("billing: sem vertical identificada na proposta nada é oferecido; o IMOB segue sem marca de vertical", async () => {
  const unknown = await enrichLauncherDecisionWithFrontDoorBilling(
    { content: "c", resolvedQuickReplies: [], verticalActivationRequest: { step: "preview" as const }, verticalActivation: { status: "access_request_proposed", verticalId: "mkt" } as unknown as VerticalActivationSnapshot },
    billingApi(billingState()),
  );
  assert.equal(unknown!.frontDoorBilling, undefined);
  assert.equal(unknown!.content, "c");

  const imob = await enrichLauncherDecisionWithFrontDoorBilling(
    { content: "c", resolvedQuickReplies: [], verticalActivationRequest: { step: "preview" as const }, verticalActivation: { status: "access_request_proposed" as const, verticalId: "imob" as const } },
    billingApi(billingState()),
  );
  assert.deepEqual(Object.keys(imob!.frontDoorBilling!).sort(), ["plans", "status"], "snapshot do IMOB inalterado");
  assert.match(imob!.content!, /Para usar o IMOB/);
  assert.equal(billingCardRows(imob!.frontDoorBilling)![0]!.actions[1]!.reply, "Pedir liberação do IMOB");
});

test("aviso 'liberou a Logística' oferece como próximo passo a ativação da Logística, não a do IMOB", () => {
  const notice = (vertical: string): VerticalAccessNotice => ({ id: `n-${vertical}`, vertical, kind: "aprovado", message: "m", createdAt: "2026-10-03T08:23:00.000Z" } as VerticalAccessNotice);
  const log = describeUnshownNotices([notice("LOGISTICA")], new Set());
  assert.deepEqual(log?.notice.nextReplies, ["Ativar Logística & Comex neste workspace"]);
  assert.deepEqual(resolveVerticalActivationStep(log!.notice.nextReplies![0]!, null), { step: "preview", verticalId: "log" });
  assert.deepEqual(describeUnshownNotices([notice("IMOB")], new Set())?.notice.nextReplies, ["Ativar o IMOB neste workspace"]);
  assert.deepEqual(describeUnshownNotices([notice("LEGAL")], new Set())?.notice.nextReplies, []);
});

test("o turno de ativação da Logística não é marcado como rota IMOB (sem resumo shadow nem placeholder do IMOB)", async () => {
  const base = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
  const log = await resolveLauncherTurnDecision({ ...base, input: "ativar logística", trimmedInput: "ativar logística" });
  assert.equal(log?.kind, "vertical_activation_preview");
  assert.equal(log?.launcherRouteIntent, "help");
  assert.equal(log?.presentationRouteIntent, "help");
  const imob = await resolveLauncherTurnDecision({ ...base, input: "ativar o IMOB", trimmedInput: "ativar o IMOB" });
  assert.equal(imob?.launcherRouteIntent, "imob");
  assert.equal(imob?.presentationRouteIntent, "imob");
});
