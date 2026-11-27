import { z } from "zod";
import { caseUpdateProposalV1Schema, collectionResultV1Schema } from "./dataSources.js";
import { jsonValue, sha256Hex, stableId, text } from "./dataSourcePrimitives.js";

/**
 * Solicitação do Oráculo a uma fonte e o resultado devolvido ao consumidor (ligação interna mínima; SEM fonte real).
 *
 * O Oráculo pede uma CAPACIDADE por identificador (fonte + operação), nunca uma URL, credencial ou autorização. Tenant,
 * workspace e identidade NÃO existem neste contrato: vêm do contexto autenticado do servidor, e o `.strict()` rejeita qualquer
 * campo desses nomes enviado pelo cliente/LLM. Uma consulta nunca altera o caso: propostas voltam como proposta.
 */

/**
 * Escopo exato do workspace (política `TenantActionPolicy` + capacidade explícita no vínculo do membro) que autoriza o Oráculo a
 * consultar fontes de dados. PROPOSTA, não ratificada e não concedida a ninguém (ver docs/ops/authorization-scopes-catalog.md).
 * O acesso de contexto da Logística declara `externalTransmissionAllowed: false`, por isso consultar uma fonte externa exige este
 * escopo próprio: o acesso ao contexto é necessário, não suficiente.
 */
export const ORACULO_SOURCE_QUERY_SCOPE = "log.oraculo_source.query" as const;
/** Prefixo obrigatório dos escopos que uma conexão pode referenciar: evita apontar uma conexão para permissões de outro domínio. */
export const ORACULO_SOURCE_SCOPE_PREFIX = "log.oraculo_source." as const;

const correlationId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
const opaqueCaseId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const sourceQueryRequestV1Schema = z.object({
  schemaVersion: z.literal("eiah.source-query-request.v1"),
  sourceId: stableId,
  operation: stableId,
  /** Finalidade explícita; cada operação do adaptador declara quais finalidades aceita. */
  purpose: stableId,
  /** Parâmetros tipados por operação: o servidor os valida contra o esquema ESTRITO da operação antes de qualquer despacho. */
  params: z.record(jsonValue).refine((value) => JSON.stringify(value).length <= 8192, "parâmetros grandes demais"),
  /** Opcional. Se ausente, o servidor gera uma. */
  correlationId: correlationId.optional(),
  /** Opcional: só quando a consulta pertence a um caso. O servidor verifica existência, escopo e revisão. */
  caseRef: z.object({ caseId: opaqueCaseId, expectedRevision: z.number().int().positive() }).strict().optional(),
}).strict();
export type SourceQueryRequestV1 = z.infer<typeof sourceQueryRequestV1Schema>;

export const SOURCE_QUERY_STAGES = ["request", "access", "source", "connection", "policy", "adapter", "parameters", "case", "audit"] as const;
export const SOURCE_QUERY_DENIAL_CODES = [
  "REQUEST_INVALID",
  "CONTEXT_MISSING",
  "ACCESS_CONTEXT_DENIED",
  "QUERY_SCOPE_DENIED",
  "SOURCE_UNKNOWN",
  "SOURCE_SCOPE_MISMATCH",
  "SOURCE_NOT_ACTIVE",
  "SOURCE_SUSPENDED",
  "SOURCE_NOT_SPECIFIC",
  "CONNECTION_MISSING",
  "CONNECTION_SCOPE_MISMATCH",
  "CONNECTION_INCOMPATIBLE",
  "CONNECTION_NOT_CONFIGURED",
  "CONNECTION_SUSPENDED",
  "CONNECTION_DISABLED",
  "CONDITIONS_MISSING_OR_INCOMPATIBLE",
  "AUTHENTICATION_UNKNOWN",
  "CREDENTIAL_RESOLUTION_UNAVAILABLE",
  "POLICY_REFERENCE_INVALID",
  "CONNECTION_POLICY_DENIED",
  "ADAPTER_NOT_REGISTERED",
  "ADAPTER_SYNTHETIC_NOT_ALLOWED",
  "OPERATION_NOT_SUPPORTED",
  "PURPOSE_NOT_ALLOWED",
  "PARAMETERS_INVALID",
  "CASE_NOT_FOUND",
  "CASE_REVISION_MISMATCH",
  "AUDIT_UNAVAILABLE",
] as const;
export type SourceQueryDenialCode = (typeof SOURCE_QUERY_DENIAL_CODES)[number];

/**
 * O que foi efetivamente registrado. `persisted` só é afirmado quando o destino de auditoria o confirma; um registro somente em
 * memória é `in_memory_only` e nunca se apresenta como auditoria ou recibo persistido.
 */
export const sourceQueryAuditV1Schema = z.object({
  durability: z.enum(["in_memory_only", "persisted"]),
  sink: text,
  eventRefs: z.array(text).max(10),
}).strict();

const outcomeBase = {
  schemaVersion: z.literal("eiah.source-query-outcome.v1"),
  correlationId,
  /** Uma consulta nunca altera o caso. */
  caseMutationApplied: z.literal(false),
  audit: sourceQueryAuditV1Schema,
};

export const sourceQueryOutcomeV1Schema = z.discriminatedUnion("status", [
  z.object({
    ...outcomeBase,
    status: z.literal("denied"),
    stage: z.enum(SOURCE_QUERY_STAGES),
    reasonCode: z.enum(SOURCE_QUERY_DENIAL_CODES),
    /** Negado nunca chama o adaptador. */
    adapterInvoked: z.literal(false),
  }).strict(),
  z.object({
    ...outcomeBase,
    status: z.literal("executed"),
    /** Exatamente uma chamada ao adaptador por solicitação. */
    adapterInvocations: z.literal(1),
    /** Sucesso, vazio, não modificado ou falha: o resultado tipado da etapa 1, com origem, evidência e avisos. */
    result: collectionResultV1Schema,
    /** Propostas de atualização do caso (nunca aplicadas, nunca decididas). */
    proposals: z.array(caseUpdateProposalV1Schema).max(50),
    evidenceRefs: z.array(z.object({ evidenceId: text, contentSha256: sha256Hex }).strict()).max(5),
  }).strict(),
]);
export type SourceQueryOutcomeV1 = z.infer<typeof sourceQueryOutcomeV1Schema>;
