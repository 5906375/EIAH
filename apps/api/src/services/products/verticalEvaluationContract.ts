import crypto from "node:crypto";
import { z } from "zod";
import { getProductDefaultActionPolicies } from "@eiah/core/catalog/workspaceActionPolicyProvisioning";
import type { VerticalAccessRecommendation } from "./verticalAccessScore";

/**
 * Avaliação gratuita da vertical (IMOB) — contrato puro, sem banco.
 *
 * Distingue cinco conceitos que NÃO se confundem:
 *  1. aprovação humana das condições  → `status = pre_ativacao` + `grant_terms` (+ hash). Não libera uso.
 *  2. aceite da versão vigente        → `grant_accepted_*` preenchido com o hash dos termos. Não libera uso.
 *  3. autorização para ativar         → derivada (`evaluateActivationAuthorization`): só quem tem aceite do hash vigente.
 *  4. ativação efetiva                → única transição `pre_ativacao → aprovado` (transação de ativação): grava início e validade.
 *  5. autorização para usar           → derivada (`resolveEffectiveVerticalAccess`): `aprovado` com grant válido e dentro da validade.
 *
 * Representação mínima: um único status intermediário (`pre_ativacao`, cobre 1–3) e um terminal regular (`encerrado`).
 * Todo leitor que só aceita `aprovado` nega os dois por padrão (fail-closed). Linhas sem `grant_kind` não mudam de comportamento.
 *
 * Nada aqui define prazo, limite, elegibilidade, autoridade de produção, encerramento, dados, renovação ou consumo:
 * esses valores só existem na configuração autorizada e as decisões obrigatórias abaixo bloqueiam a oferta enquanto
 * estiverem pendentes.
 */

export const EVALUATION_TERMS_CONTRACT_VERSION = "vertical.evaluation.terms.v1";
/** Demonstração guiada e piloto acompanhado ficam fora: o servidor os rejeita. */
export const EVALUATION_KINDS = ["evaluation"] as const;
export type EvaluationKind = (typeof EVALUATION_KINDS)[number];
export const EVALUATION_SUPPORTED_VERTICALS = ["IMOB"] as const;
/** `sem_nova_ativacao` não é encerramento: mantém o uso. */
export const EVALUATION_CLOSURE_MODES = ["somente_leitura", "bloqueio_total"] as const;
export type EvaluationClosureMode = (typeof EVALUATION_CLOSURE_MODES)[number];

// ─── Regras puras compartilhadas com o registro de liberação (aqui para serem testáveis sem banco) ───────────
// Este módulo importa só `node:crypto`, `zod`, o catálogo de policies de `@eiah/core` e um TIPO de `verticalAccessScore`
// (apagado em runtime): não importa `verticalAccessApproval`, `@repo/db` nem o módulo de responsabilidades (sem ciclo).
/** Estados em que o pedido aguarda DECISÃO do administrador. */
export const AWAITING_DECISION_STATUS_VALUES = ["pendente", "em_analise", "aguardando_humano"] as const;
export const DEFAULT_REVOCATION_MODE_VALUE = "somente_leitura" as const;
/** Uso permitido da vertical, derivado só da liberação. A instalação e as permissões continuam valendo à parte. */
export type VerticalUsage = "full" | "read_only" | "blocked";

/** A observação é obrigatória ao recusar e ao decidir contra a recomendação do agente (ADR-011 §2.3). */
export function decisionRequiresNote(decision: "aprovar" | "recusar", recommendation: VerticalAccessRecommendation | null) {
  if (decision === "recusar") return true;
  return recommendation === "nao_recomendado";
}

type UsageRow = { status: string; revocationMode: string | null; grantKind?: string | null };

function legacyVerticalUsage(row: UsageRow): VerticalUsage {
  if (row.status === "encerrado") return row.revocationMode === "somente_leitura" ? "read_only" : "blocked";
  if (row.status !== "revogado" && !row.revocationMode) return "full";
  const mode = row.revocationMode ?? DEFAULT_REVOCATION_MODE_VALUE;
  if (mode === "somente_leitura") return "read_only";
  if (mode === "sem_nova_ativacao") return "full";
  return "blocked";
}

/**
 * Uso permitido pela liberação (ADR-011 §2.5). Sem registro ou nunca revogado: a liberação não restringe (a instalação e as
 * permissões decidem). Depois de uma revogação o modo continua valendo até a EIAH aprovar de novo, inclusive enquanto um novo
 * pedido aguarda decisão ou depois de recusado. Modo desconhecido: bloqueia (fail-closed). Linhas SEM grant de avaliação
 * mantêm exatamente esse comportamento legado.
 *
 * Linha COM grant de avaliação: antes da ativação efetiva (pedido pendente, em análise, recusado, termos propostos, termos
 * aceitos) o uso NUNCA é `full` — a decisão e o aceite não são uso. Só `aprovado` (já ativado e dentro da validade, resolvido
 * pela leitura efetiva) devolve `full`; `encerrado` segue o modo dos termos (ausente/desconhecido ⇒ bloqueia).
 */
export function resolveVerticalUsage(row: UsageRow | null): VerticalUsage {
  if (!row || row.status === "aprovado") return "full";
  const usage = legacyVerticalUsage(row);
  if (row.grantKind && usage === "full") return "blocked";
  return usage;
}

export type EvaluationPhase =
  | "requested"
  | "terms_pending_acceptance"
  | "accepted_pending_activation"
  | "active"
  | "ended";

// ─── Decisões obrigatórias (não ratificadas) ───────────────────────────────────────────────────────────────
/**
 * Cada item é uma decisão humana ainda NÃO ratificada. Enquanto qualquer uma estiver `pending`, a oferta não
 * pode ser habilitada, por nenhuma variável de ambiente. Mudar um item para `ratified` exige alteração de código
 * (e, onde indicado, a implementação do enforcement correspondente) e revisão.
 */
export type EvaluationMandatoryDecision = {
  id: string;
  status: "pending" | "ratified";
  description: string;
};

export const EVALUATION_MANDATORY_DECISIONS: readonly EvaluationMandatoryDecision[] = Object.freeze([
  { id: "eligibility_criteria", status: "pending", description: "Critérios de elegibilidade e de análise do pedido." },
  { id: "production_approver_authority", status: "pending", description: "Identidade e permissão do aprovador em produção (ADR-011 §2.3 limita a regra por e-mail ao desenvolvimento)." },
  { id: "closure_and_data_after_end", status: "pending", description: "Condições de encerramento e tratamento de dados após o término (consulta, exportação, leituras de governance e bundle)." },
  { id: "renewal_and_repetition", status: "pending", description: "Renovação e repetição da avaliação." },
  { id: "consumption_policy", status: "pending", description: "Política de consumo: não há medição por vertical, e avaliação sem limite próprio não foi autorizada." },
  { id: "user_seats_definition_and_enforcement", status: "pending", description: "Definição de vaga (usuário autorizado no IMOB, não membro do workspace) e seu enforcement." },
  { id: "admin_visibility_of_request_context", status: "pending", description: "Emenda do ADR-011 §2.3: o administrador passa a ver o contexto informado no pedido." },
  { id: "conditions_text_and_upper_limits", status: "pending", description: "Texto e versão das condições e limites superiores da configuração autorizada." },
]);

// ─── Configuração autorizada da oferta ────────────────────────────────────────────────────────────────────
export const EVALUATION_OFFER_FLAG_ENV = "EIAH_VERTICAL_EVALUATION_ENABLED";
export const EVALUATION_OFFER_CONFIG_ENV = "EIAH_VERTICAL_EVALUATION_CONFIG";

/** Catálogo de actions do IMOB que a ativação padrão já sabe provisionar (única fonte de escopo). */
export function evaluationActionCatalog(): readonly string[] {
  return getProductDefaultActionPolicies("IMOB");
}

const offerConfigSchema = z
  .object({
    vertical: z.literal("IMOB"),
    maxDurationDays: z.number().int().positive(),
    allowedActions: z.array(z.string().trim().min(1)).min(1),
    closureModes: z.array(z.enum(EVALUATION_CLOSURE_MODES)).min(1),
    conditions: z.object({ version: z.string().trim().min(1).max(80), text: z.string().trim().min(1) }).strict(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const catalog = new Set(evaluationActionCatalog());
    if (new Set(config.allowedActions).size !== config.allowedActions.length) {
      ctx.addIssue({ code: "custom", path: ["allowedActions"], message: "duplicate action" });
    }
    for (const action of config.allowedActions) {
      if (!catalog.has(action)) ctx.addIssue({ code: "custom", path: ["allowedActions"], message: `action outside catalog: ${action}` });
    }
  });
export type EvaluationOfferConfig = z.infer<typeof offerConfigSchema>;

export type EvaluationOfferState =
  | { state: "disabled"; reasons: string[] }
  | { state: "blocked"; reasons: string[] }
  | { state: "enabled"; reasons: []; config: EvaluationOfferConfig };

/**
 * Avaliação PURA da oferta: recebe o ambiente e as decisões e devolve o estado. Sem estado global e sem setter. Padrão
 * `disabled`; `enabled` só com (a) flag explícita, (b) configuração completa e válida e (c) nenhuma decisão pendente.
 * `blocked` nunca vaza condições ao solicitante: só o administrador vê os motivos. Os testes da função usam fixtures
 * explícitas de decisões; a composição de produção (`resolveEvaluationOfferState`) nunca recebe decisões de fora.
 */
export function evaluateEvaluationOffer(input: {
  env: Record<string, string | undefined>;
  decisions: readonly EvaluationMandatoryDecision[];
}): EvaluationOfferState {
  const { env, decisions } = input;
  if (env[EVALUATION_OFFER_FLAG_ENV] !== "true") return { state: "disabled", reasons: ["flag_off"] };
  const reasons: string[] = [];
  let config: EvaluationOfferConfig | null = null;
  const raw = env[EVALUATION_OFFER_CONFIG_ENV];
  if (!raw || !raw.trim()) {
    reasons.push("config_missing");
  } else {
    try {
      const parsed = offerConfigSchema.safeParse(JSON.parse(raw));
      if (parsed.success) config = parsed.data;
      else reasons.push("config_invalid");
    } catch {
      reasons.push("config_invalid");
    }
  }
  for (const decision of decisions) if (decision.status !== "ratified") reasons.push(`decision_pending:${decision.id}`);
  if (reasons.length > 0 || !config) return { state: "blocked", reasons };
  return { state: "enabled", reasons: [], config };
}

/**
 * Composição de PRODUÇÃO: as decisões obrigatórias são SEMPRE as reais (`EVALUATION_MANDATORY_DECISIONS`); só o ambiente
 * (flag e configuração) é lido. Nenhuma rota, corpo de requisição ou parâmetro público substitui as decisões. Enquanto
 * qualquer uma estiver pendente (hoje todas), o resultado nunca é `enabled`, mesmo com flag e configuração válidas.
 */
export function resolveEvaluationOfferState(env: Record<string, string | undefined> = process.env): EvaluationOfferState {
  return evaluateEvaluationOffer({ env, decisions: EVALUATION_MANDATORY_DECISIONS });
}

export const isEvaluationOfferEnabled = (offer: EvaluationOfferState): offer is Extract<EvaluationOfferState, { state: "enabled" }> =>
  offer.state === "enabled";

/**
 * Dependências de composição das operações com avaliação. Produção usa SEMPRE `PRODUCTION_EVALUATION_DEPS` (decisões reais,
 * relógio real); nenhuma rota ou parâmetro público recebe isto. As funções `…Core` existem para a composição de testes, que
 * passa fixtures explícitas (decisões ratificadas só na fixture, relógio controlado).
 */
export type EvaluationDeps = { offer: () => EvaluationOfferState; clock: () => Date };
export const PRODUCTION_EVALUATION_DEPS: EvaluationDeps = Object.freeze({
  offer: () => resolveEvaluationOfferState(process.env),
  clock: () => new Date(),
});

// ─── Termos ────────────────────────────────────────────────────────────────────────────────────────────────
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const hashConditionsText = (text: string) => sha256(text.trim());

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

const idSchema = z.string().trim().min(1);

export const evaluationTermsSchema = z
  .object({
    version: z.literal(EVALUATION_TERMS_CONTRACT_VERSION),
    kind: z.literal("evaluation"),
    vertical: z.literal("IMOB"),
    scope: z.object({ tenantId: idSchema, workspaceId: idSchema }).strict(),
    requestedByUserId: idSchema,
    /** Na v1 o responsável pelo uso é o próprio solicitante: não há mecanismo de designação. */
    usageResponsibleUserId: idSchema,
    objective: z.string().trim().min(1).max(600),
    expectedOutcome: z.string().trim().min(1).max(600),
    allowedActions: z.array(z.string().trim().min(1)).min(1),
    durationDays: z.number().int().positive(),
    closureMode: z.enum(EVALUATION_CLOSURE_MODES),
    conditions: z.object({ version: z.string().trim().min(1).max(80), textSha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
    decision: z.object({ decidedBy: idSchema, decidedAt: z.string().datetime() }).strict(),
  })
  .strict()
  .superRefine((terms, ctx) => {
    if (new Set(terms.allowedActions).size !== terms.allowedActions.length) {
      ctx.addIssue({ code: "custom", path: ["allowedActions"], message: "duplicate action" });
    }
    if (terms.usageResponsibleUserId !== terms.requestedByUserId) {
      ctx.addIssue({ code: "custom", path: ["usageResponsibleUserId"], message: "responsible must be the requester in v1" });
    }
  });
export type EvaluationTerms = z.infer<typeof evaluationTermsSchema>;

export function hashEvaluationTerms(terms: EvaluationTerms): string {
  return sha256(stableStringify(terms));
}

/** Entrada do administrador ao aprovar: só o que ele decide. O resto vem do pedido e da configuração autorizada. */
export const evaluationDecisionInputSchema = z
  .object({
    durationDays: z.number().int().positive(),
    allowedActions: z.array(z.string().trim().min(1)).min(1),
    closureMode: z.enum(EVALUATION_CLOSURE_MODES),
  })
  .strict();
export type EvaluationDecisionInput = z.infer<typeof evaluationDecisionInputSchema>;

/** Contexto informado pelo solicitante (qualificação confirmada no chat). */
export const evaluationRequestContextSchema = z
  .object({
    problem: z.string().trim().min(1).max(600),
    teamSize: z.number().int().positive(),
    expectedOutcome: z.string().trim().min(1).max(600),
    additionalInfo: z.string().trim().max(600).optional(),
  })
  .strict();
export type EvaluationRequestContext = z.infer<typeof evaluationRequestContextSchema>;

export type TermsBuildResult = { ok: true; terms: EvaluationTerms; hash: string } | { ok: false; issues: string[] };

/**
 * Compõe e valida os termos contra a configuração autorizada VIGENTE. Qualquer incompletude ou contradição
 * (escopo fora do catálogo/da configuração, duração acima do limite, encerramento não permitido, condições de outra
 * versão) retorna erro: nunca produz concessão.
 */
export function buildEvaluationTerms(params: {
  scope: { tenantId: string; workspaceId: string };
  requestedByUserId: string | null;
  requestContext: unknown;
  input: unknown;
  decidedBy: string;
  decidedAt: Date;
  offer: EvaluationOfferConfig;
}): TermsBuildResult {
  const issues: string[] = [];
  const context = evaluationRequestContextSchema.safeParse(params.requestContext);
  if (!context.success) issues.push("request_context_invalid");
  const input = evaluationDecisionInputSchema.safeParse(params.input);
  if (!input.success) issues.push("decision_input_invalid");
  if (!params.requestedByUserId) issues.push("requester_missing");
  if (issues.length > 0 || !context.success || !input.success || !params.requestedByUserId) return { ok: false, issues };
  const { offer } = params;
  const allowed = new Set(offer.allowedActions);
  for (const action of input.data.allowedActions) if (!allowed.has(action)) issues.push(`action_not_offered:${action}`);
  if (input.data.durationDays > offer.maxDurationDays) issues.push("duration_above_offer_limit");
  if (!offer.closureModes.includes(input.data.closureMode)) issues.push("closure_mode_not_offered");
  if (issues.length > 0) return { ok: false, issues };
  const candidate = {
    version: EVALUATION_TERMS_CONTRACT_VERSION,
    kind: "evaluation" as const,
    vertical: "IMOB" as const,
    scope: { tenantId: params.scope.tenantId, workspaceId: params.scope.workspaceId },
    requestedByUserId: params.requestedByUserId,
    usageResponsibleUserId: params.requestedByUserId,
    objective: context.data.problem,
    expectedOutcome: context.data.expectedOutcome,
    allowedActions: input.data.allowedActions,
    durationDays: input.data.durationDays,
    closureMode: input.data.closureMode,
    conditions: { version: offer.conditions.version, textSha256: hashConditionsText(offer.conditions.text) },
    decision: { decidedBy: params.decidedBy, decidedAt: params.decidedAt.toISOString() },
  };
  const parsed = evaluationTermsSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => `terms_invalid:${issue.path.join(".")}`) };
  return { ok: true, terms: parsed.data, hash: hashEvaluationTerms(parsed.data) };
}

/** Os termos gravados ainda valem sob a configuração VIGENTE? (versão das condições, escopo e limites). */
export function termsAreCurrent(terms: EvaluationTerms, offer: EvaluationOfferConfig): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (terms.conditions.version !== offer.conditions.version) issues.push("conditions_version_stale");
  if (terms.conditions.textSha256 !== hashConditionsText(offer.conditions.text)) issues.push("conditions_text_stale");
  const allowed = new Set(offer.allowedActions);
  for (const action of terms.allowedActions) if (!allowed.has(action)) issues.push(`action_not_offered:${action}`);
  if (terms.durationDays > offer.maxDurationDays) issues.push("duration_above_offer_limit");
  if (!offer.closureModes.includes(terms.closureMode)) issues.push("closure_mode_not_offered");
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// ─── Estado efetivo (puro, com relógio injetado) ──────────────────────────────────────────────────────────
export type GrantFields = {
  grantKind: EvaluationKind | null;
  grantTerms: unknown;
  grantTermsHash: string | null;
  grantAcceptedBy: string | null;
  grantAcceptedAt: Date | null;
  grantAcceptedHash: string | null;
  grantStartedAt: Date | null;
  grantValidUntil: Date | null;
  grantClosedReason: string | null;
  evaluationUsedAt: Date | null;
};

/**
 * Linha persistida. Identidade (tenant, workspace, vertical) e solicitante são OBRIGATÓRIOS na validação: campo ausente ou
 * vazio não dispensa a checagem de escopo, invalida o grant.
 */
export type GrantRowLike = GrantFields & {
  status: string;
  revocationMode: string | null;
  tenantId: string;
  workspaceId: string;
  vertical: string;
  requestedByUserId: string | null;
};

export type EffectiveAccess<T extends GrantRowLike> = {
  row: T | null;
  /** Presente quando o grant vigente foi tratado como encerrado só agora (a escrita de fechamento é opcional para a negação). */
  closure: { reason: "expired" | "terms_invalid"; mode: EvaluationClosureMode } | null;
};

function closureModeOf(grantTerms: unknown): EvaluationClosureMode {
  const mode = (grantTerms as { closureMode?: unknown } | null)?.closureMode;
  return mode === "somente_leitura" || mode === "bloqueio_total" ? mode : "bloqueio_total";
}

/** Os termos e o aceite gravados formam um conjunto completo e consistente? */
export function grantTermsIntegrity(row: GrantRowLike): { ok: true; terms: EvaluationTerms } | { ok: false; reason: string } {
  if (row.grantKind !== "evaluation") return { ok: false, reason: "not_evaluation" };
  const parsed = evaluationTermsSchema.safeParse(row.grantTerms);
  if (!parsed.success) return { ok: false, reason: "terms_invalid" };
  if (!row.grantTermsHash || hashEvaluationTerms(parsed.data) !== row.grantTermsHash) return { ok: false, reason: "terms_hash_mismatch" };
  const terms = parsed.data;
  const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  // Linha persistida sem tenant, workspace, vertical ou solicitante nunca dispensa a validação de escopo.
  if (!present(row.tenantId) || !present(row.workspaceId) || !present(row.vertical) || !present(row.requestedByUserId)) {
    return { ok: false, reason: "row_identity_missing" };
  }
  if (terms.scope.tenantId !== row.tenantId || terms.scope.workspaceId !== row.workspaceId || terms.vertical !== row.vertical) {
    return { ok: false, reason: "scope_mismatch" };
  }
  if (terms.requestedByUserId !== row.requestedByUserId || terms.usageResponsibleUserId !== row.requestedByUserId) {
    return { ok: false, reason: "requester_mismatch" };
  }
  return { ok: true, terms };
}

/**
 * Acesso efetivo. Sem `grant_kind` devolve a MESMA linha (acessos existentes não mudam). Com grant em `aprovado`:
 * termos incompletos/inconsistentes, aceite ausente/divergente, início ou validade ausentes, ou validade vencida →
 * tratado como `encerrado` com o modo de encerramento dos termos (inválido ⇒ bloqueio total). Não depende de a
 * escrita de fechamento ter ocorrido.
 */
export function resolveEffectiveVerticalAccess<T extends GrantRowLike>(row: T | null, now: Date): EffectiveAccess<T> {
  if (!row || !row.grantKind || row.status !== "aprovado") return { row, closure: null };
  const integrity = grantTermsIntegrity(row);
  const consistent =
    integrity.ok
    && Boolean(row.grantAcceptedHash)
    && row.grantAcceptedHash === row.grantTermsHash
    && row.grantStartedAt instanceof Date
    && row.grantValidUntil instanceof Date
    && row.grantValidUntil.getTime() > row.grantStartedAt.getTime();
  if (!consistent) {
    // Termos/aceite inconsistentes (possivelmente adulterados): o modo gravado neles não é confiável ⇒ bloqueio total.
    const mode: EvaluationClosureMode = "bloqueio_total";
    return { row: { ...row, status: "encerrado", revocationMode: mode, grantClosedReason: "terms_invalid" } as T, closure: { reason: "terms_invalid", mode } };
  }
  // Fim regular por validade: o modo vem dos termos (já validados acima).
  const mode = closureModeOf(row.grantTerms);
  if (now.getTime() >= (row.grantValidUntil as Date).getTime()) {
    return { row: { ...row, status: "encerrado", revocationMode: mode, grantClosedReason: "expired" } as T, closure: { reason: "expired", mode } };
  }
  return { row, closure: null };
}

export function evaluationPhase(row: GrantRowLike | null | undefined): EvaluationPhase | null {
  if (!row?.grantKind) return null;
  if (row.status === "encerrado") return "ended";
  if (row.status === "aprovado") return "active";
  if (row.status === "pre_ativacao") return row.grantAcceptedAt ? "accepted_pending_activation" : "terms_pending_acceptance";
  return "requested";
}

export type ActivationAuthorization =
  | { ok: true; mode: "first_activation"; terms: EvaluationTerms }
  | { ok: true; mode: "already_active" }
  | { ok: false; reason: string };

/**
 * Autorização para ativar um grant de avaliação. Só aceite do hash dos termos vigentes (sob a configuração vigente
 * da oferta) autoriza. Ativação repetida de um grant já ativo e válido é idempotente (não reinicia nem estende).
 */
export function evaluateActivationAuthorization(row: GrantRowLike, now: Date, offer: EvaluationOfferState): ActivationAuthorization {
  const effective = resolveEffectiveVerticalAccess(row, now).row;
  if (!effective || !effective.grantKind) return { ok: false, reason: "not_evaluation" };
  if (effective.status === "aprovado") return { ok: true, mode: "already_active" };
  if (effective.status !== "pre_ativacao") return { ok: false, reason: `status_${effective.status}` };
  if (!isEvaluationOfferEnabled(offer)) return { ok: false, reason: "offer_unavailable" };
  const integrity = grantTermsIntegrity(effective);
  if (!integrity.ok) return { ok: false, reason: integrity.reason };
  if (!effective.grantAcceptedAt || !effective.grantAcceptedHash) return { ok: false, reason: "terms_not_accepted" };
  if (effective.grantAcceptedHash !== effective.grantTermsHash) return { ok: false, reason: "accepted_hash_mismatch" };
  const current = termsAreCurrent(integrity.terms, offer.config);
  if (!current.ok) return { ok: false, reason: current.issues[0] ?? "terms_stale" };
  if (effective.grantStartedAt) return { ok: false, reason: "already_started" };
  return { ok: true, mode: "first_activation", terms: integrity.terms };
}

/**
 * Actions que a ativação provisiona como policies. Formato esperado pelo provisionamento existente
 * (`provisionWorkspaceActionPolicies`): nomes não vazios, aparados, em minúsculas, do catálogo versionado, sem duplicata;
 * uma policy explicitamente negada nunca é sobrescrita e nenhuma policy de tenant é criada. Aqui: exatamente
 * `terms.allowedActions` normalizadas. Qualquer uma fora do catálogo do IMOB (termos adulterados ou antigos) recusa a
 * ativação: nunca se concede policy além do catálogo aprovado.
 */
export function resolveEvaluationPolicyActions(terms: Pick<EvaluationTerms, "allowedActions">): { ok: true; actions: string[] } | { ok: false; reason: string } {
  const catalog = new Set(evaluationActionCatalog().map((action) => action.trim().toLowerCase()));
  const actions = [...new Set(terms.allowedActions.map((action) => action.trim().toLowerCase()).filter(Boolean))];
  if (actions.length === 0) return { ok: false, reason: "no_actions" };
  const outside = actions.find((action) => !catalog.has(action));
  if (outside) return { ok: false, reason: `action_outside_catalog:${outside}` };
  return { ok: true, actions };
}

/** Apresentação dos termos ao solicitante, composta só dos dados validados (nunca da prosa do modelo). */
export function describeEvaluationTerms(terms: EvaluationTerms, conditionsText: string): string[] {
  return [
    `Avaliação gratuita do IMOB neste workspace — condições propostas pela EIAH (versão ${terms.conditions.version}).`,
    `Objetivo: ${terms.objective}`,
    `Resultado esperado: ${terms.expectedOutcome}`,
    `Funcionalidades liberadas: ${terms.allowedActions.join(", ")}.`,
    `Validade: ${terms.durationDays} dia(s), contados a partir da ativação efetiva (não da aprovação nem do aceite).`,
    // Só o modo de acesso ao término: a retenção e o acesso aos dados depois dele são decisão ainda não definida (não prometer).
    `Ao término: ${terms.closureMode === "somente_leitura" ? "o acesso passa a somente leitura (sem novos registros)" : "o acesso é bloqueado"}. As condições de acesso aos dados após o término serão informadas na conversa.`,
    "Esta avaliação não gera cobrança nem contratação automática.",
    "",
    conditionsText,
  ];
}

// ─── Ação → produto (decorador do Agent Protocol) ─────────────────────────────────────────────────────────
/** Mapeamento explícito e restrito: actions `realestate.*` pertencem ao IMOB; as demais não são afetadas. */
export function productForAction(action: string): "IMOB" | null {
  return action.trim().toLowerCase().startsWith("realestate.") ? "IMOB" : null;
}

export type EvaluationGrantGate = {
  /** Há grant de avaliação neste workspace/vertical (as proteções novas só atuam nesse caso). */
  applies: boolean;
  /** Uso permitido AGORA para escrita: grant válido e ativo (`aprovado` efetivo). */
  allowed: boolean;
  usage: "full" | "read_only" | "blocked";
};

export const NO_EVALUATION_GRANT: EvaluationGrantGate = { applies: false, allowed: true, usage: "full" };

/** Remove do conjunto as actions do IMOB quando há grant de avaliação que não permite escrita. Sem grant: devolve igual. */
export function filterActionsByEvaluationGate(actions: Set<string>, gate: EvaluationGrantGate): Set<string> {
  if (!gate.applies || gate.allowed) return actions;
  return new Set([...actions].filter((action) => productForAction(action) !== "IMOB"));
}
