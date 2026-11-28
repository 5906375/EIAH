import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationSequence } from "./conversationSequence";

test("sequence preserves source turn order and excludes assistant/system content", () => {
  const entries = buildConversationSequence([
    { id: "sys", role: "system", content: "interno" },
    { id: "one", role: "user", content: "  Cadastrar proprietário  " },
    { id: "answer", role: "assistant", content: "Resposta não resumida ou reinterpretada" },
    { id: "two", role: "user", content: "Ver imóveis\n do proprietário" },
    { id: "empty", role: "user", content: " " },
  ]);
  assert.deepEqual(entries, [{ id: "one", number: 1, label: "Cadastrar proprietário" }, { id: "two", number: 2, label: "Ver imóveis do proprietário" }]);
});

test("long source turn is shortened for display without inventing outcome or exposing a different turn", () => {
  const source = "x".repeat(300);
  assert.deepEqual(buildConversationSequence([{ id: "source", role: "user", content: source }]), [{ id: "source", number: 1, label: source.slice(0, 120) }]);
});
