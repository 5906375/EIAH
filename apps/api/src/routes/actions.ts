import { Router, type Response } from "express";
import { prismaGlobal } from "@repo/db";
import { ADMIN_SCOPES, VersionedActionRegistry } from "@eiah/core";
import { tenantActionRegistry } from "../actions/tenantActionRegistry";
import {
  enforceTenant,
  type TenantAwareRequest,
} from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { commercialPolicyViolation } from "../services/commercialPolicyGuard";
import {
  evaluateSubscriptionAuthority,
  recordSubscriptionDecision,
  SUBSCRIBE_FORBIDDEN_ERROR,
  subscriptionAuthorityDeps,
} from "../services/marketplaceSubscriptionAuthority";

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

    // AUTHZ-SCOPE-1: conceder política de agente/autoridade comercial é decisão comercial, não ajuste administrativo.
    const commercial = await commercialPolicyViolation(
      dependencies.prisma as unknown as Parameters<typeof commercialPolicyViolation>[0],
      actionName,
      allowed,
    );
    if (commercial && commercial.kind !== "agent") {
      return res.status(commercial.status).json({
        ok: false,
        error: { code: commercial.code, message: commercial.message },
      });
    }
    if (commercial?.kind === "agent") {
      // O efeito equivale a habilitar um agente: actions.admin (política de workspace) não é a decisão. Exige a PESSOA
      // com autoridade comercial vigente, revalidada agora, e o registro prévio da decisão.
      const actor = { tenantId, workspaceId, userId: request.authContext.userId ?? null, tokenId: request.authContext.tokenId ?? null };
      const authority = await evaluateSubscriptionAuthority(actor, subscriptionAuthorityDeps.forClient(dependencies.prisma));
      const target = { agentName: actionName, designationId: authority.designationId ?? null };
      const auditClient = dependencies.prisma as unknown as Parameters<typeof recordSubscriptionDecision>[0]["prisma"];
      if (!authority.allowed) {
        await recordSubscriptionDecision({ prisma: auditClient, actor, outcome: "denied", reasonCode: authority.reasonCode, action: "actions.override.commercial", target });
        return res.status(403).json({ ok: false, error: { ...SUBSCRIBE_FORBIDDEN_ERROR, reasonCode: authority.reasonCode } });
      }
      const recorded = await recordSubscriptionDecision({ prisma: auditClient, actor, outcome: "authorized", reasonCode: authority.reasonCode, action: "actions.override.commercial", target });
      if (!recorded) {
        return res.status(503).json({
          ok: false,
          error: { code: "COMMERCIAL_DECISION_RECORD_UNAVAILABLE", message: "Não foi possível registrar a decisão comercial. Nada foi alterado." },
        });
      }
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
