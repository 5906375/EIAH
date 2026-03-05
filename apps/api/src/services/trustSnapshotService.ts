export type TrustSnapshot = Record<string, unknown> | null;

/**
 * Minimal trust snapshot resolver for ledger contract restoration.
 * Full snapshot linkage depends on PoU/approval models not present in current src schema.
 */
export async function resolveTrustSnapshotForLedger(): Promise<TrustSnapshot> {
  return null;
}
