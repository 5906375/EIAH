import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@repo/db/client";
import { persistP1RunTransition } from "../../../apps/api/src/services/p1RunTransitionPersistence.js";
import { RUN_TRANSITION_COMMAND_VERSION, type RunTransitionCommand } from "../../../scripts/lib/p1AtomicRunTransition.js";

// No default DATABASE_URL: this suite is permitted only in the dedicated disposable database.
const rawUrl = process.env.EIAH_P1_DB_TEST_URL;
if (!rawUrl) throw new Error("EIAH_P1_DB_TEST_URL_required");
const url = new URL(rawUrl);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/eiah_p1_migration" ||
  process.env.EIAH_P1_EPHEMERAL !== "1") throw new Error("dedicated_ephemeral_database_required");
const pool = new Pool({ connectionString: rawUrl, max: 4 });
url.searchParams.set("application_name", "eiah_p1_adapter_test");
const adapter = new PrismaPg({ connectionString: url.toString(), max: 5 });
const prisma = new PrismaClient({ adapter });
after(async () => { await prisma.$disconnect(); await pool.end(); });
const created = "2026-09-20T00:00:00.000Z", declared = "2026-09-21T00:00:00.000Z";
const digest = "sha256:" + "0".repeat(64);

type Scope = { tenantId: string; workspaceId: string; runId: string; initialId: string; initialCommand: string };
async function fixture(withHistory = true): Promise<Scope> {
  const prefix = randomUUID();
  const f = { tenantId: `${prefix}:t`, workspaceId: `${prefix}:w`, runId: `${prefix}:r`,
    initialId: `${prefix}:event0`, initialCommand: `${prefix}:command0` };
  await prisma.$transaction(async tx => {
    await tx.tenant.create({ data: { id: f.tenantId, name: "P1 synthetic" } });
    await tx.workspace.create({ data: { id: f.workspaceId, tenantId: f.tenantId, name: "P1 synthetic" } });
    await tx.run.create({ data: { id: f.runId, tenantId: f.tenantId, workspaceId: f.workspaceId,
      agent: "p1-synthetic", status: "pending", request: {}, createdAt: new Date(created) } });
    if (withHistory) await tx.$executeRaw`
      INSERT INTO run_state_transitions (id,run_id,tenant_id,workspace_id,command_id,schema_version,sequence,
        status,declared_at,producer_id,operation_ref,command_digest)
      VALUES (${f.initialId},${f.runId},${f.tenantId},${f.workspaceId},${f.initialCommand},
        'p1-run-transition.v1',0,'pending',${new Date(created)},'synthetic-fixture','synthetic-only',${digest})`;
  });
  return f;
}
function command(f: Scope): RunTransitionCommand {
  const id = randomUUID();
  return { schemaVersion: RUN_TRANSITION_COMMAND_VERSION, commandId: id, tenantId: f.tenantId,
    workspaceId: f.workspaceId, runId: f.runId, expectedSequence: 0,
    expected: { status: "pending", finishedAt: null }, next: { status: "running", finishedAt: null },
    committedAt: declared, producerId: "synthetic-writer", operationRef: "synthetic-transition",
    publish: { intentId: `intent:${id}`, destination: "runQueue", payloadRef: `payload:${id}` } };
}
const payload = (f: Scope) => ({ tenantId: f.tenantId, workspaceId: f.workspaceId, runId: f.runId, prompt: "synthetic" });
async function counts(f: Scope) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: f.runId } });
  const events = await pool.query("SELECT count(*)::int AS n FROM run_state_transitions WHERE run_id=$1", [f.runId]);
  const intents = await pool.query("SELECT count(*)::int AS n FROM run_publish_outbox WHERE run_id=$1", [f.runId]);
  return { status: run.status, events: events.rows[0].n as number, intents: intents.rows[0].n as number };
}
async function insertEvent(f: Scope, options: { sequence: number; commandId?: string; workspaceId?: string; tenantId?: string }) {
  return pool.query(`INSERT INTO run_state_transitions
    (id,run_id,tenant_id,workspace_id,command_id,schema_version,sequence,previous_status,status,declared_at,producer_id,operation_ref,command_digest)
    VALUES ($1,$2,$3,$4,$5,'p1-run-transition.v1',$6,$7,'pending',$8,'synthetic','synthetic',$9)`,
    [randomUUID(),f.runId,options.tenantId ?? f.tenantId,options.workspaceId ?? f.workspaceId,
      options.commandId ?? randomUUID(),options.sequence,options.sequence === 0 ? null : "pending",created,digest]);
}

test("PostgreSQL rejects duplicate sequence, duplicate command, negative sequence and foreign scope", async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(insertEvent(f, { sequence: 0 }), { code: "23505" });
  await assert.rejects(insertEvent(f, { sequence: 1, commandId: f.initialCommand }), { code: "23505" });
  await assert.rejects(insertEvent(f, { sequence: -1 }), { code: "23514" });
  await assert.rejects(insertEvent(f, { sequence: 1, workspaceId: other.workspaceId }), { code: "23503" });
  await assert.rejects(insertEvent(f, { sequence: 1, tenantId: other.tenantId }), { code: "23503" });
  assert.deepEqual(await counts(f), { status: "pending", events: 1, intents: 0 });
});

test("adapter commits state, event and durable payload; exact retry creates no new writes", async () => {
  const f = await fixture(), c = command(f);
  const first = await persistP1RunTransition(prisma, c, payload(f));
  const retry = await persistP1RunTransition(prisma, c, payload(f));
  assert.equal(first.replayed, false); assert.equal(retry.replayed, true);
  assert.deepEqual(first.transition, retry.transition);
  assert.equal(first.historyVerification, "not_demonstrated");
  assert.equal(first.operationalEligibility, "blocked");
  assert.deepEqual(await counts(f), { status: "running", events: 2, intents: 1 });
  const rows = await pool.query("SELECT payload,state FROM run_publish_outbox WHERE run_id=$1", [f.runId]);
  assert.deepEqual(rows.rows[0], { payload: payload(f), state: "pending" });
  await assert.rejects(persistP1RunTransition(prisma, c, { ...payload(f), prompt: "changed" }), /command_id_reused/);
  await assert.rejects(persistP1RunTransition(prisma, { ...c, operationRef: "changed" }, payload(f)), /command_id_reused/);
  assert.deepEqual(await counts(f), { status: "running", events: 2, intents: 1 });
});

test("two writers actually waiting on the same row lock cannot both commit one sequence", async () => {
  const f = await fixture();
  const lock = await pool.connect();
  let results: PromiseSettledResult<unknown>[] = [];
  try {
    await lock.query("BEGIN");
    await lock.query("SELECT id FROM runs WHERE id=$1 FOR UPDATE", [f.runId]);
    const pending = Promise.allSettled([
      persistP1RunTransition(prisma, command(f), payload(f)),
      persistP1RunTransition(prisma, command(f), payload(f)),
    ]);
    let waiters = 0;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const observed = await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND application_name='eiah_p1_adapter_test' AND wait_event_type='Lock'`);
        waiters = observed.rows[0].n;
        if (waiters >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } finally { await lock.query("ROLLBACK"); }
    results = await pending;
    assert.equal(waiters, 2, "both writers must be observed blocked before releasing the row");
  } finally { lock.release(); }
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.match(String((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason), /history_or_sequence_mismatch/);
  assert.deepEqual(await counts(f), { status: "running", events: 2, intents: 1 });
});

test("event insertion failure rolls back the preceding run update", async () => {
  const f = await fixture(), other = await fixture();
  const c = { ...command(f), commandId: other.initialId };
  // Existing event ID collides, while command ID lookup is absent: INSERT must fail after UPDATE.
  await assert.rejects(persistP1RunTransition(prisma, c, payload(f)));
  assert.deepEqual(await counts(f), { status: "pending", events: 1, intents: 0 });
});

test("outbox collision rolls back state and event; corrected retry can commit", async () => {
  const first = await fixture(), existing = command(first);
  await persistP1RunTransition(prisma, existing, payload(first));
  const f = await fixture(), good = command(f);
  const collision = { ...good, publish: { ...good.publish!, intentId: existing.publish!.intentId } };
  await assert.rejects(persistP1RunTransition(prisma, collision, payload(f)));
  assert.deepEqual(await counts(f), { status: "pending", events: 1, intents: 0 });
  await persistP1RunTransition(prisma, good, payload(f));
  assert.deepEqual(await counts(f), { status: "running", events: 2, intents: 1 });
});

test("wrong scope, missing initial history and a sequence gap cannot be persisted through adapter", async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(persistP1RunTransition(prisma, { ...command(f), workspaceId: other.workspaceId },
    { ...payload(f), workspaceId: other.workspaceId }), /run_scope_mismatch/);
  const missing = await fixture(false);
  await assert.rejects(persistP1RunTransition(prisma, command(missing), payload(missing)), /history_or_sequence_mismatch/);
  assert.deepEqual(await counts(missing), { status: "pending", events: 0, intents: 0 });
  // SQL storage alone permits a gap; adapter must detect it, without certifying the source.
  await insertEvent(f, { sequence: 2 });
  await assert.rejects(persistP1RunTransition(prisma, command(f), payload(f)), /transition_sequence_gap_or_duplicate/);
  assert.deepEqual(await counts(f), { status: "pending", events: 2, intents: 0 });
});

test("outbox composite foreign key rejects a payload row with another workspace", async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(pool.query(`INSERT INTO run_publish_outbox
    (id,command_id,run_id,tenant_id,workspace_id,destination,payload_ref,payload)
    VALUES ($1,$2,$3,$4,$5,'runQueue','synthetic','{}'::jsonb)`,
    [randomUUID(),f.initialCommand,f.runId,f.tenantId,other.workspaceId]), { code: "23503" });
});

test("transition UPDATE, DELETE, TRUNCATE and outbox payload replacement are rejected", async () => {
  const f = await fixture(), c = command(f);
  await persistP1RunTransition(prisma, c, payload(f));
  await assert.rejects(pool.query("UPDATE run_state_transitions SET producer_id='changed' WHERE run_id=$1", [f.runId]), { code: "55000" });
  await assert.rejects(pool.query("DELETE FROM run_state_transitions WHERE run_id=$1", [f.runId]), { code: "55000" });
  await assert.rejects(pool.query("TRUNCATE run_state_transitions, run_publish_outbox"), { code: "55000" });
  await assert.rejects(pool.query("UPDATE run_publish_outbox SET payload='{}'::jsonb WHERE run_id=$1", [f.runId]), { code: "55000" });
  await assert.rejects(pool.query("DELETE FROM run_publish_outbox WHERE run_id=$1", [f.runId]), { code: "55000" });
  await pool.query("UPDATE run_publish_outbox SET attempts=attempts+1 WHERE run_id=$1", [f.runId]);
  // This is storage-marker validation, not an actual queue publication.
  await pool.query("UPDATE run_publish_outbox SET state='published',published_at=CURRENT_TIMESTAMP WHERE run_id=$1", [f.runId]);
  const retry = await persistP1RunTransition(prisma, c, payload(f));
  assert.equal(retry.replayed, true);
  const row = await pool.query("SELECT state,attempts FROM run_publish_outbox WHERE run_id=$1", [f.runId]);
  assert.deepEqual(row.rows[0], { state: "published", attempts: 1 });
  assert.deepEqual(await counts(f), { status: "running", events: 2, intents: 1 });
});


test("terminal transition stores finishedAt and no outbox; declared time cannot move backwards", async () => {
  const f = await fixture(), start = command(f);
  await persistP1RunTransition(prisma, start, payload(f));
  const finish: RunTransitionCommand = { ...command(f), expectedSequence: 1,
    expected: { status: "running", finishedAt: null }, next: { status: "success", finishedAt: declared }, publish: null };
  const result = await persistP1RunTransition(prisma, finish, null);
  assert.equal(result.transition.sequence, 2);
  assert.equal(result.transition.finishedAt, declared);
  assert.equal(result.publishIntent, null);
  assert.deepEqual(await counts(f), { status: "success", events: 3, intents: 1 });
  const g = await fixture();
  await persistP1RunTransition(prisma, command(g), payload(g));
  const backdated: RunTransitionCommand = { ...command(g), expectedSequence: 1,
    expected: { status: "running", finishedAt: null }, committedAt: created };
  await assert.rejects(persistP1RunTransition(prisma, backdated, payload(g)), /declared_time_regression/);
});
