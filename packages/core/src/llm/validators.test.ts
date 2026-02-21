import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { validateModelOutputJson } from "./validators";

test("validators rejects invalid JSON output", () => {
  const schema = z.object({
    intent: z.string(),
    confidence: z.number().min(0).max(1),
  });

  const result = validateModelOutputJson(schema, "not-a-json-payload");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.length > 0);
  }
});

