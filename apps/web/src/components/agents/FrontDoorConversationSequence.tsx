import React, { useId, useMemo, useState } from "react";
import { buildConversationSequence, type SequenceMessage } from "./conversationSequence";

export default function FrontDoorConversationSequence({ messages, onNavigate }: {
  messages: SequenceMessage[];
  onNavigate: (messageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const sequence = useMemo(() => buildConversationSequence(messages), [messages]);
  return <section aria-label="Sequência da conversa" className="front-door-conversation-sequence space-y-1">
    <button type="button" className="front-door-sequence-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((open) => !open)}>
      <span className="min-w-0 truncate">Resumo da sequência ({sequence.length})</span>
      <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
    <div id={contentId} hidden={!expanded}>
    {sequence.length ? <ol className="space-y-0.5">{sequence.map((turn) => <li key={turn.id}>
      <button type="button" data-sidebar-navigation="true" className="front-door-sequence-turn" onClick={() => onNavigate(turn.id)} title={turn.label}>
        {turn.number}. {turn.label}
      </button>
    </li>)}</ol> : <p className="px-2 text-xs text-muted-foreground">Os pedidos desta conversa aparecerão aqui.</p>}
    </div>
  </section>;
}
