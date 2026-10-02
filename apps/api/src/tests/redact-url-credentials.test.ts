import assert from "node:assert/strict";
import test from "node:test";

import { redactUrlCredentials } from "../services/redactUrlCredentials";

test("log nunca mostra senha de URL de conexão", () => {
  const secret = "fedcf6edf7cea67f";
  const redacted = redactUrlCredentials(`redis://:${secret}@localhost:6379/0`);
  assert.equal(redacted, "redis://***@localhost:6379/0");
  assert.equal(redacted.includes(secret), false);
  assert.equal(redactUrlCredentials("postgresql://ci:ci@localhost:5432/eiah_ci"), "postgresql://***@localhost:5432/eiah_ci");
  assert.equal(redactUrlCredentials("redis://localhost:6379"), "redis://localhost:6379");
  assert.equal(redactUrlCredentials("não é url :senha@"), "[url inválida]");
  assert.equal(redactUrlCredentials(undefined), "");
});
