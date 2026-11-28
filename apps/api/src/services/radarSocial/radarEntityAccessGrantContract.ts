// Radar Social — contrato puro de RadarEntityAccessGrant: operação fechada
// (mesmos quatro valores já existentes em RadarEntityAccessInput.operation,
// radarEntityAccessResolver.ts — nenhum novo introduzido aqui). Ver
// docs/architecture/radar-social-construction-plan-v1.md, Atualizações
// 1.21, 1.22, 1.24 e 1.25.
//
// Nenhuma operação transacional aqui (vive em radarEntityAccessGrantService.ts).

export class RadarEntityAccessGrantError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_entity_access_grant_invalid:${reasonCode}`);
    this.name = "RadarEntityAccessGrantError";
  }
}

export class RadarEntityAccessGrantConflictError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`radar_entity_access_grant_conflict:${reasonCode}`);
    this.name = "RadarEntityAccessGrantConflictError";
  }
}

export const RADAR_ENTITY_ACCESS_GRANT_OPERATIONS = ["read", "write", "manage", "analyze"] as const;
export type RadarEntityAccessGrantOperation = (typeof RADAR_ENTITY_ACCESS_GRANT_OPERATIONS)[number];

export function validateGrantOperation(value: unknown): RadarEntityAccessGrantOperation {
  if (typeof value !== "string" || !RADAR_ENTITY_ACCESS_GRANT_OPERATIONS.includes(value as never)) {
    throw new RadarEntityAccessGrantError("operation_not_supported", { received: value });
  }
  return value as RadarEntityAccessGrantOperation;
}

export interface RadarEntityAccessGrantRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  entityId: string;
  granteeUserId: string;
  operation: RadarEntityAccessGrantOperation;
  enabled: boolean;
  grantedByUserId: string;
  grantedAt: Date;
  revokedByUserId: string | null;
  revokedAt: Date | null;
}
