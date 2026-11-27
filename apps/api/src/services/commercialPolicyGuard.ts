import { COMMERCIAL_AUTHORITY_SCOPES } from "@eiah/core";
import { hasCoreAgentProfile, normalizeAgentKey } from "./agents";

/**
 * Guarda de políticas com efeito comercial (AUTHZ-SCOPE-1).
 *
 * `TenantActionPolicy` com `allowed=true` é a metade "política" da habilitação de um AGENTE (a outra é a delegação).
 * Escrevê-la por um caminho administrativo genérico (`POST /actions/override`, que exige só `actions.admin`, uma
 * política de WORKSPACE) equivaleria a contratar sem a autoridade comercial da PESSOA. Por isso, conceder (`allowed=true`)
 * uma política cujo nome identifica um agente (canônico ou publicado no Marketplace) exige a autoridade individual
 * (`marketplace.subscribe`, via designação `holder` vigente) e registro da decisão; conceder o próprio escopo
 * `marketplace.subscribe` como política nunca é possível por aqui (a fonte é a designação). NEGAR (`allowed=false`)
 * continua permitido: revogar nunca amplia autoridade.
 *
 * Fail-closed: se a verificação não puder ser feita, a concessão é recusada.
 */
export type CommercialPolicyViolation = {
  /** `scope`: o próprio escopo comercial (nunca por aqui). `agent`: exige autoridade individual. `unavailable`: não verificável. */
  kind: "scope" | "agent" | "unavailable";
  status: number;
  code: string;
  message: string;
};

type MarketplaceReader = { marketplaceItem: { findMany: (args: any) => Promise<Array<{ name?: unknown }>> } };

export const COMMERCIAL_POLICY_REQUIRES_AUTHORITY: CommercialPolicyViolation = {
  kind: "scope",
  status: 409,
  code: "COMMERCIAL_AUTHORITY_REQUIRED",
  message:
    "A autoridade comercial (marketplace.subscribe) não é concedida como política administrativa. Ela só nasce da designação comercial governada.",
};

export const COMMERCIAL_POLICY_AGENT: CommercialPolicyViolation = {
  kind: "agent",
  status: 403,
  code: "COMMERCIAL_AUTHORITY_REQUIRED",
  message:
    "Habilitar um agente é uma decisão comercial: exige uma pessoa com autoridade comercial designada neste workspace (marketplace.subscribe). actions.admin, sozinho, não basta.",
};

export async function commercialPolicyViolation(
  prisma: MarketplaceReader | null | undefined,
  actionName: string,
  allowed: boolean,
): Promise<CommercialPolicyViolation | null> {
  if (allowed !== true) return null;
  const name = typeof actionName === "string" ? actionName.trim() : "";
  if (!name) return null;
  if (name.toLowerCase() === COMMERCIAL_AUTHORITY_SCOPES.marketplaceSubscribe) return COMMERCIAL_POLICY_REQUIRES_AUTHORITY;
  if (hasCoreAgentProfile(name)) return COMMERCIAL_POLICY_AGENT;
  const key = normalizeAgentKey(name);
  try {
    if (!prisma) throw new Error("marketplace reader unavailable");
    const items = await prisma.marketplaceItem.findMany({ where: { type: "agent" }, select: { name: true }, take: 5000 });
    if (items.some((item) => typeof item.name === "string" && normalizeAgentKey(item.name) === key)) {
      return COMMERCIAL_POLICY_AGENT;
    }
    return null;
  } catch {
    return {
      kind: "unavailable",
      status: 503,
      code: "COMMERCIAL_POLICY_CHECK_UNAVAILABLE",
      message: "Não foi possível verificar se esta política tem efeito comercial. Nada foi alterado.",
    };
  }
}
