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
