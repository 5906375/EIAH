import { z } from "zod";

import {
  VERTICAL_HANDOFF_REASON_CODES,
  chatVerticalHandoffV2Schema,
  verticalIdSchema,
  type VerticalHandoffReasonCode,
} from "./chatVerticalHandoffV2Contract";

export const CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_VERSION =
  "chat.vertical_handoff_shadow_snapshot.v1" as const;
export const CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_SCHEMA_PATH =
  "contracts/chat/chat.vertical_handoff_shadow_snapshot.v1.schema.json" as const;

export const chatVerticalHandoffV2ShadowSnapshotSchema = z
  .object({
    version: z.literal(CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_VERSION),
    vertical: z.object({ id: verticalIdSchema }).strict(),
    capability: z
      .object({
        id: z.string().regex(/^[a-z][a-z0-9._-]*$/),
        mode: z.literal("read_only"),
      })
      .strict(),
    presentation: z
      .object({
        source: z.enum(["fixture", "shadow"]),
        variant: z.enum(["blocked", "chat_card", "result_list", "cockpit_link"]),
      })
      .strict(),
    outcome: z.enum(["preview_only", "blocked"]),
    reasonCode: z.enum(VERTICAL_HANDOFF_REASON_CODES),
  })
  .strict();

export type ChatVerticalHandoffV2ShadowSnapshot = z.infer<
  typeof chatVerticalHandoffV2ShadowSnapshotSchema
>;

export type BuildChatVerticalHandoffV2ShadowSnapshotResult =
  | {
      ok: true;
      snapshot: ChatVerticalHandoffV2ShadowSnapshot;
      schemaPath: typeof CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_SCHEMA_PATH;
      sideEffects: 0;
    }
  | {
      ok: false;
      reasonCode: VerticalHandoffReasonCode;
      schemaPath: typeof CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_SCHEMA_PATH;
      sideEffects: 0;
    };

function invalid(): BuildChatVerticalHandoffV2ShadowSnapshotResult {
  return {
    ok: false,
    reasonCode: "VERTICAL_PRESENTATION_INVALID",
    schemaPath: CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_SCHEMA_PATH,
    sideEffects: 0,
  };
}

export function buildChatVerticalHandoffV2ShadowSnapshot(
  input: unknown,
): BuildChatVerticalHandoffV2ShadowSnapshotResult {
  const handoffResult = chatVerticalHandoffV2Schema.safeParse(input);
  if (!handoffResult.success) return invalid();

  const handoff = handoffResult.data;
  const { source, variant } = handoff.presentation;

  if (source !== "fixture" && source !== "shadow") return invalid();
  if (handoff.capability.mode !== "read_only") return invalid();
  if (handoff.outcome !== "preview_only" && handoff.outcome !== "blocked") return invalid();
  if (source === "fixture" && handoff.outcome !== "preview_only") return invalid();
  if (handoff.outcome === "blocked" && variant !== "blocked") return invalid();
  if (handoff.outcome === "preview_only" && variant === "blocked") return invalid();

  const snapshot = chatVerticalHandoffV2ShadowSnapshotSchema.safeParse({
    version: CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_VERSION,
    vertical: { id: handoff.vertical.id },
    capability: {
      id: handoff.capability.id,
      mode: handoff.capability.mode,
    },
    presentation: {
      source,
      variant,
    },
    outcome: handoff.outcome,
    reasonCode: handoff.reasonCode,
  });

  if (!snapshot.success) return invalid();

  return {
    ok: true,
    snapshot: snapshot.data,
    schemaPath: CHAT_VERTICAL_HANDOFF_SHADOW_SNAPSHOT_SCHEMA_PATH,
    sideEffects: 0,
  };
}
