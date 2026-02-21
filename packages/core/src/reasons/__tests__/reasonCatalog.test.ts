import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReasonCatalog, assertReason, isReason, normalizeReason } from "../reasonCatalog";

describe("ReasonCatalog", () => {
  it("contains only unique string values", () => {
    const unique = new Set(ReasonCatalog);
    assert.equal(unique.size, ReasonCatalog.length);
    ReasonCatalog.forEach((reason) => assert.equal(typeof reason, "string"));
  });

  it("isReason detects valid reasons", () => {
    assert.equal(isReason("invalid_payload"), true);
    assert.equal(isReason("unknown_reason"), false);
  });

  it("assertReason returns fallback or throws", () => {
    assert.equal(assertReason("invalid_payload"), "invalid_payload");
    assert.equal(assertReason("unknown_reason", "unknown"), "unknown");
    assert.throws(() => assertReason("unknown_reason"), /Unknown reason/);
  });

  it("normalizeReason coerces to fallback", () => {
    assert.equal(normalizeReason("trust_denied"), "trust_denied");
    assert.equal(normalizeReason("nope"), "unknown");
  });
});
