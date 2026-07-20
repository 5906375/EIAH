import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatRouteTelemetryInvalidPayloadError,
  ChatRouteTelemetrySchema,
} from "../types/chatRouteTelemetryContract.ts";

test("chat route telemetry accepts a valid canonical payload", () => {
  const result = ChatRouteTelemetrySchema.safeParse({
    event: "route_entry",
    surfaceRoute: "/app/chat",
    entryKind: "deep_link",
    domainHint: "imob",
  });

  assert.equal(result.success, true);
});

test("chat route telemetry rejects malformed payloads", () => {
  const result = ChatRouteTelemetrySchema.safeParse({
    event: "invalid_event",
    surfaceRoute: "/app/chat",
  });

  assert.equal(result.success, false);
});

test("chat route telemetry rejects unexpected fields", () => {
  const result = ChatRouteTelemetrySchema.safeParse({
    event: "route_entry",
    surfaceRoute: "/app/chat",
    prompt: "must-not-be-accepted",
  });

  assert.equal(result.success, false);
});

test("chat route telemetry rejects arbitrary domain hints containing fake PII", () => {
  const result = ChatRouteTelemetrySchema.safeParse({
    event: "route_entry",
    surfaceRoute: "/app/chat",
    domainHint: "email@example.com",
  });

  assert.equal(result.success, false);
  assert.equal(
    JSON.stringify(buildChatRouteTelemetryInvalidPayloadError()).includes("email@example.com"),
    false,
  );
});
