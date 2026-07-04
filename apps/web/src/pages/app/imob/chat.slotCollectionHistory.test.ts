import test from "node:test";
import assert from "node:assert/strict";

import type { ImobChatMessage } from "@/lib/api";
import { shouldRenderMessageSlotCollectionCard } from "@/features/workbench/vertical-chat/imobChatPresentationGuards";

import {
  buildPersistedImobChatMessageMetadata,
  mapStoredMessageToChat,
  normalizeStoredSlotCollection,
} from "./chat";

test("buildPersistedImobChatMessageMetadata inclui slotCollection estrutural no payload persistido", () => {
  const metadata = buildPersistedImobChatMessageMetadata({
    slotCollection: {
      mission: "property_intake",
      title: "Completar captação",
      description: "Preencha os campos pendentes.",
      fields: ["propertyType", "goal", "city"],
      prefilled: { city: "Florianópolis" },
      propertyCandidates: [{ id: "prop-1", label: "Apartamento Beira-Mar" }],
    },
  } as any);

  assert.deepEqual(metadata.slotCollection, {
    mission: "property_intake",
    title: "Completar captação",
    description: "Preencha os campos pendentes.",
    fields: ["propertyType", "goal", "city"],
    prefilled: { city: "Florianópolis" },
    propertyCandidates: [{ id: "prop-1", label: "Apartamento Beira-Mar" }],
  });
});

test("mapStoredMessageToChat restaura slotCollection para o renderer do histórico", () => {
  const persisted = buildPersistedImobChatMessageMetadata({
    slotCollection: {
      mission: "property_intake",
      title: "Completar captação",
      description: "Preencha os campos pendentes.",
      fields: ["propertyType", "goal", "city"],
      prefilled: { city: "Florianópolis" },
      propertyCandidates: [{ id: "prop-1", label: "Apartamento Beira-Mar" }],
    },
  } as any);
  const storedMessage: ImobChatMessage = {
    id: "msg-assistant-1",
    conversationId: "conv-1",
    role: "assistant",
    content: "Continue pelos campos abaixo.",
    metadata: persisted,
    createdAt: "2026-07-02T12:00:00.000Z",
  };

  const message = mapStoredMessageToChat(storedMessage);

  assert.deepEqual(message.slotCollection, persisted.slotCollection);
  assert.equal(
    shouldRenderMessageSlotCollectionCard({
      hasForm: false,
      hasSlotCollection: true,
      isAssistantMessage: true,
      isLastMessage: true,
      isBusy: false,
    }),
    true,
  );
});

test("mapStoredMessageToChat mantém compatibilidade com histórico antigo sem slotCollection", () => {
  const storedMessage: ImobChatMessage = {
    id: "msg-assistant-legacy",
    conversationId: "conv-1",
    role: "assistant",
    content: "Mensagem legada sem slot.",
    metadata: {
      presentationMetadata: { dedupeKey: "legacy" },
    },
    createdAt: "2026-07-02T12:00:00.000Z",
  };

  const message = mapStoredMessageToChat(storedMessage);

  assert.equal(message.slotCollection, undefined);
});

test("normalizeStoredSlotCollection degrada slot malformado sem quebrar reload", () => {
  assert.equal(
    normalizeStoredSlotCollection({
      mission: "property_intake",
      title: "Completar captação",
      fields: ["propertyType", 123],
    }),
    undefined,
  );
});
