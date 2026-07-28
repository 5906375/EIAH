import { Router } from "express";
import { ADMIN_SCOPES } from "@eiah/core";
import { z } from "zod";
import {
  enforceTenant,
  type TenantAwareRequest,
} from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";

type ToolsRouterDependencies = Readonly<{
  enforceTenant: typeof enforceTenant;
  requireScope: typeof requireScope;
}>;

const defaultDependencies: ToolsRouterDependencies = {
  enforceTenant,
  requireScope,
};

const JsonSchema = z.union([z.record(z.string(), z.unknown()), z.boolean()]);
const ToolContractCreateSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    inputSchema: JsonSchema,
    outputSchema: JsonSchema.optional(),
    executor: z.enum(["http", "db", "web3", "fs"]),
    trustLevel: z.number().int().nonnegative(),
    policyId: z.string().trim().min(1).optional(),
    limits: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["active", "deprecated", "revoked"]).optional(),
  })
  .strict();

export function createToolsRouter(
  dependencies: ToolsRouterDependencies = defaultDependencies,
) {
  const router = Router();
  router.use(dependencies.enforceTenant);
  router.use(dependencies.requireScope(ADMIN_SCOPES.tools));

  router.post("/", async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "AUTH_CONTEXT_MISSING",
          message: "Authentication context missing",
        },
      });
    }

    const parsed = ToolContractCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_PAYLOAD",
          message: "Invalid ToolContract payload",
        },
      });
    }

    const { tenantId: requestedTenantId, workspaceId, ...data } = parsed.data;
    if (
      (requestedTenantId !== undefined &&
        requestedTenantId !== request.authContext.tenantId) ||
      (workspaceId !== undefined &&
        workspaceId !== request.authContext.workspaceId)
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "AUTH_CONTEXT_MISMATCH",
          message: "Tenant or workspace does not match authentication context",
        },
      });
    }

    const tool = await request.prisma.toolContract.create({
      data: {
        ...data,
        tenantId: request.authContext.tenantId,
      } as any,
    });
    return res.json(tool);
  });

  router.get("/", async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "AUTH_CONTEXT_MISSING",
          message: "Authentication context missing",
        },
      });
    }

    const tools = await request.prisma.toolContract.findMany({
      where: { tenantId: request.authContext.tenantId },
    });
    return res.json(tools);
  });

  return router;
}

const toolsRouter = createToolsRouter();

export default toolsRouter;
