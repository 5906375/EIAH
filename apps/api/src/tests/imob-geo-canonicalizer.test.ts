import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalizeImobCity,
  canonicalizeImobCityName,
} from "../services/imob/imobGeoCanonicalizer";

test("IMOB geo canonicalizer normalizes Itajai variants into canonical Itajaí", () => {
  assert.equal(canonicalizeImobCityName("Itajai"), "Itajaí");
  assert.equal(canonicalizeImobCityName("Itajaí"), "Itajaí");
  assert.equal(canonicalizeImobCityName("Itajái"), "Itajaí");
});

test("IMOB geo canonicalizer preserves source and lock metadata", () => {
  const canonical = canonicalizeImobCity("Itajái", {
    source: "scan",
    locked: true,
  });

  assert.equal(canonical?.canonicalName, "Itajaí");
  assert.equal(canonical?.normalizedKey, "itajai");
  assert.equal(canonical?.source, "scan");
  assert.equal(canonical?.locked, true);
  assert.equal(canonical?.uf, "SC");
});
