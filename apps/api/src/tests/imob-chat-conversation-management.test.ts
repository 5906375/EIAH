import test from "node:test";
import assert from "node:assert/strict";
import { conversationTitle } from "../services/imob/imobChatConversationManagement";

test("conversation title is a bounded canonical label, not an inferred instruction", () => {
  for (const input of [null, 1, {}, "", " ", "x".repeat(121), "linha\nseguinte", "tab\tlabel"]) assert.equal(conversationTitle(input), null);
  assert.equal(conversationTitle("  Negociação da unidade 101  "), "Negociação da unidade 101");
  assert.equal(conversationTitle("Excluir não significa executar uma operação"), "Excluir não significa executar uma operação");
});
