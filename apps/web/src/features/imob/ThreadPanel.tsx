import React from "react";
import { Link } from "react-router-dom";
import type { ImobChatThread } from "@/lib/api";

type HumantimelineStep = {
  id: string;
  label: string;
  state: "done" | "current" | "pending";
};

function threadStatusLabel(status: "active" | "done" | "blocked") {
  if (status === "done") return "Concluído";
  if (status === "blocked") return "Atenção";
  return "Em andamento";
}

function getThreadStageSummary(thread: ImobChatThread) {
  const label = thread.label.toLowerCase();
  if (thread.status === "blocked") return "Aguardando sua revisão para continuar com segurança.";
  if (thread.status === "done") return "Etapa concluída. Pode seguir para a próxima ação.";
  if (label.includes("captação")) return "Coletando dados e preparando cadastro do imóvel.";
  if (label.includes("busca")) return "Refinando opções para encontrar melhores matches.";
  if (label.includes("proposta")) return "Preparando proposta para aprovação e envio.";
  if (label.includes("contrato")) return "Organizando contrato para validação e avanço.";
  if (label.includes("comissão")) return "Conferindo comissão e preparando liberação.";
  if (label.includes("ajuste")) return "Aplicando ajuste solicitado com governança.";
  return "Operação em andamento nesta frente.";
}

function getThreadPrimaryCta(thread: ImobChatThread): { label: string; href: string } {
  const label = thread.label.toLowerCase();
  if (label.includes("captação")) return { label: "Abrir dashboard", href: "/app/imob/dashboard?section=imoveis#dashboard-hub" };
  if (label.includes("busca")) return { label: "Abrir dashboard", href: "/app/imob/dashboard?section=parceiros#dashboard-hub" };
  return { label: "Abrir dashboard", href: "/app/imob/dashboard?section=processos#dashboard-hub" };
}

function getThreadtimeline(thread: ImobChatThread): HumantimelineStep[] {
  const finalLabel = thread.status === "blocked" ? "atenção" : "concluído";
  if (thread.status === "done") {
    return [
      { id: "understanding", label: "entendimento", state: "done" },
      { id: "preparation", label: "preparação", state: "done" },
      { id: "execution", label: "execução", state: "done" },
      { id: "final", label: finalLabel, state: "done" },
    ];
  }
  if (thread.status === "blocked") {
    return [
      { id: "understanding", label: "entendimento", state: "done" },
      { id: "preparation", label: "preparação", state: thread.messageCount >= 3 ? "done" : "current" },
      { id: "execution", label: "execução", state: thread.messageCount >= 5 ? "done" : "pending" },
      { id: "final", label: finalLabel, state: "current" },
    ];
  }
  if (thread.messageCount <= 1) {
    return [
      { id: "understanding", label: "entendimento", state: "current" },
      { id: "preparation", label: "preparação", state: "pending" },
      { id: "execution", label: "execução", state: "pending" },
      { id: "final", label: finalLabel, state: "pending" },
    ];
  }
  if (thread.messageCount <= 3) {
    return [
      { id: "understanding", label: "entendimento", state: "done" },
      { id: "preparation", label: "preparação", state: "current" },
      { id: "execution", label: "execução", state: "pending" },
      { id: "final", label: finalLabel, state: "pending" },
    ];
  }
  return [
    { id: "understanding", label: "entendimento", state: "done" },
    { id: "preparation", label: "preparação", state: "done" },
    { id: "execution", label: "execução", state: "current" },
    { id: "final", label: finalLabel, state: "pending" },
  ];
}

function formatRelativeTime(timestamp?: string | null) {
  if (!timestamp) return "sem atividade";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sem atividade";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays} d`;
}

function timelineStepLabel(step: HumantimelineStep) {
  if (step.id === "understanding") return "entendido";
  if (step.id === "preparation") return "preparação";
  if (step.id === "execution") return "execução";
  if (step.id === "final") return step.label === "atenção" ? "atenção" : "concluído";
  return step.label;
}

type ThreadPanelProps = {
  threads: ImobChatThread[];
  selectedThreadId: string | null;
  onSelectThread: (thread: ImobChatThread) => void;
  onClearSelection: () => void;
  emptyText?: string;
  maxItems?: number;
  showNavigationCtas?: boolean;
  showTimelineLegend?: boolean;
  resolveDashboardHref?: (href: string, thread: ImobChatThread) => string;
};

export const ThreadPanel: React.FC<ThreadPanelProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onClearSelection,
  emptyText = "Sem threads ativas.",
  maxItems = 6,
  showNavigationCtas = true,
  showTimelineLegend = false,
  resolveDashboardHref,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Threads</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-white/30"
          >
            {showDetails ? "Compacto" : "Detalhes"}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-white/30"
          >
            Todas
          </button>
        </div>
      </div>
      {threads.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {threads.slice(0, maxItems).map((thread) => {
            const selected = selectedThreadId === thread.threadId;
            const tone =
              thread.status === "blocked"
                ? "text-rose-200 border-rose-300/40"
                : thread.status === "done"
                  ? "text-emerald-200 border-emerald-300/40"
                  : "text-accent border-accent/40";
            const threadCta = getThreadPrimaryCta(thread);
            const threadCtaHref = resolveDashboardHref
              ? resolveDashboardHref(threadCta.href, thread)
              : threadCta.href;
            const timeline = getThreadtimeline(thread);
            return (
              <div
                key={thread.threadId}
                className={`w-full rounded-lg border px-2 py-2 ${
                  selected ? "border-accent/40 bg-accent/10" : "border-white/10 bg-black/15"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectThread(thread)}
                  className="w-full text-left transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] text-foreground">{thread.label}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
                      {threadStatusLabel(thread.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{getThreadStageSummary(thread)}</p>
                  {showDetails ? (
                    <div className="mt-2">
                      <p className="text-[10px] text-muted-foreground/80">timeline</p>
                      <div className="mt-1 grid grid-cols-2 gap-1">
                        {timeline.map((step) => {
                          const toneClass =
                            step.state === "done"
                              ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                              : step.state === "current"
                                ? "border-accent/40 bg-accent/10 text-accent"
                                : "border-white/10 bg-black/20 text-muted-foreground";
                          const bulletClass =
                            step.state === "done" ? "bg-emerald-300" : step.state === "current" ? "bg-accent" : "bg-white/30";
                          return (
                            <div
                              key={`${thread.threadId}-${step.id}`}
                              className={`flex items-center gap-1 rounded-md border px-2 py-1 ${toneClass}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${bulletClass}`} />
                              <span className="text-[10px]">{timelineStepLabel(step)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    {thread.messageCount} mensagem{thread.messageCount === 1 ? "" : "ens"} • {formatRelativeTime(thread.lastMessageAt)}
                  </p>
                </button>
                {showDetails && showNavigationCtas ? (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectThread(thread)}
                      className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-accent transition hover:bg-accent/20"
                    >
                      Continuar
                    </button>
                    <Link
                      to={threadCtaHref}
                      className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] text-foreground transition hover:border-accent/40"
                    >
                      {threadCta.label}
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {showTimelineLegend ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Significado da timeline</p>
          <ul className="mt-2 space-y-2 text-[10px] text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Entendimento</span>: o chat interpretou sua intenção corretamente.
              Exemplo: identificou que você quer uma operação de captação.
            </li>
            <li>
              <span className="font-medium text-foreground">Preparação</span>: o plano operacional está sendo montado.
              Valida contexto, regras e próximos passos antes de executar.
            </li>
            <li>
              <span className="font-medium text-foreground">Execução</span>: a ação está rodando no motor EIAH.
              Cria/atualiza processo (run) e acompanha status.
            </li>
            <li>
              <span className="font-medium text-foreground">Concluído</span>: operação finalizada com sucesso.
              Quando aplicável, gera comprovante (receipt/tx) e fecha a etapa.
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
};
