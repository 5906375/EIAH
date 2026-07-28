import { Router, type Response } from "express";
import { prismaGlobal } from "@repo/db";
import { ADMIN_SCOPES, VersionedActionRegistry } from "@eiah/core";
import { tenantActionRegistry } from "../actions/tenantActionRegistry";
import {
  enforceTenant,
  type TenantAwareRequest,
} from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";

type ActionsRouterDependencies = Readonly<{
  prisma: typeof prismaGlobal;
  enforceTenant: typeof enforceTenant;
  requireScope: typeof requireScope;
}>;

const defaultDependencies: ActionsRouterDependencies = {
  prisma: prismaGlobal,
  enforceTenant,
  requireScope,
};

function invalidPayload(res: Response, message: string) {
  return res.status(400).json({
    ok: false,
    error: { code: "INVALID_PAYLOAD", message },
  });
}

export function createActionsRouter(
  dependencies: ActionsRouterDependencies = defaultDependencies,
) {
  const actionsRouter = Router();
  actionsRouter.use(dependencies.enforceTenant);
  actionsRouter.use(dependencies.requireScope(ADMIN_SCOPES.actions));

  /**
   * GET /actions
   * Lista todas as versões/ações registradas (DB + registry em memória).
   */
  actionsRouter.get("/", async (_req, res) => {
    const versions = await dependencies.prisma.actionRegistry.findMany({
      orderBy: [{ version: "asc" }, { name: "asc" }],
    });

    return res.json({
      ok: true,
      versions,
      registryVersions: tenantActionRegistry.snapshot?.() ?? [],
    });
  });

  /**
   * POST /actions/version
   * Registra nova versão com conjunto de ações.
   *
   * body: { version: number, actions: Record<string, ActionDefinition> }
   */
  actionsRouter.post("/version", async (req, res) => {
    const { version, actions } = req.body ?? {};

    if (!version || !actions || typeof actions !== "object") {
      return res.status(400).json({
        ok: false,
        error: "Missing version or actions",
      });
    }

    const normalizedVersion = String(version).trim();
    if (!normalizedVersion) {
      return res.status(400).json({ ok: false, error: "Invalid version" });
    }
    const versionNumber = Number(version);
    if (Number.isNaN(versionNumber)) {
      return res.status(400).json({ ok: false, error: "Version must be numeric" });
    }

    (tenantActionRegistry as VersionedActionRegistry).registerVersion({
      version: normalizedVersion,
      actions,
    });

    const entries = Object.entries(actions) as Array<
      [string, { description?: string; schema?: unknown }]
    >;

    await dependencies.prisma.$transaction(
      entries.map(([name, action]) =>
        dependencies.prisma.actionRegistry.upsert({
          where: { name_version: { name, version: versionNumber } },
          create: {
            name,
            version: versionNumber,
            description: action.description ?? null,
            schema: (action.schema ?? null) as any,
          },
          update: {
            description: action.description ?? null,
            schema: (action.schema ?? null) as any,
          },
        }),
      ),
    );

    return res.json({ ok: true });
  });

  /**
   * POST /actions/override
   * Registra override/política no tenant/workspace autenticado.
   *
   * body: { tenantId?: string; workspaceId?: string; actionName: string;
   *         allowed: boolean; maxVersion?: number | null }
   */
  actionsRouter.post("/override", async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "AUTH_CONTEXT_MISSING",
          message: "Authentication context missing",
        },
      });
    }

    const body =
      typeof req.body === "object" && req.body !== null ? req.body : {};
    const {
      tenantId: requestedTenantId,
      workspaceId: requestedWorkspaceId,
      actionName: requestedActionName,
      allowed,
      maxVersion = null,
    } = body;
    const { tenantId, workspaceId } = request.authContext;

    if (
      (requestedTenantId !== undefined && requestedTenantId !== tenantId) ||
      (requestedWorkspaceId !== undefined &&
        requestedWorkspaceId !== workspaceId)
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "AUTH_CONTEXT_MISMATCH",
          message: "Tenant or workspace does not match authentication context",
        },
      });
    }

    const actionName =
      typeof requestedActionName === "string" ? requestedActionName.trim() : "";
    if (!actionName) {
      return invalidPayload(res, "actionName is required");
    }
    if (
      !Object.prototype.hasOwnProperty.call(body, "allowed") ||
      typeof allowed !== "boolean"
    ) {
      return invalidPayload(res, "allowed must be an explicit boolean");
    }
    if (
      maxVersion !== null &&
      (!Number.isInteger(maxVersion) || maxVersion < 0)
    ) {
      return invalidPayload(
        res,
        "maxVersion must be a non-negative integer or null",
      );
    }

    const existing = await dependencies.prisma.tenantActionPolicy.findFirst({
      where: { tenantId, workspaceId, actionName },
    });

    if (!existing) {
      await dependencies.prisma.tenantActionPolicy.create({
        data: {
          tenantId,
          workspaceId,
          actionName,
          allowed,
          maxVersion,
        },
      });
    } else {
      await dependencies.prisma.tenantActionPolicy.update({
        where: { id: existing.id, tenantId, workspaceId },
        data: {
          allowed,
          maxVersion,
        },
      });
    }

    return res.json({ ok: true, tenantId, workspaceId });
  });

  /**
   * DELETE /actions/version/:version
   * Remove uma versão completa.
   */
  actionsRouter.delete("/version/:version", async (req, res) => {
    const versionNum = Number(req.params.version);

    if (Number.isNaN(versionNum)) {
      return res.status(400).json({ ok: false, error: "Invalid version" });
    }

    await dependencies.prisma.actionRegistry.deleteMany({
      where: { version: versionNum },
    });

    return res.json({ ok: true });
  });

  return actionsRouter;
}

const actionsRouter = createActionsRouter();

export { actionsRouter };
