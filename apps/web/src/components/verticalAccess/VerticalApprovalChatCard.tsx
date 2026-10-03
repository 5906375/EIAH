import React from "react";
import { approvalCardRows, type ApprovalCardRow, type VerticalApprovalChatSnapshot } from "@/components/agents/verticalApprovalChatEngine";

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

/** Linhas de cartão com botões na conversa; o clique envia o texto que o engine entende. Só renderiza. */
export const ChatActionRowsCard: React.FC<{
  rows: ApprovalCardRow[] | null;
  onReply: (text: string) => void;
  disabled?: boolean;
  testId?: string;
}> = ({ rows, onReply, disabled, testId = "approval" }) => {
  if (!rows?.length) return null;
  return (
    <div className="space-y-2" data-chat-card={testId}>
      {rows.map((row, index) =>
        !row.title ? (
          // Pergunta já feita no texto: só os botões, sem moldura.
          <div key={`actions-${index}`} className="flex flex-wrap gap-2 pt-1">
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
        ) : (
        // Leitura de cima para baixo: título e detalhe, motivos e, por último, os botões.
        <div key={`${row.title}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
          <p className="font-medium text-foreground">
            {row.title}
            {row.detail ? <span className="font-normal text-muted-foreground"> — {row.detail}</span> : null}
          </p>
          {row.misses?.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-rose-200/90">
              {row.misses.map((message) => (
                <li key={message}>✗ {message}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-2">
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
        </div>
        ),
      )}
    </div>
  );
};

export const VerticalApprovalChatCard: React.FC<{
  snapshot: VerticalApprovalChatSnapshot;
  onReply: (text: string) => void;
  disabled?: boolean;
}> = ({ snapshot, onReply, disabled }) => (
  <ChatActionRowsCard rows={approvalCardRows(snapshot)} onReply={onReply} disabled={disabled} testId="approval" />
);

export default VerticalApprovalChatCard;
