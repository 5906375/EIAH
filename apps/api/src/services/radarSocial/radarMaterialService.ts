// Radar Social — serviço de RadarMaterial (recebimento idempotente,
// consulta e correção imutável). Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualização 1.9,
// seções "Correção material — supersedesMaterialId na comparação
// idempotente" e "Pacote local proposto".
//
// NÃO implementa análise, Run, fila ou chamada a modelo. Reutiliza
// assertRadarSocialOperationAuthorized (radarKnownEntityService.ts) — mesma
// checagem de identidade/membership/vínculo/escopo já usada pela entidade,
// com um escopo de escrita distinto. RadarEntityAccessResolver de produção
// está FORA desta unidade: toda operação exige o parâmetro `resolver`, sem
// valor padrão.
import { Prisma, type PrismaClient, prismaGlobal } from "@repo/db";
import {
  validateReceiveRadarMaterialInput,
  computeMaterialHash,
  materialRequestIdentityMatches,
  RadarMaterialConflictError,
  type ReceiveRadarMaterialInput,
  type RadarMaterialRecord,
  type RadarMaterialRequestIdentity,
} from "./radarMaterialContract";
import {
  assertRadarSocialOperationAuthorized,
  RadarKnownEntityNotFoundError,
  RADAR_SOCIAL_READ_SCOPE,
} from "./radarKnownEntityService";
import {
  reasonCodeForRadarEntityAccessOutcome,
  type RadarEntityAccessResolver,
} from "./radarEntityAccessResolver";

export class RadarMaterialNotFoundError extends Error {
  constructor(readonly reasonCode: string = "radar_material_not_found", readonly context: Record<string, unknown> = {}) {
    super(reasonCode);
    this.name = "RadarMaterialNotFoundError";
  }
}

// Escopo PROVISÓRIO, distinto de leitura e de gestão de entidade — mesmo
// aviso de radarKnownEntityService.ts.
export const RADAR_SOCIAL_MATERIAL_WRITE_SCOPE = "radar_social.materials.write";

interface OperationContext {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
}

// Forma completa da linha persistida (id, escopo, negócio e campos gerados
// pelo servidor) — usada por toRecord/rowIdentity/resolveRecoveryOrConflict
// para que o objeto recuperado (via operationKey, dentro ou fora da
// transação) nunca "perca" campos ao trafegar entre essas funções.
type MaterialRow = {
  id: string; tenantId: string; workspaceId: string; entityId: string; conteudo: string;
  hashDoMaterial: string; fonteDeclarada: string; capturadoEm: Date | null;
  supersedesMaterialId: string | null; operationKey: string; providedByUserId: string; recebidoEm: Date;
};

function toRecord(row: MaterialRow): RadarMaterialRecord {
  return {
    id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId, entityId: row.entityId,
    conteudo: row.conteudo, hashDoMaterial: row.hashDoMaterial, fonteDeclarada: row.fonteDeclarada,
    capturadoEm: row.capturadoEm, supersedesMaterialId: row.supersedesMaterialId,
    operationKey: row.operationKey, providedByUserId: row.providedByUserId, recebidoEm: row.recebidoEm,
  };
}

function rowIdentity(row: MaterialRow): RadarMaterialRequestIdentity {
  return {
    entityId: row.entityId, conteudo: row.conteudo, fonteDeclarada: row.fonteDeclarada,
    capturadoEm: row.capturadoEm, supersedesMaterialId: row.supersedesMaterialId, providedByUserId: row.providedByUserId,
  };
}

type MaterialUniqueViolationKind = "operation_key" | "predecessor_successor" | "other" | "unclassified";

const OPERATION_KEY_CONSTRAINT_COLUMNS = ["tenant_id", "workspace_id", "operation_key"].sort();
const PREDECESSOR_SUCCESSOR_CONSTRAINT_COLUMNS = ["supersedes_material_id", "tenant_id", "workspace_id", "entity_id"].sort();

/** Nunca lança — classifica um P2002 já capturado, mesma técnica empírica
 * usada em signalForward/classifier.ts contra @prisma/client@7.2.0 +
 * @prisma/adapter-pg@7.2.0, reaplicada aqui sobre RadarMaterial. */
function classifyMaterialUniqueViolation(error: unknown): MaterialUniqueViolationKind {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;
  if (!typed || typeof typed !== "object" || typed.code !== "P2002") return "unclassified";
  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || meta.modelName !== "RadarMaterial") return "unclassified";
  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") return "unclassified";
  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields) || fields.some((v) => typeof v !== "string")) return "unclassified";
  const sorted = [...(fields as string[])].sort();
  const matches = (expected: string[]) => sorted.length === expected.length && sorted.every((v, i) => v === expected[i]);
  if (matches(OPERATION_KEY_CONSTRAINT_COLUMNS)) return "operation_key";
  if (matches(PREDECESSOR_SUCCESSOR_CONSTRAINT_COLUMNS)) return "predecessor_successor";
  return "other";
}

/**
 * Compara a linha JÁ PERSISTIDA sob o mesmo operationKey contra a
 * identidade da tentativa atual. Recuperação idempotente (retorna a linha
 * existente) quando idênticas; RadarMaterialConflictError quando qualquer
 * campo diverge — nunca uma segunda gravação.
 */
function resolveRecoveryOrConflict(
  existing: MaterialRow,
  attempted: RadarMaterialRequestIdentity
): { recovered: true; existing: MaterialRow } {
  if (!materialRequestIdentityMatches(rowIdentity(existing), attempted)) {
    throw new RadarMaterialConflictError("operation_key_reused_incompatible_request", {
      existingMaterialId: existing.id,
    });
  }
  return { recovered: true, existing };
}

export interface ReceiveRadarMaterialParams extends OperationContext {
  input: ReceiveRadarMaterialInput;
  resolver: RadarEntityAccessResolver;
}

export interface ReceiveRadarMaterialResult {
  material: RadarMaterialRecord;
  recovered: boolean;
}

/**
 * Recebe (criação, `supersedesMaterialId` ausente) ou corrige
 * (`supersedesMaterialId` presente) um material — MESMA função para as duas
 * semânticas, porque a comparação de idempotência já trata
 * `supersedesMaterialId` como campo comum da identidade da solicitação
 * (Atualização 1.9): duplicar a lógica entre "criar" e "corrigir" arriscaria
 * divergir dessa comparação. `correctRadarMaterial` abaixo é um wrapper
 * fino que só exige `supersedesMaterialId` não nulo, para uso onde a
 * intenção de "isto é uma correção" precisa ser explícita no call site.
 *
 * Ordem (Atualização 1.9, "ordem preservada"): autorização vigente (comum +
 * acesso individual) SEMPRE primeiro, inclusive em replay -> recuperação
 * idempotente (comparação da identidade completa sob a mesma operationKey)
 * -> só then as guardas exclusivas de NOVA escrita (entidade ativa,
 * predecessor existente e ainda sem sucessor). Uma entidade que se tornou
 * inativa OU um predecessor que ganhou sucessora DEPOIS de uma escrita
 * original bem-sucedida não impedem o replay dessa mesma escrita.
 */
export async function receiveRadarMaterial(
  params: ReceiveRadarMaterialParams,
  db: PrismaClient = prismaGlobal
): Promise<ReceiveRadarMaterialResult> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_MATERIAL_WRITE_SCOPE);
  const validated = validateReceiveRadarMaterialInput(params.input);
  const hashDoMaterial = computeMaterialHash(validated.conteudo);

  const entity = await db.radarKnownEntity.findFirst({
    where: { id: validated.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!entity) {
    throw new RadarKnownEntityNotFoundError();
  }

  const accessOutcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: validated.entityId,
    operation: "write",
  });
  if (accessOutcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(accessOutcome) ?? "radar_known_entity_not_found");
  }

  const attemptedIdentity: RadarMaterialRequestIdentity = {
    entityId: validated.entityId,
    conteudo: validated.conteudo,
    fonteDeclarada: validated.fonteDeclarada,
    capturadoEm: validated.capturadoEm,
    supersedesMaterialId: validated.supersedesMaterialId,
    providedByUserId: params.actorUserId,
  };

  try {
    return await db.$transaction(async (tx) => {
      // Recuperação-primeiro: procura uma linha já existente sob o MESMO
      // operationKey ANTES de aplicar qualquer guarda de nova escrita —
      // ordem exigida pela Atualização 1.9 (ver docstring acima).
      const existingByOperationKey = await tx.radarMaterial.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, operationKey: validated.operationKey },
      });
      if (existingByOperationKey) {
        const { existing } = resolveRecoveryOrConflict(existingByOperationKey, attemptedIdentity);
        return { material: toRecord(existing), recovered: true };
      }

      // Nenhuma linha prévia: esta é genuinamente uma tentativa de escrita
      // NOVA — as guardas exclusivas de nova escrita se aplicam agora.
      if (validated.supersedesMaterialId) {
        const predecessor = await tx.radarMaterial.findFirst({
          where: {
            id: validated.supersedesMaterialId, tenantId: params.tenantId,
            workspaceId: params.workspaceId, entityId: validated.entityId,
          },
        });
        if (!predecessor) {
          throw new RadarMaterialNotFoundError("radar_material_predecessor_not_found", {
            supersedesMaterialId: validated.supersedesMaterialId,
          });
        }
        const alreadySuperseded = await tx.radarMaterial.findFirst({
          where: {
            supersedesMaterialId: validated.supersedesMaterialId, tenantId: params.tenantId,
            workspaceId: params.workspaceId, entityId: validated.entityId,
          },
        });
        if (alreadySuperseded) {
          throw new RadarMaterialConflictError("predecessor_already_superseded", {
            supersedesMaterialId: validated.supersedesMaterialId, successorMaterialId: alreadySuperseded.id,
          });
        }
      }

      if (entity.status !== "active") {
        throw new RadarMaterialConflictError("entity_not_active", { entityId: validated.entityId, status: entity.status });
      }

      const created = await tx.radarMaterial.create({
        data: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          entityId: validated.entityId,
          conteudo: validated.conteudo,
          hashDoMaterial,
          fonteDeclarada: validated.fonteDeclarada,
          capturadoEm: validated.capturadoEm,
          supersedesMaterialId: validated.supersedesMaterialId,
          operationKey: validated.operationKey,
          providedByUserId: params.actorUserId,
        },
      });
      return { material: toRecord(created), recovered: false };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    const kind = classifyMaterialUniqueViolation(e);
    if (kind === "unclassified" || kind === "other") throw e;
    // Corrida real: duas tentativas concorrentes passaram ambas pelo
    // "nenhuma linha prévia" acima antes de uma delas confirmar. Resolve
    // FORA da transação abortada, com uma leitura nova no client raiz —
    // nunca reutiliza `tx` depois do rollback (Atualização 1.6 do plano).
    if (kind === "operation_key") {
      const existing = await db.radarMaterial.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, operationKey: validated.operationKey },
      });
      if (!existing) throw e; // inconsistência genuína: violação sem linha correspondente
      const { existing: recoveredRow } = resolveRecoveryOrConflict(existing, attemptedIdentity);
      return { material: toRecord(recoveredRow), recovered: true };
    }
    if (kind === "predecessor_successor") {
      throw new RadarMaterialConflictError("predecessor_already_superseded", {
        supersedesMaterialId: validated.supersedesMaterialId,
      });
    }
    throw e;
  }
}

export interface CorrectRadarMaterialParams extends OperationContext {
  input: ReceiveRadarMaterialInput & { supersedesMaterialId: string };
  resolver: RadarEntityAccessResolver;
}

/** Wrapper fino sobre receiveRadarMaterial exigindo `supersedesMaterialId`
 * explícito — mesma máquina de idempotência/concorrência, só reforça no
 * tipo que o call site pretende uma CORREÇÃO, não uma criação nova. */
export async function correctRadarMaterial(
  params: CorrectRadarMaterialParams,
  db: PrismaClient = prismaGlobal
): Promise<ReceiveRadarMaterialResult> {
  if (!params.input.supersedesMaterialId) {
    throw new RadarMaterialConflictError("correction_requires_supersedes_material_id");
  }
  return receiveRadarMaterial(params, db);
}

export interface GetRadarMaterialParams extends OperationContext {
  materialId: string;
  resolver: RadarEntityAccessResolver;
}

/** Consulta individual — acesso HERDADO da entidade (política ratificada):
 * uma única checagem do resolvedor sobre `entityId` do material, nunca uma
 * ACL própria por material. */
export async function getRadarMaterial(
  params: GetRadarMaterialParams,
  db: PrismaClient = prismaGlobal
): Promise<RadarMaterialRecord> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const row = await db.radarMaterial.findFirst({
    where: { id: params.materialId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!row) throw new RadarMaterialNotFoundError();

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: row.entityId,
    operation: "read",
  });
  if (outcome !== "authorized") {
    throw new RadarMaterialNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_material_not_found");
  }
  return toRecord(row);
}

export interface ListRadarMaterialsParams extends OperationContext {
  entityId: string;
  resolver: RadarEntityAccessResolver;
  limit: number;
  cursor?: string;
}

export interface ListRadarMaterialsResult {
  items: RadarMaterialRecord[];
  nextCursor: string | null;
}

/** Listagem de materiais de UMA entidade — acesso herdado: uma única
 * checagem do resolvedor sobre a entidade (operation="read") governa toda a
 * página, sem ACL por material (política ratificada). Entidade inativa não
 * bloqueia esta listagem (só bloqueia NOVOS materiais). */
export async function listRadarMaterials(
  params: ListRadarMaterialsParams,
  db: PrismaClient = prismaGlobal
): Promise<ListRadarMaterialsResult> {
  await assertRadarSocialOperationAuthorized(db, params, RADAR_SOCIAL_READ_SCOPE);

  const entity = await db.radarKnownEntity.findFirst({
    where: { id: params.entityId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!entity) throw new RadarKnownEntityNotFoundError();

  const outcome = await params.resolver({
    confirmedIdentity: params.actorUserId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    entityId: params.entityId,
    operation: "read",
  });
  if (outcome !== "authorized") {
    throw new RadarKnownEntityNotFoundError(reasonCodeForRadarEntityAccessOutcome(outcome) ?? "radar_known_entity_not_found");
  }

  const rows = await db.radarMaterial.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, entityId: params.entityId },
    orderBy: { id: "asc" },
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > params.limit;
  const page = hasNextPage ? rows.slice(0, params.limit) : rows;
  return {
    items: page.map(toRecord),
    nextCursor: hasNextPage ? page[page.length - 1]!.id : null,
  };
}
