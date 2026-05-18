export type ImobPropertyLinkOwnerInput = {
  tenantId: string;
  workspaceId: string;
  caseId: string;
  ownerId?: string | null;
  propertyId?: string | null;
};

export type ImobPropertyLinkOwnerResult =
  | {
      ok: true;
      status: "linked" | "already_linked";
      ownerId: string;
      propertyId: string;
      caseId: string;
    }
  | {
      ok: false;
      status: "blocked";
      reasonCode:
        | "tenant_scope_missing"
        | "workspace_scope_missing"
        | "case_scope_missing"
        | "owner_id_missing"
        | "property_id_missing"
        | "owner_not_found"
        | "property_not_found";
      message: string;
    };

export type ImobPropertyLinkOwnerRepository = {
  getOwner(params: { tenantId: string; workspaceId: string; ownerId: string }): Promise<{ id: string } | null>;
  getProperty(params: { tenantId: string; workspaceId: string; propertyId: string }): Promise<{ id: string; ownerId?: string | null } | null>;
  linkOwnerToProperty(params: {
    tenantId: string;
    workspaceId: string;
    caseId: string;
    ownerId: string;
    propertyId: string;
  }): Promise<void>;
};

function blocked(reasonCode: ImobPropertyLinkOwnerResult extends infer T
  ? T extends { ok: false; reasonCode: infer R } ? R : never
  : never, message: string): ImobPropertyLinkOwnerResult {
  return { ok: false, status: "blocked", reasonCode, message };
}

export async function linkImobPropertyOwner(params: {
  input: ImobPropertyLinkOwnerInput;
  repository: ImobPropertyLinkOwnerRepository;
}): Promise<ImobPropertyLinkOwnerResult> {
  const { input, repository } = params;
  if (!input.tenantId) return blocked("tenant_scope_missing", "tenantId é obrigatório para vincular proprietário e imóvel.");
  if (!input.workspaceId) return blocked("workspace_scope_missing", "workspaceId é obrigatório para vincular proprietário e imóvel.");
  if (!input.caseId) return blocked("case_scope_missing", "caseId é obrigatório para vincular proprietário e imóvel.");
  if (!input.ownerId) return blocked("owner_id_missing", "ownerId é obrigatório para vincular proprietário e imóvel.");
  if (!input.propertyId) return blocked("property_id_missing", "propertyId é obrigatório para vincular proprietário e imóvel.");

  const owner = await repository.getOwner({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
  });
  if (!owner) return blocked("owner_not_found", "Proprietário não encontrado no escopo do tenant/workspace.");

  const property = await repository.getProperty({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    propertyId: input.propertyId,
  });
  if (!property) return blocked("property_not_found", "Imóvel não encontrado no escopo do tenant/workspace.");

  if (property.ownerId === input.ownerId) {
    return {
      ok: true,
      status: "already_linked",
      ownerId: input.ownerId,
      propertyId: input.propertyId,
      caseId: input.caseId,
    };
  }

  await repository.linkOwnerToProperty({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    caseId: input.caseId,
    ownerId: input.ownerId,
    propertyId: input.propertyId,
  });

  return {
    ok: true,
    status: "linked",
    ownerId: input.ownerId,
    propertyId: input.propertyId,
    caseId: input.caseId,
  };
}
