import React, { useCallback, useEffect, useMemo, useState } from "react";
import introJs from "intro.js";
import "intro.js/minified/introjs.min.css";
import AgentSelect from "../../../components/agents/AgentSelect";
import CostBadge from "../../../components/billing/CostBadge";
import RunViewer from "../../../components/runs/RunViewer";
import { apiCreateRun, apiGetRun, apiListRuns, Run, RunStatus } from "../../../lib/api";
import { useSession } from "@/state/sessionStore";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "https://api.eiah.local/api";
const WORKSPACE_PLACEHOLDER = import.meta.env.VITE_WORKSPACE_ID ?? "workspace-demo";
const DEFAULT_WORKSPACE_ID = WORKSPACE_PLACEHOLDER;

type LowCodeTemplate = {
  name: string;
  description: string;
  link: string;
};

type RunResource = {
  prompt: string;
  restSnippet: string;
  sdkSnippet: string;
  templates: LowCodeTemplate[];
  tools?: string[];
};

const RUN_RESOURCES: Record<string, RunResource> = {
  __default: {
    prompt: "Simular fluxo de mint para cliente Alpha.",
    restSnippet: `curl -X POST "${API_BASE_URL}/defi1/simulate-mint" \
  -H "Authorization: Bearer $EIAH_TOKEN" \
  -H "x-workspace-id: ${WORKSPACE_PLACEHOLDER}" \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "to": "0xRecipient",
    "abiFragment": "mint(address,uint256)",
    "args": ["0xWallet","1"],
    "valueWei": null
  }'`,
    sdkSnippet: `import fetch from "node-fetch";

async function simulate() {
  const res = await fetch("${API_BASE_URL}/defi1/simulate-mint", {
    method: "POST",
    headers: {
      "Authorization": "Bearer \${process.env.EIAH_TOKEN}",
      "x-workspace-id": "${WORKSPACE_PLACEHOLDER}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chainId: 11155111,
      to: "0xRecipient",
      abiFragment: "mint(address,uint256)",
      args: ["0xWallet","1"]
    })
  });

  const data = await res.json();
  console.log(data);
}

simulate().catch(console.error);`,
    templates: [
      {
        name: "Zapier - disparar simulacao",
        description: "Webhook + Google Sheets para registrar pedidos",
        link: "https://zapier.com",
      },
      {
        name: "Make (Integromat) - pipeline DeFi",
        description: "Aciona agente, envia Slack e guarda logs",
        link: "https://www.make.com",
      },
      {
        name: "PowerApps - painel juridico",
        description: "Aprovacao humana com botao CONFIRM antes do run",
        link: "https://make.powerapps.com",
      },
      {
        name: "Planilha fallback",
        description: "CSV pronto para POST em /runs",
        link: "#",
      },
    ],
    tools: ["defi_simulator"],
  },
  guardian: {
    prompt: "Registrar prova processual com hash SHA-256 e verify_url imediato.",
    restSnippet: `curl -X POST "${API_BASE_URL}/guardian/provas/processuais" \
  -H "Authorization: Bearer $EIAH_TOKEN" \
  -H "x-workspace-id: ${WORKSPACE_PLACEHOLDER}" \
  -H "Content-Type: application/json" \
  -d '{
    "processo_id": "1234567-89.2025.8.26.0100",
    "itens": [
      { "tipo": "pdf", "mime": "application/pdf", "hash": "a1b2c3...", "bytes": null }
    ],
    "parte_submissora_did": "did:example:alice",
    "idempotency_key": "guardian-demo-001"
  }'`,
    sdkSnippet: `import fetch from "node-fetch";

async function registrarEvidencia() {
  const res = await fetch("${API_BASE_URL}/guardian/provas/processuais", {
    method: "POST",
    headers: {
      "Authorization": "Bearer \${process.env.EIAH_TOKEN}",
      "x-workspace-id": "${WORKSPACE_PLACEHOLDER}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      processo_id: "1234567-89.2025.8.26.0100",
      itens: [{ tipo: "pdf", mime: "application/pdf", hash: "a1b2c3...", bytes: null }],
      parte_submissora_did: "did:example:alice",
      idempotency_key: "guardian-demo-001"
    })
  });

  const data = await res.json();
  console.log(data);
}

registrarEvidencia().catch(console.error);`,
    templates: [
      {
        name: "Airflow - lote diário Merkle",
        description: "Gera lote, calcula Merkle root e aciona ancoragem Guardian",
        link: "#",
      },
      {
        name: "Notion - dashboard de provas",
        description: "Integra verify_url e status_c2pa em banco de evidências",
        link: "#",
      },
      {
        name: "AppSheet - requisições LGPD",
        description: "Interface low-code para POST /privacy/erasure com idempotency_key",
        link: "#",
      },
    ],
    tools: ["guardian_registry"],
  },
};

const STATUS_STYLES: Record<RunStatus, { label: string; badgeClass: string; indicatorClass: string }> = {
  pending: {
    label: "Na fila",
    badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-200 animate-pulse",
    indicatorClass: "from-amber-400/70 via-amber-400/20 to-transparent",
  },
  running: {
    label: "Em execução",
    badgeClass: "border-amber-300/50 bg-amber-300/15 text-amber-100 animate-pulse",
    indicatorClass: "from-amber-300/70 via-amber-300/20 to-transparent",
  },
  success: {
    label: "Sucesso",
    badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    indicatorClass: "from-emerald-400/60 via-emerald-400/20 to-transparent",
  },
  error: {
    label: "Erro",
    badgeClass: "border-rose-500/50 bg-rose-500/15 text-rose-200",
    indicatorClass: "from-rose-500/70 via-rose-500/20 to-transparent",
  },
  blocked: {
    label: "Revisão",
    badgeClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    indicatorClass: "from-yellow-500/60 via-yellow-500/20 to-transparent",
  },
};

const getAgentInitials = (agent: string) => {
  const compact = agent.replace(/[^a-zA-Z0-9]/g, "");
  return (compact.slice(0, 2) || agent.slice(0, 2) || "AI").toUpperCase();
};

const formatRunId = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

const centsToBRL = (cents?: number) => {
  if (cents === undefined) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
};

const formatClockTime = (iso?: string) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return null;
  }
};

const extractDuration = (run: Run) => {
  if (run.meta?.tookMs !== undefined) return run.meta.tookMs;
  if (run.startedAt && run.finishedAt) {
    const started = new Date(run.startedAt).getTime();
    const finished = new Date(run.finishedAt).getTime();
    if (!Number.isNaN(started) && !Number.isNaN(finished)) {
      return Math.max(0, finished - started);
    }
  }
  return undefined;
};

const formatDuration = (ms?: number) => {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0).replace(".", ",")} s`;
  return `${(ms / 60000).toFixed(1).replace(".", ",")} min`;
};

const formatTrace = (traceId?: string) => {
  if (!traceId) return null;
  return traceId.length > 12 ? `Trace ${traceId.slice(0, 4)}…${traceId.slice(-4)}` : `Trace ${traceId}`;
};

const RunsPage: React.FC = () => {
  const [agentId, setAgentId] = useState<string>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOnboardingTab, setActiveOnboardingTab] = useState<"video" | "rest" | "sdk" | "templates">("video");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const { workspaceId = DEFAULT_WORKSPACE_ID } = useSession();
  const agentKey = (agentId ?? "").toLowerCase();
  const resources = RUN_RESOURCES[agentKey] ?? RUN_RESOURCES.__default;
  const onboardingTabs = [
    { id: "video", label: "Videos" },
    { id: "rest", label: "REST" },
    { id: "sdk", label: "SDK" },
    { id: "templates", label: "Low-code" },
  ] as const;

  const inFlightStatuses: RunStatus[] = ["pending", "running", "blocked"];
  const runSummary = useMemo(() => {
    if (!runs.length) {
      return {
        total: 0,
        success: 0,
        inFlight: 0,
        failed: 0,
        blocked: 0,
        totalCostCents: 0,
        averageDurationMs: null as number | null,
      };
    }

    const durations = runs
      .map((run) => extractDuration(run))
      .filter((value): value is number => typeof value === "number");

    return {
      total: runs.length,
      success: runs.filter((run) => run.status === "success").length,
      inFlight: runs.filter((run) => inFlightStatuses.includes(run.status)).length,
      failed: runs.filter((run) => run.status === "error").length,
      blocked: runs.filter((run) => run.status === "blocked").length,
      totalCostCents: runs.reduce((sum, run) => sum + (run.costCents ?? 0), 0),
      averageDurationMs:
        durations.length > 0 ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : null,
    };
  }, [runs, inFlightStatuses]);

  const averageDurationLabel = useMemo(() => {
    if (runSummary.averageDurationMs === null) return "—";
    return formatDuration(runSummary.averageDurationMs) ?? "—";
  }, [runSummary.averageDurationMs]);

  const totalCostLabel = useMemo(() => centsToBRL(runSummary.totalCostCents) ?? "—", [runSummary.totalCostCents]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "Nunca";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastUpdatedAt);
    } catch {
      return "Agora";
    }
  }, [lastUpdatedAt]);

  const fetchRuns = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await apiListRuns({ workspaceId, agent: agentId });
        setRuns(response.items);
        setSelectedRun((current) => {
          if (!current) {
            return response.items[0] ?? null;
          }
          const updated = response.items.find((run) => run.id === current.id);
          return updated ?? response.items[0] ?? null;
        });
        setError(null);
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!options?.silent) {
          setError("Nao foi possivel carregar os runs agora.");
        } else {
          console.error("Falha ao atualizar runs em background", err);
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [agentId, workspaceId]
  );

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const hasInFlightRuns = useMemo(() => runs.some((run) => inFlightStatuses.includes(run.status)), [runs]);

  useEffect(() => {
    if (!hasInFlightRuns) {
      return;
    }

    const interval = setInterval(() => {
      fetchRuns({ silent: true });
    }, 4000);

    return () => clearInterval(interval);
  }, [hasInFlightRuns, fetchRuns]);

  const handleSelectRun = async (id: string) => {
    try {
      const fullRun = await apiGetRun(id);
      setSelectedRun(fullRun);
    } catch (err) {
      console.error(err);
    }
  };

  const displayRun = useMemo(
    () =>
      selectedRun ?? {
        id: "run_1234",
        workspaceId,
        projectId: workspaceId,
        agent: agentId ?? "desconhecido",
        status: "success" as const,
        meta: { tookMs: 280, traceId: "trace_demo" },
        response: { ok: true, summary: "Execucao concluida" },
        costCents: 128,
      },
    [selectedRun, agentId, workspaceId]
  );

  const triggerRun = async (mode: "simulate" | "execute") => {
    if (!agentId) {
      setActionError("Selecione um agente antes de executar.");
      return;
    }
    setActionError(null);
    setIsSubmitting(true);
    try {
      const response = await apiCreateRun({
        agent: agentId,
        prompt: resources.prompt,
        workspaceId,
        metadata: { mode },
      });
      const createdRun = response?.data;
      if (createdRun) {
        setRuns((prev) => [createdRun, ...prev.filter((run) => run.id !== createdRun.id)]);
        setSelectedRun(createdRun);
        setLastUpdatedAt(new Date());
        if (createdRun.status === "pending" || createdRun.status === "running") {
          setTimeout(() => {
            fetchRuns({ silent: true });
          }, 1000);
        }
      } else {
        fetchRuns({ silent: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao executar run.";
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startTour = () => {
    introJs()
      .setOptions({
        nextLabel: "Proximo",
        prevLabel: "Voltar",
        skipLabel: "Sair",
        doneLabel: "Pronto para orquestrar",
        showProgress: true,
        tooltipClass: "mission-control-tour",
        highlightClass: "mission-control-highlight",
        steps: [
          {
            element: '[data-tour="agent-select"]',
            title: "Etapa 1: Selecionar agente",
            intro:
              "Escolha o modulo que deseja executar. Cada agente cobre um dominio especifico - juridico, pitch, decisoes DeFi, etc.",
          },
          {
            element: '[data-tour="cost-estimate"]',
            title: "Etapa 2: Ver estimativa de custo",
            intro:
              "Aqui voce ve quanto deve custar a proxima chamada com base no tamanho do payload (ex.: 41 bytes). Use esta referencia para decidir entre rodar ou simular.",
          },
          {
            element: '[data-tour="project-context"]',
            title: "Etapa 3: Contexto do projeto",
            intro:
              "O selo indica em qual projeto ou ambiente as execucoes serao contabilizadas. Isso impacta limites e consumo.",
          },
          {
            element: '[data-tour="onboarding-panel"]',
            title: "Etapa 4: Onboarding tecnico",
            intro:
              "Assista a videos curtos, copie snippets REST ou SDK e baixe templates low-code para integrar o agente rapidamente.",
          },
          {
            element: '[data-tour="run-actions"]',
            title: "Etapa 5: Executar ou simular",
            intro:
              "Use as acoes para rodar fluxos reais ou simular primeiro. Simular ajuda a validar payload antes de gastar recursos ou publicar on-chain.",
          },
          {
            element: '[data-tour="run-history"]',
            title: "Etapa 6: Monitorar execucoes",
            intro:
              "Acompanhe status, tempos e horarios. Clique em cada item para ver entrada e saida completas - essencial para auditoria.",
          },
          {
            element: '[data-tour="run-viewer"]',
            title: "Etapa 7: Finalizar com acao",
            intro:
              "Se a execucao estiver ok, avance para persistir dados, acionar webhooks ou publicar on-chain.",
          },
        ],
      })
      .start();
  };

  return (
    <div className="space-y-10">
      <section className="glass-panel relative overflow-hidden p-8">
        <div className="absolute right-10 top-0 h-32 w-32 rounded-full bg-accent/30 blur-3xl" />
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent">Mission Control</p>
              <h1 className="text-3xl font-display font-semibold text-foreground md:text-4xl">
                Orquestracao de Runs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Monitore execucoes, confirme simulacoes e acompanhe custos em tempo real para cada agente.
              </p>
              <button
                type="button"
                onClick={startTour}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-accent transition hover:border-accent/70 hover:bg-accent/20"
              >
                Iniciar tour interativo
              </button>
            </div>
            <span className="pill" data-tour="project-context">
              Workspace {workspaceId}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-subtle p-5" data-tour="agent-select">
              <h3 className="text-sm font-medium text-muted-foreground">Selecionar agente</h3>
              <AgentSelect value={agentId} onChange={setAgentId} />
            </div>
            <div className="glass-subtle flex flex-col justify-between gap-4 p-5" data-tour="cost-estimate">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Estimativa de custo</h3>
                <p className="text-xs text-muted-foreground">
                  Considerando payload de <strong>{resources.prompt.length}</strong> bytes.
                </p>
              </div>
              <CostBadge
                agent={agentId}
                inputBytes={resources.prompt.length}
                tools={resources.tools}
                workspaceId={workspaceId}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-[0_25px_65px_-45px_rgba(56,189,248,0.8)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Runs totais</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">Ultima atualizacao {lastUpdatedLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Em andamento</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.inFlight}</p>
              <p className="mt-1 text-xs text-muted-foreground">Bloqueados {runSummary.blocked}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Finalizados</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.success}</p>
              <p className="mt-1 text-xs text-muted-foreground">Falhas {runSummary.failed}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Tempo medio</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{averageDurationLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">Custo acumulado {totalCostLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section
        data-tour="onboarding-panel"
        className="glass-panel grid gap-6 p-8 lg:grid-cols-[0.5fr,0.5fr]"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Onboarding tecnico</p>
            <h2 className="text-2xl font-display font-semibold text-foreground">Aprenda em minutos</h2>
            <p className="text-sm text-muted-foreground">
              Combine videos, snippets e templates low-code para conectar seu fluxo sem escrever muito codigo.
            </p>
          </div>
          <div className="grid w-full auto-cols-[minmax(110px,1fr)] grid-flow-col gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground no-scrollbar sm:text-xs md:grid-flow-row md:grid-cols-4 md:overflow-visible">
            {onboardingTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveOnboardingTab(tab.id)}
                className={`w-full whitespace-nowrap rounded-full px-3 py-1.5 text-center transition sm:px-4 sm:py-2 ${
                  activeOnboardingTab === tab.id
                    ? "bg-accent/20 text-accent"
                    : "hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="glass-subtle min-h-[220px] p-6">
            {activeOnboardingTab === "video" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tour rapido (2 min)</p>
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  <iframe
                    className="h-full w-full"
                    src="https://www.youtube.com/embed/c0U8x8s4b4k"
                    title="Onboarding Mission Control"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Substitua pelo video oficial do time quando estiver disponivel. Ideal para apresentacoes rapidas.
                </p>
              </div>
            )}
            {activeOnboardingTab === "rest" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Exemplo REST (curl)</p>
                <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
{resources.restSnippet}
                </pre>
              </div>
            )}
            {activeOnboardingTab === "sdk" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SDK Node (fetch)</p>
                <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
{resources.sdkSnippet}
                </pre>
              </div>
            )}
            {activeOnboardingTab === "templates" && (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Templates low-code</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {resources.templates.map((template) => (
                    <a
                      key={template.name}
                      href={template.link}
                      target="_blank"
                      rel="noreferrer"
                      className="glass-subtle flex flex-col gap-2 p-4 text-left transition hover:border-accent/40 hover:bg-accent/10"
                    >
                      <span className="text-sm font-semibold text-foreground">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                      <span className="text-xs font-semibold uppercase tracking-widest text-accent">Abrir template</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <aside className="glass-subtle flex flex-col gap-4 p-6 text-sm text-muted-foreground">
          <h3 className="text-lg font-semibold text-foreground">Como usar</h3>
          <ol className="space-y-2 text-xs leading-relaxed">
            <li>1. Assista ao video ou escolha o snippet que mais combina com sua stack.</li>
            <li>2. Configure o token (EIAH_TOKEN) e o workspaceId do cliente.</li>
            <li>3. Rode uma simulacao antes de liberar o fluxo real.</li>
            <li>4. Conecte um template low-code para pilotos rapidos ou equipes nao tecnicas.</li>
          </ol>
          <p>
            Recursos aqui sao exemplos mockados. Substitua pelos links oficiais assim que os materiais do time estiverem prontos.
          </p>
        </aside>
      </section>

      <section
        data-tour="run-actions"
        className="glass-subtle flex flex-col gap-3 p-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">Executar ou simular</h2>
          <p>
            Utilize as acoes abaixo para disparar uma execucao real ou testar primeiro sem comprometer recursos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => triggerRun("simulate")}
            className="rounded-full border border-accent/60 bg-accent/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 sm:px-4 sm:py-2 sm:text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Executando..." : "Simular primeiro"}
          </button>
          <button
            type="button"
            onClick={() => triggerRun("execute")}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent sm:px-4 sm:py-2 sm:text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Executando..." : "Rodar agora"}
          </button>
        </div>
        {actionError && (
          <p className="text-xs text-red-300" role="alert">
            {actionError}
          </p>
        )}
      </section>

      <section className="glass-panel relative overflow-hidden p-0">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-1/3 translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
        <div className="space-y-6 p-6 sm:p-8">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-display font-semibold text-foreground">Runs recentes</h2>
              <p className="text-sm text-muted-foreground">
                Visualize execucoes, tempos de resposta e confirme resultados antes do envio on-chain.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="pill">{runs.length} runs</span>
              <span className="pill">Atualizado {lastUpdatedLabel}</span>
              <button
                type="button"
                onClick={() => fetchRuns()}
                className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/60 hover:bg-accent/20 disabled:opacity-60"
                disabled={isLoading}
              >
                {isLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </header>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/30 p-4 text-sm text-red-200">{error}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.42fr),minmax(0,0.58fr)] xl:grid-cols-[0.4fr,0.6fr]">
              <div
                className="glass-subtle flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface/70"
                data-tour="run-history"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  <span>Timeline de execução</span>
                  {hasInFlightRuns && (
                    <span className="inline-flex items-center gap-1 text-amber-200">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                      Atualizando em tempo real
                    </span>
                  )}
                </div>
                  <div className="no-scrollbar flex max-h-[75vh] flex-col gap-4 overflow-y-auto px-4 py-6 md:max-h-[65vh] xl:max-h-[70vh]">
                  {runs.length === 0 && !isLoading ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
                      Nenhum run encontrado para este contexto. Execute uma simulacao para comecar.
                    </div>
                  ) : (
                    runs.map((run) => {
                      const isActive = selectedRun?.id === run.id;
                      const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.success;
                      const startedAt = formatClockTime(run.startedAt);
                      const duration = formatDuration(extractDuration(run));
                      const cost = centsToBRL(run.costCents);
                      const trace = formatTrace(run.meta?.traceId);
                      const metaItems = [
                        startedAt ? `Iniciado ${startedAt}` : null,
                        duration ? `Tempo ${duration}` : null,
                        cost ? `Custo ${cost}` : "Custo pendente",
                      ].filter(Boolean);
                      return (
                        <button
                          key={run.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => handleSelectRun(run.id)}
                          className={`group relative flex flex-col gap-4 rounded-3xl border px-5 py-5 text-left transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            isActive
                              ? "border-accent/70 bg-gradient-to-br from-accent/15 via-surface/95 to-black/40 shadow-[0_30px_70px_-40px_rgba(56,189,248,0.65)]"
                              : "border-white/10 bg-white/5 hover:border-accent/50 hover:bg-accent/10 hover:shadow-[0_24px_48px_-40px_rgba(56,189,248,0.55)]"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b ${statusStyle.indicatorClass}`}
                          />
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold uppercase tracking-wide ${
                                  isActive
                                    ? "bg-gradient-to-br from-accent/30 via-accent/10 to-transparent text-foreground shadow-[0_8px_18px_rgba(56,189,248,0.35)]"
                                    : "bg-white/5 text-accent shadow-[0_4px_10px_rgba(15,23,42,0.45)]"
                                }`}
                              >
                                {getAgentInitials(run.agent)}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <span className="block truncate text-base font-semibold text-foreground">{run.agent}</span>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                                    {formatRunId(run.id)}
                                  </span>
                                  {trace && (
                                    <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 sm:inline">
                                      {trace}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${statusStyle.badgeClass}`}
                            >
                              {statusStyle.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {metaItems.map((item) => (
                              <span
                                key={item}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1"
                              >
                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                                {item}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-accent transition group-hover:text-accent">
                            <span className="flex items-center gap-1">
                              Ver detalhes
                              <span aria-hidden="true" className="text-base leading-none">&gt;</span>
                            </span>
                            <span>{isActive ? "Aberto" : "Inspecionar"}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div data-tour="run-viewer" className="flex min-h-[420px] flex-col">
                <RunViewer run={displayRun} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default RunsPage;
