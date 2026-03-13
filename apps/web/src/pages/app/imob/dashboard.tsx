import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useSession } from "@/state/sessionStore";
import {
  apiGetImobChatTelemetrySummary,
  apiListImobChatThreads,
  type ImobChatThread,
} from "@/lib/api";
import { ThreadPanel } from "@/features/imob/ThreadPanel";

type Section = "imoveis" | "processos" | "parceiros";

type PropertyRow = {
  id: string;
  title: string;
  city: string;
  price: number;
  status: "available" | "reserved" | "contract";
};

type ProcessRow = {
  runId: string;
  client: string;
  action: string;
  status: "running" | "blocked" | "success";
};

type PartnerRow = {
  id: string;
  name: string;
  trust: number;
  activeCases: number;
  status: "ativo" | "revisao";
};

const syntheticProperties: PropertyRow[] = [
  { id: "imob-82912", title: "Apto Vista Mar", city: "Itapema", price: 1450000, status: "available" },
  { id: "imob-82913", title: "Apto Centro 2Q", city: "Balneário Camboriú", price: 920000, status: "reserved" },
  { id: "imob-82914", title: "Cobertura Brava", city: "Itajaí", price: 2350000, status: "contract" },
];

const syntheticProcesses: ProcessRow[] = [
  { runId: "run-imob-8421", client: "João Martins", action: "Agendar visita", status: "running" },
  { runId: "run-imob-8422", client: "Marina Costa", action: "Criar contrato", status: "blocked" },
  { runId: "run-imob-8423", client: "Ricardo Nunes", action: "Liberar comissão", status: "success" },
];

const syntheticPartners: PartnerRow[] = [
  { id: "partner-prime", name: "Prime Imóveis", trust: 92, activeCases: 4, status: "ativo" },
  { id: "partner-litoral", name: "Litoral Brokers", trust: 87, activeCases: 2, status: "ativo" },
  { id: "partner-atlantica", name: "Atlântica Realty", trust: 78, activeCases: 1, status: "revisao" },
];

const syntheticThreads: ImobChatThread[] = [
  {
    threadId: "th-captacao",
    label: "Captação",
    status: "active",
    firstMessageAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
    messageCount: 2,
  },
  {
    threadId: "th-contrato",
    label: "Contrato",
    status: "active",
    firstMessageAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    messageCount: 6,
  },
  {
    threadId: "th-comissao",
    label: "Comissão",
    status: "blocked",
    firstMessageAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    messageCount: 4,
  },
];

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function sectionLabel(section: Section) {
  if (section === "imoveis") return "Imóveis";
  if (section === "processos") return "Processos";
  return "Parceiros";
}

function formatLatencyMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const ImobDashboardPage: React.FC = () => {
  const session = useSession();
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = (searchParams.get("conversationId") || "").trim() || null;
  const requestedThreadId = (searchParams.get("threadId") || "").trim() || null;
  const rawSection = (searchParams.get("section") || "imoveis").toLowerCase();
  const section: Section =
    rawSection === "processos" || rawSection === "parceiros" ? rawSection : "imoveis";
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(requestedThreadId);
  const [threads, setThreads] = React.useState<ImobChatThread[]>(syntheticThreads);
  const [telemetrySummary, setTelemetrySummary] = React.useState<{
    generatedAt: string;
    totals: {
      events: number;
      messageToPlanAvgMs: number | null;
      planToExecuteAvgMs: number | null;
      chatToRunCoveragePct: number;
      persistSuccessRatePct: number;
    };
  } | null>(null);
  const [telemetryLoading, setTelemetryLoading] = React.useState(false);

  const setSection = (next: Section) => {
    const params = new URLSearchParams(searchParams);
    params.set("section", next);
    setSearchParams(params, { replace: true });
  };

  React.useEffect(() => {
    setSelectedThreadId(requestedThreadId);
  }, [requestedThreadId]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedThreadId) {
      params.set("threadId", selectedThreadId);
    } else {
      params.delete("threadId");
    }
    const current = searchParams.toString();
    const next = params.toString();
    if (current !== next) {
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, selectedThreadId, setSearchParams]);

  React.useEffect(() => {
    let mounted = true;
    if (!conversationId) {
      setThreads(syntheticThreads);
      return () => {
        mounted = false;
      };
    }
    void apiListImobChatThreads(conversationId)
      .then((result) => {
        if (!mounted) return;
        if (result.items.length > 0) {
          setThreads(result.items);
          if (requestedThreadId && !result.items.some((item) => item.threadId === requestedThreadId)) {
            setSelectedThreadId(null);
          }
          return;
        }
        setThreads(syntheticThreads);
      })
      .catch(() => {
        if (!mounted) return;
        setThreads(syntheticThreads);
      });
    return () => {
      mounted = false;
    };
  }, [conversationId, requestedThreadId]);

  React.useEffect(() => {
    let mounted = true;
    if (!conversationId) {
      setTelemetrySummary(null);
      setTelemetryLoading(false);
      return () => {
        mounted = false;
      };
    }

    const loadTelemetry = async () => {
      setTelemetryLoading(true);
      try {
        const summary = await apiGetImobChatTelemetrySummary({
          conversationId,
          windowHours: 24,
        });
        if (!mounted) return;
        setTelemetrySummary({
          generatedAt: summary.data.generatedAt,
          totals: summary.data.totals,
        });
      } catch {
        if (!mounted) return;
        setTelemetrySummary(null);
      } finally {
        if (mounted) setTelemetryLoading(false);
      }
    };

    void loadTelemetry();
    const interval = setInterval(() => {
      void loadTelemetry();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [conversationId]);

  const backToChatHref = React.useMemo(() => {
    const params = new URLSearchParams();
    if (conversationId) params.set("conversationId", conversationId);
    if (selectedThreadId) params.set("threadId", selectedThreadId);
    const query = params.toString();
    return `/app/imob/chat${query ? `?${query}` : ""}`;
  }, [conversationId, selectedThreadId]);

  const metricSource = telemetrySummary?.totals ?? {
    events: 0,
    messageToPlanAvgMs: 138,
    planToExecuteAvgMs: 2100,
    chatToRunCoveragePct: 100,
    persistSuccessRatePct: 100,
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">IMOB</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Visão unificada de imóveis, processos e parceiros.</p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brandName} • {workspaceLabel}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={backToChatHref}
            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/40"
          >
            Voltar ao chat
          </Link>
          {(["imoveis", "processos", "parceiros"] as Section[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                section === item
                  ? "border-accent/50 bg-accent/20 text-accent"
                  : "border-white/20 bg-white/10 text-foreground hover:border-accent/40"
              }`}
            >
              {sectionLabel(item)}
            </button>
          ))}
        </div>
      </header>

      {section === "imoveis" ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Imóveis</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {syntheticProperties.map((item) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.city} • {item.id}</p>
                <p className="mt-2 text-base font-semibold text-foreground">{currency(item.price)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.status === "available" ? "Disponível" : item.status === "reserved" ? "Reservado" : "Em contrato"}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {section === "processos" ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Processos</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-3 py-2">Processo</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {syntheticProcesses.map((item) => (
                  <tr key={item.runId} className="border-b border-white/5 text-muted-foreground">
                    <td className="px-3 py-3 text-foreground">{item.runId}</td>
                    <td className="px-3 py-3">{item.client}</td>
                    <td className="px-3 py-3">{item.action}</td>
                    <td className="px-3 py-3">
                      {item.status === "running" ? "Em andamento" : item.status === "blocked" ? "Precisa de atenção" : "Concluído"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "parceiros" ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Parceiros</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {syntheticPartners.map((item) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Trust {item.trust} • {item.activeCases} casos ativos
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{item.status === "ativo" ? "Ativo" : "Em revisão"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer id="dashboard-hub" className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Métricas Operacionais</h3>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
              {conversationId
                ? telemetryLoading
                  ? "Atualizando..."
                  : `Conversa ativa${telemetrySummary?.generatedAt ? ` • ${new Date(telemetrySummary.generatedAt).toLocaleTimeString("pt-BR")}` : ""}`
                : "Sem conversa ativa"}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">msg→plan</p>
              <p className="mt-1 text-sm text-foreground">{formatLatencyMs(metricSource.messageToPlanAvgMs)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">plan→execute</p>
              <p className="mt-1 text-sm text-foreground">{formatLatencyMs(metricSource.planToExecuteAvgMs)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">cobertura chat→run</p>
              <p className="mt-1 text-sm text-foreground">{formatPct(metricSource.chatToRunCoveragePct)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">persistência</p>
              <p className="mt-1 text-sm text-foreground">{formatPct(metricSource.persistSuccessRatePct)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <ThreadPanel
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={(thread) => setSelectedThreadId(thread.threadId)}
            onClearSelection={() => setSelectedThreadId(null)}
            maxItems={3}
            showNavigationCtas={false}
            showTimelineLegend={false}
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Significado da timeline</p>
          <ul className="mt-2 space-y-2 text-[11px] text-muted-foreground">
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
        </section>
      </footer>
    </div>
  );
};

export default ImobDashboardPage;
