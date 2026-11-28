import type { PrismaClient } from "@repo/db";
import { resolveImobInstallationStatus } from "./imobAccessGate";

/**
 * Direito de uso do IMOB no workspace: instalação ativa do produto ou
 * política de ação imobiliária liberada. Compartilhado pelas rotas do IMOB e
 * pelo registry de verticais do front door.
 */
export async function resolveImobEntitlements(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
}) {
  const [realEstatePolicies, productInstallations] = await Promise.all([
    params.prisma.tenantActionPolicy.findMany({
      where: {
        tenantId: params.tenantId,
        OR: [{ workspaceId: params.workspaceId }, { workspaceId: null }],
        actionName: {
          in: [
            "realestate.apply_adjustment",
            "action.realestate.apply_adjustment",
            "realestate.register_property",
            "realestate.create_contract",
            "realestate.configure_property_rules",
            "realestate.release_commission",
            "realestate.search_knowledge_base",
          ],
        },
        allowed: true,
      },
      select: { id: true },
      take: 1,
    }),
    params.prisma
      .$queryRaw<Array<{ product: string; status: string }>>`
        SELECT product, status
        FROM tenant_product_installations
        WHERE tenant_id = ${params.tenantId}
          AND workspace_id = ${params.workspaceId}
      `
      .catch(() => []),
  ]);

  const installationStatus = resolveImobInstallationStatus(productInstallations);
  const hasImobInstallation = installationStatus === "active";
  const realEstateCore = hasImobInstallation || realEstatePolicies.length > 0;
  return {
    REAL_ESTATE_CORE: realEstateCore,
    IMOB_INSTALLED: hasImobInstallation,
    IMOB_INSTALLATION_STATUS: installationStatus,
  };
}
