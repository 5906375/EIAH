import test from "node:test";
import assert from "node:assert/strict";

import { listImobOperationRoutes } from "../services/imob/orchestrator/imobOperationRouter";

test("operation routing preserves IMOB_Orchestrator as case owner for every canonical operation", () => {
  const routes = listImobOperationRoutes();

  assert.equal(routes.every((route) => route.ownerAgentId === "IMOB_Orchestrator"), true);
  assert.equal(routes.every((route) => route.ownershipPreserved === true), true);
});
