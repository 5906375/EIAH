import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBootstrapComparison,
  classifyBootstrapRole,
  currentRequestOrigin,
  isWorkspaceBootstrapShadowEnabled,
  observeWorkspaceBootstrapShadow,
  runWithRequestOrigin,
  WORKSPACE_BOOTSTRAP_POLICY_VERSION,
  WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY,
  WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE,
  type IndependentAdmissionEvidence,
  type WorkspaceBootstrapObservationInput,
} from "../services/workspaceBootstrapShadow";

// EIAH-AUTHZ-G2.2 — sombra do bootstrap (pura, sem banco): ativação, equivalência com a regra legada, contrato do evento e falhas.

const KEY = WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY;
const ON = { [KEY]: "true", NODE_ENV: "test" } as NodeJS.ProcessEnv;
const ROLES = ["founder", "admin", "gestor", "desenvolvedor", "corretor", "assistente"];
const noEvidence: IndependentAdmissionEvidence = { creatorLedger: false, productActivator: false, acceptedInvitation: false, legacyAssignment: false };

test("ativação: desligada por padrão; só `true` explícito e só em ambiente local (nunca produção/staging/APP_ENV)", () => {
  assert.equal(isWorkspaceBootstrapShadowEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isWorkspaceBootstrapShadowEnabled({ NODE_ENV: "test" } as NodeJS.ProcessEnv), false, "sem a variável");
  for (const value of ["1", "TRUE", "yes", "on", "", "false"]) assert.equal(isWorkspaceBootstrapShadowEnabled({ [KEY]: value, NODE_ENV: "test" } as NodeJS.ProcessEnv), false, value);
  assert.equal(isWorkspaceBootstrapShadowEnabled(ON), true);
  assert.equal(isWorkspaceBootstrapShadowEnabled({ [KEY]: "true", NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  for (const env of ["production", "staging", "", undefined]) {
    assert.equal(isWorkspaceBootstrapShadowEnabled({ [KEY]: "true", ...(env === undefined ? {} : { NODE_ENV: env }) } as NodeJS.ProcessEnv), false, `NODE_ENV=${env}`);
  }
  // APP_ENV NÃO participa do gate: nem liga nem desliga (a extensão a staging não foi comprovada nem implementada).
  assert.equal(isWorkspaceBootstrapShadowEnabled({ ...ON, APP_ENV: "production" } as NodeJS.ProcessEnv), true, "APP_ENV é ignorado: o gate é NODE_ENV local");
  assert.equal(isWorkspaceBootstrapShadowEnabled({ [KEY]: "true", APP_ENV: "staging" } as NodeJS.ProcessEnv), false, "APP_ENV=staging sozinho nunca liga");
  assert.equal(isWorkspaceBootstrapShadowEnabled({ [KEY]: "true", NODE_ENV: "production", APP_ENV: "development" } as NodeJS.ProcessEnv), false, "produção bloqueia");
});

test("o gate lê apenas o ambiente do processo: nada de requisição, cabeçalho nem APP_ENV no código do gate", () => {
  const source = readFileSync(new URL("../services/workspaceBootstrapShadow.ts", import.meta.url), "utf8");
  const gate = source.slice(source.indexOf("export function isWorkspaceBootstrapShadowEnabled"), source.indexOf("export type WorkspaceBootstrapEntryPoint"));
  assert.match(gate, /env\[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY\] !== "true"/);
  assert.match(gate, /env\.NODE_ENV === "development" \|\| env\.NODE_ENV === "test"/);
  for (const forbidden of [/req\b/, /header/i, /query/i, /body/i, /APP_ENV/, /HEALTH_ENV/]) assert.equal(forbidden.test(gate), false, String(forbidden));
});

// Cópia literal da expressão ORIGINAL de `bootstrapWorkspaceMembership` (referência de equivalência).
function legacyExpression(input: { roleKeys: string[]; workspaceHasMembers: boolean; legacyRoleKey: string | null; profileRoleKey: string | null }) {
  const roleOptions = input.roleKeys.map((key) => ({ key }));
  const { workspaceHasMembers, legacyRoleKey, profileRoleKey } = input;
  return (
    (!workspaceHasMembers && roleOptions.some((item) => item.key === "gestor") ? "gestor" : null) ??
    (legacyRoleKey && roleOptions.some((item) => item.key === legacyRoleKey) ? legacyRoleKey : null) ??
    (profileRoleKey && roleOptions.some((item) => item.key === profileRoleKey) ? profileRoleKey : null) ??
    (roleOptions.some((item) => item.key === "corretor") ? "corretor" : roleOptions[0]?.key ?? "corretor")
  );
}

test("classificador: coincide com a expressão legada em todas as combinações e informa a origem do papel", () => {
  const catalogs = [ROLES, ["corretor"], ["assistente", "founder"], ["admin"], []];
  const optionsRole = [null, "founder", "corretor", "gestor", "desconhecido"];
  let cases = 0;
  for (const roleKeys of catalogs) for (const workspaceHasMembers of [true, false]) for (const legacyRoleKey of optionsRole) for (const profileRoleKey of optionsRole) {
    const input = { roleKeys, workspaceHasMembers, legacyRoleKey, profileRoleKey };
    assert.equal(classifyBootstrapRole(input).roleKey, legacyExpression(input), JSON.stringify(input));
    cases += 1;
  }
  assert.equal(cases, 5 * 2 * 5 * 5);
  const base = { roleKeys: ROLES, workspaceHasMembers: true, legacyRoleKey: null, profileRoleKey: null };
  assert.deepEqual(classifyBootstrapRole({ ...base, workspaceHasMembers: false }), { roleKey: "gestor", source: "first_member" });
  assert.deepEqual(classifyBootstrapRole({ ...base, legacyRoleKey: "admin" }), { roleKey: "admin", source: "legacy_assignment" });
  assert.deepEqual(classifyBootstrapRole({ ...base, profileRoleKey: "founder" }), { roleKey: "founder", source: "profile_role" });
  assert.deepEqual(classifyBootstrapRole(base), { roleKey: "corretor", source: "default" });
  assert.deepEqual(classifyBootstrapRole({ ...base, legacyRoleKey: "admin", profileRoleKey: "founder" }), { roleKey: "admin", source: "legacy_assignment" }, "atribuição legada vence o perfil");
});

const bootstrapInput = (over: Partial<Extract<WorkspaceBootstrapObservationInput, { observation: "membership_bootstrap" }>> = {}): WorkspaceBootstrapObservationInput => ({
  observation: "membership_bootstrap", entryPoint: "management_summary", tenantId: "t1", workspaceId: "wsA", userId: "u1", roleKeys: ROLES,
  workspaceHasMembers: true, legacyRoleKey: null, profileRoleKey: null, assignedRoleKey: "corretor", assignedPermissions: ["imob.chat.use"], ...over,
});

test("comparação: função autodeclarada, primeiro membro e promoção aparecem como diferença para a política futura", () => {
  const selfDeclared = buildBootstrapComparison(bootstrapInput({ profileRoleKey: "founder", assignedRoleKey: "founder", assignedPermissions: ["products.activate", "workspace.manage_members"] }), noEvidence);
  assert.equal(selfDeclared.observation, "membership_bootstrap");
  const legacy = selfDeclared.legacy as Record<string, unknown>;
  assert.equal(legacy.roleSource, "profile_role");
  assert.equal(legacy.profileRoleUsed, true);
  assert.equal(legacy.profileRolePrivilegedInCatalog, true);
  assert.equal(legacy.privilegedRole, true);
  assert.equal(legacy.grantsProductsActivate, true);
  assert.equal(legacy.grantsManageMembers, true);
  assert.equal(legacy.classifierConsistent, true);
  assert.deepEqual(selfDeclared.futurePolicy, {
    policyVersion: WORKSPACE_BOOTSTRAP_POLICY_VERSION, wouldCreateMembershipOnRead: false, wouldAssignRoleKey: "corretor",
    wouldPromoteSoleMember: false, ignoresProfileRole: true, ignoresFirstMemberRule: true,
  });
  assert.deepEqual(selfDeclared.difference, { membershipCreatedOnRead: true, roleDiffers: true, privilegeReduction: true, withoutIndependentEvidence: true });

  const first = buildBootstrapComparison(bootstrapInput({ workspaceHasMembers: false, assignedRoleKey: "gestor", assignedPermissions: ["workspace.manage_members"] }), noEvidence);
  assert.equal((first.legacy as Record<string, unknown>).firstMemberRuleApplied, true);
  assert.equal((first.legacy as Record<string, unknown>).workspaceHadMembers, false);

  const withLegacy = buildBootstrapComparison(bootstrapInput({ legacyRoleKey: "admin", assignedRoleKey: "admin" }), { ...noEvidence, legacyAssignment: true });
  assert.equal((withLegacy.futurePolicy as Record<string, unknown>).wouldAssignRoleKey, "admin", "atribuição legada explícita é mantida pela política futura");
  assert.equal((withLegacy.difference as Record<string, unknown>).roleDiffers, false);
  assert.equal(withLegacy.hasIndependentEvidence, true);

  const unknownEvidence = buildBootstrapComparison(bootstrapInput(), null);
  assert.equal(unknownEvidence.hasIndependentEvidence, null, "evidência indisponível nunca vira evidência presente");
  assert.equal((unknownEvidence.difference as Record<string, unknown>).withoutIndependentEvidence, null);

  const promotion = buildBootstrapComparison({ observation: "sole_member_promotion", tenantId: "t1", workspaceId: "wsA", userId: "u1", previousRoleKey: "corretor", promotedRoleKey: "founder", promotedPermissions: ["products.activate"], activeMemberCount: 1 }, noEvidence);
  assert.equal((promotion.legacy as Record<string, unknown>).action, "sole_member_promoted_to_founder");
  assert.deepEqual(promotion.difference, { privilegeEscalationByRule: true, withoutIndependentEvidence: true });
  assert.deepEqual(promotion.futurePolicy, { policyVersion: WORKSPACE_BOOTSTRAP_POLICY_VERSION, wouldPromoteSoleMember: false, wouldKeepRoleKey: "corretor" });
});

test("o texto livre do perfil nunca é registrado; só ids, papéis do catálogo e booleanos", () => {
  const comparison = buildBootstrapComparison(bootstrapInput({ profileRoleKey: "founder_ultra_secreto", assignedRoleKey: "corretor" }), noEvidence);
  const serialized = JSON.stringify(comparison);
  assert.equal(serialized.includes("founder_ultra_secreto"), false);
  assert.equal((comparison.legacy as Record<string, unknown>).profileRolePresent, true);
  assert.equal((comparison.legacy as Record<string, unknown>).profileRoleInCatalog, false);
});

test("observação: desligada não lê nem grava; ligada grava UM evento observacional sem credenciais; falhas não propagam", async () => {
  const events: Array<Record<string, unknown>> = [];
  const record = async (event: Record<string, unknown>) => { events.push(event); };
  let evidenceReads = 0;
  const readers = { readEvidence: async () => { evidenceReads += 1; return { ...noEvidence, acceptedInvitation: true }; } };
  const input = bootstrapInput();

  assert.equal(await observeWorkspaceBootstrapShadow({ input, env: {} as NodeJS.ProcessEnv, readers, record: record as never }), null);
  assert.equal(events.length, 0);
  assert.equal(evidenceReads, 0, "desligada: nenhuma leitura de evidência");

  const comparison = await observeWorkspaceBootstrapShadow({ input, env: ON, readers, record: record as never, correlationId: "corr-1" });
  assert.equal(comparison?.hasIndependentEvidence, true);
  assert.equal(events.length, 1);
  const event = events[0]!;
  assert.equal(event.eventType, WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE);
  assert.equal(event.tenantId, "t1");
  assert.equal(event.workspaceId, "wsA");
  assert.equal(event.severity, "info");
  assert.equal(/allowed|denied|grant|authority/i.test(String(event.eventType)), false, "o tipo não parece decisão/concessão");
  const meta = event.metadata as Record<string, unknown>;
  assert.equal(meta.kind, "shadow_observation");
  assert.equal(meta.operational, false);
  assert.equal(meta.enforced, false);
  assert.equal(meta.correlationId, "corr-1");
  assert.equal(meta.policyVersion, WORKSPACE_BOOTSTRAP_POLICY_VERSION);
  assert.equal(meta.actorUserId, "u1");
  assert.equal(meta.entryPoint, "management_summary");
  assert.equal(meta.origin, null, "fora de requisição: sem origem");
  assert.deepEqual(meta.evidenceNotes, ["invitation_rootedness_not_evaluated", "product_activator_chain_not_evaluated"]);
  assert.equal(/token"|secret|password|bearer|email/i.test(JSON.stringify(event)), false);
  assert.equal(typeof meta.observedAt, "string");

  // falha do ledger: não lança, devolve null e avisa em log
  const warnings: unknown[][] = [];
  const failing = await observeWorkspaceBootstrapShadow({ input, env: ON, readers, record: async () => { throw new Error("ledger down"); }, logger: { warn: (...a) => { warnings.push(a); } } });
  assert.equal(failing, null);
  assert.equal(warnings.length, 1);

  // ledger lento: a operação não espera além do limite
  const slow = await observeWorkspaceBootstrapShadow({ input, env: ON, readers, record: () => new Promise(() => undefined), timeoutMs: 20, logger: { warn: () => undefined } });
  assert.equal(slow, null);

  // leitor de evidência quebrado: ainda registra, como "indisponível" (null), nunca como evidência presente
  events.length = 0;
  const broken = await observeWorkspaceBootstrapShadow({ input, env: ON, readers: { readEvidence: async () => { throw new Error("x"); } }, record: record as never });
  assert.equal(broken?.hasIndependentEvidence, null);
  assert.equal((events[0]!.metadata as { evidence: unknown }).evidence, null);
});

test("origem da requisição: padrão de rota sem ids, query ou token; traceId só se opaco; ausente fora de requisição", () => {
  assert.equal(currentRequestOrigin(), null);
  const req = { method: "get", baseUrl: "/api/imob", route: { path: "/cases/:caseId" } };
  runWithRequestOrigin({ req, traceId: "trace-abc_1" }, () => {
    assert.deepEqual(currentRequestOrigin(), { method: "GET", route: "/api/imob/cases/:caseId", traceId: "trace-abc_1" });
  });
  runWithRequestOrigin({ req: { method: "POST" }, traceId: "x y<script>" }, () => {
    assert.deepEqual(currentRequestOrigin(), { method: "POST", route: "unmatched", traceId: null });
  });
  assert.equal(currentRequestOrigin(), null, "o contexto não vaza para fora");
});
