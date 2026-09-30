import test from "node:test";
import assert from "node:assert/strict";
import { RUN_TRANSITION_VERSION, type RunTransition } from "../lib/p1RunTransitionHistory.js";
import { RUN_TRANSITION_COMMAND_VERSION, applyAtomicRunTransition,
  type RunTransitionCommand, type RunTransitionResult, type RunTransitionStore } from "../lib/p1AtomicRunTransition.js";

const created = "2026-09-20T00:00:00Z", at = "2026-09-21T00:00:00Z";
const initial: RunTransition = {
  schemaVersion: RUN_TRANSITION_VERSION, transitionId: "initial", sequence: 0,
  tenantId: "t", workspaceId: "w", runId: "r", previousStatus: null, status: "pending",
  previousFinishedAt: null, finishedAt: null, committedAt: created,
  producerId: "fixture", operationRef: "fixture",
};
function command(id: string): RunTransitionCommand {
  return { schemaVersion: RUN_TRANSITION_COMMAND_VERSION, commandId: id,
    tenantId: "t", workspaceId: "w", runId: "r", expectedSequence: 0,
    expected: { status: "pending", finishedAt: null }, next: { status: "running", finishedAt: null },
    committedAt: at, producerId: "fixture-writer", operationRef: "fixture-operation",
    publish: { intentId: "intent-" + id, destination: "runQueue", payloadRef: "payload-" + id },
  };
}
function fakeStore() {
  let run = { tenantId: "t", workspaceId: "w", runId: "r", status: "pending", finishedAt: null as string | null };
  let events: RunTransition[] = [initial];
  let results = new Map<string, RunTransitionResult>();
  let intents = new Map<string, NonNullable<RunTransitionResult["publishIntent"]>>();
  let failAt: "append" | "outbox" | null = null;
  let wait = Promise.resolve();
  const store: RunTransitionStore = {
    async withRunTransaction(scope, action) {
      let release!: () => void;
      const previous = wait;
      wait = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        let nextRun = { ...run }, nextEvents = [...events], nextResults = new Map(results), nextIntents = new Map(intents);
        let pendingCommand: string | null = null;
        const result = await action({
          async readRun() { return nextRun; },
          async readLastTransition() { return nextEvents.at(-1) ?? null; },
          async readByCommandId(id) { return nextResults.get(id) ?? null; },
          async updateRun(expected, next) {
            assert.equal(nextRun.tenantId, scope.tenantId);
            assert.equal(nextRun.workspaceId, scope.workspaceId);
            assert.equal(nextRun.runId, scope.runId);
            assert.equal(nextRun.status, expected.status);
            nextRun = { ...nextRun, ...next };
          },
          async appendTransition(transition, id) {
            if (failAt === "append") throw new Error("simulated_append_failure");
            nextEvents.push(transition);
            pendingCommand = id;
          },
          async insertPublishIntent(intent) {
            if (failAt === "outbox") throw new Error("simulated_outbox_failure");
            nextIntents.set(intent.intentId, intent);
          },
        });
        if (pendingCommand) nextResults.set(pendingCommand, result as unknown as RunTransitionResult);
        run = nextRun; events = nextEvents; results = nextResults; intents = nextIntents;
        return result;
      } finally { release(); }
    },
  };
  return { store, snapshot: () => ({ run, events, intents }), failAt: (value: typeof failAt) => { failAt = value; },
    async dispatch(intentId: string, publish: () => Promise<void>) {
      if (!intents.has(intentId)) throw new Error("intent_missing");
      await publish();
      intents.delete(intentId);
    } };
}
test("one transaction changes state, appends a numbered event and persists a publish intent", async () => {
  const db = fakeStore();
  const result = await applyAtomicRunTransition(db.store, command("c1"));
  assert.equal(db.snapshot().run.status, "running");
  assert.equal(db.snapshot().events.at(-1)?.sequence, 1);
  assert.equal(db.snapshot().intents.has("intent-c1"), true);
  assert.equal(result.replayed, false);
  assert.equal(result.historyVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("retry of the same command is idempotent; a second command with stale sequence conflicts", async () => {
  const db = fakeStore();
  const first = await applyAtomicRunTransition(db.store, command("c1"));
  const retry = await applyAtomicRunTransition(db.store, command("c1"));
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.transition, first.transition);
  assert.equal(db.snapshot().events.length, 2);
  await assert.rejects(applyAtomicRunTransition(db.store, command("c2")), /history_or_sequence_mismatch/);
  const reused = { ...command("c1"), publish: { ...command("c1").publish!, payloadRef: "changed" } };
  await assert.rejects(applyAtomicRunTransition(db.store, reused), /command_id_reused_with_different_payload/);
});
test("concurrent commands for one expected sequence cannot both commit", async () => {
  const db = fakeStore();
  const results = await Promise.allSettled([
    applyAtomicRunTransition(db.store, command("c1")), applyAtomicRunTransition(db.store, command("c2")),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(db.snapshot().events.length, 2);
  assert.equal(db.snapshot().intents.size, 1);
});
test("append or outbox failure rolls back the simulated transaction", async () => {
  for (const failure of ["append", "outbox"] as const) {
    const db = fakeStore(); db.failAt(failure);
    await assert.rejects(applyAtomicRunTransition(db.store, command("c1")), /simulated_.*_failure/);
    assert.equal(db.snapshot().run.status, "pending");
    assert.equal(db.snapshot().events.length, 1);
    assert.equal(db.snapshot().intents.size, 0);
  }
});
test("publish failure after commit leaves the durable intent for retry", async () => {
  const db = fakeStore();
  await applyAtomicRunTransition(db.store, command("c1"));
  await assert.rejects(db.dispatch("intent-c1", async () => { throw new Error("transport_down"); }), /transport_down/);
  assert.equal(db.snapshot().intents.has("intent-c1"), true);
  await db.dispatch("intent-c1", async () => undefined);
  assert.equal(db.snapshot().intents.has("intent-c1"), false);
  assert.equal(db.snapshot().events.length, 2);
});
