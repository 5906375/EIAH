import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorkspaceProvenance,
  summarizeProvenance,
  type InvitationFact, type MembershipFact, type ProvenanceFacts, type ProvenanceRecord, type ProvenanceSourceName,
} from "./workspaceProvenanceClassifier";

// G2.3-B — lógica pura do classificador de procedência (sem banco). Os 20 cenários do protótipo + os casos novos do incremento.
const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000);
const ALL: ProvenanceSourceName[] = ["memberships", "users", "workspaces", "tokens", "invitations", "ledger_creator", "ledger_bootstrap", "legacy_assignments", "installations", "approvals", "profiles", "role_catalog"];
const GESTOR_DEFAULTS = ["imob.chat.use", "workspace.manage_members", "workspace.manage_roles"];
const CORRETOR_DEFAULTS = ["imob.chat.use"];

function emptyFacts(): ProvenanceFacts {
  return {
    sources: Object.fromEntries(ALL.map((s) => [s, "available"])) as ProvenanceFacts["sources"],
    memberships: [], users: [], workspaces: [], tokens: [], invitations: [], creatorEvents: [], bootstrapEvents: [],
    legacyAssignments: [], installations: [], approvals: [], profiles: [], roleCatalog: [],
  };
}
/** Mundo mínimo: tenant t1 com W1 (inicial) e W2 (adicional); criador `c` admitido em W1 por `tenant.onboarded`. */
function world(): ProvenanceFacts {
  const f = emptyFacts();
  f.users.push({ id: "c", tenantId: "t1" });
  f.workspaces.push({ id: "W1", tenantId: "t1", name: "Workspace Inicial" }, { id: "W2", tenantId: "t1", name: "Adicional" });
  for (const w of ["W1", "W2"]) {
    f.roleCatalog.push({ tenantId: "t1", workspaceId: w, roleKey: "gestor", defaultPermissions: GESTOR_DEFAULTS }, { tenantId: "t1", workspaceId: w, roleKey: "corretor", defaultPermissions: CORRETOR_DEFAULTS },
      { tenantId: "t1", workspaceId: w, roleKey: "founder", defaultPermissions: [...GESTOR_DEFAULTS, "products.activate"] });
  }
  f.creatorEvents.push({ eventId: "ev-c", tenantId: "t1", workspaceId: "W1", userId: "c", at: at(0) });
  f.memberships.push(mem("c", "W1", "gestor", [...GESTOR_DEFAULTS, "products.activate"], { created: 0 }));
  return f;
}
function mem(userId: string, workspaceId: string, roleKey: string, permissions: string[] | null, o: { tenant?: string; status?: string; created?: number; updated?: number } = {}): MembershipFact {
  return { tenantId: o.tenant ?? "t1", workspaceId, userId, roleKey, permissions, status: o.status ?? "active", createdAt: at(o.created ?? 5), updatedAt: at(o.updated ?? o.created ?? 5) };
}
function user(f: ProvenanceFacts, id: string, tenant = "t1") { if (!f.users.some((u) => u.id === id)) f.users.push({ id, tenantId: tenant }); }
function invite(f: ProvenanceFacts, id: string, inviter: string | null, invitee: string, o: Partial<InvitationFact> & { role?: string; perms?: string[] } = {}) {
  user(f, invitee);
  f.invitations.push({
    id, tenantId: "t1", workspaceId: "W1", inviterUserId: inviter, acceptedByUserId: invitee, roleKey: o.role ?? "corretor", permissions: o.perms ?? CORRETOR_DEFAULTS,
    createdAt: at(10), acceptedAt: at(20), expiresAt: at(10 + 72 * 60), emailMatchesCurrent: true, ...o,
  } as InvitationFact);
}
const classify = (f: ProvenanceFacts) => classifyWorkspaceProvenance(f, { now: at(1000) });
const find = (res: { records: ProvenanceRecord[] }, userId: string, ws = "W1") => {
  const r = res.records.find((x) => x.userId === userId && x.workspaceId === ws);
  assert.ok(r, `registro ${userId}/${ws} ausente`);
  return r!;
};
const states = (r: ProvenanceRecord) => `${r.admission.state}/${r.privilege.state}`;

// DESVIO DELIBERADO DO PROTÓTIPO (O-3): a promoção automática prova a origem do PRIVILÉGIO, não da ADMISSÃO (o vínculo pode ter sido explícito).
// No protótipo, soleFounder dava UNVERIFIED/UNVERIFIED; aqui dá INSUFFICIENT_EVIDENCE/UNVERIFIED. Os outros 19 cenários coincidem.
test("20 cenários do protótipo (admissão/privilégio) + revisão humana", () => {
  const f = world();
  // convidado, gestor convidado e cadeia de profundidade 2 (concedente admitido ANTES do convite)
  invite(f, "i-ia", "c", "ia"); f.memberships.push(mem("ia", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  invite(f, "i-ma", "c", "ma", { role: "gestor", perms: GESTOR_DEFAULTS }); f.memberships.push(mem("ma", "W1", "gestor", GESTOR_DEFAULTS, { created: 20 }));
  invite(f, "i-na", "ma", "na", { createdAt: at(30), acceptedAt: at(40) }); f.memberships.push(mem("na", "W1", "corretor", CORRETOR_DEFAULTS, { created: 40 }));
  // privilégio acima do convite
  invite(f, "i-ic", "c", "ic"); f.memberships.push(mem("ic", "W1", "founder", ["products.activate", "workspace.manage_members"], { created: 20, updated: 500 }));
  // inativo
  invite(f, "i-ii", "c", "ii"); f.memberships.push(mem("ii", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20, status: "inactive" }));
  // concedente admitido DEPOIS de emitir o convite (convite anterior à admissão)
  invite(f, "i-te", "ma", "te", { createdAt: at(15), acceptedAt: at(25) }); f.memberships.push(mem("te", "W1", "corretor", CORRETOR_DEFAULTS, { created: 25 }));
  // token sem vínculo
  user(f, "l"); f.tokens.push({ tenantId: "t1", workspaceId: "W1", userId: "l" });
  // função autodeclarada observada (bootstrap), bootstrap não observado, ativador-apenas
  user(f, "sd"); f.memberships.push(mem("sd", "W1", "founder", ["products.activate"], { created: 100 }));
  f.bootstrapEvents.push({ eventId: "b-sd", tenantId: "t1", workspaceId: "W1", actorUserId: "sd", observation: "membership_bootstrap", assignedRoleKey: "founder", roleSource: "profile_role", at: at(100.01) });
  f.profiles.push({ userId: "sd", roleKey: "founder" });
  user(f, "bn"); f.memberships.push(mem("bn", "W1", "corretor", CORRETOR_DEFAULTS, { created: 101 }));
  user(f, "ac"); f.memberships.push(mem("ac", "W1", "corretor", CORRETOR_DEFAULTS, { created: 102 })); f.installations.push({ tenantId: "t1", workspaceId: "W1", activatedByUserId: "ac" });
  // criador em workspace adicional (sem admissão lá)
  f.memberships.push(mem("c", "W2", "gestor", GESTOR_DEFAULTS, { created: 200 }));
  // primeiro membro (bootstrap observado) e convite dele; promoção a Founder
  f.workspaces.push({ id: "W3", tenantId: "t1", name: "W3" }, { id: "W5", tenantId: "t1", name: "W5" }, { id: "W6", tenantId: "t1", name: "W6" }, { id: "W7", tenantId: "t1", name: "W7" });
  user(f, "fb"); f.memberships.push(mem("fb", "W3", "gestor", GESTOR_DEFAULTS, { created: 300 }));
  f.bootstrapEvents.push({ eventId: "b-fb", tenantId: "t1", workspaceId: "W3", actorUserId: "fb", observation: "membership_bootstrap", assignedRoleKey: "gestor", roleSource: "first_member", at: at(300.01) });
  invite(f, "i-xb", "fb", "xb", { workspaceId: "W3", createdAt: at(310), acceptedAt: at(320) }); f.memberships.push(mem("xb", "W3", "corretor", CORRETOR_DEFAULTS, { workspaceId: "W3", created: 320 } as never));
  user(f, "p"); f.memberships.push(mem("p", "W5", "founder", ["products.activate"], { created: 400, updated: 401 }));
  f.bootstrapEvents.push({ eventId: "b-p", tenantId: "t1", workspaceId: "W5", actorUserId: "p", observation: "sole_member_promotion", assignedRoleKey: "founder", roleSource: null, at: at(401) });
  // duplo criador
  user(f, "m1"); user(f, "m2");
  for (const m of ["m1", "m2"]) { f.memberships.push(mem(m, "W6", "gestor", GESTOR_DEFAULTS, { created: 500 })); f.creatorEvents.push({ eventId: `ev-${m}`, tenantId: "t1", workspaceId: "W6", userId: m, at: at(500) }); }
  // atribuição legada (igual / divergente)
  user(f, "la"); user(f, "lb");
  f.memberships.push(mem("la", "W7", "corretor", CORRETOR_DEFAULTS, { created: 600 }), mem("lb", "W7", "founder", ["products.activate"], { created: 600 }));
  f.legacyAssignments.push({ tenantId: "t1", workspaceId: "W7", userId: "la", roleKey: "corretor" }, { tenantId: "t1", workspaceId: "W7", userId: "lb", roleKey: "corretor" });
  // vínculo entre tenants
  f.users.push({ id: "x", tenantId: "t2" }); f.memberships.push(mem("x", "W1", "corretor", CORRETOR_DEFAULTS, { created: 700 }));

  const res = classify(f);
  const expected: Array<[string, string, string]> = [
    ["c|W1", "VERIFIED/VERIFIED", "creator"], ["ia|W1", "VERIFIED/VERIFIED", "invited"], ["ma|W1", "VERIFIED/VERIFIED", "invitedManager"], ["na|W1", "VERIFIED/VERIFIED", "chainDepth2"],
    ["ic|W1", "VERIFIED/CONFLICTING", "privilegeConflict"], ["ii|W1", "VERIFIED/VERIFIED", "inactive"], ["te|W1", "UNVERIFIED/INSUFFICIENT_EVIDENCE", "temporalOrder"],
    ["l|W1", "INSUFFICIENT_EVIDENCE/NOT_APPLICABLE", "legacyNoLink"], ["sd|W1", "UNVERIFIED/UNVERIFIED", "selfDeclared"], ["bn|W1", "INSUFFICIENT_EVIDENCE/INSUFFICIENT_EVIDENCE", "bootstrapUnobserved"],
    ["ac|W1", "UNVERIFIED/INSUFFICIENT_EVIDENCE", "activatorOnly"], ["c|W2", "UNVERIFIED/UNVERIFIED", "tenantCreatorSecondary"], ["fb|W3", "UNVERIFIED/UNVERIFIED", "firstMember"],
    ["xb|W3", "UNVERIFIED/INSUFFICIENT_EVIDENCE", "inviteFromBootstrap"], ["p|W5", "INSUFFICIENT_EVIDENCE/UNVERIFIED", "soleFounder"], ["m1|W6", "CONFLICTING/CONFLICTING", "multiCreator1"],
    ["m2|W6", "CONFLICTING/CONFLICTING", "multiCreator2"], ["la|W7", "INSUFFICIENT_EVIDENCE/INSUFFICIENT_EVIDENCE", "legacyAssignment"], ["lb|W7", "INSUFFICIENT_EVIDENCE/CONFLICTING", "legacyMismatch"], ["x|W1", "CONFLICTING/CONFLICTING", "crossTenant"],
  ];
  assert.equal(expected.length, 20);
  for (const [k, want, name] of expected) { const [u, w] = k.split("|"); assert.equal(states(find(res, u!, w)), want, name); }
  // revisão humana: só VERIFIED/VERIFIED ativo e sem sinal de revisão dispensa revisão
  for (const r of res.records) {
    const clean = r.admission.state === "VERIFIED" && r.privilege.state === "VERIFIED" && r.hasMembership && r.membership?.status === "active" && !r.signals.some((s) => ["INVITATION_ACCEPTED_ON_EXISTING_MEMBERSHIP", "MULTIPLE_ACCEPTED_INVITATIONS", "TOKEN_ACCESS_WITHOUT_MEMBERSHIP", "MEMBERSHIP_NOT_ACTIVE", "INVITATION_EMAIL_DIFFERS_FROM_CURRENT_EMAIL"].includes(s));
    assert.equal(r.needsHumanReview, !clean, `${r.userId}/${r.workspaceId}`);
    assert.equal(r.classificationIsNotAuthorization, true);
  }
  assert.ok(find(res, "ii").signals.includes("MEMBERSHIP_NOT_ACTIVE"));
  assert.ok(find(res, "sd").privilege.reasons.includes("PRIVILEGE_FROM_SELF_DECLARED_PROFILE_ROLE"));
  assert.ok(find(res, "sd").signals.includes("PROFILE_ROLE_EQUALS_PRIVILEGED_ROLE"));
  assert.ok(find(res, "fb", "W3").privilege.reasons.includes("PRIVILEGE_FROM_FIRST_MEMBER_RULE"));
  assert.ok(find(res, "p", "W5").privilege.reasons.includes("AUTOMATIC_PROMOTION_OBSERVED"));
  assert.ok(find(res, "na").admission.reasons.includes("INVITATION_ROOTED_DEPTH_2"));
});

test("O-1: tenant.onboarded cobre só o workspace inicial; criador sem admissão no workspace adicional não é raiz nem membro", () => {
  const f = world();
  // c tem apenas TOKEN em W2 (sem vínculo)
  f.tokens.push({ tenantId: "t1", workspaceId: "W2", userId: "c" });
  // c emite um convite em W2 (não admitido lá): o convidado NÃO fica enraizado
  invite(f, "i-w2", "c", "d2", { workspaceId: "W2" }); f.memberships.push({ ...mem("d2", "W2", "corretor", CORRETOR_DEFAULTS, { created: 20 }) });
  const res = classify(f);
  const cTokenOnly = find(res, "c", "W2");
  assert.equal(cTokenOnly.hasMembership, false);
  assert.equal(cTokenOnly.admission.state, "UNVERIFIED");
  assert.ok(cTokenOnly.admission.reasons.includes("TENANT_CREATOR_NO_WORKSPACE_ADMISSION"));
  assert.equal(cTokenOnly.privilege.state, "NOT_APPLICABLE");
  assert.equal(cTokenOnly.needsHumanReview, true);
  const d2 = find(res, "d2", "W2");
  assert.equal(d2.admission.state, "UNVERIFIED");
  assert.ok(d2.admission.reasons.includes("INVITATION_INVITER_NOT_ROOTED_OR_NOT_ADMITTED_BEFORE_INVITATION"));
});

test("cadeia de convites: profundidade limitada a 5; além disso não enraíza", () => {
  const f = world();
  let inviter = "c";
  for (let i = 1; i <= 6; i += 1) {
    const id = `u${i}`;
    invite(f, `i${i}`, inviter, id, { role: "gestor", perms: GESTOR_DEFAULTS, createdAt: at(10 * i), acceptedAt: at(10 * i + 5) });
    f.memberships.push(mem(id, "W1", "gestor", GESTOR_DEFAULTS, { created: 10 * i + 5 }));
    inviter = id;
  }
  const res = classify(f);
  for (let i = 1; i <= 5; i += 1) assert.equal(find(res, `u${i}`).admission.state, "VERIFIED", `u${i}`);
  assert.equal(find(res, "u6").admission.state, "UNVERIFIED", "6º nível fora do limite");
});

test("concedente desconhecido (inviter NULL) e convite com dados incompletos não são prova nem conflito", () => {
  const f = world();
  invite(f, "i-null", null, "n1"); f.memberships.push(mem("n1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  invite(f, "i-inc", "c", "n2", { acceptedAt: null }); f.memberships.push(mem("n2", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  invite(f, "i-perm", "c", "n3", { permissions: null as never }); f.memberships.push(mem("n3", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  const res = classify(f);
  assert.ok(find(res, "n1").admission.reasons.includes("INVITATION_INVITER_UNKNOWN"));
  assert.equal(find(res, "n1").admission.state, "UNVERIFIED");
  assert.equal(find(res, "n2").admission.state, "UNVERIFIED");
  assert.ok(find(res, "n2").admission.reasons.includes("INVITATION_EVIDENCE_INCOMPLETE"));
  assert.equal(find(res, "n3").admission.state, "UNVERIFIED");
});

test("convite aceito sobre vínculo já existente (reativação/sobrescrita) é sinalizado e exige revisão", () => {
  const f = world();
  // vínculo criado em t=20 (primeiro convite), revogado, e reaceito em t=500 por novo convite do criador
  invite(f, "i-1", "c", "r1", { createdAt: at(10), acceptedAt: at(20) });
  invite(f, "i-2", "c", "r1", { createdAt: at(490), acceptedAt: at(500) });
  f.memberships.push(mem("r1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20, updated: 500, status: "active" }));
  const r = find(classify(f), "r1");
  assert.equal(states(r), "VERIFIED/VERIFIED");
  assert.ok(r.signals.includes("INVITATION_ACCEPTED_ON_EXISTING_MEMBERSHIP"));
  assert.ok(r.signals.includes("MULTIPLE_ACCEPTED_INVITATIONS"));
  assert.equal(r.needsHumanReview, true);
  // revogado e sem novo aceite: segue sinalizado como não ativo
  const g = world(); invite(g, "i-3", "c", "r2"); g.memberships.push(mem("r2", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20, status: "revoked" }));
  assert.ok(find(classify(g), "r2").signals.includes("MEMBERSHIP_NOT_ACTIVE"));
});

test("O-3: o papel derivado de perfil e a promoção atingem só o eixo de privilégio de QUEM foi observado; não há rebaixamento em bloco", () => {
  const f = world();
  // convidado enraizado como gestor + OUTRO usuário com função autodeclarada observada no mesmo workspace
  invite(f, "i-g", "c", "g1", { role: "gestor", perms: GESTOR_DEFAULTS }); f.memberships.push(mem("g1", "W1", "gestor", GESTOR_DEFAULTS, { created: 20 }));
  user(f, "s1"); f.memberships.push(mem("s1", "W1", "gestor", GESTOR_DEFAULTS, { created: 100 }));
  f.bootstrapEvents.push({ eventId: "b-s1", tenantId: "t1", workspaceId: "W1", actorUserId: "s1", observation: "membership_bootstrap", assignedRoleKey: "gestor", roleSource: "profile_role", at: at(100.02) });
  const res = classify(f);
  assert.equal(states(find(res, "g1")), "VERIFIED/VERIFIED", "gestor enraizado não é afetado");
  assert.equal(states(find(res, "c")), "VERIFIED/VERIFIED", "criador não é afetado");
  assert.equal(states(find(res, "s1")), "UNVERIFIED/UNVERIFIED");
  // admissão verificada + promoção automática observada: só o privilégio fica UNVERIFIED
  const g = world(); invite(g, "i-p", "c", "pr"); g.memberships.push(mem("pr", "W1", "founder", ["products.activate"], { created: 20, updated: 300 }));
  g.bootstrapEvents.push({ eventId: "b-pr", tenantId: "t1", workspaceId: "W1", actorUserId: "pr", observation: "sole_member_promotion", assignedRoleKey: "founder", roleSource: null, at: at(300) });
  assert.equal(states(find(classify(g), "pr")), "VERIFIED/UNVERIFIED");
  // promoção observada mas papel mudou depois: não explica o papel atual => CONFLICTING (e sinaliza)
  const h = world(); invite(h, "i-q", "c", "pq"); h.memberships.push(mem("pq", "W1", "gestor", GESTOR_DEFAULTS, { created: 20, updated: 900 }));
  h.bootstrapEvents.push({ eventId: "b-pq", tenantId: "t1", workspaceId: "W1", actorUserId: "pq", observation: "sole_member_promotion", assignedRoleKey: "founder", roleSource: null, at: at(300) });
  const q = find(classify(h), "pq");
  assert.equal(q.privilege.state, "CONFLICTING"); assert.ok(q.signals.includes("ROLE_CHANGED_AFTER_AUTOMATIC_PROMOTION"));
});

test("evidência de bootstrap registrada DEPOIS do vínculo ou ANTES da sua existência", () => {
  const f = world();
  user(f, "late"); f.memberships.push(mem("late", "W1", "corretor", CORRETOR_DEFAULTS, { created: 100 }));
  f.bootstrapEvents.push({ eventId: "b-late", tenantId: "t1", workspaceId: "W1", actorUserId: "late", observation: "membership_bootstrap", assignedRoleKey: "corretor", roleSource: "default", at: at(100 + 30) });
  user(f, "early"); f.memberships.push(mem("early", "W1", "corretor", CORRETOR_DEFAULTS, { created: 200 }));
  f.bootstrapEvents.push({ eventId: "b-early", tenantId: "t1", workspaceId: "W1", actorUserId: "early", observation: "membership_bootstrap", assignedRoleKey: "corretor", roleSource: "default", at: at(100) });
  user(f, "ok"); f.memberships.push(mem("ok", "W1", "corretor", CORRETOR_DEFAULTS, { created: 300 }));
  f.bootstrapEvents.push({ eventId: "b-ok", tenantId: "t1", workspaceId: "W1", actorUserId: "ok", observation: "membership_bootstrap", assignedRoleKey: "corretor", roleSource: "default", at: at(300.5) });
  const res = classify(f);
  const late = find(res, "late");
  assert.equal(late.admission.state, "CONFLICTING"); assert.ok(late.admission.reasons.includes("BOOTSTRAP_EVENT_AFTER_MEMBERSHIP_TIMELINE_CONFLICT"));
  const early = find(res, "early");
  assert.equal(early.admission.state, "INSUFFICIENT_EVIDENCE", "evento de uma encarnação anterior não vale para o vínculo atual");
  assert.ok(early.signals.includes("STALE_BOOTSTRAP_EVENT_BEFORE_CURRENT_MEMBERSHIP"));
  assert.equal(find(res, "ok").admission.state, "UNVERIFIED");
  assert.ok(find(res, "ok").admission.reasons.includes("BOOTSTRAP_OBSERVED_CREATED_DEFAULT"));
});

test("fonte opcional ausente ou com erro: limitação explícita, sem prova positiva nem negativa", () => {
  const f = world(); invite(f, "i-a", "c", "a1"); f.memberships.push(mem("a1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  const baseline = classify(f);
  assert.equal(baseline.degraded, false);
  assert.equal(states(find(baseline, "a1")), "VERIFIED/VERIFIED");
  // sem convites: o convidado deixa de ter evidência; nada é inferido do silêncio
  const g = structuredClone(f); g.invitations = []; g.sources.invitations = "unavailable"; g.sources.ledger_bootstrap = "unavailable"; g.sources.approvals = "error";
  const res = classify(g);
  const a1 = find(res, "a1");
  assert.equal(states(a1), "INSUFFICIENT_EVIDENCE/INSUFFICIENT_EVIDENCE");
  assert.ok(a1.limitations.includes("SOURCE_UNAVAILABLE:invitations")); assert.ok(a1.limitations.includes("SOURCE_UNAVAILABLE:ledger_bootstrap")); assert.ok(a1.limitations.includes("SOURCE_ERROR:approvals"));
  assert.equal(res.degraded, true);
  for (const r of res.records) assert.equal(r.needsHumanReview, true, "com fonte crítica ausente nada dispensa revisão");
  // sem catálogo de papéis: permissões do criador não comparáveis => não verifica o privilégio
  const h = structuredClone(f); h.roleCatalog = []; h.sources.role_catalog = "unavailable";
  assert.equal(states(find(classify(h), "c")), "VERIFIED/INSUFFICIENT_EVIDENCE");
});

test("evidências contraditórias => CONFLICTING (conservador)", () => {
  const f = world();
  invite(f, "i-late", "c", "e1", { createdAt: at(10), acceptedAt: at(10 + 72 * 60 + 600), expiresAt: at(10 + 72 * 60) }); f.memberships.push(mem("e1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  invite(f, "i-back", "c", "e2", { createdAt: at(50), acceptedAt: at(20) }); f.memberships.push(mem("e2", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  f.users.push({ id: "alien", tenantId: "t2" });
  f.invitations.push({ id: "i-alien", tenantId: "t1", workspaceId: "W1", inviterUserId: "alien", acceptedByUserId: "e3", roleKey: "corretor", permissions: CORRETOR_DEFAULTS, createdAt: at(10), acceptedAt: at(20), expiresAt: null, emailMatchesCurrent: true });
  user(f, "e3"); f.memberships.push(mem("e3", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  invite(f, "i-self", "e4", "e4"); f.memberships.push(mem("e4", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  // evento de criação referenciando usuário de outro tenant
  f.creatorEvents.push({ eventId: "ev-bad", tenantId: "t1", workspaceId: "W1", userId: "alien", at: at(1) }); f.memberships.push(mem("alien", "W1", "gestor", GESTOR_DEFAULTS, { created: 5 }));
  const res = classify(f);
  assert.ok(find(res, "e1").admission.reasons.includes("INVITATION_ACCEPTED_AFTER_EXPIRY")); assert.equal(find(res, "e1").admission.state, "CONFLICTING");
  assert.ok(find(res, "e2").admission.reasons.includes("INVITATION_ACCEPTED_BEFORE_CREATED")); assert.equal(find(res, "e2").admission.state, "CONFLICTING");
  assert.ok(find(res, "e3").admission.reasons.includes("INVITATION_INVITER_TENANT_MISMATCH")); assert.equal(find(res, "e3").admission.state, "CONFLICTING");
  assert.ok(find(res, "e4").admission.reasons.includes("INVITATION_SELF_INVITED")); assert.equal(find(res, "e4").admission.state, "CONFLICTING");
  assert.ok(find(res, "alien").admission.reasons.includes("CREATOR_EVENT_REFERENCE_INCONSISTENT")); assert.equal(find(res, "alien").admission.state, "CONFLICTING");
  assert.equal(states(find(res, "c")), "VERIFIED/VERIFIED", "o criador legítimo não é contaminado");
});

test("fusos: a ordem usa instantes absolutos (offsets diferentes), não o texto local", () => {
  const mk = (adminAtIso: string, inviteCreatedIso: string) => {
    const f = world();
    f.creatorEvents = [{ eventId: "ev-c", tenantId: "t1", workspaceId: "W1", userId: "c", at: new Date(adminAtIso) }];
    f.users.push({ id: "z", tenantId: "t1" });
    invite(f, "i-z", "c", "z", { createdAt: new Date(inviteCreatedIso), acceptedAt: new Date("2026-10-02T00:00:00Z") });
    f.memberships.push(mem("z", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
    return find(classify(f), "z");
  };
  // 12:00-03:00 = 15:00Z; convite 14:30Z (= 11:30-03:00, "parece" depois no relógio local de quem lê 12:00): o criador era admitido DEPOIS do convite
  assert.equal(mk("2026-10-01T12:00:00-03:00", "2026-10-01T14:30:00Z").admission.state, "UNVERIFIED");
  // 12:00+03:00 = 09:00Z; convite 11:00Z: criador admitido ANTES
  assert.equal(mk("2026-10-01T12:00:00+03:00", "2026-10-01T11:00:00Z").admission.state, "VERIFIED");
  // mesmo instante em offsets distintos: igual (limite inclusivo)
  assert.equal(mk("2026-10-01T09:00:00-03:00", "2026-10-01T12:00:00Z").admission.state, "VERIFIED");
});

test("dados incompletos: papel/permissões malformados e eventos sem referências não viram prova", () => {
  const f = world();
  user(f, "m1"); f.memberships.push({ ...mem("m1", "W1", "corretor", null, { created: 20 }) });
  user(f, "m2"); f.memberships.push({ ...mem("m2", "W1", "x", CORRETOR_DEFAULTS, { created: 20 }), roleKey: null });
  f.creatorEvents.push({ eventId: "ev-null", tenantId: "t1", workspaceId: "W1", userId: null, at: at(1) }, { eventId: "ev-nows", tenantId: "t1", workspaceId: null, userId: "m1", at: at(1) }, { eventId: "ev-nodate", tenantId: "t1", workspaceId: "W1", userId: "m1", at: null });
  const res = classify(f);
  for (const u of ["m1", "m2"]) { const r = find(res, u); assert.equal(r.admission.state, "INSUFFICIENT_EVIDENCE"); assert.equal(r.privilege.state, "INSUFFICIENT_EVIDENCE"); assert.ok(r.limitations.includes("MALFORMED_CREATOR_EVENTS_IGNORED")); }
  assert.ok(find(res, "m1").privilege.reasons.includes("MEMBERSHIP_ROLE_OR_PERMISSIONS_MALFORMED"));
});

test("O-2: atribuição legada, sozinha ou combinada, nunca produz VERIFIED por si", () => {
  for (const role of ["corretor", "gestor", "founder", "admin"]) {
    const f = world(); user(f, "lg"); f.workspaces.push({ id: "WL", tenantId: "t1", name: "L" });
    f.memberships.push({ ...mem("lg", "WL", role, role === "corretor" ? CORRETOR_DEFAULTS : GESTOR_DEFAULTS, { created: 20 }) });
    f.legacyAssignments.push({ tenantId: "t1", workspaceId: "WL", userId: "lg", roleKey: role });
    const r = find(classify(f), "lg", "WL");
    assert.notEqual(r.admission.state, "VERIFIED", role); assert.notEqual(r.privilege.state, "VERIFIED", role);
    assert.equal(r.needsHumanReview, true);
    assert.ok(r.admission.reasons.includes("LEGACY_ASSIGNMENT_PROVENANCE_UNDOCUMENTED"));
  }
});

test("vínculo ativo não é prova: sozinho => INSUFFICIENT_EVIDENCE; criador em workspace padrão reservado pode ser founder; fora dele, founder excede a evidência", () => {
  const f = world(); user(f, "bare"); f.memberships.push(mem("bare", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  const bare = find(classify(f), "bare");
  assert.equal(states(bare), "INSUFFICIENT_EVIDENCE/INSUFFICIENT_EVIDENCE"); assert.deepEqual(bare.admission.reasons, []);
  const g = world(); g.memberships = [mem("c", "W1", "founder", [...GESTOR_DEFAULTS, "products.activate"], { created: 0 })];
  assert.equal(states(find(classify(g), "c")), "VERIFIED/CONFLICTING", "founder fora do workspace reservado excede o concedido ao criador");
  const h = g; h.workspaces[0] = { id: "W1", tenantId: "t1", name: "DEFAULT" };
  assert.equal(states(find(classify(h), "c")), "VERIFIED/VERIFIED", "no workspace DEFAULT o onboarding concede founder");
});

test("backfill de migração: products.activate acima do convite só é explicado por ativador + aprovação de migração", () => {
  const withMig = world(); invite(withMig, "i-m", "c", "mg"); withMig.memberships.push(mem("mg", "W1", "corretor", [...CORRETOR_DEFAULTS, "products.activate"], { created: 20 }));
  withMig.installations.push({ tenantId: "t1", workspaceId: "W1", activatedByUserId: "mg" }); withMig.approvals.push({ tenantId: "t1", workspaceId: "W1", requestedByUserId: null, source: "migration", status: "aprovado" });
  assert.equal(states(find(classify(withMig), "mg")), "VERIFIED/VERIFIED");
  const without = structuredClone(withMig); without.approvals = [];
  assert.equal(states(find(classify(without), "mg")), "VERIFIED/CONFLICTING");
});

test("isolamento entre tenants, determinismo, ordem de entrada e imutabilidade dos fatos", () => {
  const a = world(); invite(a, "i-a", "c", "a1"); a.memberships.push(mem("a1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  // tenant t2 com os MESMOS ids de papéis, mas ids próprios; eventos de t2 jamais enraízam t1
  const b = emptyFacts();
  b.users.push({ id: "c2", tenantId: "t2" }, { id: "a1x", tenantId: "t2" }); b.workspaces.push({ id: "V1", tenantId: "t2", name: "Workspace Inicial" });
  b.creatorEvents.push({ eventId: "ev-c2", tenantId: "t2", workspaceId: "V1", userId: "c2", at: at(0) });
  b.memberships.push(mem("c2", "V1", "gestor", GESTOR_DEFAULTS, { tenant: "t2", created: 0 }), mem("a1x", "V1", "corretor", CORRETOR_DEFAULTS, { tenant: "t2", created: 20 }));
  const merge = (x: ProvenanceFacts, y: ProvenanceFacts): ProvenanceFacts => ({ sources: x.sources, memberships: [...x.memberships, ...y.memberships], users: [...x.users, ...y.users], workspaces: [...x.workspaces, ...y.workspaces], tokens: [...x.tokens, ...y.tokens], invitations: [...x.invitations, ...y.invitations], creatorEvents: [...x.creatorEvents, ...y.creatorEvents], bootstrapEvents: [...x.bootstrapEvents, ...y.bootstrapEvents], legacyAssignments: [...x.legacyAssignments, ...y.legacyAssignments], installations: [...x.installations, ...y.installations], approvals: [...x.approvals, ...y.approvals], profiles: [...x.profiles, ...y.profiles], roleCatalog: [...x.roleCatalog, ...y.roleCatalog] });
  const only = classify(a), both = classify(merge(a, b));
  assert.deepEqual(both.records.filter((r) => r.tenantId === "t1"), only.records, "t1 é idêntico com ou sem t2");
  assert.equal(find(both, "a1x", "V1").admission.state, "INSUFFICIENT_EVIDENCE", "convite inexistente em t2: não herda de t1");
  assert.equal(both.records.every((r) => (r.tenantId === "t1") === ["W1", "W2"].includes(r.workspaceId) || r.tenantId === "t2"), true);
  // determinismo e ordem de entrada
  const shuffled = structuredClone(merge(a, b)); shuffled.memberships.reverse(); shuffled.invitations.reverse(); shuffled.creatorEvents.reverse();
  assert.deepEqual(classify(shuffled), both);
  assert.deepEqual(classify(merge(a, b)), both);
  // imutabilidade: fatos congelados não lançam e não mudam
  const frozen = merge(a, b); const deepFreeze = (o: unknown): void => { if (o && typeof o === "object") { Object.freeze(o); Object.values(o as object).forEach(deepFreeze); } }; deepFreeze(frozen);
  assert.doesNotThrow(() => classify(frozen));
  assert.equal(JSON.stringify(frozen), JSON.stringify(merge(a, b)));
});

test("saída: sem identificadores pessoais nem credenciais; agregados e aprovador elegível", () => {
  const f = world(); invite(f, "i-a", "c", "a1"); f.memberships.push(mem("a1", "W1", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  user(f, "bare"); f.memberships.push(mem("bare", "W2", "corretor", CORRETOR_DEFAULTS, { created: 20 }));
  const res = classify(f);
  const text = JSON.stringify(res);
  for (const bad of ["@", "tok_", "wsi_", "password", "Bearer"]) assert.equal(text.includes(bad), false, bad);
  const summary = summarizeProvenance(res, f);
  assert.equal(summary.totals.subjects, res.records.length);
  assert.equal(summary.admission.VERIFIED, 2);
  assert.equal(summary.workspacesWithoutEligibleApprover, 1, "W1 tem o criador com gestão de membros; W2 não tem aprovador elegível");
  assert.equal(Object.keys(summary).includes("records"), false, "o agregado não carrega registros");
  assert.equal(JSON.stringify(summary).includes("\"c\""), false, "o agregado não carrega ids de usuário");
});
