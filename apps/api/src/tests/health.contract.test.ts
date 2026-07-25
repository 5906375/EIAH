import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";

import { createPublicHealthHandler } from "../routes/health";
import {
  resolveHealthEnvironment,
  type PublicHealthReport,
} from "../services/health";

async function invokeHealthHandler(report: PublicHealthReport) {
  const handler = createPublicHealthHandler({
    collect: async () => report,
  });

  let statusCode = 200;
  let jsonBody: unknown = null;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
      return this;
    },
  } as Pick<Response, "status" | "json"> as Response;

  await handler({} as Request, response);
  return { status: statusCode, body: jsonBody as Record<string, unknown> | null };
}

test("GET /health returns the public contract with 200 when healthy", async () => {
  const response = await invokeHealthHandler({
    status: "healthy",
    timestamp: "2026-05-31T00:00:00.000Z",
    environment: "production",
    version: "1.0.0",
    dependencies: {
      database: "connected",
      agentRuntime: "ready",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body?.status, "healthy");
  assert.equal(response.body?.timestamp, "2026-05-31T00:00:00.000Z");
  assert.equal(response.body?.environment, "production");
  assert.equal(response.body?.version, "1.0.0");
  assert.deepEqual(response.body?.dependencies, {
    database: "connected",
    agentRuntime: "ready",
  });
});

test("GET /api/health returns 503 when the public health contract is degraded", async () => {
  const response = await invokeHealthHandler({
    status: "degraded",
    timestamp: "2026-05-31T00:00:00.000Z",
    environment: "staging",
    version: "1.0.1",
    dependencies: {
      database: "connected",
      agentRuntime: "error",
    },
  });

  assert.equal(response.status, 503);
  assert.match(String(response.body?.status ?? ""), /^(healthy|degraded|unhealthy)$/);
  assert.match(String(response.body?.timestamp ?? ""), /^\d{4}-\d{2}-\d{2}T/);
  assert.match(String(response.body?.environment ?? ""), /^(production|staging)$/);
  assert.equal(typeof response.body?.version, "string");
  assert.match(String(response.body?.dependencies?.database ?? ""), /^(connected|disconnected)$/);
  assert.match(String(response.body?.dependencies?.agentRuntime ?? ""), /^(ready|error)$/);
});

test("public health maps development identifiers to the non-production tier", () => {
  assert.equal(resolveHealthEnvironment({
    EIAH_ENVIRONMENT_ID: "eiah-dev",
    NODE_ENV: "development",
  }), "staging");
  assert.equal(resolveHealthEnvironment({
    APP_ENV: "development",
    NODE_ENV: "production",
  }), "staging");
});

test("public health exposes production only when the selected tier is explicit", () => {
  assert.equal(resolveHealthEnvironment({ APP_ENV: "production" }), "production");
  assert.equal(resolveHealthEnvironment({ HEALTH_ENV: "production" }), "production");
  assert.equal(resolveHealthEnvironment({ NODE_ENV: "production" }), "production");
  assert.equal(resolveHealthEnvironment({ NODE_ENV: "unexpected" }), "staging");
});
