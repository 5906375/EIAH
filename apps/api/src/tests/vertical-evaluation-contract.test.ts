import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvaluationTerms,
  decisionRequiresNote,
  evaluateActivationAuthorization,
  evaluateEvaluationOffer,
  evaluationActionCatalog,
  EVALUATION_MANDATORY_DECISIONS,
  EVALUATION_OFFER_CONFIG_ENV,
  EVALUATION_OFFER_FLAG_ENV,
  evaluationPhase,
  filterActionsByEvaluationGate,
  grantTermsIntegrity,
  hashEvaluationTerms,
  NO_EVALUATION_GRANT,
  PRODUCTION_EVALUATION_DEPS,
  productForAction,
  resolveEffectiveVerticalAccess,
  resolveEvaluationOfferState,
  resolveEvaluationPolicyActions,
  resolveVerticalUsage,
  termsAreCurrent,
  type EvaluationMandatoryDecision,
  type EvaluationOfferConfig,
  type EvaluationOfferState,
  type EvaluationTerms,
  type GrantRowLike,
} from "../services/products/verticalEvaluationContract";
import {
  computeEvaluationGrantGate,
  planEvaluationAcceptance,
  planEvaluationDecision,
  planEvaluationDecline,
  planVerticalAccessRequest,
  type PlanRow,
} from "../services/products/verticalEvaluationPlans";

// Os valores abaixo são FIXTURES DE TESTE (nenhum é padrão do produto): a oferta real não tem prazo, limite nem texto embutidos.

const catalog = [...evaluationActionCatalog()];
const OFFER_CONFIG: EvaluationOfferConfig = {
  vertical: "IMOB",
  maxDurationDays: 30,
  allowedActions: catalog.slice(0, 2),
  closureModes: ["somente_leitura", "bloqueio_total"],
  conditions: { version: "c1", text: "Condições de teste." },
};
const ENV_OK = { [EVALUATION_OFFER_FLAG_ENV]: "true", [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify(OFFER_CONFIG) };
const RATIFIED: readonly EvaluationMandatoryDecision[] = EVALUATION_MANDATORY_DECISIONS.map((decision) => ({ ...decision, status: "ratified" as const }));
const ENABLED = evaluateEvaluationOffer({ env: ENV_OK, decisions: RATIFIED });
assert.equal(ENABLED.state, "enabled");

const T0 = new Date("2026-11-13T12:00:00.000Z");
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);
const days = (base: Date, n: number) => new Date(base.getTime() + n * 86_400_000);
const SCOPE = { tenantId: "t1", workspaceId: "w1" };

function terms(over: Partial<EvaluationTerms> = {}): EvaluationTerms {
  const built = buildEvaluationTerms({
    scope: SCOPE,
    requestedByUserId: "u-req",
    requestContext: { problem: "Organizar captação", teamSize: 6, expectedOutcome: "Cadastrar imóveis mais rápido" },
    input: { durationDays: 10, allowedActions: [catalog[0]], closureMode: "somente_leitura" },
    decidedBy: "admin:a@eiah.test",
    decidedAt: T0,
    offer: OFFER_CONFIG,
  });
  assert.ok(built.ok, JSON.stringify(built));
  return { ...built.terms, ...over };
}

function grantRow(over: Partial<PlanRow> = {}): PlanRow {
  const t = terms();
  const hash = hashEvaluationTerms(t);
  return {
    id: "ap1", ...SCOPE, vertical: "IMOB", status: "pre_ativacao", revocationMode: null, requestedByUserId: "u-req",
    requestContext: { problem: "Organizar captação", teamSize: 6, expectedOutcome: "x" }, recommendation: "recomendado",
    grantKind: "evaluation", grantTerms: t, grantTermsHash: hash, grantAcceptedBy: null, grantAcceptedAt: null, grantAcceptedHash: null,
    grantStartedAt: null, grantValidUntil: null, grantClosedReason: null, evaluationUsedAt: null,
    ...over,
  };
}
const accepted = (over: Partial<PlanRow> = {}) => grantRow({ grantAcceptedBy: "u-req", grantAcceptedAt: minutes(T0, 5), grantAcceptedHash: hashEvaluationTerms(terms()), ...over });
const active = (over: Partial<PlanRow> = {}) => accepted({ status: "aprovado", grantStartedAt: minutes(T0, 10), grantValidUntil: days(minutes(T0, 10), 10), ...over });

// ─── Oferta: desligada por padrão; decisões obrigatórias não são contornáveis ───────────────────────────────────────
test("oferta: desligada por padrão e sem flag nunca habilita", () => {
  assert.deepEqual(resolveEvaluationOfferState({}), { state: "disabled", reasons: ["flag_off"] });
  assert.equal(resolveEvaluationOfferState({ [EVALUATION_OFFER_CONFIG_ENV]: ENV_OK[EVALUATION_OFFER_CONFIG_ENV] }).state, "disabled");
  for (const flag of ["1", "yes", "TRUE", "on", ""]) {
    assert.equal(resolveEvaluationOfferState({ ...ENV_OK, [EVALUATION_OFFER_FLAG_ENV]: flag }).state, "disabled", `só 'true' liga (${JSON.stringify(flag)})`);
  }
});

test("composição de produção: flag e configuração válidas NÃO habilitam enquanto houver decisão obrigatória pendente", () => {
  const offer = resolveEvaluationOfferState(ENV_OK);
  assert.equal(offer.state, "blocked");
  for (const id of ["consumption_policy", "user_seats_definition_and_enforcement", "production_approver_authority", "closure_and_data_after_end", "renewal_and_repetition", "eligibility_criteria"]) {
    assert.ok(offer.reasons.includes(`decision_pending:${id}`), id);
  }
  // O ambiente injetado só alimenta flag e configuração: não há parâmetro que substitua as decisões na composição de produção.
  assert.equal(resolveEvaluationOfferState.length <= 1, true);
  assert.equal(PRODUCTION_EVALUATION_DEPS.offer().state === "enabled", false);
});

test("oferta: configuração ausente, inválida ou fora do catálogo bloqueia, mesmo com decisões ratificadas na fixture", () => {
  const base = { [EVALUATION_OFFER_FLAG_ENV]: "true" };
  const reasons = (env: Record<string, string>) => (evaluateEvaluationOffer({ env, decisions: RATIFIED }) as { reasons: string[] }).reasons;
  assert.deepEqual(reasons(base), ["config_missing"]);
  assert.deepEqual(reasons({ ...base, [EVALUATION_OFFER_CONFIG_ENV]: "{" }), ["config_invalid"]);
  assert.deepEqual(reasons({ ...base, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, allowedActions: ["realestate.release_commission"] }) }), ["config_invalid"]);
  assert.deepEqual(reasons({ ...base, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, maxDurationDays: 0 }) }), ["config_invalid"]);
  assert.deepEqual(reasons({ ...base, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, vertical: "LOGISTICA" }) }), ["config_invalid"]);
  assert.deepEqual(reasons({ ...base, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, extra: 1 }) }), ["config_invalid"]);
});

test("oferta: com todas as decisões ratificadas NA FIXTURE, configuração completa habilita (função pura)", () => {
  assert.equal(ENABLED.state, "enabled");
  const pending = RATIFIED.map((decision, index) => (index === 0 ? { ...decision, status: "pending" as const } : decision));
  assert.equal(evaluateEvaluationOffer({ env: ENV_OK, decisions: pending }).state, "blocked");
});

test("decisões obrigatórias: consumo e vagas de usuário seguem pendentes e o catálogo do IMOB não ganhou prazo, limite ou texto", () => {
  const byId = new Map(EVALUATION_MANDATORY_DECISIONS.map((decision) => [decision.id, decision.status]));
  assert.equal(byId.get("consumption_policy"), "pending");
  assert.equal(byId.get("user_seats_definition_and_enforcement"), "pending");
  assert.ok(EVALUATION_MANDATORY_DECISIONS.every((decision) => decision.status === "pending"), "nada foi ratificado por esta implementação");
});

// ─── Termos: completos, não contraditórios, vinculados ao escopo ────────────────────────────────────────────────────
test("termos: incompletos ou contraditórios com a configuração vigente não produzem concessão", () => {
  const input = { durationDays: 10, allowedActions: [catalog[0]], closureMode: "somente_leitura" };
  const base = { scope: SCOPE, requestedByUserId: "u-req", requestContext: { problem: "p", teamSize: 3, expectedOutcome: "o" }, decidedBy: "admin:a", decidedAt: T0, offer: OFFER_CONFIG, input };
  const issues = (over: Record<string, unknown>) => {
    const result = buildEvaluationTerms({ ...base, ...over } as never);
    assert.equal(result.ok, false);
    return (result as { issues: string[] }).issues.join(",");
  };
  assert.match(issues({ requestedByUserId: null }), /requester_missing/);
  assert.match(issues({ requestContext: { problem: "p" } }), /request_context_invalid/);
  assert.match(issues({ requestContext: { problem: "p", teamSize: 0, expectedOutcome: "o" } }), /request_context_invalid/);
  assert.match(issues({ requestContext: { problem: "p", teamSize: 2.5, expectedOutcome: "o" } }), /request_context_invalid/);
  assert.match(issues({ input: { ...input, durationDays: 0 } }), /decision_input_invalid/);
  assert.match(issues({ input: { ...input, allowedActions: [] } }), /decision_input_invalid/);
  assert.match(issues({ input: { ...input, closureMode: "sem_nova_ativacao" } }), /decision_input_invalid/);
  assert.match(issues({ input: { ...input, durationDays: 31 } }), /duration_above_offer_limit/);
  assert.match(issues({ input: { ...input, allowedActions: ["realestate.release_commission"] } }), /action_not_offered/);
  assert.match(issues({ offer: { ...OFFER_CONFIG, closureModes: ["bloqueio_total"] } }), /closure_mode_not_offered/);
  assert.match(issues({ input: { ...input, allowedActions: [catalog[0], catalog[0]] } }), /terms_invalid/);
});

test("termos: hash estável e sensível a qualquer campo; versão das condições e escopo entram no hash", () => {
  const a = terms();
  assert.equal(hashEvaluationTerms(a), hashEvaluationTerms(JSON.parse(JSON.stringify(a))));
  assert.notEqual(hashEvaluationTerms(a), hashEvaluationTerms({ ...a, durationDays: 11 }));
  assert.notEqual(hashEvaluationTerms(a), hashEvaluationTerms({ ...a, conditions: { ...a.conditions, version: "c2" } }));
  assert.notEqual(hashEvaluationTerms(a), hashEvaluationTerms({ ...a, scope: { ...a.scope, workspaceId: "w2" } }));
  assert.equal(termsAreCurrent(a, OFFER_CONFIG).ok, true);
  const stale = termsAreCurrent(a, { ...OFFER_CONFIG, conditions: { version: "c2", text: "Outras condições." } });
  assert.equal(stale.ok, false);
  assert.match((stale as { issues: string[] }).issues.join(","), /conditions_version_stale/);
  assert.equal(termsAreCurrent(a, { ...OFFER_CONFIG, conditions: { ...OFFER_CONFIG.conditions, text: "Texto alterado." } }).ok, false, "mesma versão, texto diferente");
});

test("integridade: linha persistida exige tenant, workspace, vertical e solicitante; campo ausente invalida em vez de dispensar", () => {
  assert.equal(grantTermsIntegrity(grantRow()).ok, true);
  for (const field of ["tenantId", "workspaceId", "vertical", "requestedByUserId"] as const) {
    for (const value of [null, "", "   "]) {
      const result = grantTermsIntegrity({ ...grantRow(), [field]: value } as GrantRowLike);
      assert.equal(result.ok, false, `${field}=${JSON.stringify(value)}`);
      assert.equal((result as { reason: string }).reason, "row_identity_missing");
    }
    const absent = { ...grantRow() } as Record<string, unknown>;
    delete absent[field];
    assert.equal(grantTermsIntegrity(absent as unknown as GrantRowLike).ok, false, `${field} ausente`);
  }
  assert.equal((grantTermsIntegrity({ ...grantRow(), workspaceId: "w-outro" }) as { reason: string }).reason, "scope_mismatch");
  assert.equal((grantTermsIntegrity({ ...grantRow(), vertical: "LOGISTICA" }) as { reason: string }).reason, "scope_mismatch");
  assert.equal((grantTermsIntegrity({ ...grantRow(), requestedByUserId: "u-outro" }) as { reason: string }).reason, "requester_mismatch");
  assert.equal((grantTermsIntegrity({ ...grantRow(), grantTerms: { ...terms(), durationDays: 99 } }) as { reason: string }).reason, "terms_hash_mismatch");
});

// ─── Acesso efetivo e uso ───────────────────────────────────────────────────────────────────────────────────────────
test("acesso efetivo: sem grant devolve a MESMA linha (acessos existentes não mudam)", () => {
  const legacy = { ...grantRow(), grantKind: null, status: "aprovado" } as GrantRowLike;
  assert.equal(resolveEffectiveVerticalAccess(legacy, T0).row, legacy);
  assert.equal(resolveEffectiveVerticalAccess(null, T0).row, null);
});

test("acesso efetivo: validade com relógio controlado; expirado, inconsistente ou sem início/validade encerra", () => {
  const row = active();
  assert.equal(resolveEffectiveVerticalAccess(row, minutes(T0, 11)).closure, null);
  assert.equal(resolveEffectiveVerticalAccess(row, days(minutes(T0, 10), 10)).row?.status, "encerrado", "exatamente na validade já encerra");
  const expired = resolveEffectiveVerticalAccess(row, days(T0, 11));
  assert.equal(expired.row?.status, "encerrado");
  assert.equal(expired.row?.revocationMode, "somente_leitura", "modo vem dos termos");
  assert.equal(expired.closure?.reason, "expired");
  assert.equal(resolveVerticalUsage(expired.row), "read_only");
  const blockTerms = terms({ closureMode: "bloqueio_total" });
  const blocked = resolveEffectiveVerticalAccess(active({ grantTerms: blockTerms, grantTermsHash: hashEvaluationTerms(blockTerms), grantAcceptedHash: hashEvaluationTerms(blockTerms) }), days(T0, 11));
  assert.equal(resolveVerticalUsage(blocked.row), "blocked");
  for (const broken of [
    active({ grantAcceptedHash: null }),
    active({ grantAcceptedHash: "f".repeat(64) }),
    active({ grantStartedAt: null }),
    active({ grantValidUntil: null }),
    active({ grantValidUntil: minutes(T0, 10) }),
    active({ grantTerms: { lixo: true } }),
  ]) {
    const result = resolveEffectiveVerticalAccess(broken, minutes(T0, 11));
    assert.equal(result.row?.status, "encerrado");
    assert.equal(result.closure?.reason, "terms_invalid");
    assert.equal(resolveVerticalUsage(result.row), "blocked", "termos inválidos ⇒ bloqueio total");
  }
});

test("acesso efetivo: pre_ativacao (proposto ou aceito) não é uso e não vira aprovado", () => {
  for (const row of [grantRow(), accepted()]) {
    const effective = resolveEffectiveVerticalAccess(row, minutes(T0, 20));
    assert.equal(effective.row?.status, "pre_ativacao");
    assert.equal(effective.closure, null);
    assert.notEqual(resolveVerticalUsage(effective.row), "full");
  }
});

test("uso: linhas SEM grant mantêm o comportamento legado (tabela completa)", () => {
  const u = (status: string, revocationMode: string | null) => resolveVerticalUsage({ status, revocationMode });
  assert.equal(resolveVerticalUsage(null), "full");
  assert.equal(u("aprovado", null), "full");
  assert.equal(u("aprovado", "bloqueio_total"), "full");
  assert.equal(u("aguardando_humano", null), "full");
  assert.equal(u("pendente", null), "full");
  assert.equal(u("recusado", null), "full");
  assert.equal(u("revogado", "somente_leitura"), "read_only");
  assert.equal(u("revogado", null), "read_only");
  assert.equal(u("revogado", "bloqueio_total"), "blocked");
  assert.equal(u("revogado", "sem_nova_ativacao"), "full");
  assert.equal(u("revogado", "modo-inventado"), "blocked");
  assert.equal(u("aguardando_humano", "bloqueio_total"), "blocked");
  assert.equal(u("recusado", "somente_leitura"), "read_only");
  assert.equal(u("aguardando_humano", "sem_nova_ativacao"), "full");
});

test("uso: com grant de avaliação NUNCA é full antes da ativação (pendente, em análise, recusado, termos propostos/aceitos)", () => {
  for (const status of ["pendente", "em_analise", "aguardando_humano", "recusado", "pre_ativacao", "revogado"]) {
    for (const mode of [null, "sem_nova_ativacao", "somente_leitura", "bloqueio_total"]) {
      const usage = resolveVerticalUsage({ status, revocationMode: mode, grantKind: "evaluation" });
      assert.notEqual(usage, "full", `${status}/${mode}`);
    }
  }
  // restrição anterior não se perde nem se afrouxa: read_only continua read_only, bloqueio continua bloqueio
  assert.equal(resolveVerticalUsage({ status: "aguardando_humano", revocationMode: "somente_leitura", grantKind: "evaluation" }), "read_only");
  assert.equal(resolveVerticalUsage({ status: "recusado", revocationMode: "bloqueio_total", grantKind: "evaluation" }), "blocked");
  assert.equal(resolveVerticalUsage({ status: "aprovado", revocationMode: null, grantKind: "evaluation" }), "full", "só o grant ativo (efetivo) é full");
  assert.equal(resolveVerticalUsage({ status: "encerrado", revocationMode: "somente_leitura", grantKind: "evaluation" }), "read_only");
  assert.equal(resolveVerticalUsage({ status: "encerrado", revocationMode: null, grantKind: "evaluation" }), "blocked");
  assert.equal(resolveVerticalUsage({ status: "encerrado", revocationMode: "sem_nova_ativacao", grantKind: "evaluation" }), "blocked", "encerramento nunca mantém uso pleno");
});

test("fases: pedido, aprovação, aceite e ativação são distintos", () => {
  assert.equal(evaluationPhase({ ...grantRow(), status: "aguardando_humano" }), "requested");
  assert.equal(evaluationPhase(grantRow()), "terms_pending_acceptance");
  assert.equal(evaluationPhase(accepted()), "accepted_pending_activation");
  assert.equal(evaluationPhase(active()), "active");
  assert.equal(evaluationPhase({ ...active(), status: "encerrado" }), "ended");
  assert.equal(evaluationPhase({ ...grantRow(), grantKind: null }), null);
});

// ─── Autorização para ativar ────────────────────────────────────────────────────────────────────────────────────────
test("ativação: só o aceite do hash vigente autoriza; aprovação humana sozinha, não", () => {
  const ok = evaluateActivationAuthorization(accepted(), minutes(T0, 6), ENABLED);
  assert.deepEqual({ ok: ok.ok, mode: (ok as { mode?: string }).mode }, { ok: true, mode: "first_activation" });
  const reason = (row: PlanRow, offer: EvaluationOfferState = ENABLED, now = minutes(T0, 6)) => (evaluateActivationAuthorization(row, now, offer) as { reason?: string }).reason;
  assert.equal(reason(grantRow()), "terms_not_accepted");
  assert.equal(reason(accepted({ grantAcceptedHash: "a".repeat(64) })), "accepted_hash_mismatch");
  assert.equal(reason(accepted({ grantAcceptedHash: null })), "terms_not_accepted");
  assert.equal(reason(accepted(), resolveEvaluationOfferState(ENV_OK)), "offer_unavailable", "configuração completa, mas decisões obrigatórias pendentes");
  assert.equal(reason(accepted(), evaluateEvaluationOffer({ env: {}, decisions: RATIFIED })), "offer_unavailable");
  assert.equal(reason(accepted(), evaluateEvaluationOffer({ env: { ...ENV_OK, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, conditions: { version: "c2", text: "Novas." } }) }, decisions: RATIFIED })), "conditions_version_stale");
  assert.equal(reason(accepted({ grantStartedAt: minutes(T0, 7) })), "already_started");
  assert.equal(reason(accepted({ status: "recusado" })), "status_recusado");
  assert.equal(reason(accepted({ grantKind: null })), "not_evaluation");
  assert.equal(reason(accepted({ workspaceId: "w-outro" })), "scope_mismatch");
});

test("ativação: mudança concorrente dos termos entre a checagem e a trava nega (aceite era de outro hash)", () => {
  const before = accepted();
  assert.equal(evaluateActivationAuthorization(before, minutes(T0, 6), ENABLED).ok, true);
  // a linha RELIDA com trava já tem termos novos (reproposta) e o aceite antigo
  const changed = terms({ durationDays: 20 });
  const locked = accepted({ grantTerms: changed, grantTermsHash: hashEvaluationTerms(changed) });
  const after = evaluateActivationAuthorization(locked, minutes(T0, 7), ENABLED);
  assert.equal(after.ok, false);
  assert.equal((after as { reason: string }).reason, "accepted_hash_mismatch");
});

test("ativação: grant ativo e válido é idempotente; vencido nega", () => {
  const row = active();
  assert.deepEqual(evaluateActivationAuthorization(row, minutes(T0, 20), ENABLED), { ok: true, mode: "already_active" });
  const expired = evaluateActivationAuthorization(row, days(T0, 12), ENABLED);
  assert.equal(expired.ok, false);
  assert.equal((expired as { reason: string }).reason, "status_encerrado");
});

// ─── Policies provisionadas ─────────────────────────────────────────────────────────────────────────────────────────
test("policies: exatamente as actions aceitas, normalizadas, dentro do catálogo (formato do provisionamento existente)", () => {
  assert.ok(catalog.length >= 2);
  const result = resolveEvaluationPolicyActions({ allowedActions: [` ${catalog[0]!.toUpperCase()} `, catalog[1]!, catalog[0]!] });
  assert.deepEqual(result, { ok: true, actions: [catalog[0], catalog[1]] });
  for (const action of (result as { actions: string[] }).actions) {
    assert.equal(action, action.trim().toLowerCase(), "o provisionamento normaliza para minúsculas aparadas");
    assert.ok(action.length > 0);
  }
  assert.equal(resolveEvaluationPolicyActions({ allowedActions: [] }).ok, false);
  const outside = resolveEvaluationPolicyActions({ allowedActions: [catalog[0]!, "realestate.release_commission"] });
  assert.deepEqual(outside, { ok: false, reason: "action_outside_catalog:realestate.release_commission" });
  assert.equal(resolveEvaluationPolicyActions({ allowedActions: ["admin.tudo"] }).ok, false, "nenhuma permissão além do catálogo");
});

// ─── Gate dos caminhos diferidos (Agent Protocol, runs, worker, uploads) ────────────────────────────────────────────
test("gate: sem grant não se aplica; com grant só o ativo e válido permite escrita", () => {
  assert.equal(computeEvaluationGrantGate(null), NO_EVALUATION_GRANT);
  assert.equal(computeEvaluationGrantGate({ status: "aprovado", revocationMode: null, grantKind: null }), NO_EVALUATION_GRANT, "acesso pago/existente: intocado");
  assert.equal(computeEvaluationGrantGate({ status: "revogado", revocationMode: "somente_leitura", grantKind: null }), NO_EVALUATION_GRANT, "revogação legada: fora do escopo");
  const gate = (status: string, mode: string | null = null) => computeEvaluationGrantGate({ status, revocationMode: mode, grantKind: "evaluation" });
  for (const status of ["pendente", "aguardando_humano", "recusado", "pre_ativacao"]) {
    assert.deepEqual({ applies: gate(status).applies, allowed: gate(status).allowed }, { applies: true, allowed: false }, status);
  }
  assert.equal(gate("aprovado").allowed, true);
  assert.equal(gate("encerrado", "somente_leitura").allowed, false, "escrita negada depois do fim");
  assert.equal(gate("encerrado", "somente_leitura").usage, "read_only");
  assert.equal(gate("encerrado", "bloqueio_total").usage, "blocked");
  // grant ativo porém vencido, lido pela leitura efetiva, também nega
  const effective = resolveEffectiveVerticalAccess(active(), days(T0, 30)).row!;
  assert.equal(computeEvaluationGrantGate(effective).allowed, false);
});

test("ações do IMOB: só realestate.* pertence ao IMOB e o filtro só remove quando há grant sem acesso ativo", () => {
  assert.equal(productForAction("realestate.register_property"), "IMOB");
  assert.equal(productForAction(" RealEstate.qualify_lead "), "IMOB");
  assert.equal(productForAction("billing.read"), null);
  const actions = new Set(["realestate.register_property", "billing.read"]);
  assert.equal(filterActionsByEvaluationGate(actions, NO_EVALUATION_GRANT), actions, "sem grant: o MESMO conjunto");
  assert.equal(filterActionsByEvaluationGate(actions, { applies: true, allowed: true, usage: "full" }), actions);
  assert.deepEqual([...filterActionsByEvaluationGate(actions, { applies: true, allowed: false, usage: "blocked" })], ["billing.read"]);
});

// ─── Planejadores das transições ────────────────────────────────────────────────────────────────────────────────────
const decide = (row: PlanRow | null, over: Record<string, unknown> = {}) =>
  planEvaluationDecision(row, {
    decision: "aprovar", adminUserId: "u-admin", note: null, actor: "admin:a@eiah.test", decidedAt: T0, offer: ENABLED,
    decisionInput: { durationDays: 10, allowedActions: [catalog[0]], closureMode: "somente_leitura" }, ...over,
  } as never);
const awaiting = (over: Partial<PlanRow> = {}) => grantRow({ status: "aguardando_humano", grantTerms: null, grantTermsHash: null, ...over });

test("decisão: aprovar PROPÕE termos (não aceita nem ativa); recusar não exige termos", () => {
  const plan = decide(awaiting());
  assert.equal(plan.ok, true);
  assert.equal((plan as { kind: string }).kind, "propose");
  assert.equal(decide(awaiting(), { decision: "recusar", note: "motivo" }).ok, true);
  assert.equal((decide(awaiting(), { decision: "recusar", note: "motivo", offer: resolveEvaluationOfferState({}) }) as { kind: string }).kind, "refuse", "recusar vale mesmo com a oferta desligada");
});

test("decisão: bloqueios (oferta, autoria, estado, observação, termos)", () => {
  const code = (plan: ReturnType<typeof decide>) => (plan as { code?: string }).code;
  assert.equal(code(decide(null)), "NOT_FOUND");
  assert.equal(code(decide(awaiting({ grantKind: null }))), "NOT_EVALUATION");
  assert.equal(code(decide(awaiting(), { offer: resolveEvaluationOfferState(ENV_OK) })), "OFFER_UNAVAILABLE", "decisões pendentes bloqueiam a concessão");
  assert.equal(code(decide(awaiting(), { offer: resolveEvaluationOfferState({}) })), "OFFER_UNAVAILABLE");
  assert.equal(code(decide(awaiting(), { adminUserId: "u-req" })), "SELF_DECISION_FORBIDDEN");
  assert.equal(code(decide(awaiting(), { adminUserId: null })), "SELF_DECISION_FORBIDDEN");
  assert.equal(code(decide(awaiting({ status: "aprovado" }))), "NOT_AWAITING_DECISION");
  assert.equal(code(decide(accepted())), "NOT_AWAITING_DECISION", "depois do aceite não há decisão a tomar");
  assert.equal(code(decide(awaiting(), { decision: "recusar", note: null })), "NOTE_REQUIRED");
  assert.equal(code(decide(awaiting({ recommendation: "nao_recomendado" }))), "NOTE_REQUIRED");
  assert.equal(code(decide(awaiting(), { decisionInput: { durationDays: 31, allowedActions: [catalog[0]], closureMode: "somente_leitura" } })), "TERMS_INVALID");
  assert.equal(code(decide(awaiting(), { decisionInput: undefined })), "TERMS_INVALID");
  const reproposal = decide(grantRow());
  assert.equal(reproposal.ok && reproposal.kind === "propose" && reproposal.reproposal, true, "termos ainda não aceitos podem ser repropostos");
  assert.equal(decisionRequiresNote("aprovar", "nao_recomendado"), true);
});

test("aceite: só o solicitante, só o hash vigente, só com oferta habilitada; idempotente; não ativa", () => {
  const hash = grantRow().grantTermsHash!;
  const accept = (row: PlanRow | null, over: Record<string, unknown> = {}) => planEvaluationAcceptance(row, { userId: "u-req", termsHash: hash, offer: ENABLED, ...over });
  const code = (plan: ReturnType<typeof accept>) => (plan as { code?: string }).code;
  const ok = accept(grantRow());
  assert.equal(ok.ok && ok.outcome, "accept");
  assert.equal(code(accept(null)), "NOT_FOUND");
  assert.equal(code(accept(grantRow(), { offer: resolveEvaluationOfferState(ENV_OK) })), "OFFER_UNAVAILABLE");
  assert.equal(code(accept(grantRow({ status: "aprovado" }))), "NOT_PENDING");
  assert.equal(code(accept(grantRow(), { userId: "u-outro" })), "NOT_REQUESTER");
  assert.equal(code(accept(grantRow(), { termsHash: "b".repeat(64) })), "TERMS_MISMATCH");
  assert.equal(code(accept(grantRow(), { offer: evaluateEvaluationOffer({ env: { ...ENV_OK, [EVALUATION_OFFER_CONFIG_ENV]: JSON.stringify({ ...OFFER_CONFIG, conditions: { version: "c2", text: "Novas." } }) }, decisions: RATIFIED }) })), "TERMS_STALE");
  assert.equal(accept(accepted()).ok && (accept(accepted()) as { outcome: string }).outcome, "already_accepted");
  assert.equal(code(accept(accepted(), { termsHash: "c".repeat(64) })), "CONFLICT");
  assert.equal(code(accept(accepted({ grantAcceptedBy: "u-outro" }))), "CONFLICT");
});

test("recusa pelo solicitante: só o solicitante e só antes da ativação; idempotente", () => {
  const closed = (over: Partial<PlanRow> = {}) => ({ ...grantRow(), ...over }) as PlanRow & { grantClosedReason: string | null };
  assert.equal(planEvaluationDecline(closed(), "u-req").ok && (planEvaluationDecline(closed(), "u-req") as { outcome: string }).outcome, "decline");
  assert.deepEqual(planEvaluationDecline(closed(), "u-outro"), { ok: false, code: "NOT_REQUESTER" });
  assert.deepEqual(planEvaluationDecline(closed({ status: "aprovado" }), "u-req"), { ok: false, code: "NOT_PENDING" });
  assert.deepEqual(planEvaluationDecline(closed({ status: "recusado", grantClosedReason: "declined_by_requester" }), "u-req"), { ok: true, outcome: "already_declined" });
  assert.deepEqual(planEvaluationDecline(null, "u-req"), { ok: false, code: "NOT_FOUND" });
});

test("pedido: oferta desligada/bloqueada/incompleta não grava nada, também para chamada interna; direitos pagos preservados", () => {
  const plan = (over: Record<string, unknown> = {}) => planVerticalAccessRequest({ existing: null, evaluation: true, vertical: "IMOB", offer: ENABLED, ...over } as never);
  assert.deepEqual(plan(), { ok: true });
  assert.deepEqual(plan({ offer: resolveEvaluationOfferState({}) }), { ok: false, outcome: "evaluation_unavailable" });
  assert.deepEqual(plan({ offer: resolveEvaluationOfferState(ENV_OK) }), { ok: false, outcome: "evaluation_unavailable" }, "decisões obrigatórias pendentes");
  assert.deepEqual(plan({ vertical: "LOGISTICA" }), { ok: false, outcome: "evaluation_unavailable" });
  // pedido padrão não depende da oferta
  assert.deepEqual(plan({ evaluation: false, offer: resolveEvaluationOfferState({}) }), { ok: true });
  // acesso pago/existente nunca é rebaixado nem reescrito
  assert.deepEqual(plan({ existing: { status: "aprovado", evaluationUsedAt: null } }), { ok: false, outcome: "already_approved" });
  for (const status of ["pendente", "em_analise", "aguardando_humano", "pre_ativacao"]) {
    assert.deepEqual(plan({ existing: { status, evaluationUsedAt: null } }), { ok: false, outcome: "already_requested" }, status);
  }
  // avaliação já iniciada não se repete pelo pedido; pedido PADRÃO após o encerramento continua possível (continuidade humana)
  assert.deepEqual(plan({ existing: { status: "encerrado", evaluationUsedAt: T0 } }), { ok: false, outcome: "evaluation_already_used" });
  assert.deepEqual(plan({ evaluation: false, existing: { status: "encerrado", evaluationUsedAt: T0 } }), { ok: true });
  assert.deepEqual(plan({ existing: { status: "recusado", evaluationUsedAt: null } }), { ok: true });
});
