import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type FrontDoorBillingState } from "@/lib/api";
import {
  attachFrontDoorBillingToSnapshot,
  billingCardRows,
  BILLING_ACCOUNT_CANCEL_REPLY,
  enrichLauncherDecisionWithFrontDoorBilling,
  resolveFrontDoorBillingStep,
  type FrontDoorBillingSnapshot,
} from "./frontDoorBillingEngine";
import { ACCESS_REQUEST_CONFIRM_REPLY, resolveVerticalActivationStep } from "./verticalActivationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// ADR-011 §2.8: conta de billing e primeira mensalidade simulada pela conversa, antes do pedido de liberação.

const plans: FrontDoorBillingState["plans"] = [
  { code: "solo", label: "Solo", monthlyPriceCents: 49_000, includedUsers: 3, includedRuns: 1_500, includedWorkspaces: 1 },
  { code: "starter", label: "Starter B2B", monthlyPriceCents: 149_000, includedUsers: 10, includedRuns: 5_000, includedWorkspaces: 2 },
];

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
  content: "O IMOB precisa ser liberado pela EIAH antes de ativar.",
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

test("sem conta ativa: avisa no pedido e mostra os planos; o pedido continua possível sem conta", async () => {
  const decision = await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), apiWith(state({})));
  assert.match(decision!.content!, /ainda não tem conta de billing ativa/);
  assert.match(decision!.content!, /peça a liberação mesmo assim/);
  assert.deepEqual(decision!.resolvedQuickReplies, [], "os botões ficam no cartão");
  assert.equal(decision!.frontDoorBilling?.status, "offer");
  assert.equal(JSON.stringify(decision).includes("score"), false, "nunca mostra score");

  const rows = billingCardRows(decision!.frontDoorBilling)!;
  assert.deepEqual(rows.map((row) => row.title), [
    "Solo — R$ 490,00/mês",
    "Starter B2B — R$ 1.490,00/mês",
    "Ou peça a liberação sem conta de billing",
  ]);
  assert.deepEqual(rows[2]!.actions.map((action) => action.reply), [ACCESS_REQUEST_CONFIRM_REPLY, "Agora não"]);
  // O mesmo cartão mantém o pedido de liberação a um clique (engine de ativação).
  assert.equal(resolveVerticalActivationStep(ACCESS_REQUEST_CONFIRM_REPLY, decision!.verticalActivation)?.step, "request_access");
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

test("conta ativa sem primeira mensalidade: oferece pagar (simulado) ou pedir agora", async () => {
  const decision = await enrichLauncherDecisionWithFrontDoorBilling(proposedDecision(), apiWith(state({ account: starterAccount, accountActive: true })));
  assert.deepEqual(decision!.frontDoorBilling, { status: "pay_offer", planLabel: "Starter B2B", monthlyPriceCents: 149_000 });
  assert.match(decision!.content!, /simulado: nenhuma cobrança real/);
});

test("passos: escolher → confirmar criação → pagar (simulado) → pedir a liberação; nada sem o clique certo", async () => {
  const offer: FrontDoorBillingSnapshot = { status: "offer", plans };
  assert.equal(resolveFrontDoorBillingStep("sim", offer), null, "um 'sim' solto não escolhe");
  const choose = resolveFrontDoorBillingStep(billingCardRows(offer)![1]!.actions[0]!.reply, offer);
  assert.equal(choose?.step, "choose");

  const calls: string[] = [];
  const api = apiWith(state({ account: starterAccount, accountActive: true }), calls);
  const confirm = await enrichLauncherDecisionWithFrontDoorBilling({ frontDoorBillingRequest: choose! }, api);
  assert.deepEqual(calls, [], "escolher não cria nada");
  assert.equal(confirm!.frontDoorBilling?.status, "confirm_account");
  const confirmRow = billingCardRows(confirm!.frontDoorBilling)![0]!;
  assert.deepEqual(confirmRow.actions.map((action) => action.label), ["Confirmar criação da conta", "Cancelar"]);
  assert.equal(resolveFrontDoorBillingStep("Confirmar conta de billing: Solo", confirm!.frontDoorBilling), null, "confirmar outro plano não vale");

  const created = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: resolveFrontDoorBillingStep(confirmRow.actions[0]!.reply, confirm!.frontDoorBilling)! },
    api,
  );
  assert.deepEqual(calls, ["create:starter", "read"]);
  assert.match(created!.content!, /Conta de billing criada no plano Starter B2B \(R\$ 1\.490,00\/mês\)/);
  assert.equal(created!.frontDoorBilling?.status, "pay_offer");
  assert.equal(created!.verticalActivation?.status, "access_request_proposed", "o pedido continua a um clique");

  const payRow = billingCardRows(created!.frontDoorBilling)!;
  assert.equal(payRow[0]!.actions[0]!.label, "Pagar R$ 1.490,00 (simulado)");
  const paid = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: resolveFrontDoorBillingStep(payRow[0]!.actions[0]!.reply, created!.frontDoorBilling)! },
    api,
  );
  assert.deepEqual(calls, ["create:starter", "read", "pay"]);
  assert.match(paid!.content!, /pagamento simulado, sem cobrança real/);
  assert.equal(paid!.frontDoorBilling?.status, "request_offer");
  assert.deepEqual(billingCardRows(paid!.frontDoorBilling)![0]!.actions[0]!.reply, ACCESS_REQUEST_CONFIRM_REPLY);

  const cancelled = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: resolveFrontDoorBillingStep(BILLING_ACCOUNT_CANCEL_REPLY, confirm!.frontDoorBilling)! },
    api,
  );
  assert.match(cancelled!.content!, /nenhuma conta foi criada/);

  const snapshot = attachFrontDoorBillingToSnapshot({ quickReplies: ["O que o EIAH pode fazer por mim?"] }, paid);
  assert.deepEqual(snapshot.quickReplies, [], "sem sugestões genéricas embaixo do cartão");
});

test("falhas: sem permissão e pagamento real não ligado dizem que nada foi feito", async () => {
  const forbidden = {
    ...apiWith(state({})),
    createAccount: async () => { throw new ApiError(403, "Forbidden", { error: { code: "FRONT_DOOR_BILLING_FORBIDDEN" } }); },
  };
  const denied = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: { step: "create", plan: plans[0]! } },
    forbidden,
  );
  assert.match(denied!.content!, /Só o proprietário do tenant/);
  const notConnected = {
    ...apiWith(state({})),
    pay: async () => { throw new ApiError(409, "Conflict", { error: { code: "FRONT_DOOR_PAYMENT_NOT_CONNECTED" } }); },
  };
  const refused = await enrichLauncherDecisionWithFrontDoorBilling(
    { frontDoorBillingRequest: { step: "pay", planLabel: "Solo", monthlyPriceCents: 49_000 } },
    notConnected,
  );
  assert.match(refused!.content!, /Nada foi cobrado/);
  assert.equal(refused!.frontDoorBilling?.status, "request_offer");
});

test("launcher: botão do cartão vira passo do engine, sem run", async () => {
  const decision = await resolveLauncherTurnDecision({
    input: "Criar conta de billing no plano Starter B2B",
    trimmedInput: "Criar conta de billing no plano Starter B2B",
    routeIntent: "help",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
    previousAssistantSnapshot: { frontDoorBilling: { status: "offer", plans } } as never,
  });
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.frontDoorBillingRequest?.step, "choose");
});
