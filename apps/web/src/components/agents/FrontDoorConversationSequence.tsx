import React, { useMemo } from "react";
import { buildConversationSequence, type SequenceMessage } from "./conversationSequence";

export default function FrontDoorConversationSequence({ messages, onNavigate }: {
  messages: SequenceMessage[];
  onNavigate: (messageId: string) => void;
}) {
  const sequence = useMemo(() => buildConversationSequence(messages), [messages]);
  return <section aria-label="Sequência da conversa" className="front-door-conversation-sequence space-y-1">
    <h4 className="px-2 text-xs font-semibold text-muted-foreground">Resumo da sequência ({sequence.length})</h4>
    {sequence.length ? <ol className="space-y-0.5">{sequence.map((turn) => <li key={turn.id}>
      <button type="button" data-sidebar-navigation="true" className="line-clamp-2" onClick={() => onNavigate(turn.id)} title={turn.label}>
        {turn.number}. {turn.label}
      </button>
    </li>)}</ol> : <p className="px-2 text-xs text-muted-foreground">Os pedidos desta conversa aparecerão aqui.</p>}
  </section>;
}
