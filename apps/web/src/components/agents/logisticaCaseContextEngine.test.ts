import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidLogisticaCaseRef,
  logisticaFrontDoorHref,
  parseLogisticaCaseRef,
  readRememberedLogisticaCase,
  rememberLogisticaCase,
  resolveLogisticaCaseForCard,
  resolveLogisticaCaseToResume,
  LOGISTICA_ACCESS_MESSAGES,
} from "./logisticaCaseContextEngine";

const CASE = "cm0synthetic0case01";

test("referência de caso: só formato opaco válido é aceito; o resto é descartado", () => {
  assert.equal(parseLogisticaCaseRef(`?domain=logistica&case=${CASE}`), CASE);
  for (const bad of ["", "?case=", "?case=abc", "?case=../../etc/passwd", "?case=a b c d e f g h", "?case=" + "x".repeat(65), "?case=<script>alert(1)</script>", "?case=cm0synthetic0case01%0d%0a", "?case[]=cm0synthetic0case01"]) {
    assert.equal(parseLogisticaCaseRef(bad), null, bad);
  }
  assert.equal(isValidLogisticaCaseRef(null), false);
  assert.equal(isValidLogisticaCaseRef({}), false);
});

test("URLs de transferência explícita preservam a referência e nada mais", () => {
  assert.equal(logisticaFrontDoorHref(), "/app/chat?domain=logistica");
  assert.equal(logisticaFrontDoorHref(CASE), `/app/chat?domain=logistica&case=${CASE}`);
  assert.equal(logisticaFrontDoorHref("a&domain=imob"), "/app/chat?domain=logistica");
});

test("FD-CHAT-ONLY-001: não há mais URL de cockpit no engine; toda mensagem de acesso negado cobre cada motivo", () => {
  assert.equal(Object.keys(LOGISTICA_ACCESS_MESSAGES).sort().join(","), "approval_required,available,installation_inactive,installation_missing,membership_required,policy_denied,revoked,unavailable");
  for (const message of Object.values(LOGISTICA_ACCESS_MESSAGES)) assert.doesNotMatch(message, /cockpit/i);
});

function memoryStore(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; } } as Storage & { data: Map<string, string> };
}
const scopeA = { tenantId: "t1", workspaceId: "w1", userId: "u1" };

test("FD-E2E-002 continuidade: a referência é lembrada por escopo, a URL tem prioridade e nada fora do formato é aceito", () => {
  const store = memoryStore();
  rememberLogisticaCase(store, scopeA, "case_ABCDEFGH12");
  assert.equal(readRememberedLogisticaCase(store, scopeA), "case_ABCDEFGH12");
  assert.equal(resolveLogisticaCaseToResume("", store, scopeA), "case_ABCDEFGH12", "sem ?case= retoma o último caso");
  assert.equal(resolveLogisticaCaseToResume("?case=url_ABCDEFGH34", store, scopeA), "url_ABCDEFGH34", "a URL prevalece");
  assert.equal(resolveLogisticaCaseToResume("?case=../etc", store, scopeA), "case_ABCDEFGH12", "URL inválida é descartada");
  // isolamento por workspace, tenant e usuário
  assert.equal(readRememberedLogisticaCase(store, { ...scopeA, workspaceId: "w2" }), null);
  assert.equal(readRememberedLogisticaCase(store, { ...scopeA, tenantId: "t2" }), null);
  assert.equal(readRememberedLogisticaCase(store, { ...scopeA, userId: "u2" }), null);
  // valor adulterado no armazenamento não vira referência
  store.setItem([...store.data.keys()][0]!, "<script>x</script>");
  assert.equal(readRememberedLogisticaCase(store, scopeA), null);
});

test("FD-E2E-002 continuidade: 'Nova preparação' esquece o caso; referência inválida não grava; armazenamento indisponível não quebra", () => {
  const store = memoryStore();
  rememberLogisticaCase(store, scopeA, "case_ABCDEFGH12");
  rememberLogisticaCase(store, scopeA, null);
  assert.equal(readRememberedLogisticaCase(store, scopeA), null);
  rememberLogisticaCase(store, scopeA, "curto");
  assert.equal(store.data.size, 0, "formato inválido nunca é gravado");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.doesNotThrow(() => rememberLogisticaCase(broken, scopeA, "case_ABCDEFGH12"));
  assert.equal(readRememberedLogisticaCase(broken, scopeA), null);
  assert.equal(resolveLogisticaCaseToResume("", null, scopeA), null);
});

test("FD-E2E-003 cartão: o veredito do servidor só decide quando recusa a MESMA referência local ou confirma uma que faltava", () => {
  const A = "case_ABCDEFGH12", B = "case_ZYXWVUTS98";
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: A, memoryRef: null }), { caseRef: A, forget: false }, "sem veredito: URL");
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: B }), { caseRef: B, forget: false }, "sem veredito: memória");
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: A, memoryRef: B, serverCase: { status: "resolved", caseRef: A } }), { caseRef: A, forget: false }, "URL prevalece");
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: A, memoryRef: null, serverCase: { status: "unavailable", caseRef: A } }), { caseRef: null, forget: true }, "recusada: esquece e abre preparação nova");
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: A, serverCase: { status: "unavailable", caseRef: A } }), { caseRef: null, forget: true });
  // snapshot antigo (conversa restaurada) não derruba o caso mais atual
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: B, serverCase: { status: "unavailable", caseRef: A } }), { caseRef: B, forget: false });
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: null, serverCase: { status: "resolved", caseRef: A } }), { caseRef: A, forget: false }, "confirmada e o cliente não tem mais nada");
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: null, serverCase: { status: "unavailable", caseRef: A } }), { caseRef: null, forget: false });
  assert.deepEqual(resolveLogisticaCaseForCard({ urlRef: null, memoryRef: null, serverCase: { status: "resolved", caseRef: "../x" } }), { caseRef: null, forget: false }, "veredito com formato inválido é ignorado");
});
