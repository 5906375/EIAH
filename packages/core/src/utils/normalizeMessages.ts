import type { ChatMessage } from "../llm/types";

export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    name: message.name ?? undefined,
    tool_call_id: message.tool_call_id ?? undefined,
  }));
}
