import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWorkspaceSwitchShadow,
  isWorkspaceSwitchShadowEnabled,
  observeWorkspaceSwitchShadow,
  sanitizeTargetWorkspaceId,
  WORKSPACE_SWITCH_POLICY_VERSION,
  WORKSPACE_SWITCH_SHADOW_ENV_KEY,
  WORKSPACE_SWITCH_SHADOW_EVENT_TYPE,
  type WorkspaceSwitchReaders,
} from "../services/workspaceSwitchAuthorization";

// EIAH-AUTHZ-SESSION-WORKSPACE-G2 — decisão sombra (pura, sem banco): contrato, ativação e não-interferência.

const readers = (over: Partial<{ workspace: { tenantId: string } | null; membership: { status: string | null } | null; legacy: boolean }> = {}): WorkspaceSwitchReaders => ({
  readWorkspaceTenant: async () => ("workspace" in over ? over.workspace! : { tenantId: "t1" }),
  readMembershipStatus: async () => ("membership" in over ? over.membership! : null),
  readLegacyAssignment: async () => over.legacy ?? false,
});
const input = { tenantId: "t1", fromWorkspaceId: "wsA", userId: "u1", targetWorkspaceId: "wsB" };

test("ativação: desligada por padrão; só `true` explícito e só em ambiente local (nunca produção/staging)", () => {
  const key = WORKSPACE_SWITCH_SHADOW_ENV_KEY;
  assert.equal(isWorkspaceSwitchShadowEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isWorkspaceSwitchShadowEnabled({ NODE_ENV: "test" } as NodeJS.ProcessEnv), false, "sem a variável");
  for (const value of ["1", "TRUE", "yes", "on", "", "false"]) assert.equal(isWorkspaceSwitchShadowEnabled({ [key]: value, NODE_ENV: "test" } as NodeJS.ProcessEnv), false, value);
  assert.equal(isWorkspaceSwitchShadowEnabled({ [key]: "true", NODE_ENV: "test" } as NodeJS.ProcessEnv), true);
  assert.equal(isWorkspaceSwitchShadowEnabled({ [key]: "true", NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  for (const env of ["production", "staging", "", undefined]) {
    assert.equal(isWorkspaceSwitchShadowEnabled({ [key]: "true", ...(env === undefined ? {} : { NODE_ENV: env }) } as NodeJS.ProcessEnv), false, `NODE_ENV=${env}`);
  }
});

test("decisão: vínculo ativo, atribuição legada e cada negativa, com a regra e a versão", async () => {
  const cases: Array<[string, Parameters<typeof readers>[0], Partial<typeof input>, boolean, string, string]> = [
    ["vínculo ativo", { membership: { status: "active" } }, {}, true, "MEMBERSHIP_ACTIVE", "membership"],
    ["vínculo ativo (caixa/espaços)", { membership: { status: " ACTIVE " } }, {}, true, "MEMBERSHIP_ACTIVE", "membership"],
    ["atribuição legada explícita", { legacy: true }, {}, true, "LEGACY_ASSIGNMENT", "legacy_assignment"],
    ["sem vínculo nem atribuição", {}, {}, false, "MEMBERSHIP_REQUIRED", "none"],
    ["vínculo inativo", { membership: { status: "inactive" } }, {}, false, "MEMBERSHIP_NOT_ACTIVE", "none"],
    ["vínculo revogado", { membership: { status: "revoked" } }, {}, false, "MEMBERSHIP_NOT_ACTIVE", "none"],
    ["status nulo", { membership: { status: null } }, {}, false, "MEMBERSHIP_NOT_ACTIVE", "none"],
    ["vínculo não ativo vence a atribuição legada", { membership: { status: "inactive" }, legacy: true }, {}, false, "MEMBERSHIP_NOT_ACTIVE", "none"],
    ["workspace inexistente", { workspace: null }, {}, false, "WORKSPACE_FORBIDDEN", "none"],
    ["workspace de outro tenant", { workspace: { tenantId: "t2" }, membership: { status: "active" } }, {}, false, "WORKSPACE_FORBIDDEN", "none"],
    ["token sem identidade humana", { membership: { status: "active" } }, { userId: null }, false, "IDENTITY_REQUIRED", "none"],
    ["identidade vazia", { membership: { status: "active" } }, { userId: "  " }, false, "IDENTITY_REQUIRED", "none"],
    ["identificador inválido", { membership: { status: "active" } }, { targetWorkspaceId: "../x; DROP" as unknown as string }, false, "TARGET_INVALID", "none"],
    ["identificador ausente", {}, { targetWorkspaceId: undefined as unknown as string }, false, "TARGET_INVALID", "none"],
  ];
  for (const [name, over, patch, wouldAllow, reasonCode, evidence] of cases) {
    const decision = await evaluateWorkspaceSwitchShadow({ ...input, ...patch }, readers(over));
    assert.equal(decision.wouldAllow, wouldAllow, name);
    assert.equal(decision.reasonCode, reasonCode, name);
    assert.equal(decision.evidence, evidence, name);
    assert.equal(decision.mode, "shadow");
    assert.equal(decision.policyVersion, WORKSPACE_SWITCH_POLICY_VERSION);
    assert.equal(decision.tenantId, "t1");
    assert.equal(decision.fromWorkspaceId, "wsA");
    assert.match(decision.correlationId, /^[0-9a-f-]{36}$/);
  }
  assert.equal((await evaluateWorkspaceSwitchShadow(input, readers({ membership: { status: "active" } }))).workspaceId, "wsB");
  assert.equal((await evaluateWorkspaceSwitchShadow({ ...input, targetWorkspaceId: "!!" }, readers())).workspaceId, null);
  const fixed = await evaluateWorkspaceSwitchShadow({ ...input, correlationId: "corr-1" }, readers());
  assert.equal(fixed.correlationId, "corr-1");
});

test("inexistente e de outro tenant são indistinguíveis; falha de leitura nunca vira permissão", async () => {
  const none = await evaluateWorkspaceSwitchShadow(input, readers({ workspace: null }));
  const other = await evaluateWorkspaceSwitchShadow(input, readers({ workspace: { tenantId: "t2" } }));
  const strip = ({ correlationId: _c, ...rest }: typeof none) => rest;
  assert.deepEqual(strip(none), strip(other));
  for (const broken of ["readWorkspaceTenant", "readMembershipStatus", "readLegacyAssignment"] as const) {
    const r = { ...readers({ membership: { status: "active" } }), [broken]: async () => { throw new Error("db down"); } } as WorkspaceSwitchReaders;
    const decision = await evaluateWorkspaceSwitchShadow(input, broken === "readLegacyAssignment" ? { ...r, readMembershipStatus: async () => null } : r);
    assert.equal(decision.wouldAllow, false, broken);
    assert.equal(decision.reasonCode, "EVALUATION_UNAVAILABLE", broken);
  }
});

test("o resultado não carrega credenciais e a avaliação só usa leituras", async () => {
  const decision = await evaluateWorkspaceSwitchShadow(input, readers({ membership: { status: "active" } }));
  assert.deepEqual(Object.keys(decision).sort(), ["correlationId", "evidence", "fromWorkspaceId", "mode", "policyVersion", "reasonCode", "tenantId", "workspaceId", "wouldAllow"]);
  assert.equal(/token|secret|password/i.test(JSON.stringify(decision)), false);
  // os leitores expostos à avaliação são somente de leitura: não há função de escrita no contrato
  assert.deepEqual(Object.keys(readers()).sort(), ["readLegacyAssignment", "readMembershipStatus", "readWorkspaceTenant"]);
  assert.equal(sanitizeTargetWorkspaceId(" ws_abc-1 "), "ws_abc-1");
  assert.equal(sanitizeTargetWorkspaceId(42), null);
  assert.equal(sanitizeTargetWorkspaceId("a".repeat(129)), null);
});

test("observação: desligada não faz nada; ligada grava UM evento observacional sem token; falhas não propagam", async () => {
  const on = { [WORKSPACE_SWITCH_SHADOW_ENV_KEY]: "true", NODE_ENV: "test" } as NodeJS.ProcessEnv;
  const events: Array<Record<string, unknown>> = [];
  const record = async (event: Record<string, unknown>) => { events.push(event); };
  const actor = { tenantId: "t1", workspaceId: "wsA", userId: "u1" };
  const legacy = { outcome: "allowed" as const, tokenAction: "created" as const };

  assert.equal(await observeWorkspaceSwitchShadow({ actor, targetWorkspaceId: "wsB", legacy, env: {} as NodeJS.ProcessEnv, readers: readers(), record: record as never }), null);
  assert.equal(events.length, 0, "desligado: nenhum evento");

  const decision = await observeWorkspaceSwitchShadow({ actor, targetWorkspaceId: "wsB", legacy, env: on, readers: readers(), record: record as never, correlationId: "c-1" });
  assert.equal(decision?.wouldAllow, false);
  assert.equal(events.length, 1);
  const event = events[0]!;
  assert.equal(event.eventType, WORKSPACE_SWITCH_SHADOW_EVENT_TYPE);
  assert.equal(event.tenantId, "t1");
  assert.equal(event.workspaceId, "wsA", "workspace da origem (FK do ledger)");
  assert.equal(event.severity, "info");
  const meta = event.metadata as Record<string, unknown>;
  assert.equal(meta.kind, "shadow_observation");
  assert.equal(meta.operational, false);
  assert.equal(meta.enforced, false);
  assert.equal(meta.correlationId, "c-1");
  assert.equal(meta.policyVersion, WORKSPACE_SWITCH_POLICY_VERSION);
  assert.deepEqual(meta.shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_REQUIRED", evidence: "none" });
  assert.deepEqual(meta.legacy, { outcome: "allowed", tokenAction: "created" });
  assert.equal(meta.actorUserId, "u1");
  assert.equal(meta.targetWorkspaceId, "wsB");
  assert.equal(/token"|secret|password|bearer/i.test(JSON.stringify(event)), false);
  assert.equal(typeof meta.observedAt, "string");

  // falha do ledger: não lança, devolve null e avisa em log
  const warnings: unknown[][] = [];
  const failing = await observeWorkspaceSwitchShadow({ actor, targetWorkspaceId: "wsB", legacy, env: on, readers: readers(), record: async () => { throw new Error("ledger down"); }, logger: { warn: (...a) => { warnings.push(a); } } });
  assert.equal(failing, null);
  assert.equal(warnings.length, 1);

  // ledger lento: a rota não espera além do limite
  const slow = await observeWorkspaceSwitchShadow({ actor, targetWorkspaceId: "wsB", legacy, env: on, readers: readers(), record: () => new Promise(() => undefined), timeoutMs: 20, logger: { warn: () => undefined } });
  assert.equal(slow, null);

  // leitor quebrado: ainda registra a observação, como indisponível (nunca como permissão)
  events.length = 0;
  const broken = await observeWorkspaceSwitchShadow({ actor, targetWorkspaceId: "wsB", legacy, env: on, readers: { ...readers(), readMembershipStatus: async () => { throw new Error("x"); } }, record: record as never });
  assert.equal(broken?.reasonCode, "EVALUATION_UNAVAILABLE");
  assert.equal(broken?.wouldAllow, false);
  assert.equal((events[0]!.metadata as { shadow: { wouldAllow: boolean } }).shadow.wouldAllow, false);
});
