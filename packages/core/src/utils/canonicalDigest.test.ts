import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalDigest, stableSort } from "./canonicalDigest";

test("stableSort: sorts object keys recursively regardless of insertion order", () => {
  const a = stableSort({ b: 1, a: 2, c: { z: 1, y: 2 } });
  const b = stableSort({ a: 2, c: { y: 2, z: 1 }, b: 1 });
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("stableSort: preserves array order (order is semantically meaningful for arrays)", () => {
  const sorted = stableSort([{ b: 1, a: 2 }, { d: 1, c: 2 }]) as unknown[];
  assert.equal(JSON.stringify(sorted), JSON.stringify([{ a: 2, b: 1 }, { c: 2, d: 1 }]));
});

test("stableSort: leaves primitives and null untouched", () => {
  assert.equal(stableSort(42), 42);
  assert.equal(stableSort("x"), "x");
  assert.equal(stableSort(null), null);
  assert.equal(stableSort(undefined), undefined);
});

test("canonicalDigest: same logical payload with different key order produces the same digest", () => {
  const d1 = canonicalDigest({ tenantId: "t1", domain: "billing", auditGap: 0 });
  const d2 = canonicalDigest({ domain: "billing", auditGap: 0, tenantId: "t1" });
  assert.equal(d1, d2);
});

test("canonicalDigest: mutating any field produces a different digest", () => {
  const base = canonicalDigest({ tenantId: "t1", auditGap: 0 });
  const mutated = canonicalDigest({ tenantId: "t1", auditGap: 1 });
  assert.notEqual(base, mutated);
});

test("canonicalDigest: nested arrays and objects are covered by the digest", () => {
  const base = canonicalDigest({ measurements: [{ operationId: "a", auditGap: 0 }] });
  const mutated = canonicalDigest({ measurements: [{ operationId: "a", auditGap: 1 }] });
  assert.notEqual(base, mutated);
});

test("canonicalDigest: produces a 64-character hex SHA-256 digest", () => {
  const digest = canonicalDigest({ x: 1 });
  assert.match(digest, /^[0-9a-f]{64}$/);
});
