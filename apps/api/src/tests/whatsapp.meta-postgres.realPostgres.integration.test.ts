import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { PrismaClient as PrismaConnection } from "../../../../packages/db/src/generated/client/index.js";
import { createMetaOperationalAdapter, metaLabPseudonym, type MetaLabStoreItem } from "../services/whatsappMetaAdapter";
import { createMetaPostgresStore, purgeExpiredMetaReceipts } from "../services/whatsappMetaPostgresStore";

// Resolve an EXISTING dependency from its owning workspace, without importing the global DB client/.env.
const dbRequire = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
const target = process.env.EIAH_META_DISPOSABLE_POSTGRES_URL;
const scope = "whatsapp:inbound:read_only";
const retentionMs = 14 * 86400_000; // Synthetic test parameter, NOT operational approval.
const tenant = "synthetic-tenant-postgres", workspace = "synthetic-workspace-postgres";
const waba = "000000000001", phone = "000000000002", sender = "000000000000";
// Fictitious protocol credentials; no Meta client or HTTP listener exists in this suite.
const appSecret = "0123456789abcdef0123456789abcdef";
const verifyToken = "abcdef0123456789abcdef0123456789ab";
const identityKey = "fedcba9876543210fedcba9876543210fe";
const content = "SYNTHETIC-POSTGRES-CONTENT-NEVER-PERSIST";
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const item = (id: string, overrides: Partial<MetaLabStoreItem> = {}): MetaLabStoreItem => ({
  key: hash(id), digest: hash(`synthetic-digest:${id}`), atMs: Date.now(),
  tenantId: tenant, workspaceId: workspace, scope, ...overrides,
});

test("Meta real PostgreSQL — dedicated disposable container only", { skip: !target, timeout: 110_000 }, async t => {
  assert.equal(process.env.EIAH_META_DISPOSABLE, "1", "Explicit disposable authorization required");
  assert.match(process.env.EIAH_META_DISPOSABLE_CONTAINER_ID ?? "", /^[a-f0-9]{64}$/);
  assert.ok(target);
  const url = new URL(target);
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55434"); assert.equal(url.pathname, "/eiah_whatsapp_meta_synthetic");
  assert.equal(url.username, "meta_validation"); assert.ok(url.password); assert.equal(url.search, "");
  const { PrismaClient } = await import("../../../../packages/db/src/generated/client/index.js");
  const { PrismaPg }: typeof import("../../../../packages/db/node_modules/@prisma/adapter-pg/dist/index") = dbRequire("@prisma/adapter-pg");
  const clients = new Set<PrismaConnection>();
  const client = (readOnly = false) => {
    const adapter = new PrismaPg({ connectionString: target, max: 1,
      ...(readOnly ? { options: "-c default_transaction_read_only=on" } : {}) });
    const connection = new PrismaClient({ adapter, log: [] }); clients.add(connection); return connection;
  };
  const control = client(), a = client(), b = client();
  const store = (connection: PrismaConnection) => createMetaPostgresStore(() => connection, retentionMs);
  const count = async () => Number((await control.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "WhatsappMetaIngressReceipt"`)[0].n);
  const clean = () => control.$executeRaw`DELETE FROM "WhatsappMetaIngressReceipt"`;
  const pid = async (connection: PrismaConnection) => (await connection.$queryRaw<Array<{ pid: number }>>`
    SELECT pg_backend_pid() AS pid`)[0].pid;
  const makeAdapter = (connection: PrismaConnection) => {
    let processed = 0;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const fromHash = metaLabPseudonym(identityKey, "sender", [waba, phone, sender]);
    const adapter = createMetaOperationalAdapter({ mode: "operational", appSecret, verifyToken, identityKey,
      limits: { payloadBytes: 16384, events: 20, retentionMs }, replayWindowMs: 300000, futureSkewMs: 30000,
      now: Date.now, store: store(connection),
      bindings: [{ wabaId: waba, phoneNumberId: phone, bindingsJson: JSON.stringify({ [fromHash]: {
        tenantId: tenant, workspaceId: workspace, scope, allowedScopes: [scope],
        entitlements: ["channel.whatsapp.inbound.read_only"], sessionExpiresAt: "2099-01-01T00:00:00Z",
      } }) }], observe: metric => { if (metric.metric === "processing") processed++; },
    });
    const send = (id: string, text = content) => {
      const raw = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: waba,
        changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phone },
          messages: [{ id, from: sender, timestamp, type: "text", text: { body: text } }],
        } }] }] }));
      const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(raw).digest("hex")}`;
      return adapter.inbound(raw, signature);
    };
    return { send, processed: () => processed };
  };
  try {
    // Identity, empty user-table set and public schema checked BEFORE the migration/first SQL write.
    const identity = await control.$queryRaw<Array<{ db: string; role: string; version: string; port: number }>>`
      SELECT current_database() AS db, current_user AS role,
        current_setting('server_version') AS version, inet_server_port() AS port`;
    assert.equal(identity[0].db, "eiah_whatsapp_meta_synthetic");
    assert.equal(identity[0].role, "meta_validation"); assert.match(identity[0].version, /^16\./);
    assert.equal(identity[0].port, 5432);
    const existing = await control.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
    assert.equal(Number(existing[0].n), 0, "Refuse writes to a nonempty database");
    console.log("META_PG_IDENTITY", JSON.stringify({ ...identity[0], userTablesBefore: 0, hostPort: 55434 }));

    let migrated = false;
    await t.test("01 migration applies atomically to the empty disposable database", async () => {
      const migration = fs.readFileSync("packages/db/prisma/migrations/20261125180000_whatsapp_meta_ingress_receipt/migration.sql", "utf8");
      const statements = migration.split(";").map(s => s.trim()).filter(Boolean);
      assert.equal(statements.length, 2);
      await control.$transaction(async tx => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      });
      assert.equal(await count(), 0); migrated = true;
      console.log("META_PG_MIGRATION", JSON.stringify({ sha256: hash(migration), statements: 2, rows: 0 }));
    });
    if (!migrated) throw new Error("Migration failed; no dependent criteria executed");

    await t.test("02 PostgreSQL enforces primary key, scope, hash, nullability and expiry constraints", async () => {
      await clean(); const key = hash("constraint"), digest = hash("constraint-digest");
      const received = new Date(), expiry = new Date(received.getTime() + retentionMs);
      const insert = (eventKey = key, bodyDigest = digest, storedScope = scope, expires = expiry) => control.$executeRaw`
        INSERT INTO "WhatsappMetaIngressReceipt" ("tenantId","workspaceId","scope","eventKey","digest","receivedAt","expiresAt")
        VALUES (${tenant},${workspace},${storedScope},${eventKey},${bodyDigest},${received},${expires})`;
      await insert(); await assert.rejects(insert());
      await assert.rejects(insert(hash("invalid-scope"), digest, "write"));
      await assert.rejects(insert("invalid-hash", digest));
      await assert.rejects(insert(hash("invalid-digest"), "invalid-hash"));
      await assert.rejects(insert(hash("invalid-expiry"), digest, scope, received));
      await assert.rejects(control.$executeRaw`
        INSERT INTO "WhatsappMetaIngressReceipt" ("tenantId","workspaceId","scope","eventKey","digest","receivedAt","expiresAt")
        VALUES (NULL,${workspace},${scope},${hash("null-tenant")},${digest},${received},${expiry})`);
      assert.equal(await count(), 1);
      const constraints = await control.$queryRaw<Array<{ name: string }>>`
        SELECT conname AS name FROM pg_constraint WHERE conrelid = '"WhatsappMetaIngressReceipt"'::regclass`;
      assert.equal(constraints.length, 4);
      console.log("META_PG_CONSTRAINTS", JSON.stringify(constraints.map(c => c.name).sort()));
    });

    await t.test("03 real adapter ACK follows committed technical persistence visible to another connection", async () => {
      await clean(); const ingress = makeAdapter(a);
      const result = await ingress.send("wamid.SYNTHETIC_COMMIT");
      assert.equal(result.status, 200); assert.equal(result.accepted, 1); assert.equal(result.sideEffects, 0);
      assert.equal(ingress.processed(), 1); assert.equal(await count(), 1);
    });
    await t.test("04 duplicate event ID is ACKed without reprocessing", async () => {
      await clean(); const ingress = makeAdapter(a);
      const first = await ingress.send("wamid.SYNTHETIC_DUPLICATE");
      const duplicate = await ingress.send("wamid.SYNTHETIC_DUPLICATE");
      assert.equal(first.status, 200); assert.equal(first.accepted, 1);
      assert.equal(duplicate.status, 200); assert.equal(duplicate.duplicates, 1); assert.equal(duplicate.accepted, 0);
      assert.equal(ingress.processed(), 1); assert.equal(await count(), 1);
    });
    await t.test("05 conflicting digest for the same identity rolls back and preserves the original", async () => {
      await clean(); const entry = item("collision"); await store(a).transact([entry], () => {});
      await assert.rejects(store(b).transact([{ ...entry, digest: hash("different") }], () => {}), /META_EVENT_COLLISION/);
      const rows = await control.$queryRaw<Array<{ digest: string }>>`SELECT "digest" FROM "WhatsappMetaIngressReceipt"`;
      assert.equal(rows.length, 1); assert.equal(rows[0].digest, entry.digest);
    });

    await t.test("06 independent connections race safely and a blocked ACK waits for the real row-lock transaction", async () => {
      await clean(); const pidA = await pid(a), pidB = await pid(b); assert.notEqual(pidA, pidB);
      const entry = item("concurrent-fresh"); let processed = 0;
      const results = await Promise.all([a, b].map(c => store(c).transact([entry], indices => { processed += indices.length; })));
      assert.equal(results.reduce((n, r) => n + r.fresh.length, 0), 1);
      assert.equal(results.reduce((n, r) => n + r.duplicates.length, 0), 1);
      assert.equal(processed, 1); assert.equal(await count(), 1);
      await clean();
      const id = "wamid.SYNTHETIC_LOCKED_ACK";
      // Persist one event first, then retain a real row lock from a separate transaction.
      const fixedNow = Math.floor(Date.now() / 1000);
      const raw = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: waba,
        changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phone },
          messages: [{ id, from: sender, timestamp: String(fixedNow), type: "text", text: { body: content } }],
        } }] }] }));
      const key = metaLabPseudonym(identityKey, "event", ["meta", "whatsapp", waba, phone, tenant, workspace, scope, id]);
      const digest = metaLabPseudonym(identityKey, "digest", [sender, String(fixedNow), "text", content]);
      await store(a).transact([item(id, { key, digest })], () => {});
      let release = () => {}, ready = () => {};
      const released = new Promise<void>(resolve => { release = resolve; });
      const locked = new Promise<void>(resolve => { ready = resolve; });
      const holder = a.$transaction(async tx => {
        await tx.$queryRaw`SELECT "eventKey" FROM "WhatsappMetaIngressReceipt" WHERE "eventKey"=${key} FOR UPDATE`;
        ready(); await released;
      }, { timeout: 10000 });
      await locked;
      let ack = false;
      const fromHash = metaLabPseudonym(identityKey, "sender", [waba, phone, sender]);
      const adapter = createMetaOperationalAdapter({ mode: "operational", appSecret, verifyToken, identityKey,
        limits: { payloadBytes: 16384, events: 20, retentionMs }, replayWindowMs: 300000, futureSkewMs: 30000,
        now: Date.now, store: store(b), observe: () => {}, bindings: [{ wabaId: waba, phoneNumberId: phone,
          bindingsJson: JSON.stringify({ [fromHash]: { tenantId: tenant, workspaceId: workspace, scope,
            allowedScopes: [scope], entitlements: ["channel.whatsapp.inbound.read_only"], sessionExpiresAt: "2099-01-01T00:00:00Z" } }) }],
      });
      const pending = adapter.inbound(raw, `sha256=${crypto.createHmac("sha256", appSecret).update(raw).digest("hex")}`)
        .then(result => { ack = true; return result; });
      let observed: { pid: number; wait: string; blockers: number[] } | undefined;
      try {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const waits = await control.$queryRaw<Array<{ pid: number; wait: string; blockers: number[] }>>`
            SELECT pid, wait_event_type AS wait, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
            WHERE datname=current_database() AND pid=${pidB} AND wait_event_type='Lock'`;
          if (waits.length) { observed = waits[0]; break; }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(observed, "PostgreSQL must report the real lock wait");
        assert.ok(observed.blockers.includes(pidA)); assert.equal(ack, false);
      } finally { release(); await holder; }
      const result = await pending;
      assert.equal(result.status, 200); assert.equal(result.duplicates, 1); assert.equal(result.accepted, 0);
      console.log("META_PG_CONCURRENCY", JSON.stringify({ pidA, pidB, fresh: 1, duplicate: 1, processed, observed, ackWhileLocked: false }));
    });

    await t.test("07 callback rejection rolls back the complete real batch", async () => {
      await clean();
      await assert.rejects(store(a).transact([item("rollback-A"), item("rollback-B")], () => {
        throw new Error("SYNTHETIC_CALLBACK_REJECTION");
      }), /SYNTHETIC_CALLBACK_REJECTION/);
      assert.equal(await count(), 0);
    });
    await t.test("08 a real PostgreSQL read-only transaction failure never produces a positive ACK", async () => {
      await clean(); const readOnly = client(true);
      const settings = await readOnly.$queryRaw<Array<{ transaction_read_only: string }>>`SHOW transaction_read_only`;
      assert.equal(settings[0].transaction_read_only, "on");
      const ingress = makeAdapter(readOnly), result = await ingress.send("wamid.SYNTHETIC_DB_FAILURE");
      assert.equal(result.status, 503); assert.equal(result.accepted, 0); assert.equal(ingress.processed(), 0);
      assert.equal(await count(), 0); await readOnly.$disconnect(); clients.delete(readOnly);
      console.log("META_PG_FAILURE", JSON.stringify({ realSessionReadOnly: true, ackStatus: result.status, persisted: 0 }));
    });
    await t.test("09 committed receipt survives disconnect and a new Prisma/PG connection", async () => {
      await clean(); const writer = client(), entry = item("durable");
      const writerPid = await pid(writer); await store(writer).transact([entry], () => {});
      await writer.$disconnect(); clients.delete(writer);
      const reader = client(), readerPid = await pid(reader); assert.notEqual(writerPid, readerPid);
      let processed = 0;
      assert.deepEqual(await store(reader).transact([entry], indices => { processed += indices.length; }), { fresh: [], duplicates: [0] });
      assert.equal(processed, 0); assert.equal(await count(), 1);
      await reader.$disconnect(); clients.delete(reader);
      console.log("META_PG_RECONNECT", JSON.stringify({ writerPid, readerPid, persisted: 1, duplicate: true }));
    });
    await t.test("10 tenant/workspace partitions remain independent for the same event key", async () => {
      await clean(); const entry = item("same-key");
      await store(a).transact([entry, { ...entry, tenantId: "synthetic-tenant-B" }, { ...entry, workspaceId: "synthetic-workspace-B" }], () => {});
      assert.equal(await count(), 3);
      assert.deepEqual(await store(b).transact([entry], () => {}), { fresh: [], duplicates: [0] });
      const partitions = await control.$queryRaw<Array<{ tenantId: string; workspaceId: string }>>`
        SELECT "tenantId", "workspaceId" FROM "WhatsappMetaIngressReceipt"`;
      assert.equal(new Set(partitions.map(p => JSON.stringify([p.tenantId, p.workspaceId]))).size, 3);
    });
    await t.test("11 persisted records contain only technical metadata, no payload/phone/content/credentials", async () => {
      const columns = await control.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='WhatsappMetaIngressReceipt'`;
      assert.deepEqual(columns.map(c => c.column_name).sort(), ["tenantId","workspaceId","scope","eventKey","digest","receivedAt","expiresAt"].sort());
      const rows = await control.$queryRaw<Array<{ record: unknown }>>`
        SELECT row_to_json(r) AS record FROM "WhatsappMetaIngressReceipt" r`;
      const serialized = JSON.stringify(rows);
      for (const value of [content, sender, appSecret, verifyToken, identityKey, url.password]) assert.ok(!serialized.includes(value));
      const tables = await control.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
      assert.deepEqual(tables.map(row => row.table_name), ["WhatsappMetaIngressReceipt"]);
    });
    await t.test("12 expiry timestamps preserve milliseconds and real purge deletes only expired receipts", async () => {
      await clean(); const clock = Date.now();
      const expired = item("expired", { atMs: clock - retentionMs - 60000 });
      const retained = item("retained", { atMs: clock });
      await store(a).transact([expired, retained], () => {});
      const rows = await control.$queryRaw<Array<{ eventKey: string; receivedAt: Date; expiresAt: Date }>>`
        SELECT "eventKey", "receivedAt", "expiresAt" FROM "WhatsappMetaIngressReceipt"`;
      for (const row of rows) assert.equal(row.expiresAt.getTime() - row.receivedAt.getTime(), retentionMs);
      assert.equal(rows.find(row => row.eventKey === retained.key)?.receivedAt.getTime(), clock);
      assert.equal(await purgeExpiredMetaReceipts(a), 1); assert.equal(await count(), 1);
      const remaining = await control.$queryRaw<Array<{ eventKey: string }>>`SELECT "eventKey" FROM "WhatsappMetaIngressReceipt"`;
      assert.equal(remaining[0].eventKey, retained.key);
      console.log("META_PG_EXPIRY", JSON.stringify({ retentionMs, before: 2, deleted: 1, retained: 1 }));
    });
  } finally {
    await Promise.allSettled([...clients].map(c => c.$disconnect()));
  }
});
