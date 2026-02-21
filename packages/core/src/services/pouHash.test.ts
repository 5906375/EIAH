import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeResult, computeResultHash } from "./pouHash";

test("canonicalizeResult stable for key order", () => {
  const a = { b: 1, a: 2 };
  const b = { a: 2, b: 1 };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult handles nested objects deterministically", () => {
  const a = { z: { b: 1, a: 2 }, a: { c: 3 } };
  const b = { a: { c: 3 }, z: { a: 2, b: 1 } };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult normalizes -0 and Infinity", () => {
  const a = { value: -0, other: Infinity };
  const b = { value: 0, other: "__NaN__" };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult keeps arrays order", () => {
  const a = [1, 2, 3];
  const b = [3, 2, 1];
  assert.notDeepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult drops undefined", () => {
  const a = { a: 1, b: undefined };
  const b = { a: 1 };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult preserves nulls even when normalizeNulls is false", () => {
  const a = { a: 1, b: null };
  const b = { a: 1 };
  assert.notDeepEqual(canonicalizeResult(a, { normalizeNulls: false }), canonicalizeResult(b));
});

test("canonicalizeResult preserves nulls by default", () => {
  const a = { a: 1, b: null };
  const b = { a: 1 };
  assert.notDeepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("masking removes PII from hashes", () => {
  const a = { email: "test@example.com" };
  const b = { email: "tzzzt@example.com" };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult handles strings and booleans", () => {
  const a = { ok: true, name: "Alice" };
  const b = { name: "Alice", ok: true };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult handles nulls in arrays", () => {
  const a = [1, null, 2];
  const b = [1, null, 2];
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("canonicalizeResult handles nested arrays/objects", () => {
  const a = [{ b: 1, a: 2 }, { c: [3, 2, 1] }];
  const b = [{ a: 2, b: 1 }, { c: [3, 2, 1] }];
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("computeResultHash stable for canonical input", () => {
  const canonical = canonicalizeResult({ a: 1, b: 2 });
  const hash1 = computeResultHash(canonical);
  const hash2 = computeResultHash(canonical);
  assert.equal(hash1, hash2);
});

test("different canonical inputs produce different hashes", () => {
  const hash1 = computeResultHash(canonicalizeResult({ a: 1 }));
  const hash2 = computeResultHash(canonicalizeResult({ a: 2 }));
  assert.notEqual(hash1, hash2);
});

test("masking handles API keys", () => {
  const a = { key: "sk_test_12345678901234567890" };
  const b = { key: "sk_**********[REDACTED]" };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});

test("masking handles CPF", () => {
  const a = { cpf: "123.456.789-10" };
  const b = { cpf: "123.***.***-**" };
  assert.deepEqual(canonicalizeResult(a), canonicalizeResult(b));
});
