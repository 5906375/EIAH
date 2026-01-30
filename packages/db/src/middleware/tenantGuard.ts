import { Prisma } from "../generated/client";

type GuardMode = "tenant" | "tenant+workspace";

type ExtensionQueryParams = {
  model?: string;
  operation: string;
  args: any;
  query: (args: any) => Promise<any>;
};

const MODEL_GUARD_MODE: Record<string, GuardMode> = {
  Run: "tenant+workspace",
  RunEvent: "tenant+workspace",
  PlanStepRecord: "tenant+workspace",
  TenantActionPolicy: "tenant+workspace",
  GuardrailAuditLedger: "tenant+workspace",
  SclLedger: "tenant+workspace",

  // GuardrailLedger is tenant-scoped (no workspace_id column)
  GuardrailLedger: "tenant",
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureWhereMatchesContext(params: {
  tenantId: string;
  workspaceId: string;
  model: string;
  where?: unknown;
}) {
  const where = isPlainObject(params.where) ? params.where : {};

  if (where.tenantId !== params.tenantId) {
    throw new Error(
      `Tenant violation: expected tenantId=${params.tenantId} em where; recebido tenantId=${String(where.tenantId)}`
    );
  }

  const mode = MODEL_GUARD_MODE[params.model];
  if (mode === "tenant+workspace") {
    if (where.workspaceId !== params.workspaceId) {
      throw new Error(
        `Tenant violation: expected workspaceId=${params.workspaceId} em where; recebido workspaceId=${String(where.workspaceId)}`
      );
    }
  }
}

function ensureCreatePayload(params: {
  tenantId: string;
  workspaceId: string;
  model: string;
  data?: unknown;
}) {
  const data = isPlainObject(params.data) ? params.data : {};

  if (data.tenantId && data.tenantId !== params.tenantId) {
    throw new Error(`Tenant violation: create com tenantId divergente do contexto`);
  }

  const mode = MODEL_GUARD_MODE[params.model];
  if (mode === "tenant+workspace") {
    if (data.workspaceId && data.workspaceId !== params.workspaceId) {
      throw new Error(`Tenant violation: create com workspaceId divergente do contexto`);
    }
  }
}

function injectWhere(params: {
  tenantId: string;
  workspaceId: string;
  model: string;
  where?: unknown;
}) {
  const where = isPlainObject(params.where) ? params.where : {};
  const mode = MODEL_GUARD_MODE[params.model];

  if (mode === "tenant+workspace") {
    return {
      ...where,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    };
  }

  return {
    ...where,
    tenantId: params.tenantId,
  };
}

function injectCreateData(params: {
  tenantId: string;
  workspaceId: string;
  model: string;
  data?: unknown;
}) {
  const data = isPlainObject(params.data) ? params.data : {};
  const mode = MODEL_GUARD_MODE[params.model];

  if (mode === "tenant+workspace") {
    return {
      ...data,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    };
  }

  return {
    ...data,
    tenantId: params.tenantId,
  };
}

export function tenantGuard(tenantId: string, workspaceId: string) {
  const guardedModels = new Set(Object.keys(MODEL_GUARD_MODE));

  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations(params: ExtensionQueryParams) {
          const model = params.model;
          if (!model || !guardedModels.has(model)) {
            return params.query(params.args);
          }

          const args = params.args ?? {};

          if (["findUnique", "findFirst", "findMany"].includes(params.operation)) {
            args.where = injectWhere({ tenantId, workspaceId, model, where: args.where });
          }

          if (params.operation === "create") {
            ensureCreatePayload({ tenantId, workspaceId, model, data: args.data });
            args.data = injectCreateData({ tenantId, workspaceId, model, data: args.data });
          }

          if (["update", "updateMany", "delete", "deleteMany"].includes(params.operation)) {
            ensureWhereMatchesContext({ tenantId, workspaceId, model, where: args.where });
          }

          // Log leve para auditoria de enforcement multi-tenant
          // eslint-disable-next-line no-console
          console.debug(`[tenantGuard] ${model}:${params.operation} enforced for ${tenantId}/${workspaceId}`);

          return params.query(args);
        },
      },
    },
  });
}
