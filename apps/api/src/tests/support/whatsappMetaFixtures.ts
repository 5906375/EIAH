import crypto from "node:crypto";
import {
  createMetaLabAdapter, metaLabPseudonym, type MetaLabOptions, type MetaLabStore,
} from "../../services/whatsappMetaAdapter";
import { createMetaLabObservations } from "./whatsappMetaHarness";

export const META_FIXTURE: Readonly<{
  now: number;
  waba: string; phone: string; sender: string;
  appSecret: string; verifyToken: string; identityKey: string; content: string;
}> = Object.freeze({
  now: Date.parse("2026-11-25T12:00:00Z"),
  waba: "synthetic-waba-A", phone: "synthetic-phone-A", sender: "synthetic-sender-A",
  appSecret: "synthetic-meta-app-secret", verifyToken: "synthetic-meta-verify-token",
  identityKey: "synthetic-meta-pseudonym-key", content: "SYNTHETIC-CONTENT-NOT-FOR-EXPORT",
});
export function metaPayload(ids = ["synthetic-event-A"]) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: META_FIXTURE.waba, changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: META_FIXTURE.phone },
      messages: ids.map(id => ({ id, from: META_FIXTURE.sender,
        timestamp: String(META_FIXTURE.now / 1000), type: "text",
        text: { body: META_FIXTURE.content } })),
    } }] }],
  };
}
export function signMetaBytes(bytes: Buffer, secret: string = META_FIXTURE.appSecret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(bytes).digest("hex")}`;
}
export function metaBindings(overrides: Record<string, unknown> = {}) {
  const hash = metaLabPseudonym(META_FIXTURE.identityKey, "sender", [META_FIXTURE.waba, META_FIXTURE.phone, META_FIXTURE.sender]);
  return [{ wabaId: META_FIXTURE.waba, phoneNumberId: META_FIXTURE.phone,
    bindingsJson: JSON.stringify({ [hash]: {
      tenantId: "synthetic-tenant-A", workspaceId: "synthetic-workspace-A",
      scope: "whatsapp:inbound:read_only", allowedScopes: ["whatsapp:inbound:read_only"],
      entitlements: ["channel.whatsapp.inbound.read_only"], sessionExpiresAt: "2099-01-01T00:00:00Z",
      ...overrides,
    } }),
  }];
}
export function metaAdapterFixture(store: MetaLabStore, overrides: Partial<MetaLabOptions> = {}) {
  const observations = createMetaLabObservations();
  const adapter = createMetaLabAdapter({
    mode: "synthetic-lab", ...META_FIXTURE, now: () => META_FIXTURE.now,
    replayWindowMs: 300_000, futureSkewMs: 30_000, bindings: metaBindings(), store,
    observe: observations.observe, ...overrides,
  });
  return { adapter, observations };
}
