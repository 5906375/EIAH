import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";

import { createGovernedRouter } from "../middlewares/asyncHandler";
import { governedErrorHandler } from "../middlewares/governedErrorHandler";

function buildTestApp(handler: express.RequestHandler) {
  const app = express();
  const router = createGovernedRouter();
  router.get("/boom", handler);
  app.use(router);
  app.use(governedErrorHandler);
  return app;
}

test("rejected promise in a route handler returns a governed 500 without leaking the stack", async () => {
  const app = buildTestApp(async () => {
    throw new Error("boom: sensitive internal detail that must not reach the client");
  });

  const res = await supertest(app).get("/boom");

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { ok: false, reasonCode: "INTERNAL_ERROR" });
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes("boom"), "response body must not leak the error message");
  assert.ok(!raw.includes("stack"), "response body must not include a stack field");
  assert.ok(!raw.toLowerCase().includes(".ts:"), "response body must not include a stack trace line");
});

test("N-10 regression: an uncaught async rejection resolves the request instead of hanging or crashing the process", async () => {
  const app = buildTestApp(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Promise.reject(new Error("async rejection after a tick, same shape as the N-10 crash"));
  });

  const res = await Promise.race([
    supertest(app).get("/boom"),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("request hung for more than 2s — regressed to N-10 behavior")), 2000)
    ),
  ]);

  assert.equal((res as { status: number }).status, 500);
  assert.deepEqual((res as { body: unknown }).body, { ok: false, reasonCode: "INTERNAL_ERROR" });
});

test("governed 4xx responses from existing gates are not reclassified as 500", async () => {
  const app = express();
  const router = createGovernedRouter();
  router.get("/denied", async (_req, res) => {
    res.status(403).json({ ok: false, error: { reasonCode: "IMOB_ENTITLEMENT_MISSING" } });
  });
  app.use(router);
  app.use(governedErrorHandler);

  const res = await supertest(app).get("/denied");

  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { ok: false, error: { reasonCode: "IMOB_ENTITLEMENT_MISSING" } });
});
