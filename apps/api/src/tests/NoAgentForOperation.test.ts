import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobOperationRouteLoose } from "../services/imob/orchestrator/imobOperationRouter";

test("operation router fails closed for unknown operations", () => {
  assert.equal(resolveImobOperationRouteLoose("unknown_operation"), null);
  assert.equal(resolveImobOperationRouteLoose(null), null);
});
