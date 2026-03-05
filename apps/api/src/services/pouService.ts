export type PoUReceiptSummary = {
  id: string;
  actionId: string;
  status: string;
  compositeTxId: string | null;
  createdAt: string | null;
  finalizedAt: string | null;
};

export type PoULedgerResolution = {
  matchedByTxId: PoUReceiptSummary | null;
  receiptsByRun: PoUReceiptSummary[];
};

/**
 * Minimal PoU resolver for current src schema.
 * The active Prisma schema in this branch has no ProofOfUsage model,
 * so this resolver returns an explicit empty structure.
 */
export async function resolvePoUForLedger(): Promise<PoULedgerResolution> {
  return {
    matchedByTxId: null,
    receiptsByRun: [],
  };
}
