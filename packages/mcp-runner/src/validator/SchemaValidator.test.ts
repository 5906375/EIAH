import test from "node:test";
import assert from "node:assert/strict";

import { validateInput } from "./SchemaValidator.js";
import type { ToolContract } from "../types/ToolContract.js";

function buildContract(inputSchema: ToolContract["inputSchema"]): ToolContract {
  return {
    name: "test.tool",
    version: "1.0.0",
    tenantId: "tenant-test",
    inputSchema,
    executor: "http",
    trustLevel: 1,
  };
}

const strictObjectSchema = {
  type: "object",
  properties: {
    foo: { type: "string" },
  },
  required: ["foo"],
  additionalProperties: false,
} as const;

test("SchemaValidator: valid payload does not throw", () => {
  const contract = buildContract(strictObjectSchema);
  assert.doesNotThrow(() => validateInput(contract, { foo: "bar" }));
});

test("SchemaValidator: payload with wrong property type throws with Ajv error text", () => {
  const contract = buildContract(strictObjectSchema);
  assert.throws(() => validateInput(contract, { foo: 123 }), /Invalid payload:/);
});

test("SchemaValidator: missing required property throws", () => {
  const contract = buildContract(strictObjectSchema);
  assert.throws(() => validateInput(contract, {}), /Invalid payload:/);
});

test("SchemaValidator: additional property is rejected when additionalProperties is false", () => {
  const contract = buildContract(strictObjectSchema);
  assert.throws(
    () => validateInput(contract, { foo: "bar", extra: "not-allowed" }),
    /Invalid payload:/
  );
});
