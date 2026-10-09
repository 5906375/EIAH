import type { AppSessionState } from "@/state/sessionStore";

type EntitlementSession = {
  entitlements?: { IMOB_INSTALLED?: boolean } | null;
  installedProducts?: string[] | null;
};

/**
 * Returns true when the session has the IMOB vertical installed.
 * Checks both the entitlements flag (primary) and the installedProducts
 * array (legacy fallback populated during session context refresh).
 */
export function isImobInstalled(session: EntitlementSession): boolean {
  return (
    session.entitlements?.IMOB_INSTALLED === true ||
    session.installedProducts?.some((item) => item.trim().toUpperCase() === "IMOB") === true
  );
}

/** Visibilidade no Front Door a partir da sessão resolvida; não autoriza ações. */
export function isImobSurfaceAvailable(
  session: Pick<AppSessionState, "activeDomain" | "availableDomains" | "entitlements" | "verticals" | "accessGate">,
): boolean {
  // Produtos persistidos e REAL_ESTATE_CORE legado não provam instalação ativa.
  return session.activeDomain === "imob"
    && session.entitlements?.IMOB_INSTALLED === true
    && session.availableDomains?.includes("imob") === true
    && session.verticals?.find((vertical) => vertical.verticalId === "IMOB")?.enabled === true
    && !session.accessGate;
}
