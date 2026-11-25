import crypto from "node:crypto";
import { z } from "zod";
import { resolveChannelBinding } from "./channelBinding";
import { buildWhatsappBundleExport, type WhatsappBundleExport } from "./whatsappBundleExport";
import { buildWhatsappEvidenceBundle } from "./whatsappEvidenceBundle";
import {
  evaluateWhatsappReadOnlyIngress, validatePayload,
  WHATSAPP_EVENT_VERSION, WHATSAPP_PROVIDER,
  WHATSAPP_READ_ONLY_SCOPE, WHATSAPP_READ_ONLY_ENTITLEMENT,
} from "./whatsappReadOnlyIngress";

// Pure ingress. Modes are explicit; no environment lookup, router or infrastructure client.
export const META_LAB_LIMITS = Object.freeze({ payloadBytes: 16 * 1024, events: 20 });
const syntheticId = z.string().min(11).max(160).regex(/^synthetic-[A-Za-z0-9_-]+$/);
const interactiveReply = z.object({ id: syntheticId, title: z.string().min(1).max(1024) }).strict();
const messageSchema = z.object({
  id: syntheticId, from: syntheticId, timestamp: z.string().regex(/^\d{1,10}$/),
  type: z.enum(["text", "interactive"]),
  text: z.object({ body: z.string().min(1).max(8192) }).strict().optional(),
  interactive: z.object({
    type: z.enum(["button_reply", "list_reply"]),
    button_reply: interactiveReply.optional(), list_reply: interactiveReply.optional(),
  }).strict().optional(),
}).strict().refine(m => m.type === "text"
  ? Boolean(m.text) && !m.interactive
  : !m.text && Boolean(m.interactive && (m.interactive.type === "button_reply"
    ? m.interactive.button_reply && !m.interactive.list_reply
    : m.interactive.list_reply && !m.interactive.button_reply)));
const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: syntheticId,
    changes: z.array(z.object({
      field: z.literal("messages"),
      value: z.object({
        messaging_product: z.literal("whatsapp"),
        metadata: z.object({ phone_number_id: syntheticId }).strict(),
        messages: z.array(messageSchema).min(1).max(META_LAB_LIMITS.events),
      }).strict(),
    }).strict()).min(1).max(META_LAB_LIMITS.events),
  }).strict()).min(1).max(META_LAB_LIMITS.events),
}).strict();

export type MetaLabStoreItem = {
  key: string; digest: string; atMs: number;
  tenantId?: string; workspaceId?: string; scope?: string;
};
export type MetaLabTransaction = { fresh: number[]; duplicates: number[] };
export interface MetaLabStore {
  // Atomically classify the complete batch and commit only after processFresh succeeds.
  transact(items: readonly MetaLabStoreItem[], processFresh: (indices: number[]) => void): Promise<MetaLabTransaction>;
}
export type MetaLabMetric = {
  metric: "requests" | "accepted" | "duplicates" | "blocked" | "processing" | "ack_duration_ms";
  value: number;
  reasonCode?: string;
};
export type MetaLabBinding = { wabaId: string; phoneNumberId: string; bindingsJson: string };
export type MetaLabOptions = {
  mode: "synthetic-lab";
  appSecret: string;
  verifyToken: string;
  identityKey: string;
  bindings: readonly MetaLabBinding[];
  now: () => number;
  replayWindowMs: number;
  futureSkewMs: number;
  store: MetaLabStore;
  observe: (metric: MetaLabMetric) => void;
};
export type MetaOperationalOptions = Omit<MetaLabOptions, "mode"> & {
  mode: "operational";
  limits: { payloadBytes: number; events: number; retentionMs: number };
};

const nativeId = z.string().regex(/^\d{1,32}$/);
const nativeMessage = z.object({
  id: z.string().min(1).max(256), from: nativeId,
  timestamp: z.string().regex(/^\d{1,10}$/), type: z.enum(["text", "interactive"]),
  text: z.object({ body: z.string().min(1).max(8192).refine(text => text.trim().length > 0) }).optional(),
  interactive: z.object({
    type: z.enum(["button_reply", "list_reply"]),
    button_reply: z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(1024) }).optional(),
    list_reply: z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(1024), description: z.string().max(1024).optional() }).optional(),
  }).optional(),
}).refine(m => m.type === "text" ? Boolean(m.text) && !m.interactive
  : !m.text && Boolean(m.interactive && (m.interactive.type === "button_reply"
    ? m.interactive.button_reply && !m.interactive.list_reply
    : m.interactive.list_reply && !m.interactive.button_reply)));
// Protocol metadata (contacts, display phone, context) is stripped, never exported or stored.
// Unsupported/status-only notifications are rejected rather than silently acknowledged.
const nativePayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ id: nativeId, changes: z.array(z.object({
    field: z.literal("messages"), value: z.object({
      messaging_product: z.literal("whatsapp"), metadata: z.object({ phone_number_id: nativeId }),
      messages: z.array(nativeMessage).min(1),
    }),
  })).min(1) })).min(1),
});

export function isOperationalMetaSecret(value: string): boolean {
  return value.length >= 32 && value.length <= 256 && !/\s/.test(value)
    && !/synthetic|laborator|fixture|example|placeholder|changeme|stub|default|test|demo/i.test(value)
    && new Set(value).size >= 8;
}
export type MetaLabResult = {
  status: number;
  reasonCode: string;
  accepted: number;
  duplicates: number;
  events: WhatsappBundleExport[];
  sideEffects: 0;
  providerExternalCall: 0;
};

export function metaLabPseudonym(key: string, kind: string, values: readonly string[]) {
  return crypto.createHmac("sha256", key).update(JSON.stringify([kind, ...values])).digest("hex");
}

class LabRejection extends Error {
  constructor(readonly status: number, readonly reasonCode: string) { super(reasonCode); }
}
function reject(status: number, reasonCode: string): never { throw new LabRejection(status, reasonCode); }

export function createMetaLabAdapter(input: MetaLabOptions) {
  if (input.mode !== "synthetic-lab"
    || ![input.appSecret, input.verifyToken, input.identityKey].every(s => typeof s === "string" && /^synthetic-.{8,240}$/.test(s))
    || !Number.isFinite(input.replayWindowMs) || input.replayWindowMs <= 0
    || !Number.isFinite(input.futureSkewMs) || input.futureSkewMs < 0) {
    throw new Error("Synthetic lab configuration required");
  }
  return createMetaAdapter(input);
}

export function createMetaOperationalAdapter(input: MetaOperationalOptions) {
  const secrets = [input.appSecret, input.verifyToken, input.identityKey];
  const limits = input.limits;
  if (input.mode !== "operational" || !secrets.every(isOperationalMetaSecret) || new Set(secrets).size !== 3
    || !Number.isSafeInteger(limits.payloadBytes) || limits.payloadBytes < 1 || limits.payloadBytes > 10 * 1024 * 1024
    || !Number.isSafeInteger(limits.events) || limits.events < 1 || limits.events > 1000
    || !Number.isSafeInteger(limits.retentionMs) || limits.retentionMs < 1 || limits.retentionMs > 365 * 86400_000
    || !Number.isSafeInteger(input.replayWindowMs) || input.replayWindowMs < 1
    || !Number.isSafeInteger(input.futureSkewMs) || input.futureSkewMs < 0
    || input.replayWindowMs + input.futureSkewMs > limits.retentionMs
    || !input.bindings.length) throw new Error("META_CONFIGURATION_INVALID");
  return createMetaAdapter({ ...input, limits: { ...limits } });
}

function createMetaAdapter(input: MetaLabOptions | MetaOperationalOptions) {
  // Copy fixed authorization inputs so caller mutation cannot change identity or scope mid-flight.
  const options = { ...input, bindings: input.bindings.map(b => ({ ...b })) };
  const identitySchema = options.mode === "synthetic-lab" ? syntheticId : nativeId;
  const limits = options.mode === "synthetic-lab" ? META_LAB_LIMITS : options.limits;
  if (options.bindings.some(b => !identitySchema.safeParse(b.wabaId).success
    || !identitySchema.safeParse(b.phoneNumberId).success)
    || new Set(options.bindings.map(b => JSON.stringify([b.wabaId, b.phoneNumberId]))).size !== options.bindings.length) {
    throw new Error("Ambiguous or non-synthetic channel binding");
  }

  function handshake(query: Record<string, unknown>) {
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (query["hub.mode"] !== "subscribe" || typeof token !== "string"
      || typeof challenge !== "string" || !(options.mode === "synthetic-lab"
        ? /^synthetic-[A-Za-z0-9_-]{1,128}$/ : /^[A-Za-z0-9_-]{1,256}$/).test(challenge)) {
      return { status: 403, challenge: null };
    }
    const actual = Buffer.from(token);
    const expected = Buffer.from(options.verifyToken);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
      ? { status: 200, challenge } : { status: 403, challenge: null };
  }

  async function inbound(rawBody: Buffer, signature: string | undefined): Promise<MetaLabResult> {
    const started = performance.now();
    const result = (status: number, reasonCode: string, events: WhatsappBundleExport[] = [], accepted = 0, duplicates = 0): MetaLabResult => ({
      status, reasonCode, events, accepted, duplicates, sideEffects: 0, providerExternalCall: 0,
    });
    try {
      options.observe({ metric: "requests", value: 1 });
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) reject(400, "WHATSAPP_PAYLOAD_INVALID");
      if (rawBody.length > limits.payloadBytes) reject(413, "WHATSAPP_PAYLOAD_TOO_LARGE");
      if (!signature) reject(401, "WHATSAPP_SIGNATURE_MISSING");
      if (!/^sha256=[a-f0-9]{64}$/.test(signature)) reject(401, "WHATSAPP_SIGNATURE_INVALID");
      const supplied = Buffer.from(signature.slice(7), "hex");
      const expected = crypto.createHmac("sha256", options.appSecret).update(rawBody).digest();
      if (!crypto.timingSafeEqual(supplied, expected)) reject(401, "WHATSAPP_SIGNATURE_INVALID");
      let decoded: unknown;
      try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
      catch { reject(400, "WHATSAPP_PAYLOAD_INVALID"); }
      const parsed = (options.mode === "synthetic-lab" ? payloadSchema : nativePayloadSchema).safeParse(decoded);
      if (!parsed.success) reject(400, "WHATSAPP_PAYLOAD_INVALID");
      const nowMs = options.now();
      if (!Number.isFinite(nowMs)) reject(503, "PRE_PROVIDER_GAP_OPEN");
      const prepared: Array<{ body: Record<string, unknown>; binding: MetaLabBinding; item: MetaLabStoreItem }> = [];
      for (const entry of parsed.data.entry) {
        for (const change of entry.changes) {
          const phoneNumberId = change.value.metadata.phone_number_id;
          const channel = options.bindings.find(b => b.wabaId === entry.id && b.phoneNumberId === phoneNumberId);
          if (!channel) reject(403, "WHATSAPP_PHONE_NOT_BOUND");
          for (const message of change.value.messages) {
            if (prepared.length >= limits.events) reject(413, "WHATSAPP_PAYLOAD_TOO_LARGE");
            const timestampMs = Number(message.timestamp) * 1000;
            if (!Number.isFinite(timestampMs) || nowMs - timestampMs > options.replayWindowMs
              || timestampMs - nowMs > options.futureSkewMs) reject(401, "WHATSAPP_TIMESTAMP_OUT_OF_WINDOW");
            const fromPhoneHash = metaLabPseudonym(options.identityKey, "sender", [entry.id, phoneNumberId, message.from]);
            const authority = resolveChannelBinding({
              fromPhoneHash, bindingsJson: channel.bindingsJson, nowMs,
              requiredScope: WHATSAPP_READ_ONLY_SCOPE, requiredEntitlement: WHATSAPP_READ_ONLY_ENTITLEMENT,
            });
            if (!authority.allowed) reject(403, authority.reasonCode!);
            if (options.mode === "synthetic-lab" && (!syntheticId.safeParse(authority.tenantId).success
              || !syntheticId.safeParse(authority.workspaceId).success)) {
              reject(403, "WHATSAPP_PHONE_NOT_BOUND");
            }
            if (authority.scope !== WHATSAPP_READ_ONLY_SCOPE) reject(403, "ENTITLEMENT_REQUIRED");
            const key = metaLabPseudonym(options.identityKey, "event", [
              "meta", "whatsapp", entry.id, phoneNumberId, authority.tenantId!, authority.workspaceId!,
              WHATSAPP_READ_ONLY_SCOPE, ...(options.mode === "synthetic-lab" ? [message.type] : []), message.id,
            ]);
            // Stable semantic digest excludes receipt time, batch order and raw JSON formatting.
            const digest = metaLabPseudonym(options.identityKey, "digest", [
              message.from, message.timestamp, message.type,
              message.text?.body ?? JSON.stringify(message.interactive),
            ]);
            const body = {
              version: WHATSAPP_EVENT_VERSION, provider: WHATSAPP_PROVIDER, eventId: key,
              receivedAt: new Date(nowMs).toISOString(), providerTimestamp: new Date(timestampMs).toISOString(),
              fromPhoneHash, fromPhoneMasked: "[redacted]", rawPayloadRef: `redacted://${key}`,
              messageType: message.type, ...(message.text ? { text: message.text.body } : {}),
              tenantId: authority.tenantId, workspaceId: authority.workspaceId,
              scope: WHATSAPP_READ_ONLY_SCOPE, readOnly: true,
            };
            const validation = validatePayload(body);
            if (!validation.ok) reject(400, validation.code);
            prepared.push({ body, binding: channel, item: { key, digest, atMs: nowMs,
              ...(options.mode === "operational" ? { tenantId: authority.tenantId!, workspaceId: authority.workspaceId!,
                scope: WHATSAPP_READ_ONLY_SCOPE } : {}),
            } });
          }
        }
      }
      if (prepared.length === 0) reject(400, "WHATSAPP_PAYLOAD_INVALID");
      const transaction = await options.store.transact(prepared.map(p => p.item), indices => {
        for (const index of indices) {
          const p = prepared[index];
          const accepted = evaluateWhatsappReadOnlyIngress({
            body: p.body, eventId: p.item.key, provider: WHATSAPP_PROVIDER,
            bindingsJson: p.binding.bindingsJson, nowMs,
          });
          if (!accepted.body.ok) reject(accepted.status, accepted.body.error!.code);
          options.observe({ metric: "processing", value: 1 });
        }
      });
      // Never ACK an invalid store response.
      const classified = [...transaction.fresh, ...transaction.duplicates].sort((a, b) => a - b);
      if (classified.length !== prepared.length || classified.some((n, i) => n !== i)) reject(503, "PRE_PROVIDER_GAP_OPEN");
      const events = prepared.map(p => buildWhatsappBundleExport({
        evidenceBundle: buildWhatsappEvidenceBundle({
          reasonCode: "ACCEPTED_READ_ONLY", httpStatus: 202, eventId: p.item.key,
          provider: WHATSAPP_PROVIDER, messageType: p.body.messageType,
          tenantId: p.body.tenantId, workspaceId: p.body.workspaceId, scope: p.body.scope,
          decisionClass: "accepted_read_only",
        }),
        receivedAt: p.body.receivedAt, providerTimestamp: p.body.providerTimestamp, exportedAt: nowMs,
      }));
      options.observe({ metric: "accepted", value: transaction.fresh.length });
      options.observe({ metric: "duplicates", value: transaction.duplicates.length });
      options.observe({ metric: "ack_duration_ms", value: performance.now() - started });
      return result(200, transaction.fresh.length ? "ACCEPTED_READ_ONLY" : "WHATSAPP_EVENT_DUPLICATE",
        events, transaction.fresh.length, transaction.duplicates.length);
    } catch (error) {
      const status = error instanceof LabRejection ? error.status
        : error instanceof Error && ["LAB_EVENT_COLLISION", "META_EVENT_COLLISION"].includes(error.message) ? 409 : 503;
      const reasonCode = error instanceof LabRejection ? error.reasonCode
        : status === 409 ? "WHATSAPP_PAYLOAD_INVALID" : "PRE_PROVIDER_GAP_OPEN";
      // Metrics must not expose raw errors (paths, credentials, payloads). Observer loss prevents ACK.
      try { options.observe({ metric: "blocked", value: 1, reasonCode }); } catch { /* fail closed */ }
      return result(status, reasonCode);
    }
  }
  return Object.freeze({ handshake, inbound });
}
