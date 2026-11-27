import { z } from "zod";
import { isOperationalMetaSecret, type MetaLabBinding, type MetaOperationalOptions } from "./whatsappMetaAdapter";
import { WHATSAPP_READ_ONLY_ENTITLEMENT, WHATSAPP_READ_ONLY_SCOPE } from "./whatsappReadOnlyIngress";

const bindingRecord = z.object({
  tenantId: z.string().trim().min(1).max(160), workspaceId: z.string().trim().min(1).max(160),
  scope: z.literal(WHATSAPP_READ_ONLY_SCOPE),
  allowedScopes: z.array(z.literal(WHATSAPP_READ_ONLY_SCOPE)).length(1),
  entitlements: z.array(z.literal(WHATSAPP_READ_ONLY_ENTITLEMENT)).length(1),
  sessionExpiresAt: z.string().datetime({ offset: true }),
}).strict();
const channels = z.array(z.object({
  wabaId: z.string().regex(/^\d{1,32}$/), phoneNumberId: z.string().regex(/^\d{1,32}$/),
  senders: z.record(z.string().regex(/^[a-f0-9]{64}$/), bindingRecord)
    .refine(records => Object.keys(records).length > 0),
}).strict()).min(1).max(100);

export type MetaOperationalConfig = Omit<MetaOperationalOptions, "store" | "observe" | "now">;
export type MetaConfigDecision = { state: "disabled" } | { state: "invalid" }
  | { state: "configured"; config: MetaOperationalConfig };

// No defaults for policy parameters, secrets, mode, binding or approval references.
// References are required inputs, not a programmatic ratification of human approvals.
export function resolveMetaOperationalConfig(env: Readonly<Record<string, string | undefined>>): MetaConfigDecision {
  if (env.META_WHATSAPP_ENABLED !== "true") return { state: "disabled" };
  try {
    if (env.META_WHATSAPP_MODE !== "operational"
      || !env.META_WHATSAPP_POLICY_APPROVAL?.trim()
      || !env.META_WHATSAPP_EXECUTION_APPROVAL?.trim()) return { state: "invalid" };
    const secret = (name: string) => {
      const value = env[name];
      if (!value || !isOperationalMetaSecret(value)) throw new Error("META_CONFIGURATION_INVALID");
      return value;
    };
    const integer = (name: string, min: number, max: number) => {
      const value = env[name];
      if (!value || !/^\d+$/.test(value)) throw new Error("META_CONFIGURATION_INVALID");
      const result = Number(value);
      if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error("META_CONFIGURATION_INVALID");
      return result;
    };
    const parsed = channels.parse(JSON.parse(env.META_WHATSAPP_BINDINGS_JSON ?? ""));
    const bindings: MetaLabBinding[] = parsed.map(channel => ({
      wabaId: channel.wabaId, phoneNumberId: channel.phoneNumberId, bindingsJson: JSON.stringify(channel.senders),
    }));
    if (new Set(bindings.map(b => JSON.stringify([b.wabaId, b.phoneNumberId]))).size !== bindings.length) {
      return { state: "invalid" };
    }
    const config: MetaOperationalConfig = {
      mode: "operational", bindings,
      appSecret: secret("META_WHATSAPP_APP_SECRET"), verifyToken: secret("META_WHATSAPP_VERIFY_TOKEN"),
      identityKey: secret("META_WHATSAPP_IDENTITY_KEY"),
      replayWindowMs: integer("META_WHATSAPP_REPLAY_WINDOW_MS", 1, 365 * 86400_000),
      futureSkewMs: integer("META_WHATSAPP_FUTURE_SKEW_MS", 0, 3600_000),
      limits: {
        payloadBytes: integer("META_WHATSAPP_MAX_PAYLOAD_BYTES", 1, 10 * 1024 * 1024),
        events: integer("META_WHATSAPP_MAX_EVENTS", 1, 1000),
        retentionMs: integer("META_WHATSAPP_RETENTION_MS", 1, 365 * 86400_000),
      },
    };
    if (new Set([config.appSecret, config.verifyToken, config.identityKey]).size !== 3
      || config.replayWindowMs + config.futureSkewMs > config.limits.retentionMs) return { state: "invalid" };
    return { state: "configured", config };
  } catch {
    // Do not propagate Zod/JSON errors: they can contain configuration and identities.
    return { state: "invalid" };
  }
}
