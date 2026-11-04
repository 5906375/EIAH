import { z } from "zod";
import {
  collectionResultWarningV1Schema,
  collectionRecordV1Schema,
  collectionResultDatesV1Schema,
  COLLECTION_ERROR_CODES,
  type DataSourceAccessConditionsV1,
  type DataSourceAccessMode,
  type DataSourceConnectionV1,
  type DataSourceScopeV1,
  type DataSourceV2,
} from "@eiah/contracts";

/**
 * Portas do encaixe Oráculo → Core → adaptador. Nada aqui faz rede, lê ambiente ou segredo: são contratos. As implementações de
 * produção que EXISTEM reaproveitam o acesso do Core (ver `coreWiring.ts`); o que ainda não existe (armazenamento de conexões,
 * adaptadores reais, resolução de credenciais) fica como porta e, por padrão, NEGA.
 */

/** Identidade e escopo confiáveis: resolvidos no servidor (token autenticado), nunca lidos do corpo da solicitação. */
export type TrustedServerContext = Readonly<{ tenantId: string; workspaceId: string; userId?: string | null }>;

export type AccessDecision = { allowed: true } | { allowed: false; reasonCode: "ACCESS_CONTEXT_DENIED" | "QUERY_SCOPE_DENIED" };

/** Avaliação de acesso do Core. Decide quem pode consultar; o adaptador nunca decide. */
export interface SourceQueryAccessPort {
  /** Porta geral: contexto da vertical (instalação, aprovação, vínculo) + escopo de consulta do Oráculo. Antes de revelar qualquer detalhe de fonte. */
  checkQueryAccess(identity: TrustedServerContext): Promise<AccessDecision>;
  /** Política exata referenciada pela conexão (`accessPolicyRef`): política do workspace + capacidade explícita do membro. */
  checkConnectionPolicy(identity: TrustedServerContext, policyScope: string): Promise<{ allowed: boolean }>;
}

export interface SourceCatalogPort {
  get(sourceId: string): Promise<DataSourceV2 | null> | DataSourceV2 | null;
}

export type ResolvedConnection = { connection: DataSourceConnectionV1; conditions: DataSourceAccessConditionsV1 | null };
/** Resolve a conexão aplicável POR ESCOPO do servidor. A implementação de produção ainda não existe (`ConnectorInstance` sem consumidor). */
export interface ConnectionResolverPort {
  resolve(scope: Readonly<{ tenantId: string; workspaceId: string }>, sourceId: string): Promise<ResolvedConnection | null>;
}

export interface CasePort {
  /** Somente leitura, dentro do escopo do servidor. Não há método de escrita: uma consulta não consegue alterar o caso. */
  get(scope: Readonly<{ tenantId: string; workspaceId: string }>, caseId: string): Promise<{ caseId: string; caseType: string; revision: number } | null>;
}

export type SourceQueryAuditEvent = {
  event: "oraculo.source_query.denied" | "oraculo.source_query.authorized" | "oraculo.source_query.completed";
  tenantId: string;
  workspaceId: string;
  userId: string | null;
  correlationId: string;
  sourceId?: string;
  connectionId?: string;
  operation?: string;
  stage?: string;
  reasonCode?: string;
  /** Hash dos parâmetros; os valores NUNCA são registrados. */
  paramsSha256?: string;
  resultOutcome?: string;
};
export interface SourceQueryAuditSink {
  readonly name: string;
  record(event: SourceQueryAuditEvent): Promise<{ durability: "in_memory_only" | "persisted"; ref?: string }>;
}

// --- Adaptador ------------------------------------------------------------------------------------------------
export type AdapterOperationDescriptor = {
  /** Esquema ESTRITO dos parâmetros da operação. O servidor valida antes de despachar. */
  paramsSchema: z.ZodTypeAny;
  allowedPurposes: readonly string[];
  contentSchemaVersion: string;
};
export type AdapterDescriptor = {
  adapterId: string;
  sourceId: string;
  mode: DataSourceAccessMode;
  publisherStatus: "official" | "unofficial" | "unknown";
  /** Adaptador de TESTE. Só é despachável quando o serviço é criado com `allowSyntheticAdapters: true` (nunca em produção). */
  synthetic?: boolean;
  operations: Readonly<Record<string, AdapterOperationDescriptor>>;
};
/** Contexto MÍNIMO do adaptador: sem identidade de usuário, sem credencial, sem URL. `scope` só identifica o escopo da conexão. */
export type AdapterCall = Readonly<{
  correlationId: string;
  sourceId: string;
  sourceVersion: number;
  connectionId: string;
  operation: string;
  purpose: string;
  params: Readonly<Record<string, unknown>>;
  scope: DataSourceScopeV1;
}>;
export interface SourceAdapter {
  readonly descriptor: AdapterDescriptor;
  /** Devolve algo que o serviço valida como `AdapterOutcome`. Não decide acesso, não recebe segredo, não altera o caso. */
  execute(call: AdapterCall): Promise<unknown>;
}
export interface SourceAdapterRegistryPort {
  find(sourceId: string, mode: DataSourceAccessMode): SourceAdapter | null;
}

// --- Resultado do adaptador (validado pelo serviço; campos de identidade/escopo/tempo são do SERVIDOR, não do adaptador) ------------
const original = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  mediaType: z.string().trim().min(1).max(500),
  storage: z.discriminatedUnion("status", [
    z.object({ status: z.literal("preserved"), ref: z.string().trim().min(1).max(500) }).strict(),
    z.object({ status: z.literal("not_preserved") }).strict(),
  ]),
}).strict();
const transformation = z.object({
  transformId: z.string().min(3).max(80).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
  transformVersion: z.string().trim().min(1).max(500),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  deterministic: z.boolean(),
}).strict();
const adapterDates = collectionResultDatesV1Schema.innerType().omit({ collectedAt: true });
const suggestedChange = z.object({
  fieldPath: z.string().max(200),
  operation: z.enum(["set", "clear"]),
  proposedValue: z.unknown().optional(),
}).strict();
const common = { dates: adapterDates, warnings: z.array(collectionResultWarningV1Schema).max(50) };

export const adapterOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("success"), records: z.array(collectionRecordV1Schema).min(1).max(1000), original, transformation, suggestedChanges: z.array(suggestedChange).max(50).optional(), ...common }).strict(),
  z.object({ outcome: z.literal("empty"), emptyReason: z.enum(["no_matching_records", "source_returned_empty"]), original, ...common }).strict(),
  z.object({ outcome: z.literal("not_modified"), basedOn: z.object({ previousResultId: z.string().trim().min(1).max(500), previousContentSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), ...common }).strict(),
  z.object({
    outcome: z.literal("failure"),
    error: z.object({ code: z.enum(COLLECTION_ERROR_CODES), message: z.string().trim().min(1).max(500), retryable: z.boolean(), httpStatus: z.number().int().min(100).max(599).optional() }).strict(),
    ...common,
  }).strict(),
]);
export type AdapterOutcome = z.infer<typeof adapterOutcomeSchema>;
