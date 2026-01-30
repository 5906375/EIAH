/**
 * RBAC Core — EIAH_BUILDER
 * ------------------------------------------------------------
 * Integra TenantPolicyStore (JSON + DB + Redis)
 * Substitui mock anterior, permitindo enforcement dinâmico
 * e registro de violações no GuardrailLedger.
 */

import { guardrailLedger } from "../audit/guardrailLedger";
import { TenantPolicyStore } from "../policy/TenantPolicyStore";

/**
 * Garante que um recurso pertence ao mesmo tenant
 * do usuário autenticado.
 */
export function assertTenantAccess(runTenant: string, userTenant: string) {
  if (runTenant !== userTenant) {
    throw new Error("RBAC: tenant mismatch");
  }
}

/**
 * Valida se o token/usuário possui o escopo (actionName) requerido.
 * Fonte: TenantPolicyStore (DB + JSON + cache Redis).
 */
export async function checkScopePermission({
  tenantId,
  workspaceId,
  userId,
  tokenId,
  scope,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId?: string;
  scope: string; // corresponde a actionName em TenantActionPolicy
}): Promise<boolean> {
  const store = TenantPolicyStore.getInstance();
  const allowed = await store.isScopeAllowed(tenantId, workspaceId, scope);

  // Governança Cognitiva: loga negação no GuardrailLedger
  if (!allowed) {
    await guardrailLedger.log({
      type: "policy.violation",
      tenantId,
      workspaceId,
      actor: userId || tokenId,
      action: scope,
      message: `Denied scope '${scope}' for tenant '${tenantId}'`,
      timestamp: new Date(),
    });
  }

  return allowed;
}
