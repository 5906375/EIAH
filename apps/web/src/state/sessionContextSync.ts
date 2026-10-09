import { apiGetSessionContext } from "@/lib/api";
import { getSession, updateSession } from "./sessionStore";

let requestGeneration = 0;
const latestRequests = new Map<string, number>();

/** Ordena leituras que projetam o mesmo contexto, inclusive core/imob e bootstrap. */
export function beginSessionContextRequest() {
  const initial = getSession();
  const scope = JSON.stringify([initial.token, initial.tenantId, initial.workspaceId]);
  const generation = ++requestGeneration;
  latestRequests.set(scope, generation);
  const sameIdentity = () => {
    const current = getSession();
    return current.token === initial.token && current.tenantId === initial.tenantId && current.workspaceId === initial.workspaceId;
  };
  return {
    isCurrent: () => sameIdentity() && latestRequests.get(scope) === generation,
    assertCurrent() {
      if (!sameIdentity()) throw new Error("A sessão mudou durante a atualização do contexto.");
      if (latestRequests.get(scope) !== generation) throw new Error("Atualização do contexto superada por uma solicitação mais recente.");
    },
    finish() {
      if (latestRequests.get(scope) === generation) latestRequests.delete(scope);
    },
  };
}

/** Reidrata somente o contexto resolvido pelo servidor; preserva token e capabilities independentes. */
export async function syncSessionContext(
  domain?: "core" | "imob",
  fetchContext: typeof apiGetSessionContext = apiGetSessionContext,
) {
  const request = beginSessionContextRequest();
  try {
    const response = await fetchContext(domain);
    if (!response.ok || !response.data) {
      throw new Error("Não foi possível atualizar o contexto da sessão.");
    }

    request.assertCurrent();

    const context = response.data;
    updateSession({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      userId: context.userId ?? undefined,
      activeDomain: context.activeDomain,
      availableDomains: context.availableDomains,
      entitlements: context.entitlements,
      installedProducts: (context.productInstallations ?? []).map((entry) => entry.product),
      verticals: context.verticals,
      roles: context.roles,
      experience: context.experience,
      branding: context.branding,
      accessGate: null,
    });
    return context;
  } finally {
    request.finish();
  }
}
