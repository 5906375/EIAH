// Radar Social — serviço de RadarEntityAccessGrant: concessão/revogação de
// acesso individual por entidade e resolvedor real, apoiado inteiramente
// nos grants persistidos. Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.21, 1.22, 1.24 e 1.25.
//
// Ponto de serialização único: a linha de RadarKnownEntity (Atualização
// 1.24/1.25) — travada PRIMEIRO por grantRadarEntityAccess/
// revokeRadarEntityAccess, nunca por claimAttempt/preserveResult/
// reclaimExpiredAttempt (que nunca tocam grants). Toda revalidação depois
// de obter a trava usa dados lidos DE NOVO, nunca reaproveitados de antes
// da espera — mas a trava só serializa quem a adquire explicitamente: não
// alega atomicidade com alterações de TenantMembership/checkScopePermission
// feitas por caminhos que não participam deste protocolo (Atualização
// 1.25, seção 3, "fronteira exata da garantia").
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import { randomUUID } from "node:crypto";
import {
  validateGrantOperation,
  RadarEntityAccessGrantError,
  RadarEntityAccessGrantConflictError,
  type RadarEntityAccessGrantOperation,
  type RadarEntityAccessGrantRecord,
} from "./radarEntityAccessGrantContract";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
  RADAR_SOCIAL_ENTITY_MANAGE_SCOPE,
} from "./radarKnownEntityService";
import {
  RadarSocialAuthorizationError,
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
  type RadarEntityAccessOutcome,
} from "./radarEntityAccessResolver";

interface OperationContext {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
}

function toGrantRecord(row: {
  id: string; tenantId: string; workspaceId: string; entityId: string; granteeUserId: string;
  operation: string; enabled: boolean; grantedByUserId: string; grantedAt: Date;
  revokedByUserId: string | null; revokedAt: Date | null;
}): RadarEntityAccessGrantRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, entityId: row.entityId,
    granteeUserId: row.granteeUserId, operation: row.operation as RadarEntityAccessGrantOperation,
    enabled: row.enabled, grantedByUserId: row.grantedByUserId, grantedAt: row.grantedAt,
    revokedByUserId: row.revokedByUserId, revokedAt: row.revokedAt,
  };
}

/**
 * Trava a linha de RadarKnownEntity (ponto de serialização único,
 * Atualização 1.24/1.25) — dentro da transação já aberta pelo chamador.
 * Lança RadarKnownEntityNotFoundError se a entidade não existir no escopo
 * (mesmo reasonCode-base já usado no resto do Radar Social, não distingue
 * "não existe" de "outro tenant/workspace" — decisão deliberada para não
 * vazar existência entre tenants).
 */
async function lockEntityRow(
  tx: Prisma.TransactionClient,
  params: OperationContext & { entityId: string }
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM radar_known_entities
    WHERE id = ${params.entityId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
    FOR UPDATE
  `);
  if (rows.length === 0) throw new RadarKnownEntityNotFoundError();
}

/**
 * Revalida, NESTE INSTANTE (nunca reaproveitando uma checagem anterior à
 * espera pela trava), que `actorUserId` continua com `manage` habilitado
 * sobre a entidade. Lê via `tx` — protegido pela trava de entidade já
 * obtida (nenhum outro escritor de grants desta entidade pode estar no meio
 * de uma escrita enquanto a trava está retida).
 */
async function assertActorHasManage(
  tx: Prisma.TransactionClient,
  params: OperationContext & { entityId: string }
): Promise<void> {
  const actorManage = await tx.radarEntityAccessGrant.findFirst({
    where: {
      tenantId: params.tenantId, workspaceId: params.workspaceId, entityId: params.entityId,
      granteeUserId: params.actorUserId, operation: "manage", enabled: true,
    },
  });
  if (!actorManage) {
    throw new RadarEntityAccessGrantError("actor_manage_not_active", { actorUserId: params.actorUserId });
  }
}

/**
 * Grava o evento de auditoria SÓ quando uma transição real ocorreu (medida
 * pelo chamador via linhas afetadas da escrita condicionada) — nunca num
 * no-op idempotente. Atômico com a escrita: chamado dentro da MESMA
 * transação, nunca depois do COMMIT (Atualização 1.25, seção 2).
 */
async function writeGrantAuditEvent(
  tx: Prisma.TransactionClient,
  params: OperationContext & { entityId: string; granteeUserId: string; operation: string; eventType: "radar_entity_access_granted" | "radar_entity_access_revoked" }
): Promise<void> {
  await tx.guardrailAuditLedger.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      eventType: params.eventType,
      severity: "info",
      message: `${params.eventType} operation=${params.operation} entity=${params.entityId} grantee=${params.granteeUserId} actor=${params.actorUserId}`,
      metadata: {
        entityId: params.entityId,
        granteeUserId: params.granteeUserId,
        operation: params.operation,
        actorUserId: params.actorUserId,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export interface GrantRadarEntityAccessParams extends OperationContext {
  entityId: string;
  granteeUserId: string;
  operation: unknown;
}

/**
 * Concede (ou reativa, se já existiu e foi revogado) uma operação para um
 * usuário sobre uma entidade. Idempotente: conceder uma operação já
 * habilitada é sucesso silencioso, sem segundo evento de auditoria
 * (Atualização 1.25, seção 2 — "repetição sem mudança de estado" é
 * diferente de "nova alteração").
 */
export async function grantRadarEntityAccess(
  params: GrantRadarEntityAccessParams,
  db: PrismaClient = prismaGlobal
): Promise<{ granted: true }> {
  const operation = validateGrantOperation(params.operation);

  return await db.$transaction(async (tx) => {
    await lockEntityRow(tx, params);
    // Revalidado depois de obter a trava, nunca reaproveitado de antes da
    // espera — via `db` (conexão própria), não `tx`: TenantMembership/
    // checkScopePermission não participam do domínio desta trava
    // (Atualização 1.25, "fronteira exata da garantia").
    await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);
    await assertActorHasManage(tx, params);

    const newId = randomUUID();
    const affected = await tx.$executeRaw(Prisma.sql`
      INSERT INTO radar_entity_access_grants
        (id, tenant_id, workspace_id, entity_id, grantee_user_id, operation, enabled, granted_by_user_id, granted_at, revoked_by_user_id, revoked_at)
      VALUES
        (${newId}, ${params.tenantId}, ${params.workspaceId}, ${params.entityId}, ${params.granteeUserId}, ${operation}, true, ${params.actorUserId}, clock_timestamp(), NULL, NULL)
      ON CONFLICT (tenant_id, workspace_id, entity_id, grantee_user_id, operation)
      DO UPDATE SET
        enabled = true,
        granted_by_user_id = EXCLUDED.granted_by_user_id,
        granted_at = clock_timestamp(),
        revoked_by_user_id = NULL,
        revoked_at = NULL
      WHERE radar_entity_access_grants.enabled = false
    `);

    if (affected > 0) {
      await writeGrantAuditEvent(tx, {
        ...params, eventType: "radar_entity_access_granted", operation,
      });
    }
    // affected === 0 aqui significa: a linha já existia com enabled=true
    // (repetição sem mudança de estado) — sucesso idempotente, sem auditoria
    // nova. O INSERT/DO UPDATE nunca falha por duplicidade (ON CONFLICT já
    // trata a única violação de unicidade possível).
    return { granted: true } as const;
  }, { maxWait: 5000, timeout: 10000 });
}

export interface RevokeRadarEntityAccessParams extends OperationContext {
  entityId: string;
  granteeUserId: string;
  operation: unknown;
}

/**
 * Revoga uma operação de um usuário sobre uma entidade. Idempotente:
 * revogar algo já revogado ou nunca concedido é sucesso silencioso, sem
 * evento de auditoria. Para `operation === "manage"`, protege contra zerar
 * os gestores ELEGÍVEIS (grant habilitado + TenantMembership existente —
 * Atualização 1.25, seção 1, corrigindo a contagem "só de linhas" da
 * Atualização 1.24).
 */
export async function revokeRadarEntityAccess(
  params: RevokeRadarEntityAccessParams,
  db: PrismaClient = prismaGlobal
): Promise<{ revoked: true }> {
  const operation = validateGrantOperation(params.operation);

  return await db.$transaction(async (tx) => {
    await lockEntityRow(tx, params);
    await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);
    await assertActorHasManage(tx, params);

    if (operation === "manage") {
      // Reconta gestores ELEGÍVEIS (leitura fresca, sob a trava de
      // entidade já obtida): grant `manage` habilitado CUJO titular também
      // tenha TenantMembership existente. Um grant "fantasma" (titular já
      // sem membership) nunca conta, e removê-lo nunca é bloqueado por esta
      // guarda (Atualização 1.25, seção 1, casos A/C).
      const eligibleManagers = await tx.$queryRaw<Array<{ grantee_user_id: string }>>(Prisma.sql`
        SELECT g.grantee_user_id
        FROM radar_entity_access_grants g
        INNER JOIN tenant_memberships m
          ON m.tenant_id = g.tenant_id AND m.user_id = g.grantee_user_id
        WHERE g.tenant_id = ${params.tenantId} AND g.workspace_id = ${params.workspaceId}
          AND g.entity_id = ${params.entityId} AND g.operation = 'manage' AND g.enabled = true
      `);
      const isTargetTheOnlyEligible =
        eligibleManagers.length === 1 && eligibleManagers[0]!.grantee_user_id === params.granteeUserId;
      if (isTargetTheOnlyEligible) {
        throw new RadarEntityAccessGrantConflictError("cannot_revoke_last_eligible_manage_grant", {
          entityId: params.entityId,
        });
      }
    }

    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE radar_entity_access_grants
      SET enabled = false, revoked_by_user_id = ${params.actorUserId}, revoked_at = clock_timestamp()
      WHERE tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
        AND entity_id = ${params.entityId} AND grantee_user_id = ${params.granteeUserId}
        AND operation = ${operation} AND enabled = true
    `);

    if (affected > 0) {
      await writeGrantAuditEvent(tx, {
        ...params, eventType: "radar_entity_access_revoked", operation,
      });
    }
    return { revoked: true } as const;
  }, { maxWait: 5000, timeout: 10000 });
}

export interface ListRadarEntityAccessGrantsParams extends OperationContext {
  entityId: string;
  resolver: RadarEntityAccessResolver;
}

/**
 * Leitura pura de quem tem acesso HABILITADO a uma entidade agora — só
 * estado atual (histórico de concessões/revogações passadas vive em
 * GuardrailAuditLedger, consultável separadamente, nunca aqui). Gated pelo
 * resolvedor com operation:"manage" — ver quem tem acesso é, em si, um
 * poder de gestão.
 */
export async function listRadarEntityAccessGrants(
  params: ListRadarEntityAccessGrantsParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarEntityAccessGrantRecord[]> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_ENTITY_MANAGE_SCOPE);
  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId, tenantId: params.tenantId, workspaceId: params.workspaceId,
    entityId: params.entityId, operation: "manage",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }
  const rows = await db.radarEntityAccessGrant.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, entityId: params.entityId, enabled: true },
    orderBy: [{ granteeUserId: "asc" }, { operation: "asc" }],
  });
  return rows.map(toGrantRecord);
}

/**
 * Implementação REAL de RadarEntityAccessResolver, apoiada inteiramente nos
 * grants persistidos — mesma assinatura já existente
 * (radarEntityAccessResolver.ts), nenhuma alteração de tipo. Fábrica (não
 * uma função solta) para permitir injeção de um client nomeado em teste,
 * mesmo padrão de `alwaysAuthorizedResolver`/`fixedOutcomeResolver`.
 *
 * Nenhum grant dispensa os demais controles: este resolvedor NUNCA é
 * chamado sozinho — todo caminho de produção combina
 * assertRadarSocialOperationAuthorized (membership/workspace/escopo) com
 * este resolvedor (acesso individual), nenhum dos dois substitui o outro
 * (regra já ratificada, Atualização 1.6/1.9).
 */
export function createRadarEntityAccessResolver(db: PrismaClient = prismaGlobal): RadarEntityAccessResolver {
  return async (input): Promise<RadarEntityAccessOutcome> => {
    try {
      const entity = await db.radarKnownEntity.findFirst({
        where: { id: input.entityId, tenantId: input.tenantId, workspaceId: input.workspaceId },
      });
      if (!entity) {
        // Não distingue "não existe" de "existe em outro tenant/workspace"
        // — a consulta já filtra pelos três campos juntos, deliberadamente,
        // para nunca vazar existência entre tenants.
        return "entity_not_found";
      }
      const grant = await db.radarEntityAccessGrant.findFirst({
        where: {
          tenantId: input.tenantId, workspaceId: input.workspaceId, entityId: input.entityId,
          granteeUserId: input.confirmedIdentity, operation: input.operation, enabled: true,
        },
      });
      return grant ? "authorized" : "access_denied";
    } catch {
      // Erro de infraestrutura durante a resolução — fail-closed, nunca
      // "authorized" por omissão (Atualização 1.25: "nenhum acesso pode
      // ser concedido por falha de infraestrutura").
      return "resolution_failed";
    }
  };
}

export { RadarSocialAuthorizationError };
