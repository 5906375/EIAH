import { z } from "zod";
import {
  dataSourceScopeV1Schema,
  originEvidenceApprovalV1Schema,
  originEvidenceOriginV1Schema,
  originEvidenceValidationV1Schema,
  type OriginEvidenceV1,
} from "./dataSources.js";
import { dataInformationKindSchema } from "./dataSourceModel.js";
import { calendarDate, instant, jsonValue, knownOrUnknown, sha256Hex, stableId, stableStringify, text } from "./dataSourcePrimitives.js";

/**
 * Proveniência v2 e divergências. Cada dimensão é um campo próprio e NENHUMA implica outra:
 *   origem · integridade · autenticidade · atualidade · validação · aprovação · autorização.
 *   - hash prova integridade de um conteúdo, não autoria;
 *   - autenticidade (assinatura/identificação) não prova que a informação é verdadeira;
 *   - revisão humana não concede permissão para agir;
 *   - fonte oficial não significa conteúdo atualizado;
 *   - a autorização é decisão do Core e aqui só pode ser REFERENCIADA — este contrato nunca a concede.
 * Nada aqui implementa assinatura, verificação criptográfica, consenso ou reconciliação.
 */

export const originEvidenceIntegrityV2Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_available") }).strict(),
  z.object({ status: z.literal("hashed"), sha256: sha256Hex, byteLength: z.number().int().nonnegative().optional(), contentRef: text.optional() }).strict(),
]);

export const AUTHENTICITY_METHODS = ["supplier_signature", "channel_sender_verification", "publisher_checksum", "other"] as const;
/** Registro de um método, SE efetivamente disponível e verificado por alguém. Esta etapa não o executa. */
export const originEvidenceAuthenticityV2Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_assessed") }).strict(),
  z.object({ status: z.literal("none_available") }).strict(),
  z.object({ status: z.literal("method_declared"), method: z.enum(AUTHENTICITY_METHODS), note: text.optional() }).strict(),
  z.object({ status: z.literal("verified"), method: z.enum(AUTHENTICITY_METHODS), verifiedBy: text, verifiedAt: instant, evidenceRef: text }).strict(),
  z.object({ status: z.literal("failed"), method: z.enum(AUTHENTICITY_METHODS), checkedAt: instant }).strict(),
]);

export const originEvidenceCurrencyV2Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_assessed") }).strict(),
  z.object({ status: z.literal("assessed"), result: z.enum(["current", "stale", "unknown"]), referenceDate: knownOrUnknown(calendarDate), assessedAt: instant }).strict(),
]);

export const originEvidenceAuthorizationV2Schema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_evaluated") }).strict(),
  z.object({ status: z.literal("core_decision_referenced"), decisionRef: text, outcome: z.enum(["allowed", "denied"]), decidedAt: instant }).strict(),
]);

export const originEvidenceV2Schema = z.object({
  schemaVersion: z.literal("eiah.origin-evidence.v2"),
  evidenceId: text,
  origin: originEvidenceOriginV1Schema,
  integrity: originEvidenceIntegrityV2Schema,
  authenticity: originEvidenceAuthenticityV2Schema,
  currency: originEvidenceCurrencyV2Schema,
  validation: originEvidenceValidationV1Schema,
  approval: originEvidenceApprovalV1Schema,
  authorization: originEvidenceAuthorizationV2Schema,
  /** Este registro nunca concede autorização, nem quando referencia uma decisão `allowed` do Core. */
  grantsAuthorization: z.literal(false),
}).strict().superRefine((e, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (e.authenticity.status === "verified" && e.integrity.status !== "hashed") {
    issue(["authenticity"], "autenticidade verificada precisa dizer sobre QUAL conteúdo: exige integridade com hash");
  }
  if (e.approval.status === "decided") {
    if (e.approval.decidedBy === e.approval.requestedBy) issue(["approval", "decidedBy"], "decisor deve ser diferente de quem pediu");
    if (e.approval.decision === "approved" && e.validation.status !== "validated") issue(["approval", "decision"], "aprovação exige validação prévia");
  }
});
export type OriginEvidenceV2 = z.infer<typeof originEvidenceV2Schema>;

/** v1 → v2 sem perda: o hash do v1 vira integridade; autenticidade, atualidade e autorização ficam "não avaliadas". */
export function upgradeOriginEvidenceV1ToV2(v1: OriginEvidenceV1): OriginEvidenceV2 {
  return originEvidenceV2Schema.parse({
    schemaVersion: "eiah.origin-evidence.v2",
    evidenceId: v1.evidenceId,
    origin: v1.origin,
    integrity: { status: "hashed", sha256: v1.contentSha256 },
    authenticity: { status: "not_assessed" },
    currency: { status: "not_assessed" },
    validation: v1.validation,
    approval: v1.approval,
    authorization: { status: "not_evaluated" },
    grantsAuthorization: false,
  });
}

// --- Divergências entre fontes -----------------------------------------------------------------------------
/**
 * Representa o conflito; NÃO o resolve. Sem votação, média, maioria ou "confiança". A regra de prevalência é declarada
 * por domínio (referência explícita) e a resolução só existe como DECISÃO HUMANA registrada.
 * Vários canais reproduzindo a mesma informação compartilham `originGroupId` e contam como UMA origem.
 */
export const sourceClaimV1Schema = z.object({
  claimId: text,
  /** Tipos diferentes não se comparam (previsão ≠ evento observado ≠ estatística agregada ≠ confirmação operacional). */
  informationKind: dataInformationKindSchema,
  sourceId: stableId,
  evidenceRef: z.object({ evidenceId: text, contentSha256: sha256Hex }).strict(),
  value: jsonValue,
  referenceDate: knownOrUnknown(calendarDate),
  versionLabel: knownOrUnknown(text),
  /** Identifica a origem subjacente. Claims com o mesmo valor aqui NÃO são independentes. */
  originGroupId: text,
  /** Claims de que esta é derivada/republicação. */
  derivedFromClaimIds: z.array(text).max(20).optional(),
  /** Canal pelo qual chegou (cópia/retransmissão), quando relevante. */
  viaChannel: z.enum(["whatsapp"]).optional(),
}).strict();
export type SourceClaimV1 = z.infer<typeof sourceClaimV1Schema>;

export const DIVERGENCE_CONFLICT_KINDS = ["value_mismatch", "date_or_version_mismatch", "same_origin_derivation"] as const;

export const sourceDivergenceV1Schema = z.object({
  schemaVersion: z.literal("eiah.source-divergence.v1"),
  divergenceId: text,
  scope: dataSourceScopeV1Schema,
  /** O que está em disputa (entidade/campo), em termos do domínio. */
  subjectRef: text,
  conflictKinds: z.array(z.enum(DIVERGENCE_CONFLICT_KINDS)).min(1).max(3).refine((k) => new Set(k).size === k.length, "tipos de conflito duplicados"),
  claims: z.array(sourceClaimV1Schema).min(2).max(20),
  /** A regra depende do domínio e é explícita; `none_declared` significa que NÃO há regra e portanto nada pode prevalecer. */
  prevalenceRule: z.discriminatedUnion("status", [
    z.object({ status: z.literal("none_declared") }).strict(),
    z.object({ status: z.literal("declared"), ruleRef: text, domain: text }).strict(),
  ]),
  resolution: z.discriminatedUnion("status", [
    z.object({ status: z.literal("unresolved") }).strict(),
    z.object({ status: z.literal("clarification_requested"), requestedBy: text, requestedAt: instant, requestRef: text.optional() }).strict(),
    z.object({
      status: z.literal("resolved_by_human"),
      decidedBy: z.object({ kind: z.literal("human"), ref: text }).strict(),
      decidedAt: instant,
      note: text,
      ruleRef: text,
      chosenClaimId: text.optional(),
      basisHash: sha256Hex,
    }).strict(),
  ]),
  /** Não existe motor de reconciliação nesta etapa. */
  automaticResolution: z.literal(false),
}).strict().superRefine((d, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const ids = d.claims.map((c) => c.claimId);
  if (new Set(ids).size !== ids.length) issue(["claims"], "claimId duplicado");
  const known = new Set(ids);
  d.claims.forEach((c, i) => {
    for (const parent of c.derivedFromClaimIds ?? []) {
      if (parent === c.claimId) issue(["claims", i, "derivedFromClaimIds"], "claim não deriva de si mesma");
      else if (!known.has(parent)) issue(["claims", i, "derivedFromClaimIds"], `claim de origem inexistente: ${parent}`);
    }
  });
  if (new Set(d.claims.map((c) => c.informationKind)).size > 1) {
    issue(["claims"], "tipos de informação diferentes não constituem conflito comparável");
  }
  if (d.conflictKinds.includes("value_mismatch") && new Set(d.claims.map((c) => stableStringify(c.value))).size < 2) {
    issue(["conflictKinds"], "value_mismatch exige ao menos dois valores distintos");
  }
  if (d.conflictKinds.includes("date_or_version_mismatch")) {
    const dates = new Set<string>(); const versions = new Set<string>();
    for (const c of d.claims) { if (c.referenceDate.status === "known") dates.add(c.referenceDate.value); if (c.versionLabel.status === "known") versions.add(c.versionLabel.value); }
    if (dates.size < 2 && versions.size < 2) issue(["conflictKinds"], "date_or_version_mismatch exige duas datas ou versões conhecidas e distintas");
  }
  if (d.conflictKinds.includes("same_origin_derivation") && countIndependentOrigins(d.claims) >= d.claims.length) {
    issue(["conflictKinds"], "same_origin_derivation exige claims que compartilhem origem ou derivação");
  }
  if (d.resolution.status === "resolved_by_human") {
    if (d.prevalenceRule.status !== "declared") issue(["prevalenceRule"], "resolução exige regra de prevalência explícita do domínio");
    else if (d.prevalenceRule.ruleRef !== d.resolution.ruleRef) issue(["resolution", "ruleRef"], "a resolução deve citar a regra declarada");
    if (d.resolution.chosenClaimId !== undefined && !known.has(d.resolution.chosenClaimId)) issue(["resolution", "chosenClaimId"], "claim escolhida inexistente");
  }
});
export type SourceDivergenceV1 = z.infer<typeof sourceDivergenceV1Schema>;

/**
 * Quantas origens INDEPENDENTES os claims representam: agrupa por `originGroupId` e funde claims ligadas por derivação.
 * É descrição de proveniência. NÃO é peso, voto nem critério de decisão: ninguém deve escolher um valor por "ter mais".
 */
export function countIndependentOrigins(claims: readonly Pick<SourceClaimV1, "claimId" | "originGroupId" | "derivedFromClaimIds">[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const root = find(p); parent.set(x, root); return root; };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const groupKey = (g: string) => `group:${g}`;
  for (const c of claims) {
    union(`claim:${c.claimId}`, groupKey(c.originGroupId));
    for (const p of c.derivedFromClaimIds ?? []) union(`claim:${c.claimId}`, `claim:${p}`);
  }
  return new Set(claims.map((c) => find(`claim:${c.claimId}`))).size;
}
