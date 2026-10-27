import { LOGISTICA_CONTEXT_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { ensureWorkspaceMembershipForUser, ensureWorkspaceResponsibilityStore } from "../../services/workspaceResponsibility";

// Membros EXPRESSAMENTE autorizados na Logística (S03): a capacidade consta, de forma exata, nas permissões gravadas do próprio vínculo.
// Papéis embutidos (founder, gestor, corretor…) não aceitam permissões extras da Logística; por isso estes vínculos usam papéis próprios do
// catálogo do workspace (o mesmo que o perfil grava com `upsertWorkspaceRoleConfig`) e entram pelo caminho do onboarding/convite
// (`ensureWorkspaceMembershipForUser` com `permissions`). Nomes de capacidade = escopos canônicos de `@eiah/contracts`.
// Um papel ausente do catálogo é recusado (WORKSPACE_ROLE_INVALID).
export const LOGISTICA_READER_ROLE = "logistica_leitor";
export const LOGISTICA_OPERATOR_ROLE = "logistica_operador";
export const LOGISTICA_READER_CAPABILITIES = [LOGISTICA_CONTEXT_SCOPE] as const;
export const LOGISTICA_OPERATOR_CAPABILITIES = [LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE] as const;

export const logisticaReader = () => ({ roleKey: LOGISTICA_READER_ROLE, permissions: [...LOGISTICA_READER_CAPABILITIES] as string[] });
/** Dono do workspace nos testes: mantém a autoridade de ativar produtos e as capacidades da Logística, agora como permissões explícitas do vínculo. */
export const LOGISTICA_OWNER_ROLE = "logistica_dono";
export const logisticaOwner = () => ({ roleKey: LOGISTICA_OWNER_ROLE, permissions: [...LOGISTICA_OPERATOR_CAPABILITIES, "products.activate", "workspace.manage_members", "workspace.manage_roles"] as string[] });
export const logisticaOperator = () => ({ roleKey: LOGISTICA_OPERATOR_ROLE, permissions: [...LOGISTICA_OPERATOR_CAPABILITIES] as string[] });

/** Registra o papel no catálogo do workspace (com as permissões como padrão do papel) e cria o vínculo ATIVO com as permissões pedidas. */
export async function ensureLogisticaMember(prisma: any, params: { tenantId: string; workspaceId: string; userId: string; roleKey: string; permissions: string[] }) {
  await ensureWorkspaceResponsibilityStore(prisma);
  await prisma.$executeRaw`
    INSERT INTO eiah_workspace_roles (tenant_id, workspace_id, role_key, label, default_permissions, created_at, updated_at)
    VALUES (${params.tenantId}, ${params.workspaceId}, ${params.roleKey}, ${params.roleKey}, ${JSON.stringify(params.permissions)}::jsonb, NOW(), NOW())
    ON CONFLICT (tenant_id, workspace_id, role_key) DO UPDATE SET default_permissions = EXCLUDED.default_permissions, updated_at = NOW()`;
  await ensureWorkspaceMembershipForUser({ prisma, tenantId: params.tenantId, workspaceId: params.workspaceId, userId: params.userId, roleKey: params.roleKey, permissions: params.permissions });
}
