// Radar Social — serviço de RadarKnownEntity (cadastro, consulta, alteração
// e desativação). Ver docs/architecture/radar-social-construction-plan-v1.md,
// Atualização 1.9.
//
// NÃO implementa análise, Run, fila ou chamada a modelo. Reutiliza
// checkScopePermission real (fail-closed, @eiah/core) e TenantMembership
// real (schema existente) — nenhum destes é reimplementado aqui. Não
// implementa RadarEntityAccessResolver de produção (radarEntityAccessResolver.ts
// só a interface): toda operação que dependa de acesso individual a uma
// entidade EXISTENTE exige o parâmetro `resolver`, sem valor padrão — sua
// ausência/falha bloqueia, nunca libera.
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import { checkScopePermission } from "@eiah/core";
import {
  RadarKnownEntityError,
  validateCreateRadarKnownEntityInput,
  validateUpdateRadarKnownEntityPatch,
  type CreateRadarKnownEntityInput,
  type RadarKnownEntityRecord,
  type RadarKnownEntityStatus,
  type UpdateRadarKnownEntityPatch,
} from "./radarKnownEntityContract";
import {
  RadarSocialAuthorizationError,
  reasonCodeForRadarEntityAccessOutcome,
  isRadarEntityAccessOperationFailure,
  RADAR_ENTITY_ACCESS_ITEM_FILTERABLE_OUTCOMES,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";
import { RADAR_ENTITY_ACCESS_GRANT_OPERATIONS } from "./radarEntityAccessGrantContract";

export class RadarKnownEntityNotFoundError extends Error {
  constructor(readonly reasonCode: string = "radar_known_entity_not_found", readonly context: Record<string, unknown> = {}) {
    super(reasonCode);
    this.name = "RadarKnownEntityNotFoundError";
  }
}

export class RadarKnownEntityConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_known_entity_conflict:${reasonCode}`);
    this.name = "RadarKnownEntityConflictError";
  }
}

// Escopos PROVISÓRIOS, análogos ao aviso de "runs.execute" em
// signalForwardingService.ts: nomes novos, não integrados a nenhuma matriz
// de escopos ratificada fora desta unidade. Leitura é DISTINTA de
// escrita/gestão (política ratificada, Atualização 1.9 — "Escrita e gestão
// exigem permissões separadas da leitura"); gestão de entidade e escrita de
// material usam escopos próprios adicionalmente distintos entre si, por
// princípio de menor privilégio (decisão desta unidade, não uma política já
// ratificada em rodada anterior — sujeita a revisão).
export const RADAR_SOCIAL_READ_SCOPE = "radar_social.read";
export const RADAR_SOCIAL_ENTITY_MANAGE_SCOPE = "radar_social.entities.manage";

const ENTITY_EXTERNAL_REF_CONSTRAINT_COLUMNS = ["external_ref", "tenant_id", "workspace_id"].sort();

function isExternalRefUniqueViolation(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return false;
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarKnownEntity") return false;
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return false;
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return false;
  const sorted = [...(fields as string[])].sort();
  return sorted.length === ENTITY_EXTERNAL_REF_CONSTRAINT_COLUMNS.length
    && sorted.every((v, i) => v === ENTITY_EXTERNAL_REF_CONSTRAINT_COLUMNS[i]);
}

interface OperationContext {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
}

/**
 * Controles COMUNS a toda operação, na ordem: identidade+membership (o
 * usuário pertence ao tenant) -> vínculo workspace-tenant (o workspace
 * pertence ao tenant informado) -> permissão da operação (checkScopePermission,
 * fail-closed). Nenhuma das três dispensa as outras (Atualização 1.4/1.6 do
 * plano). Lançado ANTES de qualquer leitura/gravação de RadarKnownEntity.
 */
async function assertOperationAuthorized(
  db: PrismaClient,
  ctx: OperationContext,
  scope: string
): Promise<void> {
  const membership = await db.tenantMembership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId },
  });
  if (!membership) {
    throw new RadarSocialAuthorizationError("membership_not_found");
  }

  const workspace = await db.workspace.findFirst({
    where: { id: ctx.workspaceId, tenantId: ctx.tenantId },
  });
  if (!workspace) {
    throw new RadarSocialAuthorizationError("workspace_tenant_mismatch");
  }

  const decision = await checkScopePermission({
    tenantId: ctx.tenantId,
    workspaceId: ctx.workspaceId,
    userId: ctx.actorUserId,
    scope,
  });
  if (!decision.allowed) {
    throw new RadarSocialAuthorizationError(decision.reasonCode);
  }
}

function toRecord(row: {
  id: string; tenantId: string; workspaceId: string; displayName: string;
  externalRef: string | null; status: string; revision: number;
  createdByUserId: string; createdAt: Date; updatedAt: Date;
}): RadarKnownEntityRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId,
    displayName: row.displayName, externalRef: row.externalRef,
    status: row.status as RadarKnownEntityStatus, revision: row.revision,
    createdByUserId: row.createdByUserId, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export interface CreateRadarKnownEntityParams extends OperationContext {
  input: CreateRadarKnownEntityInput;
}

/**
 * Criação — autorização da COLEÇÃO (membership + workspace-tenant + escopo
 * de gestão), SEM checagem de acesso individual: não existe entityId antes
 * de a linha ser criada (política ratificada, "Criação: autorização da
 * coleção antes de existir entityId"). Conflito de externalRef é reportado
 * como RadarKnownEntityConflictError — não há recuperação idempotente na
 * criação de entidade (só o material tem operationKey/idempotência).
 *
 * Cria, na MESMA transação, os quatro grants iniciais do criador (`read`,
 * `write`, `manage`, `analyze` — RadarEntityAccessGrant) com
 * `grantedByUserId = createdByUserId` (autoconcessão explícita, registrada
 * — nunca um bypass implícito sem linha própria, Atualização 1.22 Decisão
 * 1, corrigindo a Atualização 1.21). Essas quatro linhas são, a partir daí,
 * grants revogáveis como quaisquer outros — nenhum tratamento especial
 * depois da criação.
 */
export async function createRadarKnownEntity(
  params: CreateRadarKnownEntityParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarKnownEntityRecord> {
  await assertOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);
  const validated = validateCreateRadarKnownEntityInput(params.input);

  try {
    const created = await db.$transaction(async (tx) => {
      const entity = await tx.radarKnownEntity.create({
        data: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          displayName: validated.displayName,
          externalRef: validated.externalRef,
          createdByUserId: params.actorUserId,
        },
      });
      const now = new Date();
      await tx.radarEntityAccessGrant.createMany({
        data: RADAR_ENTITY_ACCESS_GRANT_OPERATIONS.map((operation) => ({
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          entityId: entity.id,
          granteeUserId: params.actorUserId,
          operation,
          enabled: true,
          grantedByUserId: params.actorUserId,
          grantedAt: now,
        })),
      });
      for (const operation of RADAR_ENTITY_ACCESS_GRANT_OPERATIONS) {
        await tx.guardrailAuditLedger.create({
          data: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            eventType: "radar_entity_access_granted",
            severity: "info",
            message: `radar_entity_access_granted operation=${operation} entity=${entity.id} grantee=${params.actorUserId} actor=${params.actorUserId} (initial grant at entity creation)`,
            metadata: {
              entityId: entity.id, granteeUserId: params.actorUserId, operation, actorUserId: params.actorUserId,
              initialGrantAtEntityCreation: true,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return entity;
    });
    return toRecord(created);
  } catch (e) {
    if (isExternalRefUniqueViolation(e)) {
      throw new RadarKnownEntityConflictError("external_ref_already_in_use", { externalRef: validated.externalRef });
    }
    throw e;
  }
}

export interface GetRadarKnownEntityParams extends OperationContext {
  entityId: string;
  resolver: RadarEntityAccessResolver;
}

/**
 * Consulta individual — escopo de leitura + acesso individual pelo
 * resolvedor (obrigatório). "não encontrado no escopo" e "acesso negado"
 * NUNCA revelam qual dos dois ocorreu de fato ao chamador externo (mesmo
 * reasonCode base do serviço), mas o reasonCode interno de auditoria
 * preserva a distinção via `context`.
 */
export async function getRadarKnownEntity(
  params: GetRadarKnownEntityParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarKnownEntityRecord> {
  await assertOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const row = await db.radarKnownEntity.findFirst({
    where: { id: params.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!row) {
    throw new RadarKnownEntityNotFoundError();
  }

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: "read",
  });
  if (outcome !== "authorized") {
    // Mesmo reasonCode-base independentemente do outcome específico do
    // resolvedor (not_found/out_of_scope/access_denied/resolver_unavailable/
    // resolution_failed) — não revela ao chamador qual dos dois motivos de
    // "não encontrado" ocorreu (não existe vs. sem acesso).
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }

  return toRecord(row);
}

export interface ListRadarKnownEntitiesParams extends OperationContext {
  resolver: RadarEntityAccessResolver;
  status?: RadarKnownEntityStatus;
  limit: number;
  cursor?: string;
}

export interface ListRadarKnownEntitiesResult {
  items: RadarKnownEntityRecord[];
  nextCursor: string | null;
}

/**
 * Listagem — escopo de leitura + filtragem INDIVIDUAL por item via o
 * resolvedor, ANTES de compor a página devolvida (política ratificada:
 * "Listagem: autorização da operação e filtragem individual antes de
 * compor itens, contagens e paginação"). `access_denied`/`entity_not_found`/
 * `entity_out_of_scope` por item apenas EXCLUEM aquele item;
 * `resolver_unavailable`/`resolution_failed` abortam a operação inteira
 * (nunca uma lista vazia "bem-sucedida" por engano).
 *
 * Limitação conhecida e documentada: a filtragem ocorre DEPOIS da consulta
 * paginada por cursor (não há hoje um resolvedor real que permita empurrar
 * o filtro para o SQL) — sob alta taxa de negação, uma página pode devolver
 * menos itens que `limit` mesmo havendo mais linhas além do cursor. Isso é
 * uma limitação aceita nesta unidade, não uma contagem incorreta.
 */
export async function listRadarKnownEntities(
  params: ListRadarKnownEntitiesParams,
  db: PrismaClient = prismaGlobal
): Promise<ListRadarKnownEntitiesResult> {
  await assertOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const rows = await db.radarKnownEntity.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { id: "asc" },
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasNextPage = rows.length > params.limit;
  const page = hasNextPage ? rows.slice(0, params.limit) : rows;

  const items: RadarKnownEntityRecord[] = [];
  for (const row of page) {
    const outcome = await params.resolver({
      confirmedIdentity: params.actorUserId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      entityId: row.id,
      operation: "read",
    });
    if (outcome === "authorized") {
      items.push(toRecord(row));
      continue;
    }
    if (isRadarEntityAccessOperationFailure(outcome)) {
      throw new RadarSocialAuthorizationError(reasonCodeForRadarEntityAccessOutcome(outcome)!, { entityId: row.id });
    }
    if (!RADAR_ENTITY_ACCESS_ITEM_FILTERABLE_OUTCOMES.includes(outcome)) {
      // Outcome desconhecido/novo: fail-closed por padrão, trata como falha
      // de operação em vez de excluir silenciosamente.
      throw new RadarSocialAuthorizationError(`radar_entity_access_unrecognized_outcome`, { entityId: row.id, outcome });
    }
    // access_denied / entity_not_found / entity_out_of_scope: exclui só o item.
  }

  return {
    items,
    nextCursor: hasNextPage ? page[page.length - 1]!.id : null,
  };
}

export interface UpdateRadarKnownEntityParams extends OperationContext {
  entityId: string;
  expectedRevision: number;
  patch: UpdateRadarKnownEntityPatch;
  resolver: RadarEntityAccessResolver;
}

/**
 * Alteração (displayName/externalRef) — escrita condicionada atômica via
 * `updateMany` com `WHERE id=... AND revision=$expectedRevision`: uma única
 * instrução SQL garante que uma revisão desatualizada nunca sobrescreve a
 * vencedora, sem depender de SELECT-antes-de-UPDATE. `expectedRevision` é
 * um PARÂMETRO da chamada (não um campo do registro) — nunca confundido com
 * `revision`, que é sempre gerado/incrementado pelo servidor.
 */
export async function updateRadarKnownEntity(
  params: UpdateRadarKnownEntityParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarKnownEntityRecord> {
  await assertOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);
  const validatedPatch = validateUpdateRadarKnownEntityPatch(params.patch);

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: "manage",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }

  try {
    const result = await db.radarKnownEntity.updateMany({
      where: {
        id: params.entityId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        revision: params.expectedRevision,
      },
      data: {
        ...validatedPatch,
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw await buildConditionalWriteFailure(db, params.tenantId, params.workspaceId, params.entityId, params.expectedRevision);
    }
  } catch (e) {
    if (isExternalRefUniqueViolation(e)) {
      throw new RadarKnownEntityConflictError("external_ref_already_in_use", { externalRef: validatedPatch.externalRef });
    }
    throw e;
  }

  const updated = await db.radarKnownEntity.findFirst({
    where: { id: params.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!updated) throw new RadarKnownEntityNotFoundError();
  return toRecord(updated);
}

export interface DeactivateRadarKnownEntityParams extends OperationContext {
  entityId: string;
  expectedRevision: number;
  resolver: RadarEntityAccessResolver;
}

/**
 * Desativação — mesma escrita condicionada atômica de updateRadarKnownEntity,
 * adicionalmente exigindo `status='active'` na condição: uma segunda
 * desativação concorrente (mesma revisão já consumida pela primeira) falha
 * com conflito, nunca "desativa de novo" silenciosamente. Entidade inativa
 * bloqueia NOVOS materiais (radarMaterialService.ts) mas preserva consulta e
 * replay históricos autorizados.
 */
export async function deactivateRadarKnownEntity(
  params: DeactivateRadarKnownEntityParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarKnownEntityRecord> {
  await assertOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: "manage",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }

  const result = await db.radarKnownEntity.updateMany({
    where: {
      id: params.entityId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      revision: params.expectedRevision,
      status: "active",
    },
    data: { status: "inactive", revision: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw await buildConditionalWriteFailure(db, params.tenantId, params.workspaceId, params.entityId, params.expectedRevision);
  }

  const updated = await db.radarKnownEntity.findFirst({
    where: { id: params.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!updated) throw new RadarKnownEntityNotFoundError();
  return toRecord(updated);
}

/**
 * Diagnóstico best-effort APÓS uma escrita condicionada falhar (`count !==
 * 1`) — leitura separada, fora de qualquer transação abortada, só para
 * produzir um reasonCode útil (not_found vs. revision_conflict vs.
 * already_inactive). A correção em si já é garantida pela atomicidade da
 * própria instrução `updateMany`, não por esta leitura.
 */
async function buildConditionalWriteFailure(
  db: PrismaClient,
  tenantId: string,
  workspaceId: string,
  entityId: string,
  expectedRevision: number
): Promise<RadarKnownEntityConflictError | RadarKnownEntityNotFoundError> {
  const current = await db.radarKnownEntity.findFirst({ where: { id: entityId, tenantId, workspaceId } });
  if (!current) return new RadarKnownEntityNotFoundError();
  if (current.revision !== expectedRevision) {
    return new RadarKnownEntityConflictError("expected_revision_outdated", {
      expectedRevision, actualRevision: current.revision,
    });
  }
  if (current.status !== "active") {
    return new RadarKnownEntityConflictError("entity_not_active", { status: current.status });
  }
  return new RadarKnownEntityConflictError("conditional_write_failed");
}

// Reexportado para reaproveitamento por radarMaterialService.ts — mesma
// checagem de identidade/membership/vínculo/escopo, escopo diferente.
export { assertOperationAuthorized as assertRadarSocialOperationAuthorized };
export { RadarKnownEntityError };
