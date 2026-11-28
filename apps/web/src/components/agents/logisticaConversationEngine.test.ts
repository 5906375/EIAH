import test from "node:test";
import assert from "node:assert/strict";
import type { OraculoDecisionViewV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { buildForwardSummary, DECISION_BLOCK_MESSAGES, describeDecisionTrigger, resolveLogisticaJourney } from "./logisticaConversationEngine";
import { attachVerticalHandoffToSnapshot } from "./verticalHandoffEngine";

const CASE = "cm0synthetic0case01";
const informed = (value: string) => ({ status: "informed" as const, value });
const base = (over: Record<string, unknown> = {}): OraculoPreparationRecordV1 => ({
  schemaVersion: "oraculo.empty-return-preparation.v1", tenantId: "t", workspaceId: "w",
  context: { port: informed("Porto Sintético"), depot: informed("Depósito Sintético"), flow: informed("Devolução de vazio") },
  operationReference: { containerNumber: "TSTU1234567" },
  caseId: CASE, caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 2, lifecycle: "DISCOVERY",
  createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T11:00:00.000Z",
  executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false, ...over,
} as unknown as OraculoPreparationRecordV1);
const evidence = (documentId = "doc-1", fileName = "eir-sintetico.txt") => ({ documentId, fileName, kind: "receipt", sourceDescription: "origem sintética", sha256: "a".repeat(64), linkedBy: "user-secret-id", linkedAt: "2026-10-19T10:30:00.000Z", sizeBytes: 10, mimeType: "text/plain" });
const review = (documentId: string, outcome: string, checks: Array<{ field: string; status: string }> = []) => ({ id: `rev-${documentId}-${outcome}`, documentId, outcome, checks, reviewedBy: "reviewer-secret-id", reviewedAt: "2026-10-19T10:40:00.000Z", locator: "página 1 — localizador sensível", notes: "notas sensíveis do revisor" });
const step = (view: ReturnType<typeof resolveLogisticaJourney>, id: string) => view.steps.find((s) => s.id === id)!;

test("sem caso: etapas pendentes, próximo passo é salvar, sem decisão humana nem resumo", () => {
  const view = resolveLogisticaJourney(null);
  assert.deepEqual(view.steps.map((s) => s.id), ["context", "operation_reference", "evidence", "review", "decision"]);
  assert.ok(view.steps.every((s) => s.state === "pending"));
  assert.equal(view.humanDecisionNeeded, false); assert.equal(view.forwardSummary, null); assert.equal(view.caseShortId, null);
  assert.match(view.nextAction, /Salvar a preparação/);
});

test("campos obrigatórios e pendências: não informado, a confirmar, valor ausente e contêiner sem referência", () => {
  const view = resolveLogisticaJourney(base({
    context: { port: { status: "not_informed" }, depot: { status: "to_confirm" }, flow: { status: "informed", value: "  " } },
    operationReference: {},
  }));
  assert.equal(step(view, "context").state, "pending");
  assert.deepEqual(step(view, "context").pendencies, ["Porto: não informado", "Depósito: a confirmar", "Fluxo pretendido: valor obrigatório"]);
  assert.equal(step(view, "operation_reference").state, "pending");
  assert.match(step(view, "operation_reference").pendencies[0]!, /Contêiner esperado não informado/);
  assert.equal(step(view, "evidence").state, "pending");
  assert.equal(step(view, "review").state, "pending"); assert.match(step(view, "review").detail, /depois de vincular/);
  assert.equal(view.humanDecisionNeeded, false);
});

test("jornada completa e coerente: tudo concluído, sem decisão humana, e o aceite operacional continua fora do fluxo", () => {
  const view = resolveLogisticaJourney(base({ evidences: [evidence()], contentReviews: [review("doc-1", "consistent_in_checked_fields")] }));
  assert.ok(view.steps.every((s) => s.state === "done"), JSON.stringify(view.steps.map((s) => [s.id, s.state])));
  assert.equal(view.humanDecisionNeeded, false); assert.equal(view.forwardSummary, null);
  assert.match(view.results.join(" "), /Aceite operacional, responsabilidade e custos: pendentes e fora deste fluxo/);
  assert.match(view.results.join(" "), /coerente nos campos conferidos \(transcrição humana\)/);
  assert.match(view.nextAction, /aceite operacional fora deste fluxo/);
});

test("divergência e correspondência indeterminada exigem decisão humana e geram resumo sem dados pessoais nem conteúdo do documento", () => {
  const view = resolveLogisticaJourney(base({
    evidences: [evidence("doc-1", "eir-sintetico.txt"), evidence("doc-2", "foto.png")],
    contentReviews: [review("doc-1", "divergent", [{ field: "containerNumber", status: "diverges" }, { field: "depot", status: "diverges" }, { field: "port", status: "matches" }]), review("doc-2", "indeterminate", [{ field: "returnDate", status: "not_observed" }])],
  }));
  assert.equal(step(view, "review").state, "needs_human"); assert.equal(step(view, "decision").state, "needs_human");
  assert.equal(view.humanDecisionNeeded, true);
  const summary = view.forwardSummary!;
  assert.match(summary, /Caso cm0synth, revisão 2: decisão humana necessária/);
  assert.match(summary, /eir-sintetico\.txt: com divergência \(Contêiner, Depósito\)/);
  assert.match(summary, /foto\.png: indeterminada \(Data da devolução\)/);
  assert.match(summary, /não notifica ninguém nem autoriza a operação/);
  for (const secret of ["reviewer-secret-id", "user-secret-id", "notas sensíveis", "localizador sensível", "a".repeat(64), "@"]) assert.equal(summary.includes(secret), false, secret);
});

test("campo dispensado ('não se aplica') exige revisão humana; a conferência mais recente por documento é a que vale", () => {
  const dispensed = resolveLogisticaJourney(base({ context: { port: informed("P"), depot: informed("D"), flow: { status: "not_applicable", justification: "j" } } }));
  assert.equal(step(dispensed, "context").state, "needs_human"); assert.equal(dispensed.humanDecisionNeeded, true);
  assert.match(dispensed.forwardSummary ?? "", /Fluxo pretendido: dispensado com justificativa — requer revisão humana/);
  const superseded = resolveLogisticaJourney(base({ evidences: [evidence()], contentReviews: [review("doc-1", "divergent", [{ field: "port", status: "diverges" }]), review("doc-1", "consistent_in_checked_fields")] }));
  assert.equal(step(superseded, "review").state, "done"); assert.equal(superseded.humanDecisionNeeded, false);
  const noReview = resolveLogisticaJourney(base({ evidences: [evidence()] }));
  assert.equal(step(noReview, "review").state, "pending"); assert.match(step(noReview, "review").pendencies[0]!, /conferência humana ainda não registrada/);
});

test("resumo de encaminhamento é determinístico e só contém o necessário", () => {
  const text = buildForwardSummary("cm0synth", 7, ["Porto: dispensado com justificativa — requer revisão humana"]);
  assert.equal(text, buildForwardSummary("cm0synth", 7, ["Porto: dispensado com justificativa — requer revisão humana"]));
  assert.equal(text.split("\n").length, 4);
});

test("snapshot: a jornada só abre quando o servidor permite o handoff de Logística (log); bloqueio, IMOB e ausência não abrem", () => {
  const allowed = (id: string) => ({ verticalHandoff: { ok: true, handoff: { vertical: { id, label: id, registryVersion: "vr1-x" }, capability: { id: "oraculo.context" } } } });
  const open = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null } as { verticalContext: "IMOB" | "LEGAL" | "LOGISTICA" | null; logisticaJourney?: boolean | null }, allowed("log") as never);
  assert.equal(open.logisticaJourney, true); assert.equal(open.verticalContext, "LOGISTICA");
  const imob = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null } as { verticalContext: "IMOB" | "LEGAL" | "LOGISTICA" | null; logisticaJourney?: boolean | null }, allowed("imob") as never);
  assert.equal(imob.logisticaJourney, undefined);
  const blocked = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null } as { verticalContext: "IMOB" | "LEGAL" | "LOGISTICA" | null; logisticaJourney?: boolean | null }, { verticalHandoff: { ok: false, reasonCode: "VERTICAL_POLICY_DENIED", verticalId: "log" } } as never);
  assert.equal(blocked.logisticaJourney, undefined);
  const none = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | "LOGISTICA" | null } as { verticalContext: "IMOB" | "LEGAL" | "LOGISTICA" | null; logisticaJourney?: boolean | null }, null);
  assert.equal(none.logisticaJourney, undefined);
});

// FD-E2E-004 (J17): o estado da decisão humana vem do servidor (visão) e só vale para a MESMA revisão do caso.
const dispensed = () => base({ context: { port: informed("P"), depot: informed("D"), flow: { status: "not_applicable", justification: "j" } } });
const decisionView = (coverage: OraculoDecisionViewV1["coverage"], over: Partial<OraculoDecisionViewV1> = {}): OraculoDecisionViewV1 => ({
  caseId: CASE, revision: 2, coverage, triggers: [{ key: "context:flow", kind: "context_field", field: "flow" }], requests: [],
  eligibility: { requestAllowed: coverage === "none", requestBlockedReason: coverage === "none" ? null : "already_requested", deciderAvailable: true, decideAllowed: true },
  operationalAuthorization: "not_granted", ...over,
});

test("J17: sem solicitação a etapa pede a decisão e mantém o resumo copiável; pendente esconde o resumo; aprovada conclui sem autorizar", () => {
  const none = resolveLogisticaJourney(dispensed(), decisionView("none"));
  assert.equal(step(none, "decision").state, "needs_human"); assert.match(step(none, "decision").detail, /Solicite a decisão abaixo/);
  assert.ok(none.forwardSummary);
  const pending = resolveLogisticaJourney(dispensed(), decisionView("pending"));
  assert.equal(step(pending, "decision").state, "needs_human"); assert.match(step(pending, "decision").detail, /Aguardando um responsável elegível/);
  assert.equal(pending.forwardSummary, null); assert.ok(pending.results.some((line) => /solicitada, aguardando responsável/.test(line)));
  const approved = resolveLogisticaJourney(dispensed(), decisionView("approved"));
  assert.equal(step(approved, "decision").state, "done"); assert.match(step(approved, "decision").detail, /Não autoriza execução/);
  assert.equal(approved.humanDecisionNeeded, false); assert.equal(approved.forwardSummary, null);
  for (const line of approved.results) assert.doesNotMatch(line, /autorizad[oa] para execu/i);
  assert.match(approved.results.at(-1)!, /pendentes e fora deste fluxo/);
});

test("J17: rejeitada, complementação e obsoleta continuam exigindo decisão e orientam o próximo passo", () => {
  const rejected = resolveLogisticaJourney(dispensed(), decisionView("rejected"));
  assert.equal(step(rejected, "decision").state, "needs_human"); assert.match(step(rejected, "decision").detail, /rejeitada/);
  assert.ok(rejected.forwardSummary);
  const more = resolveLogisticaJourney(dispensed(), decisionView("more_information"));
  assert.match(step(more, "decision").detail, /complementação/);
  const obsolete = resolveLogisticaJourney(dispensed(), decisionView("obsolete"));
  assert.match(step(obsolete, "decision").detail, /obsoleta porque o caso mudou/);
});

test("J17: visão de outra revisão ou de outro caso é ignorada (nunca decide a tela)", () => {
  assert.match(step(resolveLogisticaJourney(dispensed(), decisionView("approved", { revision: 1 })), "decision").detail, /Solicite a decisão abaixo/);
  assert.match(step(resolveLogisticaJourney(dispensed(), decisionView("approved", { caseId: "outro" })), "decision").detail, /Solicite a decisão abaixo/);
  assert.equal(step(resolveLogisticaJourney(dispensed(), null), "decision").state, "needs_human");
  // sem gatilho a visão é irrelevante: a etapa não finge decisão
  const clean = resolveLogisticaJourney(base(), decisionView("approved"));
  assert.notEqual(step(clean, "decision").detail, "");
  assert.equal(clean.humanDecisionNeeded, false);
});

test("J17: rótulos dos gatilhos e mensagens de bloqueio usam a linguagem da jornada, sem conteúdo do documento", () => {
  const record = base({ context: { port: informed("P"), depot: informed("D"), flow: { status: "not_applicable", justification: "j" } }, evidences: [evidence()] });
  assert.equal(describeDecisionTrigger({ key: "context:flow", kind: "context_field", field: "flow" }, record), "Fluxo pretendido: dispensado com justificativa");
  assert.equal(describeDecisionTrigger({ key: "review:doc-1:r", kind: "document_review", documentId: "doc-1", reviewId: "r", outcome: "divergent" }, record), "eir-sintetico.txt: com divergência");
  assert.match(DECISION_BLOCK_MESSAGES.no_eligible_decider, /Sem responsável elegível/); assert.match(DECISION_BLOCK_MESSAGES.no_eligible_decider, /Nenhuma solicitação foi criada/);
});

test("J17: caso com eventos de decisão e visão ainda não carregada não afirma nada sobre a decisão (sem 'solicite' enganoso)", () => {
  const withEvents = base({ context: { port: informed("P"), depot: informed("D"), flow: { status: "not_applicable", justification: "j" } }, humanDecisions: [{ kind: "requested", id: "r1" }] });
  assert.match(step(resolveLogisticaJourney(withEvents, null), "decision").detail, /Consultando a situação da decisão humana/);
  assert.doesNotMatch(step(resolveLogisticaJourney(withEvents, null), "decision").detail, /Solicite a decisão/);
  assert.match(step(resolveLogisticaJourney(dispensed(), null), "decision").detail, /Solicite a decisão abaixo/, "sem eventos: pede a decisão como antes");
});
