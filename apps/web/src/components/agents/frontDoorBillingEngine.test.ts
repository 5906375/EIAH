import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type FrontDoorBillingState } from "@/lib/api";
import {
  attachFrontDoorBillingToSnapshot,
  billingCardRows,
  enrichLauncherDecisionWithFrontDoorBilling,
  OTHER_PLANS_REPLY,
  PAY_LATER_REPLY,
  resolveFrontDoorBillingStep,
  START_ACCOUNT_REPLY,
  type FrontDoorBillingSnapshot,
} from "./frontDoorBillingEngine";
import { ACCESS_REQUEST_CANCEL_REPLY, ACCESS_REQUEST_CONFIRM_REPLY, resolveVerticalActivationStep } from "./verticalActivationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// ADR-011 §2.8: conta de billing e primeira mensalidade simulada pela conversa, em etapas, antes do pedido de liberação.

const plans: FrontDoorBillingState["plans"] = [
  { code: "solo", label: "Solo", monthlyPriceCents: 49_000, includedUsers: 3, includedRuns: 1_500, includedWorkspaces: 1 },
  { code: "starter", label: "Starter B2B", monthlyPriceCents: 149_000, includedUsers: 10, includedRuns: 5_000, includedWorkspaces: 2 },
];
const planOptions = plans.map(({ code, label, monthlyPriceCents, includedUsers, includedRuns }) => ({
  code,
  label,
  monthlyPriceCents,
  includedUsers,
  includedRuns,
}));

const state = (over: Partial<FrontDoorBillingState>): FrontDoorBillingState => ({
  canManage: true,
  account: null,
  accountActive: false,
  firstPayment: null,
  paymentMode: "simulated",
  plans,
  ...over,
});

const starterAccount = {
  planCode: "starter" as const,
  planLabel: "Starter B2B",
  monthlyPriceCents: 149_000,
  status: "active",
  currency: "BRL",
  createdAt: "2026-10-03T12:00:00.000Z",
};

const proposedDecision = () => ({
  content: "Esta vertical precisa ser liberada pela EIAH antes de ativar.",
  resolvedQuickReplies: [ACCESS_REQUEST_CONFIRM_REPLY, "Agora não"],
  verticalActivationRequest: { step: "preview" },
  verticalActivation: { status: "access_request_proposed" as const, verticalId: "imob" as const },
});

const apiWith = (read: FrontDoorBillingState, calls: string[] = []) => ({
  read: async () => {
    calls.push("read");
    return { ok: true as const, data: read };
  },
  createAccount: async (body: { planCode: string }) => {
    calls.push(`create:${body.planCode}`);
    return { ok: true as const, data: { outcome: "created" as const, account: starterAccount } };
  },
  pay: async () => {
    calls.push("pay");
    return {
      ok: true as const,
      data: { outcome: "paid" as const, account: starterAccount, payment: { mode: "simulated" as const, paidAt: "x", description: null } },
    };
  },
});

const labels = (snapshot: FrontDoorBillingSnapshot | undefined) =>
  billingCardRows(snapshot)!.flatMap((row) => row.actions.map((action) => action.label));

const turn = async (snapshot: FrontDoorBillingSnapshot | undefined, label: string, api: ReturnType<typeof apiWith>) => {
  const action = billingCardRows(snapshot)!.flatMap((row) => row.actions).find((item) => item.label === label)!;
  const request = resolveFrontDoorBillingStep(action.reply, snapshot);
  assert.ok(request, `o botão "${label}" é entendido`);
  return enrichLauncherDecisionWithFrontDoorBilling({ frontDoorBillingRequest: request }, api);
};

test("primeira mensagem: explica a liberação e faz uma pergunta só (criar a conta?), sem despejar planos", async () => {
  const decision = await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), apiWith(state({})));
  assert.match(decision!.content!, /^Claro! Para usar o IMOB, a EIAH primeiro precisa liberar/);
  assert.match(decision!.content!, /ainda não tem conta de billing/);
  assert.match(decision!.content!, /Quer criar a conta agora\?$/);
  assert.doesNotMatch(decision!.content!, /responda "/, "sem instrução robótica");
  assert.doesNotMatch(decision!.content!, /R\$/, "os planos vêm só na próxima etapa");
  assert.deepEqual(decision!.resolvedQuickReplies, []);
  assert.equal(JSON.stringify(decision).includes("score"), false, "nunca mostra score");

  assert.deepEqual(labels(decision!.frontDoorBilling), ["Sim, criar a conta", "Pedir a liberação sem conta", "Agora não"]);
  const rows = billingCardRows(decision!.frontDoorBilling)!;
  assert.equal(rows[0]!.title, undefined, "só botões, a pergunta está no texto");
  // "Pedir a liberação sem conta" e "Agora não" são o pedido/cancelamento do engine de ativação.
  assert.equal(resolveVerticalActivationStep(rows[0]!.actions[1]!.reply, decision!.verticalActivation)?.step, "request_access");
  assert.equal(resolveVerticalActivationStep(rows[0]!.actions[2]!.reply, decision!.verticalActivation)?.step, "cancel_access_request");
});

test("quem não pode cuidar do billing, ou já tem conta paga, segue o pedido como antes", async () => {
  for (const read of [state({ canManage: false }), state({ account: starterAccount, accountActive: true, firstPayment: { mode: "simulated", paidAt: "x", description: null } })]) {
    const decision = await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), apiWith(read));
    assert.equal(decision!.frontDoorBilling, undefined);
    assert.deepEqual(decision!.resolvedQuickReplies, [ACCESS_REQUEST_CONFIRM_REPLY, "Agora não"]);
  }
  const failing = { ...apiWith(state({})), read: async () => { throw new Error("offline"); } };
  assert.equal((await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), failing))!.frontDoorBilling, undefined, "falha de leitura não atrapalha o pedido");
});

test("conta ativa sem primeira mensalidade: pergunta se quer pagar agora (simulado) ou depois", async () => {
  const decision = await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), apiWith(state({ account: starterAccount, accountActive: true })));
  assert.deepEqual(decision!.frontDoorBilling, { status: "pay_offer", planLabel: "Starter B2B", monthlyPriceCents: 149_000 });
  assert.match(decision!.content!, /conta de billing já existe, no plano Starter B2B/);
  assert.match(decision!.content!, /Quer pagar agora\? Neste ambiente o pagamento é simulado/);
  assert.deepEqual(labels(decision!.frontDoorBilling), ["Pagar agora (simulado)", PAY_LATER_REPLY]);
});

test("sequência: criar? → planos → confirmar o plano → pagar? → enviar o pedido?; nada sem o clique certo", async () => {
  const calls: string[] = [];
  const api = apiWith(state({ account: starterAccount, accountActive: true }), calls);
  const intro: FrontDoorBillingSnapshot = { status: "intro", plans: planOptions };
  assert.equal(resolveFrontDoorBillingStep("sim", intro), null, "um 'sim' solto não avança");

  const offer = await turn(intro, "Sim, criar a conta", api);
  assert.equal(offer!.content, "Ótimo! Estes são os planos disponíveis. Qual combina mais com a sua imobiliária?");
  assert.deepEqual(billingCardRows(offer!.frontDoorBilling)!.map((row) => row.title), ["Solo · R$ 490,00 por mês", "Starter B2B · R$ 1.490,00 por mês"]);
  assert.deepEqual(calls, [], "ver planos não cria nada");

  const starterAction = billingCardRows(offer!.frontDoorBilling)![1]!.actions[0]!;
  const confirm = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: resolveFrontDoorBillingStep(starterAction.reply, offer!.frontDoorBilling)! },
    api,
  );
  assert.match(confirm!.content!, /Boa escolha\. O plano \*\*Starter B2B\*\* custa R\$ 1\.490,00 por mês/);
  assert.match(confirm!.content!, /Posso criar a conta de billing neste plano\?$/);
  assert.deepEqual(labels(confirm!.frontDoorBilling), ["Sim, criar a conta", OTHER_PLANS_REPLY]);
  assert.deepEqual(calls, [], "escolher não cria nada");
  assert.equal((await turn(confirm!.frontDoorBilling, OTHER_PLANS_REPLY, api))!.frontDoorBilling?.status, "offer", "volta aos planos");

  const created = await turn(confirm!.frontDoorBilling, "Sim, criar a conta", api);
  assert.deepEqual(calls, ["create:starter", "read"]);
  assert.match(created!.content!, /^Pronto, a conta de billing foi criada no plano Starter B2B\./);
  assert.match(created!.content!, /Quer pagar a primeira mensalidade \(R\$ 1\.490,00\) agora\? Neste ambiente o pagamento é simulado/);
  assert.equal(created!.verticalActivation?.status, "access_request_proposed", "o pedido continua possível");

  const paid = await turn(created!.frontDoorBilling, "Pagar agora (simulado)", api);
  assert.deepEqual(calls, ["create:starter", "read", "pay"]);
  assert.match(paid!.content!, /Pagamento de R\$ 1\.490,00 registrado \(simulado, sem cobrança real\)\. Obrigado!/);
  assert.match(paid!.content!, /Posso enviar o pedido\?$/);
  const send = billingCardRows(paid!.frontDoorBilling)![0]!.actions;
  assert.deepEqual(send.map((action) => [action.label, action.reply]), [
    ["Sim, enviar o pedido", ACCESS_REQUEST_CONFIRM_REPLY],
    [ACCESS_REQUEST_CANCEL_REPLY, ACCESS_REQUEST_CANCEL_REPLY],
  ]);

  const later = await turn(created!.frontDoorBilling, PAY_LATER_REPLY, api);
  assert.match(later!.content!, /^Sem problema, você pode pagar depois\./);
  assert.equal(later!.frontDoorBilling?.status, "request_offer");

  const snapshot = attachFrontDoorBillingToSnapshot({ quickReplies: ["O que o EIAH pode fazer por mim?"] }, paid);
  assert.deepEqual(snapshot.quickReplies, [], "sem sugestões genéricas embaixo dos botões");
  assert.equal(resolveFrontDoorBillingStep(START_ACCOUNT_REPLY, paid!.frontDoorBilling), null, "botão de etapa antiga não vale");
});

test("falhas: dizem que nada foi feito e oferecem enviar o pedido mesmo assim", async () => {
  const forbidden = {
    ...apiWith(state({})),
    createAccount: async () => { throw new ApiError(403, "Forbidden", { error: { code: "FRONT_DOOR_BILLING_FORBIDDEN" } }); },
  };
  const denied = await enrichLauncherDecisionWithFrontDoorBilling({ frontDoorBillingRequest: { step: "create", plan: planOptions[0]! } }, forbidden);
  assert.match(denied!.content!, /Só o proprietário do tenant/);
  assert.match(denied!.content!, /Posso enviar\?$/);
  const notConnected = {
    ...apiWith(state({})),
    pay: async () => { throw new ApiError(409, "Conflict", { error: { code: "FRONT_DOOR_PAYMENT_NOT_CONNECTED" } }); },
  };
  const refused = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: { step: "pay", planLabel: "Solo", monthlyPriceCents: 49_000 } },
    notConnected,
  );
  assert.match(refused!.content!, /nada foi cobrado/);
  assert.equal(refused!.frontDoorBilling?.status, "request_offer");
});

test("launcher: botão vira passo do engine, sem run", async () => {
  const decision = await resolveLauncherTurnDecision({
    input: START_ACCOUNT_REPLY,
    trimmedInput: START_ACCOUNT_REPLY,
    routeIntent: "help",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
    previousAssistantSnapshot: { frontDoorBilling: { status: "intro", plans: planOptions } } as never,
  });
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.frontDoorBillingRequest?.step, "show_plans");
});
