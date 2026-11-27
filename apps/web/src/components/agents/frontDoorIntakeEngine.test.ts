import test from "node:test";
import assert from "node:assert/strict";
import type { FrontDoorIntakeResult } from "@/lib/api";
import {
  billingCardRows,
  CHANGE_SUBJECT_REPLY,
  type InterpretableBillingSnapshot,
  chooseReply,
  enrichLauncherDecisionWithFrontDoorBilling,
  findPendingFrontDoorBilling,
  isInterpretableBilling,
  resolveFrontDoorBillingStep,
  type FrontDoorBillingSnapshot,
} from "./frontDoorBillingEngine";
import { enrichLauncherDecisionWithFrontDoorIntake, type FrontDoorIntakeRequest } from "./frontDoorIntakeEngine";
import { createLauncherPresentationSnapshot, resolveLauncherTurnDecision } from "./chatLauncherEngine";

// Intake contextual do Front Door na escolha de plano (lado web). A API/provider são dublês sintéticos: nenhuma rede, nenhuma chamada paga.
// O que se prova: despacho por ESTADO (não por palavra), estado comercial preservado, desfechos explícitos e nenhum efeito (contratar/ativar/pagar).

const plans = [
  { code: "solo" as const, label: "Solo", monthlyPriceCents: 49_000, includedUsers: 3, includedRuns: 1_500 },
  { code: "starter" as const, label: "Starter B2B", monthlyPriceCents: 149_000, includedUsers: 10, includedRuns: 5_000 },
];
const offer: InterpretableBillingSnapshot = { status: "offer", plans };
const intakeRequest = (pending: InterpretableBillingSnapshot = offer, message = "não tem como começar gratuita ?"): FrontDoorIntakeRequest => ({ message, pending });
const result = (over: Partial<FrontDoorIntakeResult> = {}): { data: FrontDoorIntakeResult } => ({ data: { outcome: "answered", content: "resposta do catálogo", endsContext: false, ...over } });

// Serviços de billing que NÃO podem ser chamados: lançam se alguém os usar (a consulta e o encerramento da etapa não têm efeito).
const noBilling = {
  read: async () => { throw new Error("billing não deve ser lido"); },
  createAccount: async () => { throw new Error("não cria conta"); },
  pay: async () => { throw new Error("não paga"); },
};
// Snapshot real (sem estado de billing) de uma mensagem intermediária do assistente.
const intermediateSnapshot = () => createLauncherPresentationSnapshot({ routeIntent: "help", eiahMode: "help", isHelpCenterMode: true, proposalMode: false, attachmentIntake: { enabled: false } });

const turnBase = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
const turn = (input: string, pendingFrontDoorBilling: FrontDoorBillingSnapshot | null | undefined) =>
  resolveLauncherTurnDecision({ ...turnBase, input, trimmedInput: input, pendingFrontDoorBilling });

test("despacho por estado: qualquer pergunta livre na etapa de plano vai ao intake, sem depender de palavra", async () => {
  const phrases = [
    "não tem como começar gratuita ?", "Existe algum período de teste?", "Posso começar sem pagar?", "Qual é a diferença entre os planos?",
    "xyzzy plugh", "😀", "tem desconto pra ONG?", "what about a free tier",
  ];
  for (const phrase of phrases) {
    const decision = await turn(phrase, offer);
    assert.equal(decision?.kind, "front_door_intake", phrase);
    assert.equal(decision?.shouldCreateRun, false, "nenhuma run é criada");
    assert.equal(decision?.frontDoorIntakeRequest?.message, phrase);
    assert.equal(decision?.frontDoorIntakeRequest?.pending.status, "offer");
    assert.equal(decision?.frontDoorBillingRequest, undefined, "a pergunta não escolhe plano nem executa passo de billing");
  }
});

test("o texto exato de um botão continua sendo o passo de billing; sem etapa pendente, o intake não entra", async () => {
  const click = await turn(chooseReply(plans[0]), offer);
  assert.equal(click?.kind, "front_door_billing_choose");
  assert.equal(click?.frontDoorIntakeRequest, undefined);
  const none = await turn("não tem como começar gratuita ?", null);
  assert.notEqual(none?.kind, "front_door_intake");
  // request_offer ("posso enviar o pedido?") agora também é etapa interpretável; o botão exato "Pedir liberação" segue no engine de ativação.
  const requestOffer = await turn("não tem como começar gratuita ?", { status: "request_offer" });
  assert.equal(requestOffer?.kind, "front_door_intake");
  assert.equal(requestOffer?.frontDoorIntakeRequest?.pending.status, "request_offer");
  const closed = await turn("não tem como começar gratuita ?", { status: "closed" });
  assert.notEqual(closed?.kind, "front_door_intake", "etapa encerrada não intercepta mais");
});

test("transições explícitas reconhecidas continuam valendo durante a etapa (nada muda de vertical em silêncio)", async () => {
  const decision = await turn("mudar para logística", offer);
  assert.equal(decision?.kind, "vertical_handoff");
  assert.equal(decision?.frontDoorIntakeRequest, undefined);
});

test("enriquecimento: manda contexto estruturado e preserva a MESMA etapa com o botão explícito de mudar de assunto", async () => {
  const calls: Array<{ body: unknown }> = [];
  const decision = await turn("Posso começar sem pagar?", offer);
  const enriched = await enrichLauncherDecisionWithFrontDoorIntake(decision, async (body) => { calls.push({ body }); return result(); });
  assert.deepEqual(calls[0].body, { message: "Posso começar sem pagar?", context: { verticalId: "imob", step: "offer" } });
  assert.equal(enriched?.content, "resposta do catálogo");
  assert.deepEqual(enriched?.frontDoorBilling, { ...offer, offerLeave: true }, "mesma etapa; só ganha a saída explícita");
  assert.deepEqual(enriched?.verticalActivation, { status: "access_request_proposed", verticalId: "imob" });
  const rows = billingCardRows(enriched?.frontDoorBilling);
  assert.equal(rows?.length, plans.length + 1, "os botões dos planos continuam e há a linha de mudar de assunto");
  assert.equal(rows?.[rows.length - 1]?.actions?.[0]?.reply, CHANGE_SUBJECT_REPLY);
});

test("o intake leva a vertical e o plano em confirmação; Logística preserva a vertical", async () => {
  const confirm: FrontDoorBillingSnapshot = { status: "confirm_account", plan: plans[0], plans, verticalId: "log" };
  const calls: unknown[] = [];
  const enriched = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest(confirm) }, async (body) => { calls.push(body); return result(); });
  assert.deepEqual(calls[0], { message: "não tem como começar gratuita ?", context: { verticalId: "log", step: "confirm_account", planLabel: "Solo" } });
  assert.equal(enriched?.frontDoorBilling && "verticalId" in enriched.frontDoorBilling ? enriched.frontDoorBilling.verticalId : null, "log");
});

test("saída explícita encerra a etapa (closed, sem proposta de liberação pendente); os demais desfechos preservam", async () => {
  const left = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest() }, async () => result({ outcome: "leave", endsContext: true, content: "encerrei" }));
  assert.deepEqual(left?.frontDoorBilling, { status: "closed" });
  assert.equal(left?.verticalActivation, undefined);
  assert.equal(billingCardRows(left?.frontDoorBilling), null);
  for (const outcome of ["answered", "clarify", "out_of_context", "not_permitted", "unavailable", "timeout", "invalid"] as const) {
    const kept = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest() }, async () => result({ outcome }));
    assert.equal(kept?.frontDoorBilling?.status, "offer", outcome);
    assert.equal(isInterpretableBilling(kept?.frontDoorBilling), true, outcome);
  }
});

test("API indisponível ou com erro: desfecho explícito, sem inventar condição comercial, etapa preservada", async () => {
  const failed = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest() }, async () => { throw new Error("HTTP 503"); });
  assert.match(failed?.content ?? "", /Nada foi alterado e eu não vou supor condições comerciais/);
  assert.equal(/gratuit|grátis|R\$/i.test(failed?.content ?? ""), false);
  assert.equal(failed?.frontDoorBilling?.status, "offer");
});

test("timeout do cliente: aborta a requisição, avisa explicitamente e preserva a etapa", async () => {
  let aborted = false;
  const never = (_body: unknown, signal?: AbortSignal) => new Promise<{ data: FrontDoorIntakeResult }>((_, reject) => {
    signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
  });
  const timedOut = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest() }, never, 25);
  assert.equal(aborted, true, "a requisição pendente foi interrompida");
  assert.match(timedOut?.content ?? "", /demorou mais que o limite/);
  assert.equal(timedOut?.frontDoorBilling?.status, "offer");
});

test("sem pedido de intake a decisão passa intacta; a consulta nunca chama os serviços de billing", async () => {
  const decision = { content: "x" };
  assert.equal(await enrichLauncherDecisionWithFrontDoorIntake(decision, async () => { throw new Error("não deve chamar"); }), decision);
  assert.equal(await enrichLauncherDecisionWithFrontDoorIntake(null), null);
  // A etapa de billing (criar conta/pagar) só nasce de `frontDoorBillingRequest`, que o intake nunca produz.
  const enriched = await enrichLauncherDecisionWithFrontDoorIntake({ frontDoorIntakeRequest: intakeRequest() }, async () => result());
  assert.equal("frontDoorBillingRequest" in (enriched ?? {}), false);
  assert.equal(await enrichLauncherDecisionWithFrontDoorBilling(enriched, noBilling) === enriched, true, "o enriquecimento de billing não age sobre uma decisão de intake");
});

test("mudar de assunto: botão canônico encerra a etapa e reconhece a transição", async () => {
  assert.deepEqual(resolveFrontDoorBillingStep(CHANGE_SUBJECT_REPLY, offer), { step: "leave" });
  assert.equal(resolveFrontDoorBillingStep(CHANGE_SUBJECT_REPLY, { status: "closed" }), null);
  assert.equal(resolveFrontDoorBillingStep(CHANGE_SUBJECT_REPLY, null), null);
  const decision = await turn(CHANGE_SUBJECT_REPLY, offer);
  assert.equal(decision?.kind, "front_door_billing_leave");
  const enriched = await enrichLauncherDecisionWithFrontDoorBilling(decision, noBilling);
  assert.deepEqual(enriched?.frontDoorBilling, { status: "closed" });
  assert.match(enriched?.content ?? "", /Nada foi criado, contratado ou pago/);
  assert.equal(enriched?.verticalActivation, undefined);
});

test("estado comercial da CONVERSA: perguntas intermediárias não o apagam; fim por saída, handoff ou outro fluxo", () => {
  const billing = (frontDoorBilling: FrontDoorBillingSnapshot) => ({ frontDoorBilling, verticalActivation: { status: "access_request_proposed" as const, verticalId: "imob" as const } });
  const answer = { frontDoorBilling: { ...offer, offerLeave: true } as FrontDoorBillingSnapshot, verticalActivation: { status: "access_request_proposed" as const, verticalId: "imob" as const } };
  const generic = {}; // mensagem intermediária sem estado de billing
  assert.equal(findPendingFrontDoorBilling([billing(offer), generic, generic, generic])?.status, "offer", "três mensagens intermediárias depois");
  assert.equal(findPendingFrontDoorBilling([billing(offer), answer, generic])?.status, "offer");
  assert.equal(findPendingFrontDoorBilling([billing(offer), null, undefined, generic])?.status, "offer");
  const next = billing({ status: "confirm_account", plan: plans[0], plans });
  assert.equal(findPendingFrontDoorBilling([billing(offer), generic, next, generic])?.status, "confirm_account", "vale a etapa mais recente");
  assert.equal(findPendingFrontDoorBilling([billing(offer), generic, { frontDoorBilling: { status: "closed" } }, generic]), null, "encerrada pelo usuário");
  assert.equal(findPendingFrontDoorBilling([billing(offer), { verticalHandoff: { ok: true } }]), null, "handoff de vertical reconhecido encerra");
  assert.equal(findPendingFrontDoorBilling([billing(offer), { verticalActivation: { status: "access_requested", verticalId: "imob" } }]), null, "o pedido de liberação foi enviado");
  assert.equal(findPendingFrontDoorBilling([billing({ status: "request_offer" })])?.status, "request_offer");
  assert.equal(isInterpretableBilling(findPendingFrontDoorBilling([billing({ status: "request_offer" })])), true, "request_offer é etapa interpretável");
  assert.equal(findPendingFrontDoorBilling([]), null);
});

test("sem o estado da conversa, só o último snapshot valeria: com ele, o botão do cartão antigo ainda funciona depois de perguntas intermediárias", async () => {
  const snapshots = [{ frontDoorBilling: offer }, {}, {}];
  const lastSnapshot = intermediateSnapshot();
  const pending = findPendingFrontDoorBilling(snapshots);
  const click = await resolveLauncherTurnDecision({ ...turnBase, input: chooseReply(plans[1]), trimmedInput: chooseReply(plans[1]), previousAssistantSnapshot: lastSnapshot, pendingFrontDoorBilling: pending });
  assert.equal(click?.kind, "front_door_billing_choose", "o botão ainda vale");
  const legacy = await resolveLauncherTurnDecision({ ...turnBase, input: chooseReply(plans[1]), trimmedInput: chooseReply(plans[1]), previousAssistantSnapshot: lastSnapshot });
  assert.notEqual(legacy?.kind, "front_door_billing_choose", "(controle) derivando só do último snapshot, o botão se perderia");
});
