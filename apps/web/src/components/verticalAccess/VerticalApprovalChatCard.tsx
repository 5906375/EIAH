import React from "react";
import { approvalCardRows, type VerticalApprovalChatSnapshot } from "@/components/agents/verticalApprovalChatEngine";

/**
 * ADR-011 §2.3: cartão da fila de liberações dentro da conversa do front door. Cada pedido tem os
 * próprios botões; o clique envia o mesmo texto que o engine entende, e a decisão só sai depois do
 * botão de confirmação. Só renderiza: quem decide o que mostrar é o engine.
 */
const TONE: Record<"approve" | "refuse" | "neutral", string> = {
  approve: "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25",
  refuse: "border-rose-400/60 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20",
  neutral: "border-white/15 bg-white/5 text-foreground hover:border-accent/40",
};

export const VerticalApprovalChatCard: React.FC<{
  snapshot: VerticalApprovalChatSnapshot;
  onReply: (text: string) => void;
  disabled?: boolean;
}> = ({ snapshot, onReply, disabled }) => {
  const rows = approvalCardRows(snapshot);
  if (!rows?.length) return null;
  return (
    <div className="space-y-2" data-approval-card>
      {rows.map((row) => (
        <div key={row.title} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-foreground">{row.title}</p>
            {row.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p> : null}
            {row.misses?.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-rose-200/90">
                {row.misses.map((message) => (
                  <li key={message}>✗ {message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {row.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={disabled}
                onClick={() => onReply(action.reply)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${TONE[action.tone]}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default VerticalApprovalChatCard;
