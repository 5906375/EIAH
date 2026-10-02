import type { ChatVerticalHandoffResult } from "@/lib/api";
import { VERTICAL_HANDOFF_CAPABILITY_LABELS } from "@/components/agents/verticalHandoffEngine";

/**
 * Card do handoff para vertical na mesma conversa (`chat.vertical_handoff.v2`,
 * operacional). Só apresenta o resultado já avaliado pelo servidor.
 */
export function ChatVerticalHandoffCard({ result }: { result: ChatVerticalHandoffResult }) {
  if (result.ok) {
    const label = result.handoff.vertical.label ?? result.handoff.vertical.id.toUpperCase();
    return (
      <section
        aria-label={`${label} ativo nesta conversa`}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50"
      >
        <span className="rounded-full border border-emerald-300/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</span>
        <span>Nesta conversa · {VERTICAL_HANDOFF_CAPABILITY_LABELS[result.handoff.capability.id] ?? result.handoff.capability.id}</span>
      </section>
    );
  }
  return (
    <section
      aria-label="Vertical indisponível nesta conversa"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-50"
    >
      <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]">IMOB indisponível</span>
      <span className="font-mono text-[10px] text-amber-100/80">{result.reasonCode}</span>
    </section>
  );
}

export default ChatVerticalHandoffCard;
