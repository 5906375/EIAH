import test from "node:test";
import assert from "node:assert/strict";
import type { LogisticaContextAccess, OraculoPreparationRecordV1 } from "@eiah/contracts";
import {
  isValidLogisticaCaseRef,
  logisticaCockpitHref,
  logisticaFrontDoorHref,
  parseLogisticaCaseRef,
  resolveLogisticaFrontDoorContext,
  summarizeLogisticaCase,
} from "./logisticaCaseContextEngine";

const access = (over: Partial<LogisticaContextAccess> = {}): LogisticaContextAccess => ({
  allowed: true, mode: "context_only", usage: "full", executionAllowed: false, externalTransmissionAllowed: false, reason: "available", ...over,
});
const CASE = "cm0synthetic0case01";
const record = (over: Partial<OraculoPreparationRecordV1> = {}): OraculoPreparationRecordV1 => ({
  schemaVersion: "oraculo.empty-return-preparation.v1", tenantId: "t", workspaceId: "w",
  context: { port: { status: "informed", value: "Porto" }, depot: { status: "to_confirm" }, flow: { status: "not_applicable", justification: "x" } },
  caseId: CASE, caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 3, lifecycle: "DISCOVERY",
  createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T11:00:00.000Z",
  executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false, ...over,
} as OraculoPreparationRecordV1);
function deps(over: Partial<Parameters<typeof resolveLogisticaFrontDoorContext>[0]> = {}) {
  const calls = { getCase: 0, listCases: 0 };
  return { calls, value: {
    getAccess: async (): Promise<LogisticaContextAccess | null> => access(), caseRef: null as string | null,
    getCase: async (id: string) => { calls.getCase++; return { data: record({ caseId: id }) }; },
    listCases: async () => { calls.listCases++; return { data: { items: [record()] } }; },
    ...over,
  } };
}

test("referência de caso: só formato opaco válido é aceito; o resto é descartado", () => {
  assert.equal(parseLogisticaCaseRef(`?domain=logistica&case=${CASE}`), CASE);
  for (const bad of ["", "?case=", "?case=abc", "?case=../../etc/passwd", "?case=a b c d e f g h", "?case=" + "x".repeat(65), "?case=<script>alert(1)</script>", "?case=cm0synthetic0case01%0d%0a", "?case[]=cm0synthetic0case01"]) {
    assert.equal(parseLogisticaCaseRef(bad), null, bad);
  }
  assert.equal(isValidLogisticaCaseRef(null), false);
  assert.equal(isValidLogisticaCaseRef({}), false);
});

test("URLs de transferência explícita preservam a referência e nada mais", () => {
  assert.equal(logisticaCockpitHref(), "/app/logistica");
  assert.equal(logisticaCockpitHref(CASE), `/app/logistica?case=${CASE}`);
  assert.equal(logisticaFrontDoorHref(), "/app/chat?domain=logistica");
  assert.equal(logisticaFrontDoorHref(CASE), `/app/chat?domain=logistica&case=${CASE}`);
  assert.equal(logisticaCockpitHref("../x"), "/app/logistica", "referência inválida nunca vira URL");
  assert.equal(logisticaFrontDoorHref("a&domain=imob"), "/app/chat?domain=logistica");
});

test("sem acesso confirmado pelo servidor: nenhuma consulta de caso e mensagem compreensível por motivo", async () => {
  for (const reason of ["installation_missing", "installation_inactive", "approval_required", "revoked", "membership_required", "policy_denied", "unavailable"] as const) {
    const d = deps({ getAccess: async () => access({ allowed: false, usage: "blocked", reason }), caseRef: CASE });
    const out = await resolveLogisticaFrontDoorContext(d.value);
    assert.equal(out.status, "no_access");
    assert.equal(out.status === "no_access" && out.reason, reason);
    assert.ok(out.message.length > 10);
    assert.deepEqual(d.calls, { getCase: 0, listCases: 0 }, `${reason}: não pode consultar casos`);
    assert.equal(out.ctas[0].href, "/app/chat?domain=core");
  }
  const none = deps({ getAccess: async () => null, caseRef: CASE });
  assert.equal((await resolveLogisticaFrontDoorContext(none.value)).status, "no_access");
  assert.equal(none.calls.getCase + none.calls.listCases, 0);
  const forgedAllowedButBlocked = deps({ getAccess: async () => access({ allowed: true, usage: "blocked" }), caseRef: CASE });
  assert.equal((await resolveLogisticaFrontDoorContext(forgedAllowedButBlocked.value)).status, "no_access");
  const failing = deps({ getAccess: async () => { throw new Error("rede"); }, caseRef: CASE });
  const failed = await resolveLogisticaFrontDoorContext(failing.value);
  assert.equal(failed.status === "no_access" && failed.reason, "unavailable", "falha ao consultar o acesso é fail-closed");
  assert.equal(failing.calls.getCase + failing.calls.listCases, 0);
});

test("com acesso e referência: recupera o caso pelo servidor e resume pendências, revisão humana e evidências", async () => {
  const d = deps({ caseRef: CASE });
  const out = await resolveLogisticaFrontDoorContext(d.value);
  assert.equal(out.status, "case");
  if (out.status !== "case") return;
  assert.equal(d.calls.getCase, 1);
  assert.deepEqual(out.summary.pending, ["Depósito"]);
  assert.deepEqual(out.summary.needsReview, ["Fluxo pretendido"]);
  assert.equal(out.summary.evidenceCount, 0);
  assert.equal(out.summary.lastReview, null);
  assert.equal(out.ctas[0].href, `/app/logistica?case=${CASE}`);
  assert.match(out.message, /não autoriza execução/);
});

test("conferência registrada aparece como transcrição humana, sem afirmar autorização", () => {
  const summary = summarizeLogisticaCase(record({ evidences: [{} as never], contentReviews: [{ outcome: "divergent", documentId: "doc1" } as never] }));
  assert.equal(summary.evidenceCount, 1);
  assert.deepEqual(summary.lastReview, { outcome: "com divergência", documentId: "doc1" });
});

test("somente leitura: o caso abre, com aviso, e o cockpit continua sendo explícito", async () => {
  const out = await resolveLogisticaFrontDoorContext(deps({ getAccess: async () => access({ usage: "read_only", reason: "revoked" }), caseRef: CASE }).value);
  assert.equal(out.status, "case");
  assert.match(out.message, /somente leitura/);
});

test("erros do servidor viram mensagens distintas e nunca expõem dados nem selecionam caso", async () => {
  const cases: Array<[number | undefined, string, RegExp]> = [
    [404, "not_found", /não foi encontrado/], [403, "forbidden", /permissão/], [401, "session", /sessão/], [409, "integrity", /integridade/], [500, "unavailable", /Não foi possível/], [undefined, "unavailable", /Não foi possível/],
  ];
  for (const [status, kind, text] of cases) {
    const out = await resolveLogisticaFrontDoorContext(deps({ caseRef: CASE, getCase: async () => { throw Object.assign(new Error("HTTP " + status + " segredo-interno"), status === undefined ? {} : { status }); } }).value);
    assert.equal(out.status, "case_unavailable");
    if (out.status !== "case_unavailable") continue;
    assert.equal(out.kind, kind);
    assert.match(out.message, text);
    assert.doesNotMatch(JSON.stringify(out), /segredo-interno|caseId|revision/);
  }
});

test("caso de outro workspace (servidor responde 404) e id divergente devolvido são tratados como indisponíveis", async () => {
  const foreign = await resolveLogisticaFrontDoorContext(deps({ caseRef: CASE, getCase: async () => { throw Object.assign(new Error("x"), { status: 404 }); } }).value);
  assert.equal(foreign.status === "case_unavailable" && foreign.kind, "not_found");
  const mismatch = await resolveLogisticaFrontDoorContext(deps({ caseRef: CASE, getCase: async () => ({ data: record({ caseId: "cm0otherworkspace99" }) }) }).value);
  assert.equal(mismatch.status, "case_unavailable", "o servidor deve devolver exatamente o caso pedido");
  assert.doesNotMatch(JSON.stringify(mismatch), /cm0otherworkspace99/);
});

test("sem referência: sugere o caso mais recente (ação explícita) ou o cockpit vazio; falha de lista não vaza", async () => {
  const withCase = await resolveLogisticaFrontDoorContext(deps().value);
  assert.equal(withCase.status, "no_case");
  assert.equal(withCase.status === "no_case" && withCase.recent?.caseId, CASE);
  assert.equal(withCase.ctas[0].label, "Continuar este caso no cockpit");
  const empty = await resolveLogisticaFrontDoorContext(deps({ listCases: async () => ({ data: { items: [] } }) }).value);
  assert.equal(empty.status === "no_case" && empty.recent, null);
  assert.equal(empty.ctas[0].href, "/app/logistica");
  const failing = await resolveLogisticaFrontDoorContext(deps({ listCases: async () => { throw Object.assign(new Error("x"), { status: 403 }); } }).value);
  assert.equal(failing.status === "case_unavailable" && failing.kind, "forbidden");
});
