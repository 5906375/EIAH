import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeImobConversation, authorizeImobHistoryActor, sendImobHistoryDenied, type ImobHistoryAccessDeps,
} from "../services/imob/imobHistoryAccess";

// FD-IMOB-HISTORY-AUTHZ-001 — decisão pura (fail-closed). Vínculo e titularidade vêm de leituras; nada aqui cria vínculo.
const scope = { tenantId: "t1", workspaceId: "w1", userId: "u1" };
const deps = (over: Partial<ImobHistoryAccessDeps> = {}): ImobHistoryAccessDeps & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    readMembership: async () => { calls.push("membership"); return { status: "active" }; },
    listOwnedConversationIds: async () => { calls.push("owned"); return new Set(["conv_a"]); },
    ...over,
  };
};

test("autorizado: vínculo ativo + titular da conversa", async () => {
  const d = deps();
  assert.deepEqual(await authorizeImobConversation(scope, "conv_a", d), { allowed: true, ...scope });
  assert.deepEqual(d.calls, ["membership", "owned"]);
});

test("identidade incompleta (sem usuário, tenant ou workspace) nega sem consultar nada", async () => {
  for (const auth of [undefined, { ...scope, userId: undefined }, { ...scope, userId: "  " }, { ...scope, tenantId: "" }, { ...scope, workspaceId: null }]) {
    const d = deps();
    const decision = await authorizeImobHistoryActor(auth as never, d);
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.code, "IMOB_HISTORY_IDENTITY_REQUIRED");
    assert.deepEqual(d.calls, []);
  }
});

test("ausência, status diferente de active ou erro na leitura do vínculo ⇒ 403 (fail-closed); a titularidade nem é consultada", async () => {
  const cases: Array<ImobHistoryAccessDeps["readMembership"]> = [
    async () => null, async () => ({ status: null }), async () => ({ status: "revoked" }), async () => ({ status: "pending" }),
    async () => ({ status: "ACTIVE" }), async () => { throw new Error("db down"); },
  ];
  for (const readMembership of cases) {
    const d = deps({ readMembership });
    const decision = await authorizeImobConversation(scope, "conv_a", d);
    assert.equal(decision.allowed, false);
    assert.equal(!decision.allowed && decision.status, 403);
    assert.equal(!decision.allowed && decision.code, "IMOB_HISTORY_MEMBERSHIP_REQUIRED");
    assert.ok(!d.calls.includes("owned"));
  }
});

test("conversa alheia, inexistente ou erro na titularidade ⇒ 404 idêntico (sem oráculo de existência)", async () => {
  const alheia = await authorizeImobConversation(scope, "conv_de_outro", deps());
  const inexistente = await authorizeImobConversation(scope, "conv_nao_existe", deps({ listOwnedConversationIds: async () => new Set() }));
  const erro = await authorizeImobConversation(scope, "conv_a", deps({ listOwnedConversationIds: async () => { throw new Error("boom"); } }));
  assert.deepEqual(alheia, inexistente);
  assert.deepEqual(alheia, erro);
  assert.equal(!alheia.allowed && alheia.status, 404);
  assert.equal(!alheia.allowed && alheia.code, "CONVERSATION_NOT_FOUND");
});

test("resposta de negação: 403 leva o reasonCode IMOB_PERMISSION_DENIED (cópia existente da UI); 404 não carrega motivo", () => {
  const sent: Array<{ status: number; body: unknown }> = [];
  const res = { status(code: number) { return { json(body: unknown) { sent.push({ status: code, body }); return this; } }; } } as never;
  sendImobHistoryDenied(res, { allowed: false, status: 403, code: "IMOB_HISTORY_MEMBERSHIP_REQUIRED", message: "m" });
  sendImobHistoryDenied(res, { allowed: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: "n" });
  assert.deepEqual(sent[0], { status: 403, body: { ok: false, error: { code: "IMOB_HISTORY_MEMBERSHIP_REQUIRED", reasonCode: "IMOB_PERMISSION_DENIED", message: "m" } } });
  assert.deepEqual(sent[1], { status: 404, body: { ok: false, error: { code: "CONVERSATION_NOT_FOUND", message: "n" } } });
});

test("o serviço não importa nenhuma escrita de vínculo (bootstrap/promoção) — só a leitura canônica", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../services/imob/imobHistoryAccess.ts", import.meta.url), "utf8");
  assert.match(source, /readActiveMembershipStatus/);
  assert.doesNotMatch(source, /workspaceResponsibility|readWorkspaceResponsibleProfile|ensureWorkspaceMembership|bootstrap\w*\(|INSERT|UPDATE|DELETE/);
});
