/** Presentation-only index of source turns. No intent inference or generated summary. */
export type SequenceMessage = { id: string; role: "user" | "assistant" | "system"; content: string };
export function buildConversationSequence(messages: SequenceMessage[]) {
  return messages.filter((message) => message.role === "user" && message.content.trim()).map((message, index) => ({
    id: message.id, number: index + 1, label: message.content.trim().replace(/\s+/g, " ").slice(0, 120),
  }));
}
