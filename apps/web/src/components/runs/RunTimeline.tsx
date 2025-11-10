import { RunEvent, RunStatus } from "@/lib/api";

const formatEventTimestamp = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};


const EVENT_LABELS: Record<string, string> = {
  "run.requested": "Briefing recebido",
  "run.enqueued": "Run enfileirado",
  "run.started": "Execução iniciada",
  "run.completed": "Execução concluída",
  "run.failed": "Execução falhou",
  "run.action.enqueued": "Ação enfileirada",
  "run.action.completed": "Ação concluída",
  "run.action.failed": "Ação falhou",
};

const ACTION_BADGES: Record<string, string> = {
  "run.action.enqueued": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  "run.action.completed": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  "run.action.failed": "border-rose-500/40 bg-rose-500/15 text-rose-100",
  "run.completed": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  "run.failed": "border-rose-500/40 bg-rose-500/15 text-rose-100",
  "run.started": "border-amber-400/40 bg-amber-400/15 text-amber-100",
  "run.enqueued": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  "run.requested": "border-white/10 bg-white/5 text-foreground",
};

type RunTimelineProps = {
  events: RunEvent[];
  isLoading?: boolean;
  error?: string | null;
  status?: RunStatus;
};

export default function RunTimeline({ events, isLoading, error, status }: RunTimelineProps) {
  return (
    <section className="glass-panel max-h-[26vh] overflow-hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">Timeline do run</h4>
        {isLoading ? (
          <span className="pill">Carregando</span>
        ) : (
          <span className="pill">{events.length} eventos</span>
        )}
      </div>
      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
          {status === "pending" || status === "running" || status === "blocked"
            ? "Aguardando eventos do worker. Atualizaremos assim que o agente registrar progresso."
            : "Nenhum evento registrado ainda para este run."}
        </div>
      ) : (
        <ul className="no-scrollbar flex max-h-[18vh] flex-col gap-2 overflow-y-auto pr-1 text-xs text-muted-foreground">
          {events.map((event) => {
            const label = EVENT_LABELS[event.type] ?? event.type;
            const badgeClass = ACTION_BADGES[event.type] ?? "border-white/10 bg-white/5 text-foreground";
            return (
              <li
                key={event.id}
                className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
                    {formatEventTimestamp(event.createdAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                      {label}
                    </span>
                  </div>
                </div>
                {event.payload ? (
                  <details className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    <summary className="cursor-pointer text-foreground/80">Ver detalhes técnicos</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-2xl bg-black/50 p-3 text-[10px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
