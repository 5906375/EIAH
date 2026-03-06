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


function maskSensitive(value: string) {
  return value
    .replace(/([\w.+-]+)@([\w-]+\.[\w.-]+)/g, "***@***")
    .replace(/(\+?\d[\d\s.-]{7,}\d)/g, "[masked-phone]");
}

function sanitizePayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return maskSensitive(payload);
  if (Array.isArray(payload)) return payload.map(sanitizePayload);
  if (typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      out[k] = sanitizePayload(v);
    }
    return out;
  }
  return payload;
}

const EVENT_LABELS: Record<string, string> = {
  "run.requested": "Briefing recebido",
  "run.enqueued": "Run enfileirado",
  "run.started": "Execução iniciada",
  "run.completed": "Execução concluída",
  "run.failed": "Execução falhou",
  "run.token": "Token (stream)",
  "run.token.summary": "Resumo de tokens",
  "run.action.plan": "Plano (step)",
  "run.action.call": "Execução (call)",
  "run.action.result": "Resultado (step)",
  "run.action.reflect": "Reflexão",
  "run.action.enqueued": "Ação enfileirada",
  "run.action.completed": "Ação concluída",
  "run.action.failed": "Ação falhou",
};

const ACTION_BADGES: Record<string, string> = {
  "run.action.plan": "border-sky-400/40 bg-sky-400/10 text-sky-100",
  "run.action.call": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  "run.action.result": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  "run.action.reflect": "border-violet-400/40 bg-violet-400/10 text-violet-100",
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
  emptyStateMessage?: string;
};

export default function RunTimeline({ events, isLoading, error, status, emptyStateMessage }: RunTimelineProps) {
  const decorated = events.map((event) => ({
    ...event,
    depth: event.type.startsWith("run.action") ? 1 : 0,
  }));

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
          {emptyStateMessage ??
            (status === "pending" || status === "running" || status === "blocked"
              ? "Aguardando eventos do worker. Atualizaremos assim que o agente registrar progresso."
              : "Nenhum evento registrado ainda para este run.")}
        </div>
      ) : (
        <ul className="no-scrollbar flex max-h-[18vh] flex-col gap-2 overflow-y-auto pr-1 text-xs text-muted-foreground">
          {decorated.map((event) => {
            const label = EVENT_LABELS[event.type] ?? event.type;
            const badgeClass = ACTION_BADGES[event.type] ?? "border-white/10 bg-white/5 text-foreground";
            const payload = sanitizePayload(event.payload);
            const indentClass = event.depth === 1 ? "ml-4 border-l border-white/10 pl-3" : "";
            return (
              <li
                key={event.id}
                className={`rounded-2xl border border-white/5 bg-white/5 px-3 py-2 text-left ${indentClass}`}
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
                {payload ? (
                  <details className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    <summary className="cursor-pointer text-foreground/80">Ver detalhes técnicos</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-2xl bg-black/50 p-3 text-[10px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {JSON.stringify(payload, null, 2)}
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
