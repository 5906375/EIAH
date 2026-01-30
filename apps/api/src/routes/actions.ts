import { Router } from "express";
import { prismaGlobal } from "@repo/db";
import { VersionedActionRegistry } from "@eiah/core";
import { tenantActionRegistry } from "../actions/tenantActionRegistry";

const actionsRouter = Router();

/**
 * GET /actions
 * Lista todas as versões/ações registradas (DB + registry em memória).
 */
actionsRouter.get("/", async (_req, res) => {
  const versions = await prismaGlobal.actionRegistry.findMany({
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

  // Atualiza registry em memória
  (tenantActionRegistry as VersionedActionRegistry).registerVersion({
    version: normalizedVersion,
    actions,
  });

  // Persiste em ActionRegistry (um registro por action)
  const entries = Object.entries(actions) as Array<
    [string, { description?: string; schema?: unknown }]
  >;

  await prismaGlobal.$transaction(
    entries.map(([name, action]) =>
      prismaGlobal.actionRegistry.upsert({
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
      })
    )
  );

  return res.json({ ok: true });
});

/**
 * POST /actions/override
 * Registra override/política por tenant/workspace para uma action específica.
 *
 * body: { tenantId: string; workspaceId?: string | null; actionName: string; allowed?: boolean; maxVersion?: number }
 */
actionsRouter.post("/override", async (req, res) => {
  const { tenantId, workspaceId = null, actionName, allowed = true, maxVersion = null } =
    req.body ?? {};

  if (!tenantId || !actionName) {
    return res.status(400).json({
      ok: false,
      error: "Missing tenantId or actionName",
    });
  }

  const existing = await prismaGlobal.tenantActionPolicy.findFirst({
    where: { tenantId, actionName },
  });

  if (!existing) {
    await prismaGlobal.tenantActionPolicy.create({
      data: {
        tenantId,
        workspaceId,
        actionName,
        allowed,
        maxVersion,
      },
    });
  } else {
    await prismaGlobal.tenantActionPolicy.update({
      where: { id: existing.id },
      data: {
        workspaceId,
        allowed,
        maxVersion,
      },
    });
  }

  return res.json({ ok: true });
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

  await prismaGlobal.actionRegistry.deleteMany({
    where: { version: versionNum },
  });

  return res.json({ ok: true });
});

export { actionsRouter };
