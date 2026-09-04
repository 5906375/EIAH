import crypto from "node:crypto";

/**
 * Deterministically sorts object keys (recursively) so that two payloads
 * with the same logical content always serialize to the same JSON string,
 * regardless of property insertion order. Array order is preserved — order
 * is semantically meaningful for arrays, never for object keys.
 *
 * This is the same canonicalization already used by
 * `apps/api/src/services/receiptCanonService.ts` (Receipt Canon v1). It is
 * extracted here so that `packages/core` can reuse the identical algorithm
 * without depending on `apps/api` (which would invert the monorepo
 * dependency direction). Ratified P1-R2-H, Decision 6: REUSE_EXISTING — no
 * new canon.
 */
export function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSort(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return Object.fromEntries(keys.map((key) => [key, stableSort(record[key])]));
}

/**
 * Canonical SHA-256 digest of a JSON-serializable payload. The same logical
 * content always produces the same digest, regardless of key order; any
 * change to the content produces a different digest.
 */
export function canonicalDigest(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(stableSort(payload));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
