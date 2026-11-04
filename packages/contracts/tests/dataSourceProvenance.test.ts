import assert from "node:assert/strict";
import test from "node:test";
import type { ZodTypeAny } from "zod";
import {
  countIndependentOrigins,
  originEvidenceV1Schema as evidenceV1Schema,
  originEvidenceV2Schema as evidenceSchema,
  sourceDivergenceV1Schema as divergenceSchema,
  upgradeOriginEvidenceV1ToV2,
} from "../src/index.js";

const T0 = "2026-11-03T12:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const ok = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, true, `deveria ser válido ${label}`);
const bad = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, false, `deveria ser inválido ${label}`);
const UNKNOWN = { status: "unknown" } as const;

const validated = { status: "validated", method: "human_review", validatedBy: "synthetic-reviewer", validatedAt: T0, basisHash: SHA_B };
const evidence = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.origin-evidence.v2",
  evidenceId: "ev-1",
  origin: { kind: "system_obtained", sourceId: "synthetic.source", obtainedAt: T0, publisherStatus: "official" },
  integrity: { status: "hashed", sha256: SHA_A },
  authenticity: { status: "not_assessed" },
  currency: { status: "not_assessed" },
  validation: { status: "not_validated" },
  approval: { status: "not_requested" },
  authorization: { status: "not_evaluated" },
  grantsAuthorization: false,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------
test("evidência v2: origem, integridade, autenticidade, atualidade, validação, aprovação e autorização são dimensões próprias", () => {
  ok(evidenceSchema, evidence(), "mínima");
  ok(evidenceSchema, evidence({ origin: { kind: "supplier_declared", supplierRef: "synthetic-provider", receivedAt: T0 } }), "declarada pelo fornecedor");
  ok(evidenceSchema, evidence({ origin: { kind: "manual_entry", enteredBy: "synthetic-user", enteredAt: T0, entryBasis: "synthetic" } }), "inserida manualmente");
  for (const dimension of ["origin", "integrity", "authenticity", "currency", "validation", "approval", "authorization", "grantsAuthorization"]) {
    const { [dimension]: _omitted, ...rest } = evidence() as Record<string, unknown>;
    void _omitted;
    bad(evidenceSchema, rest, `sem ${dimension}`);
  }
  bad(evidenceSchema, evidence({ confidence: 0.9 }), "sem confiança numérica");
  bad(evidenceSchema, evidence({ trusted: true }), "sem 'confiável'");
  bad(evidenceSchema, evidence({ integrity: { status: "hashed", sha256: "A".repeat(64) } }));
  bad(evidenceSchema, evidence({ integrity: { status: "hashed" } }), "hash obrigatório quando hashed");
  ok(evidenceSchema, evidence({ integrity: { status: "hashed", sha256: SHA_A, byteLength: 10, contentRef: "storage:synthetic/1" } }), "hash e referência ao conteúdo original");
  ok(evidenceSchema, evidence({ integrity: { status: "not_available" } }), "sem conteúdo original, não há hash");
});

test("um hash não prova autoria; assinatura não prova veracidade; revisão não autoriza; oficial não é atualizado", () => {
  // hash sem nenhuma autenticidade
  const hashedOnly = evidenceSchema.parse(evidence());
  assert.equal(hashedOnly.integrity.status, "hashed");
  assert.equal(hashedOnly.authenticity.status, "not_assessed", "hash não infere autenticidade");
  assert.equal(hashedOnly.validation.status, "not_validated");
  // autenticidade verificada, mas conteúdo não validado nem aprovado nem autorizado
  const signedNotTrue = evidence({ authenticity: { status: "verified", method: "supplier_signature", verifiedBy: "synthetic-reviewer", verifiedAt: T0, evidenceRef: "synthetic-check-1" } });
  ok(evidenceSchema, signedNotTrue, "assinatura verificada");
  const parsedSigned = evidenceSchema.parse(signedNotTrue);
  assert.equal(parsedSigned.validation.status, "not_validated", "assinatura ≠ veracidade");
  assert.equal(parsedSigned.approval.status, "not_requested");
  assert.equal(parsedSigned.authorization.status, "not_evaluated");
  bad(evidenceSchema, evidence({ integrity: { status: "not_available" }, authenticity: { status: "verified", method: "publisher_checksum", verifiedBy: "u", verifiedAt: T0, evidenceRef: "r" } }), "autenticidade verificada precisa de um conteúdo identificado por hash");
  ok(evidenceSchema, evidence({ authenticity: { status: "method_declared", method: "supplier_signature" } }), "método declarado, não verificado");
  ok(evidenceSchema, evidence({ authenticity: { status: "none_available" } }), "sem método disponível");
  ok(evidenceSchema, evidence({ authenticity: { status: "failed", method: "supplier_signature", checkedAt: T0 } }), "falha registrada");
  bad(evidenceSchema, evidence({ authenticity: { status: "verified", method: "pgp", verifiedBy: "u", verifiedAt: T0, evidenceRef: "r" } }), "método fora do vocabulário");
  bad(evidenceSchema, evidence({ authenticity: { status: "verified", method: "supplier_signature", verifiedAt: T0, evidenceRef: "r" } }), "quem verificou é obrigatório");
  // revisão humana validada, sem permissão
  const reviewed = evidenceSchema.parse(evidence({ validation: validated }));
  assert.equal(reviewed.validation.status, "validated");
  assert.equal(reviewed.authorization.status, "not_evaluated", "revisão humana não concede permissão");
  assert.equal(reviewed.grantsAuthorization, false);
  // fonte oficial desatualizada
  ok(evidenceSchema, evidence({ currency: { status: "assessed", result: "stale", referenceDate: { status: "known", value: "2026-01-01" }, assessedAt: T0 } }), "oficial e desatualizada");
  const officialStale = evidenceSchema.parse(evidence({ currency: { status: "assessed", result: "stale", referenceDate: UNKNOWN, assessedAt: T0 } }));
  assert.equal(officialStale.origin.kind === "system_obtained" && officialStale.origin.publisherStatus, "official");
  bad(evidenceSchema, evidence({ currency: { status: "assessed", result: "fresh", referenceDate: UNKNOWN, assessedAt: T0 } }));
  bad(evidenceSchema, evidence({ currency: { status: "assessed", result: "current", referenceDate: { status: "known", value: "2026-02-30" }, assessedAt: T0 } }), "data inexistente");
  bad(evidenceSchema, evidence({ origin: { kind: "system_obtained", sourceId: "synthetic.source", obtainedAt: T0, publisherStatus: "official", current: true } }), "'oficial' não carrega atualidade");
});

test("autorização é decisão do Core, apenas referenciada, e independente de validação/aprovação", () => {
  const decision = (outcome: string) => ({ status: "core_decision_referenced", decisionRef: "core-decision-synthetic-1", outcome, decidedAt: T0 });
  ok(evidenceSchema, evidence({ authorization: decision("allowed") }), "permitido sem validar");
  ok(evidenceSchema, evidence({ authorization: decision("denied"), validation: validated }), "negado apesar de validado");
  bad(evidenceSchema, evidence({ authorization: decision("granted") }), "vocabulário da decisão");
  bad(evidenceSchema, evidence({ authorization: { status: "core_decision_referenced", outcome: "allowed", decidedAt: T0 } }), "sem referência da decisão");
  bad(evidenceSchema, evidence({ authorization: { status: "approved" } }));
  // mesmo com decisão "allowed" referenciada, este registro não concede nada
  assert.equal(evidenceSchema.parse(evidence({ authorization: decision("allowed") })).grantsAuthorization, false);
  bad(evidenceSchema, evidence({ grantsAuthorization: true }), "o registro nunca concede autorização");
  // a validação não altera a autorização e vice-versa (nenhum campo é derivado do outro)
  for (const v of [{ status: "not_validated" }, validated]) {
    for (const a of [{ status: "not_evaluated" }, decision("allowed"), decision("denied")]) ok(evidenceSchema, evidence({ validation: v, authorization: a }));
  }
});

test("aprovação e validação seguem as regras do v1 (decisor ≠ solicitante; aprovar exige validar)", () => {
  const requested = { status: "requested", requestedBy: "synthetic-requester", requestedAt: T0 };
  const decided = (over: Record<string, unknown> = {}) => ({ status: "decided", decision: "approved", requestedBy: "synthetic-requester", decidedBy: "synthetic-decider", decidedAt: T0, note: "synthetic", ...over });
  ok(evidenceSchema, evidence({ validation: validated, approval: requested }));
  ok(evidenceSchema, evidence({ validation: validated, approval: decided() }));
  bad(evidenceSchema, evidence({ approval: decided() }), "aprovação sem validação");
  bad(evidenceSchema, evidence({ validation: validated, approval: decided({ decidedBy: "synthetic-requester" }) }), "decisor = solicitante");
  ok(evidenceSchema, evidence({ approval: decided({ decision: "more_information" }) }));
  bad(evidenceSchema, evidence({ validation: validated, approval: decided({ decision: "granted" }) }));
  bad(evidenceSchema, evidence({ validation: { status: "validated", method: "human_review", validatedBy: "u", validatedAt: T0 } }), "validação sem base");
});

test("compatibilidade: evidência v1 migra para v2 sem perda e sem promover nenhuma dimensão", () => {
  const v1 = evidenceV1Schema.parse({
    schemaVersion: "eiah.origin-evidence.v1", evidenceId: "ev-legacy", contentSha256: SHA_C,
    origin: { kind: "supplier_declared", supplierRef: "synthetic-provider", receivedAt: T0 },
    validation: validated, approval: { status: "requested", requestedBy: "synthetic-requester", requestedAt: T0 }, operationalAuthorization: false,
  });
  const v2 = upgradeOriginEvidenceV1ToV2(v1);
  assert.equal(v2.evidenceId, v1.evidenceId);
  assert.deepEqual(v2.origin, v1.origin);
  assert.deepEqual(v2.validation, v1.validation);
  assert.deepEqual(v2.approval, v1.approval);
  assert.deepEqual(v2.integrity, { status: "hashed", sha256: SHA_C });
  assert.deepEqual([v2.authenticity.status, v2.currency.status, v2.authorization.status], ["not_assessed", "not_assessed", "not_evaluated"]);
  assert.equal(v2.grantsAuthorization, false);
  const minimal = evidenceV1Schema.parse({ schemaVersion: "eiah.origin-evidence.v1", evidenceId: "ev-2", contentSha256: SHA_A, origin: { kind: "manual_entry", enteredBy: "u", enteredAt: T0, entryBasis: "b" }, validation: { status: "not_validated" }, approval: { status: "not_requested" }, operationalAuthorization: false });
  assert.equal(upgradeOriginEvidenceV1ToV2(minimal).validation.status, "not_validated");
});

// ---------------------------------------------------------------------------------------------------------
const claim = (id: string, over: Record<string, unknown> = {}) => ({
  claimId: id, informationKind: "reference_data", sourceId: "synthetic.source", evidenceRef: { evidenceId: `ev-${id}`, contentSha256: SHA_A },
  value: { code: "X" }, referenceDate: UNKNOWN, versionLabel: UNKNOWN, originGroupId: `origin-${id}`, ...over,
});
const divergence = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.source-divergence.v1", divergenceId: "div-1", scope: { kind: "shared" }, subjectRef: "synthetic.subject",
  conflictKinds: ["value_mismatch"], claims: [claim("c1", { value: { code: "X" } }), claim("c2", { value: { code: "Y" } })],
  prevalenceRule: { status: "none_declared" }, resolution: { status: "unresolved" }, automaticResolution: false, ...over,
});

test("divergência: conflito de valores entre fontes é representado, não resolvido", () => {
  ok(divergenceSchema, divergence(), "valores distintos");
  ok(divergenceSchema, divergence({ scope: { kind: "tenant_workspace", tenantId: "tenant-synthetic-A", workspaceId: "workspace-synthetic-A1" } }), "com escopo de tenant");
  bad(divergenceSchema, divergence({ claims: [claim("c1")] }), "uma única claim não é divergência");
  bad(divergenceSchema, divergence({ claims: [claim("c1", { value: { code: "X" } }), claim("c2", { value: { code: "X" } })] }), "value_mismatch com valores iguais");
  bad(divergenceSchema, divergence({ claims: [claim("c1"), claim("c1", { value: { code: "Y" } })] }), "claim duplicada");
  bad(divergenceSchema, divergence({ conflictKinds: [] }));
  bad(divergenceSchema, divergence({ conflictKinds: ["value_mismatch", "value_mismatch"] }));
  bad(divergenceSchema, divergence({ conflictKinds: ["majority"] }));
  ok(divergenceSchema, divergence({ claims: [claim("c1", { value: { a: 1, b: 2 } }), claim("c2", { value: { b: 2, a: 1, c: 3 } })] }), "ordem das chaves é irrelevante; conteúdo difere");
  bad(divergenceSchema, divergence({ claims: [claim("c1", { value: { a: 1, b: 2 } }), claim("c2", { value: { b: 2, a: 1 } })] }), "mesmo conteúdo em ordem diferente não é conflito");
});

test("divergência: sem votação, média, maioria, vencedor ou confiança; sem reconciliação automática", () => {
  for (const key of ["vote", "votes", "average", "majority", "consensus", "winner", "chosenValue", "confidence", "weight"]) bad(divergenceSchema, divergence({ [key]: 1 }), key);
  bad(divergenceSchema, divergence({ claims: [claim("c1", { value: 1, weight: 0.7 }), claim("c2", { value: 2 })] }), "peso por claim");
  bad(divergenceSchema, divergence({ automaticResolution: true }), "não há motor de reconciliação");
  bad(divergenceSchema, divergence({ resolution: { status: "resolved_automatically" } }));
  // N claims com o mesmo valor não "vencem" nada: o contrato não tem campo derivado de contagem
  const many = divergence({ claims: [claim("c1", { value: 1 }), claim("c2", { value: 1 }), claim("c3", { value: 1 }), claim("c4", { value: 2 })] });
  const parsed = divergenceSchema.parse(many);
  assert.equal(parsed.resolution.status, "unresolved");
  assert.equal(parsed.prevalenceRule.status, "none_declared");
});

test("divergência: tipos de informação diferentes não são comparáveis", () => {
  const kinds = ["aggregate_statistic", "reference_data", "forecast", "observed_event", "operational_confirmation", "normative_text", "document"];
  for (const kind of kinds) ok(divergenceSchema, divergence({ claims: [claim("c1", { informationKind: kind, value: 1 }), claim("c2", { informationKind: kind, value: 2 })] }), kind);
  for (const [a, b] of [["forecast", "observed_event"], ["aggregate_statistic", "operational_confirmation"], ["reference_data", "forecast"], ["observed_event", "operational_confirmation"]]) {
    bad(divergenceSchema, divergence({ claims: [claim("c1", { informationKind: a, value: 1 }), claim("c2", { informationKind: b, value: 2 })] }), `${a} × ${b}`);
  }
  bad(divergenceSchema, divergence({ claims: [claim("c1", { informationKind: "rumor", value: 1 }), claim("c2", { informationKind: "rumor", value: 2 })] }));
});

test("divergência: datas ou versões diferentes, e pendência de esclarecimento", () => {
  const dated = (d1: unknown, d2: unknown, extra: Record<string, unknown> = {}) => divergence({
    conflictKinds: ["date_or_version_mismatch"], claims: [claim("c1", { value: 1, referenceDate: d1, ...extra }), claim("c2", { value: 1, referenceDate: d2 })],
  });
  ok(divergenceSchema, dated({ status: "known", value: "2026-10-01" }, { status: "known", value: "2026-11-01" }), "datas de referência diferentes");
  ok(divergenceSchema, divergence({ conflictKinds: ["date_or_version_mismatch"], claims: [claim("c1", { value: 1, versionLabel: { status: "known", value: "v1" } }), claim("c2", { value: 1, versionLabel: { status: "known", value: "v2" } })] }), "versões diferentes");
  bad(divergenceSchema, dated({ status: "known", value: "2026-10-01" }, { status: "known", value: "2026-10-01" }), "mesma data não é conflito de data");
  bad(divergenceSchema, dated({ status: "known", value: "2026-10-01" }, UNKNOWN), "data desconhecida não prova diferença");
  bad(divergenceSchema, dated({ status: "known", value: "2026-02-30" }, { status: "known", value: "2026-11-01" }), "data inválida");
  ok(divergenceSchema, divergence({ resolution: { status: "clarification_requested", requestedBy: "synthetic-user", requestedAt: T0, requestRef: "req-1" } }), "pendência de esclarecimento");
  bad(divergenceSchema, divergence({ resolution: { status: "clarification_requested", requestedAt: T0 } }), "quem pediu é obrigatório");
});

test("divergência: fontes derivadas de uma mesma origem e vários canais NÃO são independentes", () => {
  const base = (id: string, group: string, extra: Record<string, unknown> = {}) => ({ claimId: id, originGroupId: group, ...extra });
  assert.equal(countIndependentOrigins([base("a", "g1"), base("b", "g1"), base("c", "g1")]), 1, "três canais, mesma origem");
  assert.equal(countIndependentOrigins([base("a", "g1"), base("b", "g2")]), 2, "duas origens distintas");
  assert.equal(countIndependentOrigins([base("a", "g1"), base("b", "g2", { derivedFromClaimIds: ["a"] })]), 1, "derivada de a");
  assert.equal(countIndependentOrigins([base("a", "g1"), base("b", "g2", { derivedFromClaimIds: ["a"] }), base("c", "g3")]), 2);
  assert.equal(countIndependentOrigins([base("a", "g1"), base("b", "g2", { derivedFromClaimIds: ["c"] }), base("c", "g3", { derivedFromClaimIds: ["a"] })]), 1, "cadeia de derivação");
  assert.equal(countIndependentOrigins([]), 0);
  // mesma informação por 3 canais: a divergência com a 4ª fonte é 1 origem × 1 origem, não 3 × 1
  const copies = [
    claim("w1", { originGroupId: "supplier-doc-1", viaChannel: "whatsapp", value: 1 }),
    claim("w2", { originGroupId: "supplier-doc-1", viaChannel: "whatsapp", value: 1 }),
    claim("w3", { originGroupId: "supplier-doc-1", derivedFromClaimIds: ["w1"], value: 1 }),
    claim("o1", { originGroupId: "official-1", value: 2 }),
  ];
  ok(divergenceSchema, divergence({ claims: copies }), "cópias + oficial");
  assert.equal(countIndependentOrigins(copies), 2);
  ok(divergenceSchema, divergence({ conflictKinds: ["value_mismatch", "same_origin_derivation"], claims: copies }), "derivação da mesma origem declarada");
  bad(divergenceSchema, divergence({ conflictKinds: ["value_mismatch", "same_origin_derivation"] }), "same_origin_derivation sem claims compartilhando origem");
  bad(divergenceSchema, divergence({ claims: [claim("c1", { value: 1, derivedFromClaimIds: ["ghost"] }), claim("c2", { value: 2 })] }), "derivada de claim inexistente");
  bad(divergenceSchema, divergence({ claims: [claim("c1", { value: 1, derivedFromClaimIds: ["c1"] }), claim("c2", { value: 2 })] }), "derivada de si mesma");
});

test("divergência: a prevalência é explícita por domínio e a resolução é sempre uma decisão humana", () => {
  const rule = { status: "declared", ruleRef: "domain-rule-synthetic-1", domain: "synthetic-domain" };
  const resolved = (over: Record<string, unknown> = {}) => ({ status: "resolved_by_human", decidedBy: { kind: "human", ref: "synthetic-human" }, decidedAt: T0, note: "synthetic", ruleRef: "domain-rule-synthetic-1", chosenClaimId: "c1", basisHash: SHA_B, ...over });
  ok(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved() }), "resolvida por humano com regra declarada");
  ok(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved({ chosenClaimId: undefined }) }), "resolução sem escolher claim");
  bad(divergenceSchema, divergence({ resolution: resolved() }), "sem regra de prevalência declarada nada prevalece");
  bad(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved({ ruleRef: "outra-regra" }) }), "cita regra diferente da declarada");
  bad(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved({ chosenClaimId: "ghost" }) }), "claim inexistente");
  bad(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved({ decidedBy: { kind: "system", ref: "synthetic-collector" } }) }), "sistema não resolve");
  bad(divergenceSchema, divergence({ prevalenceRule: rule, resolution: resolved({ basisHash: "x" }) }));
  bad(divergenceSchema, divergence({ prevalenceRule: { status: "declared", ruleRef: "r" } }), "regra sem domínio");
  bad(divergenceSchema, divergence({ prevalenceRule: { status: "newest_wins" } }), "não existem regras embutidas");
});
