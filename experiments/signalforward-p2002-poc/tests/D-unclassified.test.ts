// Cenário D — identificação inconclusiva. Testes unitários (sem banco), com
// formatos sintéticos de erro malformado/desconhecido, conforme autorizado
// para este cenário específico.
import test from "node:test";
import assert from "node:assert/strict";
import { classifySignalForwardUniqueViolation } from "../classifier.ts";
import { dispatchAfterTransactionError } from "../service.ts";
import type { SignalForwardRequestInput } from "../service.ts";

const input: SignalForwardRequestInput = {
  tenantId: "t", workspaceId: "w", requestedByUserId: "u",
  sourceRunId: "r", destinationAgent: "mkt",
  idempotencyKey: "k", requestFingerprint: "f",
};

function makeError(overrides: Record<string, unknown>) {
  const err = new Error("synthetic");
  Object.assign(err, { code: "P2002" }, overrides);
  return err;
}

test("classifica como unclassified: meta ausente", () => {
  const e = makeError({ meta: undefined });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });
});

test("classifica como unclassified: meta sem modelName", () => {
  const e = makeError({ meta: { driverAdapterError: {} } });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });
});

test("classifica como unclassified: meta sem driverAdapterError", () => {
  const e = makeError({ meta: { modelName: "SignalForwardRequest" } });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });
});

test("classifica como unclassified: cause.kind diferente de UniqueConstraintViolation", () => {
  const e = makeError({
    meta: {
      modelName: "SignalForwardRequest",
      driverAdapterError: { cause: { kind: "ForeignKeyConstraintViolation" } },
    },
  });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });
});

test("classifica como unclassified: constraint.fields ausente/mal formado", () => {
  const e = makeError({
    meta: {
      modelName: "SignalForwardRequest",
      driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: {} } },
    },
  });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });

  const e2 = makeError({
    meta: {
      modelName: "SignalForwardRequest",
      driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields: "not-an-array" } } },
    },
  });
  assert.deepEqual(classifySignalForwardUniqueViolation(e2), { kind: "unclassified" });
});

test("classifica como unclassified: código diferente de P2002", () => {
  const e = new Error("synthetic");
  Object.assign(e, { code: "P2025" });
  assert.deepEqual(classifySignalForwardUniqueViolation(e), { kind: "unclassified" });
});

test("classifica como unclassified: erro nulo/indefinido", () => {
  assert.deepEqual(classifySignalForwardUniqueViolation(null), { kind: "unclassified" });
  assert.deepEqual(classifySignalForwardUniqueViolation(undefined), { kind: "unclassified" });
});

test("dispatchAfterTransactionError: inconclusivo relança o erro ORIGINAL sem iniciar recuperação", async () => {
  const e = makeError({ meta: undefined });
  // db = undefined proposital: se o código tentasse recuperar, acessaria
  // db.signalForwardRequest.findUnique e lançaria um TypeError DIFERENTE do
  // erro original — provando que a recuperação não foi sequer tentada.
  await assert.rejects(
    dispatchAfterTransactionError(undefined as any, input, e),
    (err: unknown) => err === e
  );
});

test("dispatchAfterTransactionError: outra violação relança o erro ORIGINAL sem iniciar recuperação", async () => {
  const e = makeError({
    meta: {
      modelName: "OtherUniqueFixture",
      driverAdapterError: {
        cause: { kind: "UniqueConstraintViolation", constraint: { fields: ["tenant_id", "external_ref"] } },
      },
    },
  });
  await assert.rejects(
    dispatchAfterTransactionError(undefined as any, input, e),
    (err: unknown) => err === e
  );
});
