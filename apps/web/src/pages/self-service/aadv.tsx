import React, { useCallback, useEffect, useMemo, useState } from "react";
import SelfServiceNav from "./components/SelfServiceNav";
import AgentFormShell from "./components/AgentFormShell";
import RunViewer from "@/components/runs/RunViewer";
import { RUN_STATUS_STYLES } from "@/components/runs/statusStyles";
import { useSession } from "@/state/sessionStore";
import { apiGetRun, apiListRuns, Run, RunStatus } from "@/lib/api";
import {
  centsToBRL,
  extractDuration,
  formatClockTime,
  formatDuration,
  formatRunId,
  formatTrace,
  getAgentInitials,
} from "@/components/runs/utils";

type IconProps = { className?: string };
const createPlaceholderIcon = () =>
  function PlaceholderIcon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M8 12h8" />
      </svg>
    );
  };

const BarChart2 = createPlaceholderIcon();
const Briefcase = createPlaceholderIcon();
const CheckCircle2 = createPlaceholderIcon();
const Clock = createPlaceholderIcon();
const Copy = createPlaceholderIcon();
const DollarSign = createPlaceholderIcon();
const Download = createPlaceholderIcon();
const Printer = createPlaceholderIcon();
const Shield = createPlaceholderIcon();
const Users = createPlaceholderIcon();
const Zap = createPlaceholderIcon();
const Info = createPlaceholderIcon();

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-3xl border border-white/10 bg-surface/70 text-foreground shadow-xl shadow-black/40 ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b border-white/5 p-4">
    <h2 className="text-lg font-semibold">{children}</h2>
  </div>
);

const CardContent = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "outline";
};

const Button = ({ variant = "secondary", className = "", type = "button", ...props }: ButtonProps) => {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-60";
  const variants = {
    secondary: "border-white/10 bg-white/5 text-foreground hover:border-accent/40 hover:bg-accent/10",
    outline: "border-accent/40 bg-transparent text-accent hover:bg-accent/10",
  };

  return <button type={type} className={`${base} ${variants[variant]} ${className}`.trim()} {...props} />;
};

const personasOpt = ["Gestor Financeiro", "Analista de Segurança", "Operações", "Diretoria", "Atendimento"];
const categoriasOpt = ["Custo/FinOps", "Produtividade", "Risco/Conformidade", "Atendimento", "RH"];
const kpisOpt = ["Tempo poupado", "Economia estimada", "Incidentes evitados", "Adoção"];
const checklistFinOps = ["Pre-fatura visível", "Reconcile OK (eiah billing reconcile)", "PlanQuota definida", "Sem anomalias"];
const checklistSeguranca = [
  "RBAC OK",
  "KMS ativo e logs mascarados",
  "Isolamento por equipes internas (times, filiais, projetos)",
  "Trilha assinada OK",
];

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toNum = (value: string) => {
  const parsed = parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeMoney = (value: string) => {
  const cleaned = value.replace(/[^\d,-]/g, "").replaceAll(".", "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
};
const normalizeDateISO = (value: string) => {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return value || undefined;
  const [, day, month, yearRaw, hour = "0", minute = "0"] = match;
  const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
  const date = new Date(year, Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};
const normalizeBoolean = (value: string | boolean) => {
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  return ["sim", "true", "1", "yes"].includes(normalized);
};

const WORKSPACE_PLACEHOLDER = import.meta.env.VITE_WORKSPACE_ID ?? "workspace-demo";
const DEFAULT_WORKSPACE_ID = WORKSPACE_PLACEHOLDER;
const IN_FLIGHT_STATUSES: RunStatus[] = ["pending", "running", "blocked"];

function AadvRecentRuns() {
  const { workspaceId = DEFAULT_WORKSPACE_ID } = useSession();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const response = await apiListRuns({ workspaceId, agent: "AADV" });
        setRuns(response.items);
        setSelectedRun((current) => {
          if (!current) {
            return response.items[0] ?? null;
          }
          const updated = response.items.find((run) => run.id === current.id);
          return updated ?? response.items[0] ?? null;
        });
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (!options?.silent) {
          setError("Não foi possível carregar os runs agora.");
        } else {
          console.error("Falha ao atualizar runs AADV", err);
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const hasInFlightRuns = useMemo(() => runs.some((run) => IN_FLIGHT_STATUSES.includes(run.status)), [runs]);

  useEffect(() => {
    if (!hasInFlightRuns) return;
    const interval = setInterval(() => fetchRuns({ silent: true }), 4000);
    return () => clearInterval(interval);
  }, [fetchRuns, hasInFlightRuns]);

  const handleSelectRun = useCallback(async (id: string) => {
    try {
      const fullRun = await apiGetRun(id);
      setSelectedRun(fullRun);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const displayRun = useMemo(
    () =>
      selectedRun ?? {
        id: "run_1234",
        workspaceId,
        projectId: workspaceId,
        agent: "AADV",
        status: "success" as const,
        meta: { tookMs: 280, traceId: "trace_demo" },
        response: { ok: true, summary: "Execução concluída" },
        costCents: 128,
      },
    [selectedRun, workspaceId]
  );

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

  return (
    <section className="glass-panel relative overflow-hidden p-0">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-1/3 translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
      <div className="space-y-6 p-6 sm:p-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold text-foreground">Runs recentes</h2>
            <p className="text-sm text-muted-foreground">Monitore o histórico do AADV com o mesmo layout do painel principal.</p>
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
            <div className="glass-subtle flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface/70">
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
                    Nenhum run do AADV foi encontrado. Envie uma execução para começar.
                  </div>
                ) : (
                  runs.map((run) => {
                    const isActive = selectedRun?.id === run.id;
                    const statusStyle = RUN_STATUS_STYLES[run.status] ?? RUN_STATUS_STYLES.success;
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
                            <span key={item} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1">
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
            <div className="flex min-h-[420px] flex-col">
              <RunViewer run={displayRun} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}


const TagMultiField = ({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string[];
  onChange: (val: string[]) => void;
  options: string[];
  helper?: string;
}) => {
  const toggle = (option: string) => {
    const set = new Set(value);
    set.has(option) ? set.delete(option) : set.add(option);
    onChange(Array.from(set));
  };
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${
              value.includes(option) ? "border-accent bg-accent text-white" : "border-white/20 bg-white/5 text-muted-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
};

const TextAreaField = ({
  id,
  label,
  value,
  onChange,
  rows = 4,
  helper,
  icon: Icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  helper?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <label className="space-y-2 text-sm text-foreground">
    <span className="flex items-center gap-2 text-muted-foreground">
      {Icon && <Icon className="h-4 w-4 text-accent" />} {label}
    </span>
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-foreground placeholder:text-muted-foreground/60 focus:border-accent"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
    {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
  </label>
);

const InputField = ({
  id,
  label,
  value,
  onChange,
  helper,
  type = "text",
  icon: Icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  type?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => (
  <label className="space-y-2 text-sm text-foreground">
    <span className="flex items-center gap-2 text-muted-foreground">
      {Icon && <Icon className="h-4 w-4 text-accent" />} {label}
    </span>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-foreground placeholder:text-muted-foreground/60 focus:border-accent"
    />
    {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
  </label>
);

const SelectField = ({
  id,
  label,
  value,
  onChange,
  options,
  helper,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  helper?: string;
}) => (
  <label className="space-y-2 text-sm text-foreground">
    <span className="text-muted-foreground">{label}</span>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-foreground focus:border-accent"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
  </label>
);

type AadvFormValues = {
  personas: string[];
  categoria: string;
  kpi90d: string;
  volumeMes: string;
  horasPorTarefa: string;
  custoHora: string;
  tarefasRepetitivas: string;
  finOpsExemplo: string;
  restricoes: string;
  kpis: string[];
  runTask: string;
  runInicio: string;
  runFim: string;
  runPausaAprovacao: string;
  runPausaDuracao: string;
  runErros: string;
  runPassos: string;
  billingExecId: string;
  billingTotal: string;
  billingIa: string;
  billingTools: string;
  billingRealtime: string;
  rbacPapelUsuario: string;
  rbacAprovador: string;
  rbacVisualiza: string;
  rbacPapeis: string;
  panelFinops: boolean;
  panelRunViewer: boolean;
  panelApprovalUI: boolean;
};

const initialValues: AadvFormValues = {
  personas: [personasOpt[0]],
  categoria: "Custo/FinOps",
  kpi90d: "Aumentar eficiência em 20%",
  volumeMes: "100",
  horasPorTarefa: "2",
  custoHora: "50",
  tarefasRepetitivas: "Análise de logs de segurança e geração de relatórios mensais de conformidade.",
  finOpsExemplo: "Não monitoramos o custo por execução; orçamento é fixo.",
  restricoes: "Dados de clientes são PII e devem ser mascarados.",
  kpis: ["Tempo poupado", "Economia estimada"],
  runTask: "",
  runInicio: "",
  runFim: "",
  runPausaAprovacao: "não",
  runPausaDuracao: "",
  runErros: "não",
  runPassos: "",
  billingExecId: "",
  billingTotal: "",
  billingIa: "",
  billingTools: "",
  billingRealtime: "sim",
  rbacPapelUsuario: "",
  rbacAprovador: "",
  rbacVisualiza: "",
  rbacPapeis: "",
  panelFinops: true,
  panelRunViewer: true,
  panelApprovalUI: true,
};

const recomendarPlano = (roi: number, horasPoupadas: number) => {
  if (roi >= 2) return "Plano Pro (R$ 450/mês)";
  if (roi >= 1 || horasPoupadas >= 20) return "Teste Grátis (7 dias)";
  return "Não recomendado ainda";
};

const computeNumbers = (values: AadvFormValues) => {
  const volume = toNum(values.volumeMes);
  const horas = toNum(values.horasPorTarefa);
  const custo = toNum(values.custoHora);
  const horasPoupadas = volume * horas;
  const valorMensal = horasPoupadas * custo;
  const roi = valorMensal > 0 ? valorMensal / 450 : 0;
  const prontidao = roi >= 2 ? "Completo" : roi >= 1 ? "Intermediário" : horasPoupadas >= 20 ? "Básico" : "Exploratório";
  return { horasPoupadas, valorMensal, roi, prontidao };
};

const buildSchema = (values: AadvFormValues, numbers: ReturnType<typeof computeNumbers>, planoSugerido: string) => {
  const metricasAlvo = {
    lat_ms: "<= 4000",
    p95_step_ms: "<= 4000",
    "taxa_erro_%": "<= 2",
    "retrabalho_%": "- 30",
    custo_run_usd: "<= 2.00",
    "tokens_tools_%": "<= 40",
    ttfr_ms: "<= 1500",
  };

  return {
    persona: values.personas[0] || "não informado",
    categoria: values.categoria,
    pergunta_critica: values.kpi90d,
    hipotese_valor: values.tarefasRepetitivas,
    explicacao_leiga: values.restricoes,
    evidencias_requeridas: ["BillingLedger consulta", "RunEvent->trace_id", "RBAC->RoleAssignment", "DLQ metric", "KMS log"],
    metricas_alvo: metricasAlvo,
    procedimentos_verificacao: ["CLI: eiah billing reconcile", "CLI: eiah runs replay --trace", "Painel: FinOps", "Painel: Run Viewer"],
    checklist_finops: {
      previsibilidade: true,
      reconciliacao_ok: true,
      quota_definida: true,
      alerta_anomalia: false,
    },
    checklist_seguranca: {
      rbac_ok: true,
      kms_ok: true,
      isolation_ok: true,
      logs_mascarados: true,
      trilha_assinada_ok: true,
    },
    riscos: ["Dados parciais podem reduzir confiança"],
    red_flags: values.billingRealtime === "sim" ? [] : ["Sem custo em tempo real"],
    acao_corretiva: "Habilitar PlanQuota e reconciliar com eiah billing reconcile",
    veredito: "go_condicional",
    _fontes: {
      run_event: {
        tarefa: values.runTask,
        inicio_iso: normalizeDateISO(values.runInicio),
        fim_iso: normalizeDateISO(values.runFim),
        pausa_aprovacao: normalizeBoolean(values.runPausaAprovacao),
        pausa_duracao: values.runPausaDuracao,
        erros: values.runErros,
        passos_ultimos: values.runPassos
          .split(/\n|,|;/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
      billing_ledger: {
        exec_id: values.billingExecId,
        custo_total: normalizeMoney(values.billingTotal),
        custo_ia: normalizeMoney(values.billingIa),
        custo_tools: normalizeMoney(values.billingTools),
        custo_em_tempo_real: normalizeBoolean(values.billingRealtime),
      },
      rbac: {
        papel_usuario: values.rbacPapelUsuario,
        quem_aprova: values.rbacAprovador,
        quem_visualiza: values.rbacVisualiza
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        papeis_ativos: values.rbacPapeis
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      paineis: {
        finops_leitura: values.panelFinops,
        run_viewer_leitura: values.panelRunViewer,
        ponto_aprovacao_visivel: values.panelApprovalUI,
      },
    },
    metadata: {
      personas: values.personas,
      kpis: values.kpis,
      roi: numbers.roi,
      prontidao: numbers.prontidao,
      planoSugerido,
      valorMensal: numbers.valorMensal,
    },
  };
};

const buildPrompt = (values: AadvFormValues, numbers: ReturnType<typeof computeNumbers>) => {
  const personas = values.personas.length ? values.personas.join(", ") : "não informado";
  return [
    "Você é o AADV Self-Service. Gere o dossiê com JSONL no ESQUEMA_SAIDA e um resumo executivo.",
    `Persona(s): ${personas}. Categoria: ${values.categoria}.`,
    `Resultado esperado (90 dias): ${values.kpi90d || "não informado"}.`,
    `Tarefa repetitiva alvo: ${values.tarefasRepetitivas || "não informado"}.`,
    `Volume/mês: ${values.volumeMes || "não informado"}. Horas/tarefa: ${values.horasPorTarefa || "não informado"}. Custo/hora: ${values.custoHora || "não informado"}.`,
    `ROI estimado ${numbers.roi.toFixed(1)}x e prontidão ${numbers.prontidao}.`,
    `Restrições/guardrails: ${values.restricoes || "não informado"}.`,
    `Contexto FinOps: ${values.finOpsExemplo || "não informado"}.`,
    `KPIs para provar valor: ${values.kpis.join(", ") || "não informado"}.`,
    `Fontes RunEvent/Billing/RBAC foram informadas e devem ser refletidas na resposta.`,
    "Saída exigida: JSONL fiel ao schema + resumo executivo em HTML com seções Valor, Contexto, Risco, Recomendação.",
  ].join("\n");
};

export default function SelfServiceAadvPage() {
  const buildRequest = useCallback((values: AadvFormValues) => {
    const numbers = computeNumbers(values);
    const planoSugerido = recomendarPlano(numbers.roi, numbers.horasPoupadas);
    const schema = buildSchema(values, numbers, planoSugerido);
    const personaList = values.personas.length ? values.personas.join(", ") : "não informado";
    const prompt = [
      buildPrompt(values, numbers),
      "",
      "Retorne apenas um resumo estratégico curto (Markdown) com seções: Persona, Categoria, Resultado 90d, Dor principal, Guardrails, ROI/Plano.",
      "Após o resumo, inclua uma timeline com 3-4 bullets (• período — atividade) e um checklist com FinOps e Segurança.",
      "Ao final, forneça um resumo executivo em HTML (<h3>/<p>) com Valor, Contexto e Recomendação.",
      "Os dados completos já estão no metadata.schema — não replique o JSON na resposta."
        + ` Persona: ${personaList}. Categoria: ${values.categoria}. Resultado 90d: ${values.kpi90d || "não informado"}. Dor: ${
            values.tarefasRepetitivas || "não informado"
          }. Guardrails: ${values.restricoes || "não informado"}. ROI estimado: ${numbers.roi.toFixed(1)}x (Plano: ${planoSugerido}).`,
      "Seja conciso; nada além das seções descritas.",
    ].join("\n");
    return {
      prompt,
      metadata: {
        schema,
        roi: numbers.roi,
        prontidao: numbers.prontidao,
        valor_mensal: numbers.valorMensal,
      },
      rawPayload: schema,
    };
  }, []);

  return (
      <div className="space-y-6">
        <SelfServiceNav currentSlug="aadv" />
        <AgentFormShell<AadvFormValues>
        agentId="AADV"
        title="AADV Self-Service"
        description="Colete sinais operacionais, financeiros e de auditoria para gerar o dossiê AADV (JSONL + resumo executivo)."
        initialValues={initialValues}
        buildRequest={buildRequest}
      >
        {({ values, setValue, updateValues }) => {
          const numbers = computeNumbers(values);
          const planoPreview = recomendarPlano(numbers.roi, numbers.horasPoupadas);
          const schemaPreview = buildSchema(values, numbers, planoPreview);
          return (
            <div className="space-y-6">
              <Card>
                <CardHeader>Resumo em tempo real</CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.3em]">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-foreground">ROI {numbers.roi.toFixed(1)}x</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-foreground">Prontidão {numbers.prontidao}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-foreground">
                      Valor potencial {fmtBRL.format(numbers.valorMensal)}
                    </span>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-black/30 p-5 space-y-3 text-foreground">
                    <div>
                      <strong>Objetivo</strong>
                      <p>{values.kpi90d || "—"}</p>
                    </div>
                    <div>
                      <strong>Dor principal</strong>
                      <p>{values.tarefasRepetitivas || "—"}</p>
                    </div>
                    <div>
                      <strong>Guardrails</strong>
                      <p>{values.restricoes || "—"}</p>
                    </div>
                    <div>
                      <strong>Persona / Categoria</strong>
                      <p>{(values.personas.length ? values.personas.join(", ") : "—") + " • " + values.categoria}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Custo por run: {fmtBRL.format(450)} (mock). Ajuste os campos e clique em “Enviar” para acionar o run real.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>1. Perfil e objetivo (90 dias)</CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <TagMultiField
                      label="Persona principal"
                      value={values.personas}
                      onChange={(val) => setValue("personas", val)}
                      options={personasOpt}
                      helper="Escolha 1–2 personas para orientar o briefing"
                    />
                    <SelectField
                      id="categoria"
                      label="Categoria"
                      value={values.categoria}
                      onChange={(val) => setValue("categoria", val)}
                      options={categoriasOpt}
                    />
                  </div>
                  <TextAreaField
                    id="kpi90d"
                    label="Resultado esperado nos próximos 90 dias"
                    value={values.kpi90d}
                    onChange={(val) => setValue("kpi90d", val)}
                    rows={4}
                    helper="Use linguagem simples – ex.: Diminuir o tempo de aprovação de contratos de 5 para 2 dias."
                    icon={CheckCircle2}
                  />
                  <TextAreaField
                    id="tarefas"
                    label="Tarefa repetitiva que o agente deve atacar primeiro"
                    value={values.tarefasRepetitivas}
                    onChange={(val) => setValue("tarefasRepetitivas", val)}
                    rows={4}
                    icon={Clock}
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    <InputField
                      id="volume"
                      label="Execuções/mês"
                      value={values.volumeMes}
                      onChange={(val) => setValue("volumeMes", val)}
                      icon={Zap}
                    />
                    <InputField
                      id="horas"
                      label="Horas/execução"
                      value={values.horasPorTarefa}
                      onChange={(val) => setValue("horasPorTarefa", val)}
                      icon={Clock}
                    />
                    <InputField
                      id="custoHora"
                      label="Custo/hora (R$)"
                      value={values.custoHora}
                      onChange={(val) => setValue("custoHora", val)}
                      icon={DollarSign}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>2. Risco, FinOps e KPIs</CardHeader>
                <CardContent className="space-y-6">
                  <TextAreaField
                    id="restricoes"
                    label="Restrições de compliance/segurança"
                    value={values.restricoes}
                    onChange={(val) => setValue("restricoes", val)}
                    rows={3}
                    icon={Shield}
                  />
                  <TextAreaField
                    id="finops"
                    label="Exemplo de ponto cego FinOps"
                    value={values.finOpsExemplo}
                    onChange={(val) => setValue("finOpsExemplo", val)}
                    rows={3}
                    icon={DollarSign}
                  />
                  <TagMultiField
                    label="KPIs para provar valor"
                    value={values.kpis}
                    onChange={(val) => setValue("kpis", val)}
                    options={kpisOpt}
                    helper="Escolha os indicadores que quer acompanhar"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>3. Fontes de auditoria</CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <TextAreaField
                      id="runTask"
                      label="RunEvent – tarefa"
                      value={values.runTask}
                      onChange={(val) => setValue("runTask", val)}
                      rows={3}
                      icon={Clock}
                    />
                    <InputField
                      id="runInicio"
                      label="Início (dd/mm/aaaa HH:MM)"
                      value={values.runInicio}
                      onChange={(val) => setValue("runInicio", val)}
                    />
                    <InputField
                      id="runFim"
                      label="Fim (dd/mm/aaaa HH:MM)"
                      value={values.runFim}
                      onChange={(val) => setValue("runFim", val)}
                    />
                    <SelectField
                      id="runPausa"
                      label="Houve pausa awaiting_confirmation?"
                      value={values.runPausaAprovacao}
                      onChange={(val) => setValue("runPausaAprovacao", val)}
                      options={["sim", "não"]}
                    />
                    <InputField
                      id="runPausaDuracao"
                      label="Duração da pausa"
                      value={values.runPausaDuracao}
                      onChange={(val) => setValue("runPausaDuracao", val)}
                    />
                    <InputField
                      id="runErros"
                      label="Erros"
                      value={values.runErros}
                      onChange={(val) => setValue("runErros", val)}
                    />
                  </div>
                  <TextAreaField
                    id="runPassos"
                    label="Últimos passos (um por linha)"
                    value={values.runPassos}
                    onChange={(val) => setValue("runPassos", val)}
                    rows={3}
                  />
                  <div className="grid gap-6 lg:grid-cols-2">
                    <InputField
                      id="billingExecId"
                      label="Billing – Exec ID"
                      value={values.billingExecId}
                      onChange={(val) => setValue("billingExecId", val)}
                    />
                    <InputField
                      id="billingTotal"
                      label="Custo total (R$)"
                      value={values.billingTotal}
                      onChange={(val) => setValue("billingTotal", val)}
                    />
                    <InputField
                      id="billingIa"
                      label="Custo IA (R$)"
                      value={values.billingIa}
                      onChange={(val) => setValue("billingIa", val)}
                    />
                    <InputField
                      id="billingTools"
                      label="Custo ferramentas (R$)"
                      value={values.billingTools}
                      onChange={(val) => setValue("billingTools", val)}
                    />
                    <SelectField
                      id="billingRealtime"
                      label="Streaming em tempo real?"
                      value={values.billingRealtime}
                      onChange={(val) => setValue("billingRealtime", val)}
                      options={["sim", "não"]}
                    />
                  </div>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <InputField
                      id="rbacPapel"
                      label="RBAC – papel usuário"
                      value={values.rbacPapelUsuario}
                      onChange={(val) => setValue("rbacPapelUsuario", val)}
                    />
                    <InputField
                      id="rbacAprovador"
                      label="Quem aprova ações críticas"
                      value={values.rbacAprovador}
                      onChange={(val) => setValue("rbacAprovador", val)}
                    />
                    <InputField
                      id="rbacVisualiza"
                      label="Quem visualiza (vírgula)"
                      value={values.rbacVisualiza}
                      onChange={(val) => setValue("rbacVisualiza", val)}
                    />
                    <InputField
                      id="rbacPapeis"
                      label="Papéis ativos (vírgula)"
                      value={values.rbacPapeis}
                      onChange={(val) => setValue("rbacPapeis", val)}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3 text-sm text-muted-foreground">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={values.panelFinops} onChange={(e) => setValue("panelFinops", e.target.checked)} /> FinOps leitura
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={values.panelRunViewer} onChange={(e) => setValue("panelRunViewer", e.target.checked)} /> Run Viewer leitura
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={values.panelApprovalUI} onChange={(e) => setValue("panelApprovalUI", e.target.checked)} /> Ponto de aprovação visível
                    </label>
                  </div>
                </CardContent>
              </Card>

              <Card className="no-print">
                <CardHeader>Prévia do JSONL (ESQUEMA_SAIDA)</CardHeader>
                <CardContent>
                  <pre className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-foreground overflow-x-auto">
                    {JSON.stringify(schemaPreview, null, 2)}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(schemaPreview, null, 2))}>
                      <Copy className="h-4 w-4 mr-2" /> Copiar prévia
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(schemaPreview) + "\n"], { type: "application/json" });
                        const anchor = document.createElement("a");
                        anchor.href = URL.createObjectURL(blob);
                        anchor.download = "preview_aadv.jsonl";
                        anchor.click();
                        URL.revokeObjectURL(anchor.href);
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" /> Baixar prévia
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        }}
      </AgentFormShell>
      <AadvRecentRuns />
    </div>
  );
}
