import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import request from "supertest";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import { createMetaWhatsappRouter, META_WHATSAPP_WEBHOOK_PATH as path } from "../routes/whatsappMeta";
import { resolveMetaOperationalConfig } from "../services/whatsappMetaOperationalConfig";
import { createMetaLabAdapter, createMetaOperationalAdapter, metaLabPseudonym, type MetaLabMetric } from "../services/whatsappMetaAdapter";
import { createMetaPostgresStore, purgeExpiredMetaReceipts, type MetaSqlDatabase, type MetaSqlTransaction } from "../services/whatsappMetaPostgresStore";

// All identifiers, content and high-entropy strings below are fictitious test values.
// No .env, infrastructure client, real database or external provider is imported.
const now = Date.parse("2026-11-25T12:00:00Z");
const waba = "000000000001", phone = "000000000002", sender = "000000000000";
const appSecret = "0123456789abcdef0123456789abcdef";
const verifyToken = "abcdef0123456789abcdef0123456789ab";
const identityKey = "fedcba9876543210fedcba9876543210fe";
const scope = "whatsapp:inbound:read_only";
const content = "SYNTHETIC-CONTENT-DO-NOT-STORE";
const senderHash = metaLabPseudonym(identityKey, "sender", [waba, phone, sender]);
function bindings(overrides: Record<string, unknown> = {}) {
  return [{ wabaId: waba, phoneNumberId: phone, senders: { [senderHash]: {
    tenantId: "synthetic-tenant-operational", workspaceId: "synthetic-workspace-operational", scope,
    allowedScopes: [scope], entitlements: ["channel.whatsapp.inbound.read_only"],
    sessionExpiresAt: "2099-01-01T00:00:00Z", ...overrides,
  } } }];
}
function environment(): Record<string, string | undefined> {
  return {
    META_WHATSAPP_ENABLED: "true", META_WHATSAPP_MODE: "operational",
    META_WHATSAPP_POLICY_APPROVAL: "synthetic-policy-reference-not-a-real-approval",
    META_WHATSAPP_EXECUTION_APPROVAL: "synthetic-execution-reference-not-a-real-approval",
    META_WHATSAPP_APP_SECRET: appSecret, META_WHATSAPP_VERIFY_TOKEN: verifyToken,
    META_WHATSAPP_IDENTITY_KEY: identityKey, META_WHATSAPP_BINDINGS_JSON: JSON.stringify(bindings()),
    META_WHATSAPP_REPLAY_WINDOW_MS: "300000", META_WHATSAPP_FUTURE_SKEW_MS: "30000",
    // Test parameters ONLY: no operational ratification of 16KiB/20/14days.
    META_WHATSAPP_MAX_PAYLOAD_BYTES: "16384", META_WHATSAPP_MAX_EVENTS: "20", META_WHATSAPP_RETENTION_MS: "1209600000",
  };
}
function payload(ids = ["wamid.SYNTHETIC_EVENT_A"]) {
  return { object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "000000000000", phone_number_id: phone },
    contacts: [{ profile: { name: "SYNTHETIC CONTACT" }, wa_id: sender }],
    messages: ids.map(id => ({ from: sender, id, timestamp: String(now / 1000), type: "text",
      text: { body: content }, context: { from: sender, id: "wamid.SYNTHETIC_CONTEXT" } })),
  } }] }] };
}
function sign(body: string) { return `sha256=${crypto.createHmac("sha256", appSecret).update(body).digest("hex")}`; }

type Row = { digest: string; scope: string; expiresAt: Date };
class SqlContractDouble implements MetaSqlDatabase {
  rows = new Map<string, Row>();
  calls: Array<{ sql: string; values: unknown[] }> = [];
  commits = 0; rollbacks = 0; transactions = 0;
  failWrite = false; failCommit = false;
  beforeCommit: (() => Promise<void>) | undefined;
  private tail = Promise.resolve();
  async $transaction<T>(work: (tx: MetaSqlTransaction) => Promise<T>, options: {
    isolationLevel: "ReadCommitted"; maxWait: number; timeout: number;
  }): Promise<T> {
    assert.equal(options.isolationLevel, "ReadCommitted");
    let unlock = () => {};
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { unlock = resolve; });
    await previous;
    this.transactions++;
    const snapshot = new Map(this.rows);
    try {
      const tx: MetaSqlTransaction = {
        $executeRaw: async (strings, ...values) => {
          const sql = strings.join("?"); this.calls.push({ sql, values });
          assert.match(sql, /"WhatsappMetaIngressReceipt"/);
          if (this.failWrite) throw new Error("SYNTHETIC storage failure must not escape");
          if (sql.includes("DELETE")) {
            let deleted = 0;
            for (const [key, row] of this.rows) if (row.expiresAt.getTime() <= now) { this.rows.delete(key); deleted++; }
            return deleted;
          }
          assert.match(sql, /ON CONFLICT \("tenantId", "workspaceId", "eventKey"\) DO NOTHING/);
          const [tenant, workspace, storedScope, key, digest, receivedAt, expiresAt] = values;
          assert.equal(storedScope, scope); assert.ok(receivedAt instanceof Date); assert.ok(expiresAt instanceof Date);
          assert.equal(typeof digest, "string");
          const lookup = JSON.stringify([tenant, workspace, key]);
          if (this.rows.has(lookup)) return 0;
          this.rows.set(lookup, { digest: String(digest), scope: String(storedScope), expiresAt });
          return 1;
        },
        $queryRaw: async (strings, ...values) => {
          const sql = strings.join("?"); this.calls.push({ sql, values });
          assert.match(sql, /FOR UPDATE/);
          const row = this.rows.get(JSON.stringify(values));
          return row ? [{ digest: row.digest, scope: row.scope }] : [];
        },
      };
      const result = await work(tx);
      if (this.beforeCommit) await this.beforeCommit();
      if (this.failCommit) throw new Error("SYNTHETIC commit failure must not escape");
      this.commits++;
      return result;
    } catch (error) { this.rows = snapshot; this.rollbacks++; throw error; }
    finally { unlock(); }
  }
}
function fixture(env = environment(), database = new SqlContractDouble()) {
  const metrics: MetaLabMetric[] = [];
  let genericLogger = 0, storeCreations = 0;
  const app = express();
  app.use(path, createMetaWhatsappRouter({ environment: () => env, now: () => now,
    store: config => { storeCreations++; return createMetaPostgresStore(() => database, config.limits.retentionMs); },
    observe: metric => metrics.push(metric),
  }));
  app.use((_req, _res, next) => { genericLogger++; next(); });
  app.use(express.json());
  app.post("/unrelated", (req, res) => { res.json(req.body); });
  const post = (body = JSON.stringify(payload()), signature = sign(body)) => request(app).post(path)
    .set("Content-Type", "application/json").set("x-hub-signature-256", signature).send(body);
  return { app, env, database, metrics, post, genericLogger: () => genericLogger, storeCreations: () => storeCreations };
}

// Only local HTTP test exchanges are allowed. External sockets/DNS/TLS/fetch are denied.
const originals = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request,
  httpsGet: https.get, lookup: dns.lookup, resolve: dns.resolve,
  promiseLookup: dns.promises.lookup, promiseResolve: dns.promises.resolve,
  tlsConnect: tls.connect, socketConnect: net.Socket.prototype.connect, fetch: globalThis.fetch };
let externalAttempts = 0;
function deny(): never { externalAttempts++; throw new Error("META_OPERATIONAL_TEST_EXTERNAL_NETWORK_FORBIDDEN"); }
function loopbackConnect(this: net.Socket, ...args: unknown[]): net.Socket {
  const first: unknown = args[0];
  // Node normalizes internal connection arguments into [options, callback].
  const options: unknown = Array.isArray(first) ? first[0] : first;
  if (!options || typeof options !== "object" || !("host" in options)
    || !["127.0.0.1", "::1"].includes(String(options.host))) return deny();
  return Reflect.apply(originals.socketConnect, this, args);
}
Object.defineProperty(net.Socket.prototype, "connect", { ...Object.getOwnPropertyDescriptor(net.Socket.prototype, "connect"), value: loopbackConnect });
https.request = deny; https.get = deny; tls.connect = deny;
const deniedDns = Object.assign(deny, { __promisify__: async () => deny() });
dns.lookup = deniedDns; dns.resolve = deniedDns; dns.promises.lookup = deny; dns.promises.resolve = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
after(() => {
  assert.equal(externalAttempts, 0, "No external network attempt is allowed by the tested delta");
  net.Socket.prototype.connect = originals.socketConnect;
  https.request = originals.httpsRequest; https.get = originals.httpsGet; tls.connect = originals.tlsConnect;
  dns.lookup = originals.lookup; dns.resolve = originals.resolve;
  dns.promises.lookup = originals.promiseLookup; dns.promises.resolve = originals.promiseResolve;
  globalThis.fetch = originals.fetch; syncBuiltinESMExports();
});

test("flag defaults off, rejects noncanonical values, performs no persistence and bypasses URL logger", async () => {
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    const env = environment(); env.META_WHATSAPP_ENABLED = flag;
    const f = fixture(env);
    assert.equal((await f.post()).status, 404);
    assert.equal((await request(f.app).get(path).query({ "hub.verify_token": verifyToken })).status, 404);
    assert.equal(f.storeCreations(), 0); assert.equal(f.database.transactions, 0); assert.equal(f.genericLogger(), 0);
  }
});
test("incomplete config, missing approvals, duplicate bindings and laboratory credentials fail closed", async () => {
  const required = Object.keys(environment()).filter(key => key !== "META_WHATSAPP_ENABLED");
  for (const missing of required) {
    const env = environment(); delete env[missing]; const f = fixture(env);
    assert.equal((await f.post()).status, 503, missing); assert.equal(f.database.transactions, 0);
  }
  for (const field of ["META_WHATSAPP_APP_SECRET", "META_WHATSAPP_VERIFY_TOKEN", "META_WHATSAPP_IDENTITY_KEY"]) {
    const env = environment(); env[field] = "synthetic-meta-laboratory-credential-1234567890";
    assert.equal(resolveMetaOperationalConfig(env).state, "invalid");
  }
  const env = environment(); env.META_WHATSAPP_BINDINGS_JSON = JSON.stringify([...bindings(), ...bindings()]);
  assert.equal(resolveMetaOperationalConfig(env).state, "invalid");
  env.META_WHATSAPP_BINDINGS_JSON = JSON.stringify(bindings({ sessionExpiresAt: "invalid" }));
  assert.equal(resolveMetaOperationalConfig(env).state, "invalid");
});
test("operational limits are explicit and retention covers the full replay window", () => {
  for (const [field, value] of [["META_WHATSAPP_MAX_PAYLOAD_BYTES", "0"], ["META_WHATSAPP_MAX_EVENTS", "1.5"],
    ["META_WHATSAPP_RETENTION_MS", "300000"], ["META_WHATSAPP_FUTURE_SKEW_MS", "-1"]]) {
    const env = environment(); env[field] = value; assert.equal(resolveMetaOperationalConfig(env).state, "invalid");
  }
});
test("GET challenge is opaque, bounded, authenticated and never reaches the generic logger", async () => {
  const f = fixture();
  const query = { "hub.mode": "subscribe", "hub.verify_token": verifyToken, "hub.challenge": "123456789" };
  const response = await request(f.app).get(path).query(query);
  assert.equal(response.status, 200); assert.equal(response.text, "123456789");
  assert.match(response.headers["content-type"], /text\/plain/);
  assert.equal((await request(f.app).get(path).query({ ...query, "hub.verify_token": "wrong" })).status, 403);
  assert.equal((await request(f.app).get(path).query({ ...query, "hub.challenge": "x".repeat(257) })).status, 403);
  assert.equal(f.genericLogger(), 0); assert.equal(f.database.transactions, 0);
});
test("raw bytes are signed before global JSON parsing; whitespace is significant", async () => {
  const f = fixture(); const raw = JSON.stringify(payload(), null, 2);
  assert.equal((await f.post(raw)).status, 200); assert.equal(f.database.commits, 1);
  assert.equal((await f.post(raw, sign(JSON.stringify(payload())))).status, 401);
  assert.equal((await f.post(raw, "sha256=bad")).status, 401);
  assert.equal(f.genericLogger(), 0);
  assert.deepEqual((await request(f.app).post("/unrelated").send({ preserved: true })).body, { preserved: true });
});
test("missing signature, malformed JSON, unsupported content/compression/methods and oversize fail closed", async () => {
  const f = fixture();
  assert.equal((await request(f.app).post(path).send(payload())).status, 401);
  assert.equal((await f.post("{" )).status, 400);
  assert.equal((await request(f.app).post(path).type("text").send("synthetic")).status, 415);
  assert.equal((await request(f.app).post(path).type("json").set("Content-Encoding", "gzip").send("synthetic")).status, 415);
  assert.equal((await request(f.app).put(path)).status, 405);
  assert.equal((await request(f.app).get(`${path}/unexpected`).query({ token: verifyToken })).status, 404);
  assert.equal((await f.post("x".repeat(16385))).status, 413);
  assert.equal(f.database.transactions, 0); assert.equal(f.genericLogger(), 0);
});
test("native contacts/context metadata are discarded; interactive replies reuse the same ingress", async () => {
  const f = fixture(); const p = payload();
  const value = p.entry[0].changes[0].value;
  const interactive = { ...value, messages: [{ id: "wamid.SYNTHETIC_BUTTON", from: sender, timestamp: String(now / 1000),
    type: "interactive", interactive: { type: "button_reply", button_reply: { id: "SYNTHETIC_REPLY", title: "SYNTHETIC" } } }] };
  const raw = JSON.stringify({ ...p, entry: [{ id: waba, changes: [{ field: "messages", value: interactive }] }] });
  assert.equal((await f.post()).status, 200); assert.equal((await f.post(raw)).status, 200);
  const exported = JSON.stringify({ metrics: f.metrics, rows: [...f.database.rows], calls: f.database.calls });
  for (const sensitive of [content, "SYNTHETIC CONTACT", "SYNTHETIC_REPLY", "wamid.SYNTHETIC", sender,
    appSecret, verifyToken, identityKey, "display_phone_number", "contacts"]) assert.ok(!exported.includes(sensitive), sensitive);
});
test("unsupported status-only/media envelopes, empty batches, excess events and malformed shapes are not ACKed", async () => {
  const f = fixture();
  for (const bad of [{ object: "other" }, payload([]), payload(Array.from({ length: 21 }, (_, i) => `wamid.SYNTHETIC_${i}`)),
    { object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: phone }, statuses: [{ id: "wamid.SYNTHETIC" }],
    } }] }] }]) assert.notEqual((await f.post(JSON.stringify(bad))).status, 200);
  const media = payload(); media.entry[0].changes[0].value.messages[0].type = "image";
  assert.equal((await f.post(JSON.stringify(media))).status, 400); assert.equal(f.database.transactions, 0);
});
test("binding enforces WABA, phone, sender, tenant, workspace, scope, entitlement and session expiry", async () => {
  for (const override of [{ tenantId: "" }, { workspaceId: "" }, { scope: "write" }, { entitlements: [] },
    { allowedScopes: [] }, { sessionExpiresAt: "2020-01-01T00:00:00Z" }]) {
    const env = environment(); env.META_WHATSAPP_BINDINGS_JSON = JSON.stringify(bindings(override));
    const f = fixture(env); assert.notEqual((await f.post()).status, 200); assert.equal(f.database.transactions, 0);
  }
  for (const change of ["waba", "phone", "sender"]) {
    const f = fixture(); const p = payload();
    if (change === "waba") p.entry[0].id = "000000000099";
    if (change === "phone") p.entry[0].changes[0].value.metadata.phone_number_id = "000000000099";
    if (change === "sender") p.entry[0].changes[0].value.messages[0].from = "000000000099";
    assert.equal((await f.post(JSON.stringify(p))).status, 403); assert.equal(f.database.transactions, 0);
  }
});
test("replay timestamps reject stale/future events before persistence", async () => {
  for (const skew of [-301, 31]) {
    const f = fixture(); const p = payload(); p.entry[0].changes[0].value.messages[0].timestamp = String(now / 1000 + skew);
    assert.equal((await f.post(JSON.stringify(p))).status, 401); assert.equal(f.database.transactions, 0);
  }
});
test("duplicates within batch, reformatted retries, concurrency and new store instances are idempotent in SQL contract double", async () => {
  const f = fixture();
  const concurrent = await Promise.all([f.post(), f.post(), f.post(JSON.stringify(payload(), null, 2))]);
  assert.ok(concurrent.every(r => r.status === 200)); assert.equal(f.database.rows.size, 1);
  assert.equal(f.metrics.filter(m => m.metric === "processing").length, 1);
  assert.equal((await f.post(JSON.stringify(payload(["wamid.SYNTHETIC_B", "wamid.SYNTHETIC_B"])))).status, 200);
  const restarted = fixture(environment(), f.database); assert.equal((await restarted.post()).status, 200);
  assert.equal(restarted.metrics.filter(m => m.metric === "processing").length, 0);
  assert.equal(f.database.rows.size, 2);
});
test("changed content or changed type for the same event ID rolls back without an ACK", async () => {
  const f = fixture(); assert.equal((await f.post()).status, 200);
  const p = payload(); p.entry[0].changes[0].value.messages[0].text.body = "DIFFERENT-SYNTHETIC";
  assert.equal((await f.post(JSON.stringify(p))).status, 409); assert.equal(f.database.rows.size, 1);
  const v = payload().entry[0].changes[0].value;
  const changedType = { ...v, messages: [{ from: sender, id: "wamid.SYNTHETIC_EVENT_A", timestamp: String(now / 1000),
    type: "interactive", interactive: { type: "button_reply", button_reply: { id: "SYNTHETIC", title: "SYNTHETIC" } } }] };
  assert.equal((await f.post(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: waba,
    changes: [{ field: "messages", value: changedType }] }] }))).status, 409);
  assert.equal(f.database.rows.size, 1);
});
test("successful ACK waits for commit; write and commit errors return sanitized retryable failure", async () => {
  const f = fixture(); let release = () => {}; let entered = () => {};
  const committed = new Promise<void>(resolve => { release = resolve; });
  const transactionEntered = new Promise<void>(resolve => { entered = resolve; });
  f.database.beforeCommit = () => { entered(); return committed; };
  let finished = false;
  const response = f.post().then(r => { finished = true; return r; });
  await transactionEntered; assert.equal(finished, false); assert.equal(f.database.commits, 0);
  release(); assert.equal((await response).status, 200); assert.equal(f.database.commits, 1);
  for (const failure of ["write", "commit"]) {
    const broken = fixture(); broken.database.failWrite = failure === "write"; broken.database.failCommit = failure === "commit";
    const result = await broken.post(); assert.equal(result.status, 503); assert.deepEqual(result.body, { ok: false });
    assert.equal(broken.database.rows.size, 0); assert.equal(broken.database.rollbacks, 1);
  }
});
test("callback failure rolls back the entire technical batch and observer failure never leaks details", async () => {
  const db = new SqlContractDouble(); const config = resolveMetaOperationalConfig(environment());
  assert.equal(config.state, "configured"); if (config.state !== "configured") throw new Error("fixture config");
  const adapter = createMetaOperationalAdapter({ ...config.config, now: () => now,
    store: createMetaPostgresStore(() => db, config.config.limits.retentionMs),
    observe: metric => { if (metric.metric === "processing") throw new Error(content); },
  });
  const raw = JSON.stringify(payload(["wamid.SYNTHETIC_A", "wamid.SYNTHETIC_B"]));
  const result = await adapter.inbound(Buffer.from(raw), sign(raw));
  assert.equal(result.status, 503); assert.equal(db.rows.size, 0); assert.equal(db.rollbacks, 1);
  assert.ok(!JSON.stringify(result).includes(content));
});
test("scope/tenant/workspace are SQL-bound and malformed store inputs are rejected before DB access", async () => {
  const db = new SqlContractDouble(); const store = createMetaPostgresStore(() => db, 1209600000);
  const item = { key: "a".repeat(64), digest: "b".repeat(64), atMs: now,
    tenantId: "synthetic-A", workspaceId: "synthetic-A", scope };
  await store.transact([item], () => {});
  await store.transact([{ ...item, tenantId: "synthetic-B" }, { ...item, workspaceId: "synthetic-B" }], () => {});
  assert.equal(db.rows.size, 3);
  const calls = db.transactions;
  await assert.rejects(store.transact([{ ...item, tenantId: undefined }], () => {}), /META_STORE_INPUT_INVALID/);
  assert.equal(db.transactions, calls);
});
test("explicit expiry maintenance touches only the technical table; no automatic domain cleanup", async () => {
  const db = new SqlContractDouble(); db.rows.set("expired", { digest: "a".repeat(64), scope, expiresAt: new Date(now - 1) });
  db.rows.set("retained", { digest: "b".repeat(64), scope, expiresAt: new Date(now + 1) });
  assert.equal(await purgeExpiredMetaReceipts(db), 1); assert.equal(db.rows.size, 1);
});
test("disable/rollback closes GET and POST immediately and preserves the ledger", async () => {
  const f = fixture(); assert.equal((await f.post()).status, 200);
  f.env.META_WHATSAPP_ENABLED = "false";
  const calls = f.database.transactions;
  assert.equal((await f.post()).status, 404);
  assert.equal((await request(f.app).get(path)).status, 404);
  assert.equal(f.database.transactions, calls); assert.equal(f.database.rows.size, 1);
});
test("laboratory factory retains credential/binding restrictions; operational mode rejects synthetic envelope IDs", async () => {
  const config = resolveMetaOperationalConfig(environment());
  if (config.state !== "configured") throw new Error("fixture config");
  const db = new SqlContractDouble();
  assert.throws(() => createMetaLabAdapter({ ...config.config, mode: "synthetic-lab",
    store: createMetaPostgresStore(() => db, 1209600000), observe: () => {}, now: () => now }), /Synthetic lab/);
  const f = fixture(); const p = payload(); p.entry[0].id = "synthetic-waba-A";
  assert.equal((await f.post(JSON.stringify(p))).status, 400); assert.equal(f.database.transactions, 0);
});
test("bootstrap mounts native ingress before generic logging/JSON, keeps legacy ingress and changes no default env", () => {
  const source = fs.readFileSync("apps/api/src/index.ts", "utf8");
  const mount = source.indexOf("app.use(META_WHATSAPP_WEBHOOK_PATH");
  assert.ok(mount > 0 && mount < source.indexOf("app.use(requestLogger)") && mount < source.indexOf("app.use(express.json"));
  assert.ok(source.includes('app.use("/api", whatsappRouter)'));
  assert.ok(!source.includes("META_WHATSAPP_ENABLED ="));
  const migration = fs.readFileSync("packages/db/prisma/migrations/20261125180000_whatsapp_meta_ingress_receipt/migration.sql", "utf8");
  assert.match(migration, /PRIMARY KEY \("tenantId", "workspaceId", "eventKey"\)/);
  assert.match(migration, /scope_check/); assert.match(migration, /expiry_check/);
  assert.ok(!/REFERENCES|ALTER TABLE|DROP TABLE/i.test(migration));
});
