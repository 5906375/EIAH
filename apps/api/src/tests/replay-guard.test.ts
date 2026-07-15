import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReplayGuardStore,
  evaluateReplayGuard,
} from "../services/replayGuard";

test("replay guard accepts the first inbound event", () => {
  const store = createReplayGuardStore();
  const decision = evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1000,
    maxAgeMs: 30_000,
  });

  assert.deepEqual(decision, {
    accepted: true,
    duplicate: false,
    replay: false,
    reasonCode: null,
  });
});

test("replay guard returns replay when the exact replay key repeats", () => {
  const store = createReplayGuardStore();
  evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1000,
    maxAgeMs: 30_000,
  });

  const decision = evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1001,
    maxAgeMs: 30_000,
  });

  assert.deepEqual(decision, {
    accepted: false,
    duplicate: false,
    replay: true,
    reasonCode: "WHATSAPP_REPLAY_DETECTED",
  });
});

test("replay guard returns duplicate when the event id repeats with a different replay key", () => {
  const store = createReplayGuardStore();
  evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1000,
    maxAgeMs: 30_000,
  });

  const decision = evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-2",
    payloadDigest: "digest-1",
    nowMs: 1001,
    maxAgeMs: 30_000,
  });

  assert.deepEqual(decision, {
    accepted: false,
    duplicate: true,
    replay: false,
    reasonCode: "WHATSAPP_EVENT_DUPLICATE",
  });
});

test("replay guard prunes expired state and accepts the same keys after the window", () => {
  const store = createReplayGuardStore();
  evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1000,
    maxAgeMs: 100,
  });

  const decision = evaluateReplayGuard({
    store,
    eventKey: "whatsapp:evt-1",
    replayKey: "whatsapp:evt-1:timestamp:sig-1",
    payloadDigest: "digest-1",
    nowMs: 1201,
    maxAgeMs: 100,
  });

  assert.deepEqual(decision, {
    accepted: true,
    duplicate: false,
    replay: false,
    reasonCode: null,
  });
});
