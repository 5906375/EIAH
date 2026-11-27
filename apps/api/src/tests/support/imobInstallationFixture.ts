import { randomUUID } from "node:crypto";

/**
 * AUTHZ-IMOB-INSTALLATION-001 — fixture de teste: as APIs operacionais do IMOB exigem o IMOB INSTALADO e HABILITADO no workspace. Em vez de
 * depender de "não ter checagem", os testes instalam o IMOB pelo MESMO serviço de ativação do produto (instalação + agentes provisionados), depois
 * de uma liberação EIAH sintética (banco descartável). Nunca é usado pelo código de produção.
 */
export async function installImobForTest(params: { prisma: any; tenantId: string; workspaceId: string; userId?: string | null }) {
  const { ensureVerticalAccessStore } = await import("../../services/products/verticalAccessApproval");
  const { activateProductInstallation } = await import("../../services/products/productActivation");
  await ensureVerticalAccessStore(params.prisma);
  await params.prisma.$executeRaw`INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at, note, created_at, updated_at) VALUES (${randomUUID()}, ${params.tenantId}, ${params.workspaceId}, 'IMOB', 'aprovado', 'migration', 'synthetic-admin', NOW(), 'synthetic', NOW(), NOW()) ON CONFLICT DO NOTHING`;
  const result = await activateProductInstallation({ prisma: params.prisma, tenantId: params.tenantId, workspaceId: params.workspaceId, userId: params.userId ?? null, product: "IMOB" });
  if (!result.ok) throw new Error(`fixture: instalação do IMOB falhou (${result.code})`);
}

/** Remove o que `installImobForTest` criou (instalação, liberação, atribuições e políticas do workspace) para que o teste apague os workspaces. */
export async function cleanupImobInstallationForTest(prisma: any, tenantIds: string[]) {
  for (const tenantId of tenantIds) {
    await prisma.$executeRaw`DELETE FROM tenant_product_installations WHERE tenant_id = ${tenantId}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM vertical_access_approvals WHERE tenant_id = ${tenantId}`.catch(() => undefined);
    await prisma.workspaceAgentAssignment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenantActionPolicy.deleteMany({ where: { tenantId } }).catch(() => undefined);
  }
}
