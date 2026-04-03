import { Router } from "express";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { buildOnboardingContextContract } from "../types/onboardingContextContract";
import { readWorkspaceManagementSummary } from "../services/workspaceResponsibility";

export const onboardingContextRouter = Router();
onboardingContextRouter.use(enforceTenant);

type ProductInstallationRow = {
  product: string;
};

type TenantRecipeVisibleRow = {
  id: string;
  title: string;
  agentId: string;
};

async function readInstalledProducts(request: TenantAwareRequest) {
  try {
    const prisma = request.prisma;
    if (!prisma) return [];
    const rows = await prisma.$queryRaw<ProductInstallationRow[]>`
      SELECT product
      FROM tenant_product_installations
      WHERE tenant_id = ${request.authContext?.tenantId ?? ""}
        AND workspace_id = ${request.authContext?.workspaceId ?? ""}
        AND status = 'active'
      ORDER BY activated_at DESC;
    `;
    return (rows ?? []).map((row) => row.product);
  } catch {
    return [];
  }
}

async function readVisibleRecipes(request: TenantAwareRequest) {
  try {
    const prisma = request.prisma;
    if (!prisma) return [];
    const rows = await prisma.$queryRaw<TenantRecipeVisibleRow[]>`
      SELECT
        id,
        title,
        agent_id AS "agentId"
      FROM tenant_recipes
      WHERE tenant_id = ${request.authContext?.tenantId ?? ""}
        AND status = 'homologated'
        AND (
          workspace_scope_mode = 'all_workspaces'
          OR workspace_scope_ids ? ${request.authContext?.workspaceId ?? ""}
        )
      ORDER BY updated_at DESC
      LIMIT 6;
    `;
    return rows ?? [];
  } catch {
    return [];
  }
}

async function resolveOnboardingRoleProfile(request: TenantAwareRequest) {
  const userId = request.authContext?.userId;
  if (!userId) return "workspace_member" as const;

  const workspaceSummary = await readWorkspaceManagementSummary({
    prisma: request.prisma,
    tenantId: request.authContext!.tenantId,
    workspaceId: request.authContext!.workspaceId,
    userId,
  });

  const normalizedRoleKey = (workspaceSummary.selectedRoleKey ?? "").trim().toLowerCase();
  if (normalizedRoleKey === "founder" || normalizedRoleKey === "global_admin") {
    return "founder_global" as const;
  }
  if (normalizedRoleKey.includes("tenant")) {
    return "tenant_admin" as const;
  }
  if (workspaceSummary.canManageMembers) {
    return "workspace_admin" as const;
  }
  return "workspace_member" as const;
}

onboardingContextRouter.get("/onboarding/context", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const installedProducts = await readInstalledProducts(request);
  const visibleRecipes = await readVisibleRecipes(request);
  const activeDomain = installedProducts.includes("IMOB") ? "imob" : "general";
  const roleProfile = await resolveOnboardingRoleProfile(request);

  const nextSteps = [
    visibleRecipes.length > 0
      ? "Abra uma recipe homologada para começar por um fluxo já aprovado pelo tenant."
      : "Se não houver recipes homologadas, assine um fluxo no marketplace ou publique uma recipe interna.",
    installedProducts.includes("IMOB")
      ? "O produto IMOB está ativo neste workspace; use a trilha liberada antes de recorrer a telas administrativas."
      : "Ative apenas produtos necessários ao workspace para reduzir ruído operacional.",
  ];

  const constraints = [
    "Somente recipes homologadas aparecem como onboarding contextual do workspace.",
    "Instalações de produto e recipes não mudam autorização; continuam dependentes de policy e gates existentes.",
  ];

  const summary =
    visibleRecipes.length > 0
      ? `Workspace com ${visibleRecipes.length} recipe(s) homologada(s) e ${installedProducts.length} produto(s) ativo(s).`
      : `Workspace sem recipes homologadas visíveis; o onboarding deve começar por marketplace ou catálogo base.`;

  const context = buildOnboardingContextContract({
    roleProfile,
    activeDomain,
    workspaceId: request.authContext.workspaceId,
    tenantId: request.authContext.tenantId,
    installedProducts,
    visibleRecipes,
    nextSteps,
    constraints,
    summary,
  });

  return res.json({ ok: true, data: context });
});
