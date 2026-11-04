import assert from "node:assert/strict";
import test from "node:test";
import type { ZodTypeAny } from "zod";
import {
  ORACULO_SOURCE_QUERY_SCOPE,
  ORACULO_SOURCE_SCOPE_PREFIX,
  SOURCE_QUERY_DENIAL_CODES,
  SOURCE_QUERY_STAGES,
  sourceQueryOutcomeV1Schema as outcomeSchema,
  sourceQueryRequestV1Schema as requestSchema,
} from "../src/index.js";

const ok = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, true, `deveria ser válido ${label}`);
const bad = (schema: ZodTypeAny, value: unknown, label = "") => assert.equal(schema.safeParse(value).success, false, `deveria ser inválido ${label}`);
const T0 = "2026-11-03T12:00:00.000Z";
const SHA = "a".repeat(64);

const request = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.source-query-request.v1", sourceId: "synthetic.test-source", operation: "synthetic_lookup", purpose: "synthetic_test", params: { code: "0000" }, ...over,
});
const audit = { durability: "in_memory_only", sink: "in_memory", eventRefs: [] };
const denied = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.source-query-outcome.v1", correlationId: "corr-synthetic-0001", status: "denied", stage: "source", reasonCode: "SOURCE_NOT_ACTIVE",
  adapterInvoked: false, caseMutationApplied: false, audit, ...over,
});
const executed = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "eiah.source-query-outcome.v1", correlationId: "corr-synthetic-0001", status: "executed", adapterInvocations: 1, caseMutationApplied: false, audit,
  result: {
    schemaVersion: "eiah.collection-result.v1", resultId: "res-1", sourceId: "synthetic.test-source", sourceVersion: 1, contentSchemaVersion: "synthetic.v1", scope: { kind: "shared" },
    dates: { collectedAt: T0, referenceDate: { status: "unknown" }, publishedAt: { status: "unknown" }, validFrom: { status: "unknown" }, validUntil: { status: "unknown" } }, warnings: [],
    outcome: "failure", error: { code: "timeout", message: "tempo esgotado", retryable: true },
  },
  proposals: [], evidenceRefs: [], ...over,
});

test("solicitação: capacidade por identificador; sem tenant, workspace, usuário, URL, credencial ou autorização", () => {
  ok(requestSchema, request());
  ok(requestSchema, request({ correlationId: "corr-client-0001", caseRef: { caseId: "case-1", expectedRevision: 3 } }), "com correlação e caso");
  for (const field of ["tenantId", "workspaceId", "userId", "url", "endpoint", "credentialRef", "apiKey", "token", "authorization", "allowed", "grantsAuthorization", "scope", "connectionId", "adapter"]) {
    bad(requestSchema, request({ [field]: "x" }), `campo ${field} não existe no contrato`);
  }
  for (const field of ["sourceId", "operation", "purpose", "params", "schemaVersion"]) {
    const rest = Object.fromEntries(Object.entries(request()).filter(([k]) => k !== field));
    bad(requestSchema, rest, `sem ${field}`);
  }
  bad(requestSchema, request({ sourceId: "https://evil.invalid/x" }), "fonte por identificador, nunca por URL");
  bad(requestSchema, request({ operation: "Op Com Espaço" }));
  bad(requestSchema, request({ purpose: "" }));
  bad(requestSchema, request({ params: "x" }));
  bad(requestSchema, request({ params: { blob: "x".repeat(9000) } }), "parâmetros limitados");
  bad(requestSchema, request({ correlationId: "curta" }));
  bad(requestSchema, request({ correlationId: "tem espaço no meio" }));
  bad(requestSchema, request({ caseRef: { caseId: "case 1", expectedRevision: 3 } }), "id de caso opaco");
  bad(requestSchema, request({ caseRef: { caseId: "case-1" } }), "revisão esperada obrigatória");
  bad(requestSchema, request({ caseRef: { caseId: "case-1", expectedRevision: 0 } }));
  bad(requestSchema, request({ caseRef: { caseId: "case-1", expectedRevision: 3, tenantId: "t" } }), "o caso não carrega tenant");
});

test("escopos propostos: consulta de fontes tem escopo próprio, distinto do contexto e da preparação", () => {
  assert.equal(ORACULO_SOURCE_QUERY_SCOPE, "log.oraculo_source.query");
  assert.ok(ORACULO_SOURCE_QUERY_SCOPE.startsWith(ORACULO_SOURCE_SCOPE_PREFIX));
  assert.notEqual(ORACULO_SOURCE_QUERY_SCOPE, "log.context.read");
  assert.equal(ORACULO_SOURCE_QUERY_SCOPE.startsWith("log.oraculo_preparation."), false);
});

test("resultado: negado nunca invocou o adaptador; executado invocou exatamente uma vez; ninguém altera o caso", () => {
  ok(outcomeSchema, denied());
  ok(outcomeSchema, executed());
  bad(outcomeSchema, denied({ adapterInvoked: true }), "negado não chama o adaptador");
  bad(outcomeSchema, denied({ caseMutationApplied: true }));
  bad(outcomeSchema, executed({ caseMutationApplied: true }), "consulta não altera o caso");
  bad(outcomeSchema, executed({ adapterInvocations: 0 }), "executado invocou o adaptador");
  bad(outcomeSchema, executed({ adapterInvocations: 2 }), "no máximo uma chamada");
  bad(outcomeSchema, denied({ reasonCode: "SOMETHING_ELSE" }));
  bad(outcomeSchema, denied({ stage: "nowhere" }));
  bad(outcomeSchema, { ...denied(), result: executed().result }, "negado não carrega resultado");
  bad(outcomeSchema, { ...executed(), reasonCode: "SOURCE_NOT_ACTIVE" }, "executado não carrega motivo de negação");
  bad(outcomeSchema, denied({ correlationId: "x" }));
  for (const code of SOURCE_QUERY_DENIAL_CODES) ok(outcomeSchema, denied({ reasonCode: code }), code);
  for (const stage of SOURCE_QUERY_STAGES) ok(outcomeSchema, denied({ stage }), stage);
  assert.equal(new Set(SOURCE_QUERY_DENIAL_CODES).size, SOURCE_QUERY_DENIAL_CODES.length, "códigos únicos");
});

test("auditoria declarada: persistida só quando afirmada; descrição estrita", () => {
  ok(outcomeSchema, denied({ audit: { durability: "persisted", sink: "guardrail_audit_ledger", eventRefs: ["ref-1"] } }));
  bad(outcomeSchema, denied({ audit: { durability: "durable", sink: "x", eventRefs: [] } }), "vocabulário de durabilidade");
  bad(outcomeSchema, denied({ audit: { durability: "persisted", eventRefs: [] } }), "destino obrigatório");
  bad(outcomeSchema, denied({ audit: { durability: "persisted", sink: "x", eventRefs: [], receipt: "r1" } }), "sem recibo inventado");
  bad(outcomeSchema, denied({ audit: undefined }));
});

test("executado reaproveita os contratos de resultado, evidência e proposta da etapa anterior", () => {
  bad(outcomeSchema, executed({ result: { ...executed().result, confidence: 0.9 } }), "sem confiança numérica");
  bad(outcomeSchema, executed({ result: { ...executed().result, outcome: "success" } }), "resultado inválido não passa");
  bad(outcomeSchema, executed({ evidenceRefs: [{ evidenceId: "ev-1", contentSha256: "xyz" }] }));
  ok(outcomeSchema, executed({ evidenceRefs: [{ evidenceId: "ev-1", contentSha256: SHA }] }));
  bad(outcomeSchema, executed({ proposals: [{ schemaVersion: "eiah.case-update-proposal.v1", caseMutationApplied: true }] }), "proposta inválida/aplicada não passa");
});
