/**
 * RBAC Core — EIAH_BUILDER
 * ------------------------------------------------------------
 * Integra TenantPolicyStore (JSON + DB + Redis)
 * Substitui mock anterior, permitindo enforcement dinâmico
 * e registro de violações no GuardrailLedger.
 */

import { guardrailLedger } from "../audit/guardrailLedger";
import { TenantPolicyStore, type ScopeDecision } from "../policy/TenantPolicyStore";

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
  requestId,
  runId,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId?: string;
  scope: string; // corresponde a actionName em TenantActionPolicy
  requestId?: string;
  runId?: string;
}): Promise<ScopeDecision> {
  const store = TenantPolicyStore.getInstance();
  const decision = await store.resolveScopeDecision(tenantId, workspaceId, scope);

  try {
    // The two writes below are intentional and complementary:
    // GuardrailLedger keeps the canonical/hash record, while GuardrailAuditLedger
    // keeps operational metadata such as workspaceId, scope, reasonCode and requestId.
    await guardrailLedger.log({
      type: decision.allowed ? "rbac.scope.allow" : "rbac.scope.deny",
      tenantId,
      workspaceId,
      actorId: userId || tokenId,
      scope,
      action: scope,
      decision: decision.allowed ? "allow" : "deny",
      reasonCode: decision.reasonCode,
      requestId,
      runId,
      message: `${decision.allowed ? "Allowed" : "Denied"} scope '${scope}' for tenant '${tenantId}' (${decision.reasonCode})`,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("guardrailLedger RBAC log failed:", error);
  }

  return decision;
}
