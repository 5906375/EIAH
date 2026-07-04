import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssistantMessageDedupeKey,
  dedupeRunMessages,
} from "./chat";

test("dedupeRunMessages colapsa duplicata assistente legado sem runId inicial", () => {
  const dedupeKey = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:collecting",
    text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
    threadId: "thread-captacao-1",
  });

  const items = dedupeRunMessages([
    {
      id: "assistant-plan",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: dedupeKey,
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
      card: { type: "queue", title: "Preparando", lines: [] },
    } as any,
    {
      id: "assistant-terminal",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: dedupeKey,
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-123" },
    } as any,
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "assistant-terminal");
  assert.equal(items[0]?.card?.runId, "run-123");
});

test("dedupeRunMessages preserva mensagens assistente semanticamente distintas", () => {
  const first = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:collecting",
    text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
    threadId: "thread-captacao-1",
  });
  const second = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:ready_for_review",
    text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
    threadId: "thread-captacao-1",
  });

  const items = dedupeRunMessages([
    {
      id: "assistant-1",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: first,
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
    } as any,
    {
      id: "assistant-2",
      role: "assistant",
      text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
      assistantDedupeKey: second,
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-456" },
    } as any,
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, "assistant-1");
  assert.equal(items[1]?.id, "assistant-2");
});

test("dedupeRunMessages mantém fallback por runId para started e terminal do mesmo run", () => {
  const items = dedupeRunMessages([
    {
      id: "assistant-started",
      role: "assistant",
      text: "Atualizando progresso em tempo real.",
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
      card: { type: "queue", title: "Em andamento", lines: [], runId: "run-789" },
    } as any,
    {
      id: "assistant-terminal",
      role: "assistant",
      text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-789" },
    } as any,
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "assistant-terminal");
});
