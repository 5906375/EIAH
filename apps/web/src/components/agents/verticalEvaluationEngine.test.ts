import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type EvaluationIntakeResult, type VerticalApprovalAdminItem } from "@/lib/api";
import { CHANGE_SUBJECT_REPLY } from "./frontDoorBillingEngine";
import {
  ACTIVATION_REQUEST_REPLY,
  describeActivationPreview,
  enrichLauncherDecisionWithVerticalActivation,
  resolveVerticalActivationStep,
} from "./verticalActivationEngine";
import {
  DEFAULT_EVALUATION_API,
  describeEvaluationTermsPresentation,
  enrichEvaluationRequest,
  EVALUATION_ACCEPT_REPLY,
  EVALUATION_ACTIVATE_REPLY,
  EVALUATION_ADJUST_REPLY,
  EVALUATION_CONTINUE_REPLY,
  EVALUATION_DECLINE_REPLY,
  EVALUATION_LEAVE_REPLY,
  EVALUATION_REQUEST_REPLY,
  EVALUATION_SUBMIT_REPLY,
  EVALUATION_VIEW_TERMS_REPLY,
  resolveEvaluationStep,
  type EvaluationApi,
  type EvaluationSnapshot,
} from "./verticalEvaluationEngine";
import { describeUnshownNotices } from "./verticalAccessNoticeEngine";
import { describeApprovalQueue } from "./verticalApprovalChatEngine";
import { canDecide, itemsForTab, revocationActionsFor, evaluationBlockers } from "../../pages/app/admin/verticalApprovalsView";

/**
 * Engine do Front Door para a avaliação gratuita. Dublês injetados no lugar da API: provam o ENCADEAMENTO do engine (que passo
 * chama o quê, o que nunca é chamado, o que a mensagem afirma e nega, que estado fica). NÃO provam a interpretação semântica do
 * provider (a qualificação real é do intake central no servidor) nem a rota autenticada.
 */

const draftFull = { problem: "Organizar captação", teamSize: 6, expectedOutcome: "Cadastrar mais rápido" };
const qualifying: EvaluationSnapshot = { status: "evaluation_qualifying", verticalId: "imob" };
const confirm: EvaluationSnapshot = { status: "evaluation_confirm", verticalId: "imob", draft: draftFull };
const termsPending: EvaluationSnapshot = { status: "evaluation_terms", verticalId: "imob", termsHash: "a".repeat(64) };

function fakeApi(over: Partial<{ [K in keyof EvaluationApi]: unknown }> = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const record = (name: string, impl: (...args: any[]) => unknown) => async (...args: unknown[]) => {
    calls.push({ name, args });
    return impl(...args);
  };
  const api = {
    getAccess: record("getAccess", () => ({ data: { evaluation: { offerAvailable: true, phase: null } } })),
    intake: record("intake", () => ({ data: { outcome: "clarify", content: "?", endsContext: false, draft: {}, missing: [] } })),
    requestAccess: record("requestAccess", () => ({ data: { outcome: "requested" } })),
    getTerms: record("getTerms", () => ({ data: { available: false, phase: null } })),
    acceptTerms: record("acceptTerms", () => ({ data: { outcome: "accepted", activated: false } })),
    declineTerms: record("declineTerms", () => ({ data: { outcome: "declined" } })),
  } as Record<string, unknown>;
  for (const [name, impl] of Object.entries(over)) api[name] = record(name, impl as never);
  return { api: api as unknown as EvaluationApi, calls, called: (name: string) => calls.filter((call) => call.name === name) };
}
const intakeResult = (over: Partial<EvaluationIntakeResult>): EvaluationIntakeResult => ({ outcome: "need_more", content: "c", endsContext: false, draft: {}, missing: [], ...over });
const apiError = (code: string) => new ApiError(409, "x", { error: { code } });

test("botões canônicos coincidem com os dos outros engines (guarda de drift)", () => {
  assert.equal(EVALUATION_LEAVE_REPLY, CHANGE_SUBJECT_REPLY);
  assert.equal(EVALUATION_ACTIVATE_REPLY, ACTIVATION_REQUEST_REPLY);
});

test("passos: só botões exatos resolvem; sem etapa pendente nenhuma frase livre vira avaliação (sem palavras-chave)", () => {
  assert.deepEqual(resolveEvaluationStep(EVALUATION_REQUEST_REPLY, null), { step: "evaluation_offer", verticalId: "imob" });
  assert.deepEqual(resolveEvaluationStep(EVALUATION_VIEW_TERMS_REPLY, null), { step: "evaluation_view_terms", verticalId: "imob" });
  for (const text of ["quero testar de graça", "avaliação gratuita do imob", "trial", "posso experimentar antes de pagar?", "solicitar avaliação gratuita"]) {
    assert.equal(resolveEvaluationStep(text, null), null, text);
    assert.equal(resolveEvaluationStep(text, { status: "proposed" }), null, `${text} (outra etapa pendente)`);
  }
});

test("passos: na etapa de qualificação QUALQUER texto livre vai ao intake central; botões saem", () => {
  assert.deepEqual(resolveEvaluationStep("Somos uma imobiliária pequena com seis corretores", qualifying), {
    step: "evaluation_qualify", verticalId: "imob", message: "Somos uma imobiliária pequena com seis corretores", stage: "qualifying", draft: {},
  });
  assert.deepEqual(resolveEvaluationStep(EVALUATION_LEAVE_REPLY, qualifying), { step: "evaluation_leave", verticalId: "imob" });
  assert.deepEqual(resolveEvaluationStep("Agora não", qualifying), { step: "evaluation_leave", verticalId: "imob" });
  const withDraft: EvaluationSnapshot = { status: "evaluation_qualifying", verticalId: "imob", draft: { problem: "x" } };
  assert.deepEqual((resolveEvaluationStep("mais uma informação", withDraft) as { draft: unknown }).draft, { problem: "x" }, "rascunho preservado entre perguntas");
});

test("passos: confirmar/ajustar/enviar são exatos; texto livre na confirmação é interpretado, não envia", () => {
  assert.deepEqual(resolveEvaluationStep(EVALUATION_SUBMIT_REPLY, confirm), { step: "evaluation_submit", verticalId: "imob", draft: draftFull });
  assert.deepEqual(resolveEvaluationStep(EVALUATION_ADJUST_REPLY, confirm), { step: "evaluation_adjust", verticalId: "imob", draft: draftFull });
  for (const text of ["isso gera cobrança?", "sim", "ok, pode mandar", "enviar", "confirmo"]) {
    const step = resolveEvaluationStep(text, confirm);
    assert.equal(step?.step, "evaluation_qualify", `${text}: não envia nada, vai ao intake`);
  }
  assert.equal(resolveEvaluationStep(EVALUATION_SUBMIT_REPLY, qualifying)?.step, "evaluation_qualify", "o botão fora da etapa de confirmação não envia");
  assert.equal(resolveEvaluationStep(EVALUATION_SUBMIT_REPLY, null), null);
});

test("passos: nas condições só há aceitar/recusar/sair; texto livre não aceita nada", () => {
  assert.deepEqual(resolveEvaluationStep(EVALUATION_ACCEPT_REPLY, termsPending), { step: "evaluation_accept", verticalId: "imob", termsHash: "a".repeat(64) });
  assert.deepEqual(resolveEvaluationStep(EVALUATION_DECLINE_REPLY, termsPending), { step: "evaluation_decline", verticalId: "imob" });
  for (const text of ["sim", "aceito", "pode ativar", "ok"]) assert.equal(resolveEvaluationStep(text, termsPending)?.step, "evaluation_remind", text);
  assert.equal(resolveEvaluationStep(EVALUATION_ACCEPT_REPLY, null), null, "aceitar sem condições pendentes não faz nada");
  assert.equal(resolveEvaluationStep(EVALUATION_ACCEPT_REPLY, qualifying)?.step, "evaluation_qualify");
});

test("integração com o resolvedor de ativação: avaliação tem precedência só com botão/etapa; ativação legada intacta", () => {
  assert.equal(resolveVerticalActivationStep(EVALUATION_REQUEST_REPLY, null)?.step, "evaluation_offer");
  assert.deepEqual(resolveVerticalActivationStep("ativar o IMOB neste workspace", null), { step: "preview", verticalId: "imob" });
  assert.equal(resolveVerticalActivationStep("ativar o IMOB neste workspace", confirm)?.step, "evaluation_qualify", "durante o pedido, o texto é a resposta (o intake decide se é fora de contexto)");
  assert.equal(resolveVerticalActivationStep("cancelar", { status: "proposed", verticalId: "imob", registryVersion: "r" })?.step, "cancel");
});

test("oferta: só segue se o servidor disser que a avaliação está disponível; nunca chama o pedido", async () => {
  const off = fakeApi({ getAccess: () => ({ data: { evaluation: { offerAvailable: false, phase: null } } }) });
  const unavailable = await enrichEvaluationRequest({ step: "evaluation_offer", verticalId: "imob" }, off.api);
  assert.match(unavailable.content, /não está disponível/);
  assert.match(unavailable.content, /Nada foi enviado, aceito, ativado nem cobrado/);
  assert.equal(unavailable.activation.status, "evaluation_closed");
  assert.equal(off.called("requestAccess").length, 0);
  const on = fakeApi();
  const prompt = await enrichEvaluationRequest({ step: "evaluation_offer", verticalId: "imob" }, on.api);
  assert.equal(prompt.activation.status, "evaluation_qualifying");
  assert.deepEqual(prompt.quickReplies, [EVALUATION_LEAVE_REPLY]);
  assert.match(prompt.content, /Nada é enviado até você confirmar/);
  assert.equal(on.called("requestAccess").length, 0);
});

test("qualificação: confirmar, completar, pergunta intermediária e fora de contexto preservam o rascunho e NÃO enviam o pedido", async () => {
  const run = async (result: Partial<EvaluationIntakeResult>, stage: "qualifying" | "confirm" = "qualifying", draft = {}) => {
    const f = fakeApi({ intake: () => ({ data: intakeResult(result) }) });
    const presentation = await enrichEvaluationRequest({ step: "evaluation_qualify", verticalId: "imob", message: "texto", stage, draft }, f.api);
    assert.equal(f.called("requestAccess").length, 0, "qualificar nunca envia o pedido");
    assert.equal(f.called("acceptTerms").length + f.called("declineTerms").length, 0);
    return { presentation, f };
  };
  const confirmed = await run({ outcome: "confirm", draft: draftFull, content: "Revise" });
  assert.equal(confirmed.presentation.activation.status, "evaluation_confirm");
  assert.deepEqual(confirmed.presentation.quickReplies, [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY]);
  assert.deepEqual((confirmed.presentation.activation as { draft: unknown }).draft, draftFull);
  assert.deepEqual(confirmed.f.called("intake")[0]!.args[0], { message: "texto", stage: "qualifying", draft: {} });

  const more = await run({ outcome: "need_more", draft: { problem: "x" }, missing: ["teamSize", "expectedOutcome"], content: "Falta" });
  assert.equal(more.presentation.activation.status, "evaluation_qualifying");
  assert.deepEqual((more.presentation.activation as { draft: unknown }).draft, { problem: "x" });

  const question = await run({ outcome: "answered", content: "Não cobra nada" }, "confirm", draftFull);
  assert.equal(question.presentation.activation.status, "evaluation_confirm", "a pergunta não tira a pessoa da confirmação");
  assert.deepEqual((question.presentation.activation as { draft: unknown }).draft, draftFull, "rascunho intacto");
  assert.ok(question.presentation.quickReplies.includes(EVALUATION_SUBMIT_REPLY));

  const off = await run({ outcome: "out_of_context", content: "Estamos montando o pedido..." }, "confirm", draftFull);
  assert.deepEqual(off.presentation.quickReplies, [EVALUATION_CONTINUE_REPLY, EVALUATION_LEAVE_REPLY], "explica a etapa e oferece continuar ou mudar de assunto");
  assert.equal(off.presentation.activation.status, "evaluation_confirm");

  const left = await run({ outcome: "leave", endsContext: true, content: "Encerrei" });
  assert.equal(left.presentation.activation.status, "evaluation_closed");
  for (const outcome of ["not_permitted", "offer_unavailable"] as const) {
    assert.equal((await run({ outcome, content: "x" })).presentation.activation.status, "evaluation_closed", outcome);
  }
});

test("qualificação: indisponibilidade e timeout dizem o que NÃO aconteceu e mantêm a etapa e o rascunho", async () => {
  const down = fakeApi({ intake: () => { throw new Error("provider fora"); } });
  const result = await enrichEvaluationRequest({ step: "evaluation_qualify", verticalId: "imob", message: "x", stage: "confirm", draft: draftFull }, down.api);
  assert.match(result.content, /Nada foi enviado, aceito, ativado nem cobrado/);
  assert.equal(result.activation.status, "evaluation_confirm");
  assert.deepEqual((result.activation as { draft: unknown }).draft, draftFull);
  assert.equal(down.called("requestAccess").length, 0);
  // timeout: o cliente aborta e a mensagem diz que demorou (não que falhou por outra causa)
  const slow = fakeApi({ intake: (_body: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const timedOut = await enrichEvaluationRequest({ step: "evaluation_qualify", verticalId: "imob", message: "x", stage: "qualifying", draft: {} }, slow.api, 5);
  assert.match(timedOut.content, /demorou mais que o limite/);
  assert.equal(slow.called("requestAccess").length, 0);
});

test("pedido: só com a confirmação explícita; envia o contexto validado com confirmed=true pelo canal chat; é só o PEDIDO", async () => {
  const f = fakeApi();
  const sent = await enrichEvaluationRequest({ step: "evaluation_submit", verticalId: "imob", draft: { ...draftFull, additionalInfo: "ex" } }, f.api);
  assert.deepEqual(f.called("requestAccess")[0]!.args[0], {
    vertical: "IMOB", channel: "chat", evaluation: { problem: draftFull.problem, teamSize: 6, expectedOutcome: draftFull.expectedOutcome, additionalInfo: "ex", confirmed: true },
  });
  assert.match(sent.content, /só o PEDIDO: nada foi aprovado, aceito nem ativado/);
  assert.equal(sent.activation.status, "evaluation_requested");
  assert.equal(f.called("acceptTerms").length + f.called("getTerms").length, 0, "enviar não aceita nem mostra/ativa nada");
  // rascunho incompleto não chama a API
  const incomplete = fakeApi();
  const stay = await enrichEvaluationRequest({ step: "evaluation_submit", verticalId: "imob", draft: { problem: "x" } }, incomplete.api);
  assert.equal(incomplete.called("requestAccess").length, 0);
  assert.equal(stay.activation.status, "evaluation_qualifying");
  // erros do servidor: mensagens explícitas, sem fallback genérico e sem afirmar envio
  for (const [code, pattern] of [["EVALUATION_OFFER_UNAVAILABLE", /não está disponível/], ["EVALUATION_ALREADY_USED", /já foi iniciada/], ["VERTICAL_ACCESS_REQUEST_FORBIDDEN", /pode pedir a avaliação/]] as const) {
    const failing = fakeApi({ requestAccess: () => { throw apiError(code); } });
    const result = await enrichEvaluationRequest({ step: "evaluation_submit", verticalId: "imob", draft: draftFull }, failing.api);
    assert.match(result.content, pattern, code);
    assert.match(result.content, /Nada foi enviado/);
  }
  const already = await enrichEvaluationRequest({ step: "evaluation_submit", verticalId: "imob", draft: draftFull }, fakeApi({ requestAccess: () => ({ data: { outcome: "already_requested" } }) }).api);
  assert.match(already.content, /já tem um pedido em análise/);
});

test("condições: proposta ≠ aceite ≠ ativação; aceitar não ativa e só oferece o passo de ativação", async () => {
  const text = ["Condições propostas (v1)", "Validade: 5 dia(s)"];
  const proposal = describeEvaluationTermsPresentation({ termsHash: "h".repeat(64), text, accepted: false, requesterIsViewer: true });
  assert.match(proposal.content, /só a PROPOSTA da EIAH/);
  assert.match(proposal.content, /Aceitar não ativa nada nem libera uso/);
  assert.deepEqual(proposal.quickReplies, [EVALUATION_ACCEPT_REPLY, EVALUATION_DECLINE_REPLY, EVALUATION_LEAVE_REPLY]);
  assert.equal(proposal.activation.status, "evaluation_terms");
  const viewer = describeEvaluationTermsPresentation({ termsHash: "h", text, accepted: false, requesterIsViewer: false });
  assert.deepEqual(viewer.quickReplies, [], "quem não fez o pedido não vê botão de aceite");
  const already = describeEvaluationTermsPresentation({ termsHash: "h", text, accepted: true, requesterIsViewer: true });
  assert.match(already.content, /AINDA NÃO começou/);
  assert.deepEqual(already.quickReplies, [EVALUATION_ACTIVATE_REPLY]);

  const f = fakeApi({ getTerms: () => ({ data: { available: true, phase: "terms_pending_acceptance", termsHash: "h".repeat(64), accepted: false, requesterIsViewer: true, text } }) });
  const shown = await enrichEvaluationRequest({ step: "evaluation_view_terms", verticalId: "imob" }, f.api);
  assert.equal(shown.activation.status, "evaluation_terms");
  const accepted = await enrichEvaluationRequest({ step: "evaluation_accept", verticalId: "imob", termsHash: "h".repeat(64) }, f.api);
  assert.deepEqual(f.called("acceptTerms")[0]!.args[0], { termsHash: "h".repeat(64) });
  assert.match(accepted.content, /NÃO ativou nada/);
  assert.deepEqual(accepted.quickReplies, [EVALUATION_ACTIVATE_REPLY]);
  assert.equal(f.called("requestAccess").length, 0);
  const stale = await enrichEvaluationRequest({ step: "evaluation_accept", verticalId: "imob", termsHash: "h" }, fakeApi({ acceptTerms: () => { throw apiError("EVALUATION_TERMS_MISMATCH"); } }).api);
  assert.match(stale.content, /nada foi aceito/);
  const none = await enrichEvaluationRequest({ step: "evaluation_view_terms", verticalId: "imob" }, fakeApi({ getTerms: () => ({ data: { available: false, phase: null, stale: true } }) }).api);
  assert.match(none.content, /não estão mais vigentes/);
  const declined = fakeApi();
  assert.match((await enrichEvaluationRequest({ step: "evaluation_decline", verticalId: "imob" }, declined.api)).content, /nada foi ativado/);
  assert.equal(declined.called("declineTerms").length, 1);
});

test("prévia de ativação: a avaliação só é anunciada quando o servidor a habilita; condições aparecem antes de qualquer ativação", () => {
  const base = { status: "approval_required" as const, verticalId: "imob", approval: { code: "VERTICAL_NOT_APPROVED" as const, message: "precisa liberar", accessStatus: null }, canRequest: true };
  const without = describeActivationPreview(base, "imob");
  assert.equal(without.quickReplies.includes(EVALUATION_REQUEST_REPLY), false);
  assert.doesNotMatch(without.content, /avaliação gratuita/i);
  const withOffer = describeActivationPreview({ ...base, evaluationOffer: true }, "imob");
  assert.ok(withOffer.quickReplies.includes(EVALUATION_REQUEST_REPLY));
  assert.match(withOffer.content, /a EIAH analisa e decide, e nada é concedido até lá/);
  assert.equal(describeActivationPreview({ ...base, evaluationOffer: true, canRequest: false }, "imob").quickReplies.includes(EVALUATION_REQUEST_REPLY), false, "sem permissão de pedir, não se anuncia");
  assert.equal(describeActivationPreview({ ...base, verticalId: "log", evaluationOffer: true }, "log").quickReplies.includes(EVALUATION_REQUEST_REPLY), false, "só o IMOB");
  const terms = describeActivationPreview({ status: "evaluation_terms", verticalId: "imob", terms: { termsHash: "h", text: ["x"], accepted: false, requesterIsViewer: true } }, "imob");
  assert.equal(terms.activation.status, "evaluation_terms");
  assert.equal(terms.quickReplies.includes(EVALUATION_ACTIVATE_REPLY), false, "antes do aceite não se propõe ativar");
});

test("enrich: passo de avaliação delega ao engine e grava o estado no snapshot; passo legado segue igual", async () => {
  const f = fakeApi();
  const decision = { content: "interino", verticalActivationRequest: { step: "evaluation_offer" as const, verticalId: "imob" as const } };
  const enriched = await enrichLauncherDecisionWithVerticalActivation(decision, {
    preview: (async () => { throw new Error("não deve chamar"); }) as never,
    confirm: (async () => { throw new Error("não deve chamar"); }) as never,
    evaluation: f.api,
  });
  assert.equal(enriched?.verticalActivation?.status, "evaluation_qualifying");
  assert.deepEqual(enriched?.resolvedQuickReplies, [EVALUATION_LEAVE_REPLY]);
  const legacy = await enrichLauncherDecisionWithVerticalActivation(
    { content: "x", verticalActivationRequest: { step: "cancel" as const, verticalId: "imob" as const } },
    { preview: (async () => { throw new Error("x"); }) as never, confirm: (async () => { throw new Error("x"); }) as never },
  );
  assert.equal(legacy?.verticalActivation?.status, "cancelled");
  assert.ok(DEFAULT_EVALUATION_API.getAccess && DEFAULT_EVALUATION_API.intake);
});

test("avisos: termos propostos levam a VER as condições, nunca direto à ativação", () => {
  const presentation = describeUnshownNotices(
    [{ id: "n1", vertical: "IMOB", kind: "avaliacao_termos_propostos", message: "m", createdAt: "2026-11-13T12:00:00.000Z" }],
    new Set(),
  );
  assert.ok(presentation);
  const next = presentation!.notice.nextReplies ?? [];
  assert.ok(next.every((reply) => reply !== ACTIVATION_REQUEST_REPLY) || next.length === 0);
});

// ─── Fila administrativa ────────────────────────────────────────────────────────────────────────────────────────────
const adminItem = (over: Partial<VerticalApprovalAdminItem> = {}): VerticalApprovalAdminItem => ({
  id: "1", tenantName: "T", workspaceName: "W", vertical: "IMOB", status: "aguardando_humano", source: "request", revocationMode: null, requestedBy: "u",
  requestedAt: null, decidedBy: null, decidedAt: null, note: null, score: 80, recommendation: "recomendado", scoreReasons: null, scoreRuleVersion: null, ...over,
});

test("fila: aprovação de avaliação não é decidida pelo chat; a tela mostra fases e bloqueios", () => {
  const evaluation = adminItem({ id: "e1", grantKind: "evaluation", evaluationPhase: "requested" });
  const queue = describeApprovalQueue([adminItem({ id: "p1" }), evaluation]);
  assert.equal(queue.approvalChat.status, "queue");
  assert.equal((queue.approvalChat as { items: unknown[] }).items.length, 1, "só o pedido padrão tem botões no chat");
  assert.match(queue.content, /1 pedido\(s\) de avaliação gratuita aguardando decisão/);
  assert.match(queue.content, /nada é aprovado pelo chat/);
  const onlyEvaluation = describeApprovalQueue([evaluation]);
  assert.equal(onlyEvaluation.approvalChat.status, "empty");
  assert.match(onlyEvaluation.content, /pedido\(s\) de avaliação gratuita/);
  assert.equal(canDecide(evaluation), true);
  assert.equal(canDecide(adminItem({ status: "pre_ativacao", grantKind: "evaluation", evaluationPhase: "terms_pending_acceptance" })), true, "reproposta antes do aceite");
  assert.equal(canDecide(adminItem({ status: "pre_ativacao", grantKind: "evaluation", evaluationPhase: "accepted_pending_activation" })), false, "depois do aceite não há decisão");
  assert.equal(itemsForTab([evaluation, adminItem({ id: "x", status: "aprovado", grantKind: "evaluation", evaluationPhase: "active" })], "avaliacoes").length, 1);
  assert.equal(itemsForTab([adminItem({ id: "x", status: "encerrado", grantKind: "evaluation", evaluationPhase: "ended" })], "historico").length, 0, "avaliação tem aba própria");
  assert.deepEqual(revocationActionsFor({ status: "revogado", grantKind: "evaluation" }), ["alterar_modo"], "avaliação não é restaurável");
  assert.deepEqual(revocationActionsFor({ status: "revogado", grantKind: null }), ["alterar_modo", "restaurar"], "legado intacto");
  assert.deepEqual(evaluationBlockers({ state: "blocked", reasons: ["decision_pending:consumption_policy"] }), ["decision_pending:consumption_policy"]);
  assert.deepEqual(evaluationBlockers({ state: "enabled", reasons: [] }), []);
});
