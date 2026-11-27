import "./support/whatsappMetaHarness";
import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setImmediate as nextTurn } from "node:timers/promises";
import {
  createMetaLabAdapter, metaLabPseudonym, META_LAB_LIMITS,
  type MetaLabOptions, type MetaLabStore,
} from "../services/whatsappMetaAdapter";
import { metaLabNetworkAttempts } from "./support/whatsappMetaHarness";
import { META_FIXTURE, metaPayload, signMetaBytes, metaAdapterFixture, metaBindings } from "./support/whatsappMetaFixtures";
import { openMetaLabFileStore } from "./support/whatsappMetaFileStore";

function laboratory(t: TestContext, faults: Parameters<typeof openMetaLabFileStore>[1] = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eiah-meta-lab-"));
  const stores: ReturnType<typeof openMetaLabFileStore>[] = [];
  const open = (f = {}) => {
    const store = openMetaLabFileStore(directory, f);
    stores.push(store); return store;
  };
  t.after(async () => {
    for (const store of stores) await store.close();
    fs.rmSync(directory, { recursive: true });
  });
  const store = open(faults);
  return { directory, store, open, journal: () => fs.existsSync(path.join(directory, "events.json"))
    ? fs.readFileSync(path.join(directory, "events.json"), "utf8") : "" };
}
const bytes = (payload: unknown = metaPayload()) => Buffer.from(JSON.stringify(payload));
const send = (adapter: ReturnType<typeof createMetaLabAdapter>, payload: unknown = metaPayload()) => {
  const raw = bytes(payload); return adapter.inbound(raw, signMetaBytes(raw));
};
const firstMessage = (payload: ReturnType<typeof metaPayload>) => payload.entry[0].changes[0].value.messages[0];

test("Meta lab handshake verifies mode, token and synthetic challenge without a server", t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  assert.deepEqual(adapter.handshake({ "hub.mode": "subscribe", "hub.verify_token": META_FIXTURE.verifyToken,
    "hub.challenge": "synthetic-challenge-A" }), { status: 200, challenge: "synthetic-challenge-A" });
  for (const q of [{}, { "hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "synthetic-A" },
    { "hub.mode": "other", "hub.verify_token": META_FIXTURE.verifyToken, "hub.challenge": "synthetic-A" },
    { "hub.mode": "subscribe", "hub.verify_token": META_FIXTURE.verifyToken, "hub.challenge": "real-value" }]) {
    assert.equal(adapter.handshake(q).status, 403);
  }
});

test("Meta lab accepts authenticated synthetic ingress and preserves the internal bundle contract", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const r = await send(adapter);
  assert.equal(r.status, 200); assert.equal(r.accepted, 1); assert.equal(r.duplicates, 0);
  assert.equal(r.events[0].version, "whatsapp.read_only.bundle_export.v1");
  assert.equal(r.events[0].status, 202); assert.equal(r.events[0].decision, "accepted_read_only");
  assert.equal(r.events[0].scope, "whatsapp:inbound:read_only");
  assert.equal(r.events[0].tenantId, "synthetic-tenant-A");
  assert.equal(r.events[0].workspaceId, "synthetic-workspace-A");
  assert.equal(r.events[0].sideEffects, 0); assert.equal(r.events[0].piiMasked, true);
  assert.equal(r.sideEffects, 0); assert.equal(r.providerExternalCall, 0);
  assert.equal(JSON.parse(lab.journal()).length, 1);
  assert(observations.metrics.some(m => m.metric === "processing" && m.value === 1));
  assert(observations.metrics.some(m => m.metric === "ack_duration_ms" && m.value >= 0));
});

test("Meta lab signature validation covers raw bytes, strict prefix and exact digest length", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  const raw = bytes();
  for (const signature of [undefined, "", "sha256=00", "v1=" + "00".repeat(32), "sha256=" + "g".repeat(64), "00".repeat(32), "sha256=" + "00".repeat(32)]) {
    assert.equal((await adapter.inbound(raw, signature)).status, 401);
  }
  assert.equal((await adapter.inbound(Buffer.concat([raw, Buffer.from(" ")]), signMetaBytes(raw))).status, 401);
  assert.equal(lab.journal(), "");
});

test("Meta lab rejects malformed JSON, non-UTF8, schema drift and non-synthetic identities", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  for (const raw of [Buffer.from("{"), Buffer.from([0xff]), bytes(null), bytes([]), bytes({ object: "other" }),
    bytes({ ...metaPayload(), tenantId: "synthetic-forged-tenant" })]) {
    assert.equal((await adapter.inbound(raw, signMetaBytes(raw))).status, 400);
  }
  const realIdentity = metaPayload(); realIdentity.entry[0].id = "123456789";
  assert.equal((await send(adapter, realIdentity)).status, 400);
  const unsupported = metaPayload(); firstMessage(unsupported).type = "image";
  assert.equal((await send(adapter, unsupported)).status, 400);
  assert.equal(lab.journal(), "");
});

test("Meta lab enforces the raw 16 KiB boundary before JSON parsing", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  const raw = bytes();
  const exact = Buffer.concat([raw, Buffer.alloc(META_LAB_LIMITS.payloadBytes - raw.length, " ")]);
  assert.equal((await adapter.inbound(exact, signMetaBytes(exact))).status, 200);
  const excess = Buffer.concat([exact, Buffer.from(" ")]);
  assert.equal((await adapter.inbound(excess, signMetaBytes(excess))).status, 413);
});

test("Meta lab admits twenty events and rejects an oversized aggregate batch", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  const p = metaPayload(Array.from({ length: 20 }, (_, i) => `synthetic-event-${i}`));
  const r = await send(adapter, p);
  assert.equal(r.status, 200); assert.equal(r.accepted, 20);
  const over = metaPayload();
  over.entry.push(...Array.from({ length: 20 }, (_, i) => metaPayload([`synthetic-excess-${i}`]).entry[0]));
  assert.notEqual((await send(adapter, over)).status, 200);
  const across = metaPayload(Array.from({ length: 11 }, (_, i) => `synthetic-batch-A-${i}`));
  across.entry.push(metaPayload(Array.from({ length: 10 }, (_, i) => `synthetic-batch-B-${i}`)).entry[0]);
  assert.equal((await send(adapter, across)).status, 413);
  assert.equal(JSON.parse(lab.journal()).length, 20);
});

test("Meta lab validates interactive replies without interpreting their meaning", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  for (const type of ["button_reply", "list_reply"]) {
    const payload = metaPayload([`synthetic-${type}`]);
    const m = firstMessage(payload) as Record<string, unknown>;
    m.type = "interactive"; delete m.text;
    m.interactive = { type, [type]: { id: "synthetic-choice-A", title: "Synthetic choice" } };
    const r = await send(adapter, payload);
    assert.equal(r.status, 200); assert.equal(r.events[0].messageType, "interactive");
  }
});

test("Meta lab fails closed on missing channel, sender, tenant, workspace, scope and entitlement", async t => {
  const lab = laboratory(t);
  const cases: Partial<MetaLabOptions>[] = [
    { bindings: [] },
    ...[{ tenantId: null }, { workspaceId: null }, { scope: null }, { entitlements: [] },
      { allowedScopes: [] }, { sessionExpiresAt: "2000-01-01T00:00:00Z" }, { tenantId: "not-a-synthetic-tenant" }]
      .map(overrides => ({ bindings: metaBindings(overrides) })),
  ];
  for (const overrides of cases) {
    const { adapter } = metaAdapterFixture(lab.store, overrides);
    assert.equal((await send(adapter)).status, 403);
  }
  const { adapter } = metaAdapterFixture(lab.store);
  for (const kind of ["waba", "phone", "sender"]) {
    const p = metaPayload();
    if (kind === "waba") p.entry[0].id = "synthetic-unbound-waba";
    if (kind === "phone") p.entry[0].changes[0].value.metadata.phone_number_id = "synthetic-unbound-phone";
    if (kind === "sender") firstMessage(p).from = "synthetic-unbound-sender";
    assert.equal((await send(adapter, p)).status, 403);
  }
  assert.equal(lab.journal(), "");
});

test("Meta lab blocks explicit mutation fields while treating message text only as data", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  for (const extra of [{ action: "lead.create" }, { readOnly: false }, { operation: "delete" }, { scope: "admin" }]) {
    assert.equal((await send(adapter, { ...metaPayload(), ...extra })).status, 400);
  }
  const p = metaPayload(); firstMessage(p).text.body = "lead.create";
  const r = await send(adapter, p);
  assert.equal(r.status, 200); assert(!JSON.stringify(r).includes("lead.create"));
  assert.equal(r.sideEffects, 0);
});

test("Meta lab applies signed event timestamp boundaries without inventing delivery headers", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  for (const [offset, status] of [[-301_000, 401], [31_000, 401], [-300_000, 200], [30_000, 200]]) {
    const p = metaPayload([`synthetic-time-${offset < 0 ? "old" : "future"}-${Math.abs(offset)}`]);
    firstMessage(p).timestamp = String((META_FIXTURE.now + offset) / 1000);
    assert.equal((await send(adapter, p)).status, status);
  }
  for (const timestamp of ["", "NaN", "tomorrow"]) {
    const p = metaPayload(); firstMessage(p).timestamp = timestamp;
    assert.equal((await send(adapter, p)).status, 400);
  }
});

test("Meta lab duplicate delivery and reformatted JSON do not repeat processing", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  assert.equal((await send(adapter)).accepted, 1);
  const duplicate = await send(adapter);
  assert.equal(duplicate.status, 200); assert.equal(duplicate.accepted, 0); assert.equal(duplicate.duplicates, 1);
  const formatted = Buffer.from(JSON.stringify(metaPayload(), null, 1));
  assert.equal((await adapter.inbound(formatted, signMetaBytes(formatted))).duplicates, 1);
  const later = metaAdapterFixture(lab.store, { now: () => META_FIXTURE.now + 1000 });
  assert.equal((await send(later.adapter)).duplicates, 1);
  const revoked = metaAdapterFixture(lab.store, { bindings: metaBindings({ entitlements: [] }) });
  assert.equal((await send(revoked.adapter)).status, 403);
  assert.equal(observations.metrics.filter(m => m.metric === "processing").length, 1);
  assert.equal(JSON.parse(lab.journal()).length, 1);
});

test("Meta lab classifies a repeated member within one batch without a second processing", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const r = await send(adapter, metaPayload(["synthetic-repeated-member", "synthetic-repeated-member"]));
  assert.equal(r.status, 200); assert.equal(r.accepted, 1); assert.equal(r.duplicates, 1);
  assert.equal(observations.metrics.filter(m => m.metric === "processing").length, 1);
  assert.equal(JSON.parse(lab.journal()).length, 1);
});

test("Meta lab detects event identity collisions and commits no partial batch", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const p = metaPayload(["synthetic-event-collision", "synthetic-event-collision"]);
  p.entry[0].changes[0].value.messages[1].text.body = "SYNTHETIC-DIFFERENT-CONTENT";
  assert.equal((await send(adapter, p)).status, 409);
  assert.equal(lab.journal(), "");
  assert.equal(observations.metrics.filter(m => m.metric === "processing").length, 0);
  assert.equal((await send(adapter)).status, 200);
  const changed = metaPayload(); firstMessage(changed).text.body += " altered";
  assert.equal((await send(adapter, changed)).status, 409);
  assert.equal(JSON.parse(lab.journal()).length, 1);
});

test("Meta lab validates every batch member before processing authorized entries", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const p = metaPayload(["synthetic-batch-allowed", "synthetic-batch-denied"]);
  p.entry[0].changes[0].value.messages[1].from = "synthetic-unbound-sender";
  assert.equal((await send(adapter, p)).status, 403);
  assert.equal(lab.journal(), "");
  assert.equal(observations.metrics.filter(m => m.metric === "processing").length, 0);
});

test("Meta lab namespaces the same native event across independent authorized channels", async t => {
  const lab = laboratory(t);
  const bindingB = metaBindings()[0];
  bindingB.phoneNumberId = "synthetic-phone-B";
  const hashB = metaLabPseudonym(META_FIXTURE.identityKey, "sender", [META_FIXTURE.waba, bindingB.phoneNumberId, META_FIXTURE.sender]);
  const authorityB = Object.values(JSON.parse(bindingB.bindingsJson))[0] as Record<string, unknown>;
  bindingB.bindingsJson = JSON.stringify({ [hashB]: { ...authorityB, tenantId: "synthetic-tenant-B", workspaceId: "synthetic-workspace-B" } });
  const { adapter } = metaAdapterFixture(lab.store, { bindings: [...metaBindings(), bindingB] });
  const a = await send(adapter);
  const p = metaPayload(); p.entry[0].changes[0].value.metadata.phone_number_id = bindingB.phoneNumberId;
  const b = await send(adapter, p);
  assert.equal(a.accepted, 1); assert.equal(b.accepted, 1);
  assert.notEqual(a.events[0].eventId, b.events[0].eventId);
  assert.equal(b.events[0].tenantId, "synthetic-tenant-B");
  assert.equal(a.events[0].tenantId, "synthetic-tenant-A");
});

test("Meta lab serializes concurrent duplicate delivery with one committed acceptance", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const rs = await Promise.all(Array.from({ length: 8 }, () => send(adapter)));
  assert(rs.every(r => r.status === 200));
  assert.equal(rs.reduce((n, r) => n + r.accepted, 0), 1);
  assert.equal(rs.reduce((n, r) => n + r.duplicates, 0), 7);
  assert.equal(observations.metrics.filter(m => m.metric === "processing").length, 1);
});

test("Meta lab ACK waits for durable transaction completion", async t => {
  const lab = laboratory(t);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const delayed: MetaLabStore = { async transact(items, processFresh) {
    await barrier; return lab.store.transact(items, processFresh);
  } };
  const { adapter } = metaAdapterFixture(delayed);
  let settled = false;
  const pending = send(adapter).then(r => { settled = true; return r; });
  await nextTurn(); assert.equal(settled, false); assert.equal(lab.journal(), "");
  release(); assert.equal((await pending).status, 200); assert.notEqual(lab.journal(), "");
});

test("Meta lab storage failure never produces ACK or leaks raw exception details", async t => {
  const lab = laboratory(t, { beforeWrite: () => { throw new Error(META_FIXTURE.appSecret); } });
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const r = await send(adapter);
  assert.equal(r.status, 503); assert.equal(r.accepted, 0); assert.deepEqual(r.events, []);
  assert(!JSON.stringify([r, observations.metrics]).includes(META_FIXTURE.appSecret));
  assert.equal(lab.journal(), "");
});

test("Meta lab retry after lost ACK recovers a durable acceptance without reprocessing", async t => {
  const lab = laboratory(t, { afterSync: () => { throw new Error("synthetic-interruption"); } });
  const first = metaAdapterFixture(lab.store);
  assert.equal((await send(first.adapter)).status, 503);
  assert.notEqual(lab.journal(), "");
  await lab.store.close();
  const second = metaAdapterFixture(lab.open());
  const r = await send(second.adapter);
  assert.equal(r.status, 200); assert.equal(r.duplicates, 1); assert.equal(r.accepted, 0);
  assert.equal(second.observations.metrics.filter(m => m.metric === "processing").length, 0);
});

test("Meta lab persists acceptance across an actual separate Node process", async t => {
  const lab = laboratory(t);
  const { adapter } = metaAdapterFixture(lab.store);
  assert.equal((await send(adapter)).accepted, 1);
  await lab.store.close();
  const script = `
    import { openMetaLabFileStore } from './apps/api/src/tests/support/whatsappMetaFileStore.ts';
    import { metaAdapterFixture, metaPayload, signMetaBytes } from './apps/api/src/tests/support/whatsappMetaFixtures.ts';
    const store = openMetaLabFileStore(process.argv[1]);
    try {
      const { adapter } = metaAdapterFixture(store);
      const raw = Buffer.from(JSON.stringify(metaPayload()));
      const r = await adapter.inbound(raw, signMetaBytes(raw));
      console.log(JSON.stringify({status:r.status,accepted:r.accepted,duplicates:r.duplicates}));
    } finally { await store.close(); }
  `;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--import", "./apps/api/src/tests/support/whatsappMetaHarness.ts",
    "--input-type=module", "--eval", script, lab.directory], {
    encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { status: 200, accepted: 0, duplicates: 1 });
});

test("Meta lab rejects another writer, corrupt storage and observation loss", async t => {
  const lab = laboratory(t);
  assert.throws(() => openMetaLabFileStore(lab.directory), /LAB_STORE_LOCKED/);
  const { adapter } = metaAdapterFixture(lab.store, { observe: () => { throw new Error("synthetic-observer-down"); } });
  assert.equal((await send(adapter)).status, 503); assert.equal(lab.journal(), "");
  await lab.store.close();
  fs.writeFileSync(path.join(lab.directory, "events.json"), "corrupt");
  assert.throws(() => openMetaLabFileStore(lab.directory), /LAB_STORE_CORRUPT/);
});

test("Meta lab outputs, metrics and persisted state exclude payload, identities and credentials", async t => {
  const lab = laboratory(t);
  const { adapter, observations } = metaAdapterFixture(lab.store);
  const r = await send(adapter);
  const serialized = JSON.stringify([r, observations.metrics, lab.journal()]);
  for (const forbidden of [META_FIXTURE.content, META_FIXTURE.sender, META_FIXTURE.waba, META_FIXTURE.phone,
    META_FIXTURE.appSecret, META_FIXTURE.verifyToken, META_FIXTURE.identityKey, "synthetic-event-A", "sha256="]) {
    assert(!serialized.includes(forbidden), `Sensitive fixture value exported`);
  }
  for (const record of JSON.parse(lab.journal())) assert.deepEqual(Object.keys(record).sort(), ["atMs", "digest", "key"]);
});

test("Meta lab requires explicit lab credentials and unambiguous fixed channel registry", t => {
  const lab = laboratory(t);
  assert.throws(() => metaAdapterFixture(lab.store, { appSecret: "not-fictitious" }), /Synthetic lab/);
  assert.throws(() => metaAdapterFixture(lab.store, { mode: "production" as "synthetic-lab" }), /Synthetic lab/);
  assert.throws(() => metaAdapterFixture(lab.store, { bindings: [...metaBindings(), ...metaBindings()] }), /Ambiguous/);
});

test("Meta lab dependency closure excludes domain infrastructure, outbound clients and bootstrap", () => {
  const allowed = new Set(["node:crypto", "zod"]);
  const seen = new Set<string>();
  function inspect(file: string) {
    if (seen.has(file)) return; seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    assert(!/\b(?:fetch\s*\(|process\.env|import\s*\(|require\s*\()/m.test(source), file);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) { assert(allowed.has(specifier), specifier); continue; }
      const target = path.resolve(path.dirname(file), specifier + ".ts");
      assert(path.basename(target) !== "index.ts");
      assert(!/prisma|queue|runAtivo|agents|llm/i.test(target));
      inspect(target);
    }
  }
  inspect(path.resolve("apps/api/src/services/whatsappMetaAdapter.ts"));
  assert.equal(metaLabNetworkAttempts(), 0);
});

after(() => {
  assert.equal(metaLabNetworkAttempts(), 0, "No network attempt is allowed in this lab");
});
