import React, { useCallback, useEffect, useMemo, useState } from "react";
import introJs from "intro.js";
import "intro.js/minified/introjs.min.css";
import AgentSelect from "../../../components/agents/AgentSelect";
import CostBadge from "../../../components/billing/CostBadge";
import RunViewer from "../../../components/runs/RunViewer";
import { RUN_STATUS_STYLES } from "@/components/runs/statusStyles";
import {
  centsToBRL,
  extractDuration,
  formatClockTime,
  formatDuration,
  formatAgentLabel,
  formatRunId,
  formatTrace,
  getAgentInitials,
} from "@/components/runs/utils";
import {
  ApiError,
  apiGetImobFunnelHealth,
  apiGetRun,
  apiGetTenantBillingSummary,
  apiListImobBlockedRuns,
  apiListRuns,
  ImobFunnelHealth,
  Run,
  RunStatus,
} from "../../../lib/api";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import { useSession } from "@/state/sessionStore";
import { getDomainTerm } from "@/domain/semantics";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "https://api.eiah.local/api";
const TENANT_PLACEHOLDER = import.meta.env.VITE_TENANT_ID ?? "tenant-demo";
const WORKSPACE_PLACEHOLDER = import.meta.env.VITE_WORKSPACE_ID ?? "workspace-demo";
const DEFAULT_WORKSPACE_ID = WORKSPACE_PLACEHOLDER;
const ORPHAN_PENDING_HIDE_MS = 2 * 60 * 1000;

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
  -H "x-eiah-tenant: ${TENANT_PLACEHOLDER}" \
  -H "x-eiah-workspace: ${WORKSPACE_PLACEHOLDER}" \
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
      "x-eiah-tenant": "${TENANT_PLACEHOLDER}",
      "x-eiah-workspace": "${WORKSPACE_PLACEHOLDER}",
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
  -H "x-eiah-tenant: ${TENANT_PLACEHOLDER}" \
  -H "x-eiah-workspace: ${WORKSPACE_PLACEHOLDER}" \
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
      "x-eiah-tenant": "${TENANT_PLACEHOLDER}",
      "x-eiah-workspace": "${WORKSPACE_PLACEHOLDER}",
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

const RunsPage: React.FC = () => {
  const [agentId, setAgentId] = useState<string>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOnboardingTab, setActiveOnboardingTab] = useState<"video" | "rest" | "sdk" | "templates">("video");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [tenantQuotaPct, setTenantQuotaPct] = useState<number | null>(null);
  const [imobHealth, setImobHealth] = useState<ImobFunnelHealth | null>(null);
  const [imobBlockedRuns, setImobBlockedRuns] = useState<Array<{
    runId: string;
    status: string;
    reasonCodes: string[];
    ageHours: number;
    bundleHash: string | null;
    txId: string | null;
    updatedAt: string;
  }>>([]);
  const [imobLoading, setImobLoading] = useState(false);
  const [imobStatusFilter, setImobStatusFilter] = useState("blocked");
  const [imobReasonFilter, setImobReasonFilter] = useState("all");

  const session = useSession();
  const { tenantId, workspaceId = DEFAULT_WORKSPACE_ID, userId, token } = session;
  const isImobDomain = session.activeDomain === "imob";
  const hasImobAccess = session.entitlements?.REAL_ESTATE_CORE === true;
  const semanticDomain = isImobDomain ? "imob" : "core";
  const runLabelPlural = getDomainTerm(semanticDomain, "runPlural");
  const runLabelSingular = getDomainTerm(semanticDomain, "runSingular");
  const blockedLabelPlural = getDomainTerm(semanticDomain, "blockedPlural");
  const receiptLabel = getDomainTerm(semanticDomain, "receipt");
  const bundleLabel = getDomainTerm(semanticDomain, "bundle");
  const queueLabel = getDomainTerm(semanticDomain, "queue");
  const riskLabel = getDomainTerm(semanticDomain, "risk");
  const commandCenterLabel = getDomainTerm(semanticDomain, "commandCenter");
  const { executeAgent } = useAgentExecution();
  const agentKey = (agentId ?? "").toLowerCase();
  const resources = RUN_RESOURCES[agentKey] ?? RUN_RESOURCES.__default;
  const onboardingTabs = [
    { id: "video", label: "Videos" },
    { id: "rest", label: "REST" },
    { id: "sdk", label: "SDK" },
    { id: "templates", label: "Low-code" },
  ] as const;

  const visibleRuns = useMemo(() => {
    const now = Date.now();
    return runs.filter((run) => {
      if (!userId) return true;
      if (run.userId) return true;
      if (run.status !== "pending") return true;
      const baseTime = run.createdAt ?? run.startedAt;
      if (!baseTime) return true;
      const parsed = Date.parse(baseTime);
      if (!Number.isFinite(parsed)) return true;
      return now - parsed < ORPHAN_PENDING_HIDE_MS;
    });
  }, [runs, userId]);

  const inFlightStatuses: RunStatus[] = ["pending", "running"];
  const runSummary = useMemo(() => {
    if (!visibleRuns.length) {
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

    const durations = visibleRuns
      .map((run) => extractDuration(run))
      .filter((value): value is number => typeof value === "number");

    return {
      total: visibleRuns.length,
      success: visibleRuns.filter((run) => run.status === "success").length,
      inFlight: visibleRuns.filter((run) => inFlightStatuses.includes(run.status)).length,
      failed: visibleRuns.filter((run) => run.status === "error").length,
      blocked: visibleRuns.filter((run) => run.status === "blocked").length,
      totalCostCents: visibleRuns.reduce((sum, run) => sum + (run.costCents ?? 0), 0),
      averageDurationMs:
        durations.length > 0 ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : null,
    };
  }, [visibleRuns, inFlightStatuses]);

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

  const fetchTenantQuota = useCallback(async () => {
    try {
      const response = await apiGetTenantBillingSummary();
      const hardLimit = response.data.policy?.monthlyCostCentsLimit ?? 0;
      const currentCost = response.data.totals?.costCents ?? 0;
      if (hardLimit > 0) {
        setTenantQuotaPct(Math.min(100, (currentCost / hardLimit) * 100));
      } else {
        setTenantQuotaPct(null);
      }
    } catch {
      setTenantQuotaPct(null);
    }
  }, []);

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
          const nextItems = response.items.filter((run) => {
            if (!userId) return true;
            if (run.userId) return true;
            if (run.status !== "pending") return true;
            const baseTime = run.createdAt ?? run.startedAt;
            if (!baseTime) return true;
            const parsed = Date.parse(baseTime);
            if (!Number.isFinite(parsed)) return true;
            return Date.now() - parsed < ORPHAN_PENDING_HIDE_MS;
          });
          if (!current) return nextItems[0] ?? null;
          const updated = nextItems.find((run) => run.id === current.id);
          return updated ?? nextItems[0] ?? null;
        });
        setError(null);
        setLastUpdatedAt(new Date());
        fetchTenantQuota();
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
    [agentId, workspaceId, userId, fetchTenantQuota]
  );

  const fetchImobCommandCenter = useCallback(async () => {
    if (!isImobDomain || !hasImobAccess) return;
    setImobLoading(true);
    try {
      const [healthRes, blockedRes] = await Promise.all([
        apiGetImobFunnelHealth({ workspaceId }),
        apiListImobBlockedRuns({
          workspaceId,
          status: imobStatusFilter,
          reasonCode: imobReasonFilter === "all" ? undefined : imobReasonFilter,
          limit: 12,
        }),
      ]);
      setImobHealth(healthRes.data);
      setImobBlockedRuns(blockedRes.data.items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `Falha ao carregar Command Center IMOB (${error.status})`
          : "Falha ao carregar Command Center IMOB";
      setActionError(message);
    } finally {
      setImobLoading(false);
    }
  }, [hasImobAccess, imobReasonFilter, imobStatusFilter, isImobDomain, workspaceId]);

  const downloadImobArtifact = useCallback(
    async (type: "bundle" | "receipt", runId: string, txId?: string | null) => {
      if (!token) {
        setActionError("Sessao sem token para download de artefato.");
        return;
      }
      if (type === "receipt" && !txId) {
        setActionError("Run sem txId para exportar receipt.");
        return;
      }
      const path = type === "bundle" ? `/runs/${runId}/bundle` : `/ledger/${txId}`;
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        setActionError(`Falha ao baixar ${type} (${response.status}).`);
        return;
      }
      const payload = await response.text();
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = type === "bundle" ? `run-${runId}-bundle.json` : `run-${runId}-receipt.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [token]
  );

  useEffect(() => {
    fetchRuns();
    fetchTenantQuota();
  }, [fetchRuns, fetchTenantQuota]);

  useEffect(() => {
    void fetchImobCommandCenter();
  }, [fetchImobCommandCenter]);

  const hasInFlightRuns = useMemo(
    () => visibleRuns.some((run) => inFlightStatuses.includes(run.status)),
    [visibleRuns]
  );

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
    setActionNotice(null);
    setIsSubmitting(true);
    try {
      const response = await executeAgent(agentId, {
        agent: agentId,
        prompt: resources.prompt,
        workspaceId,
        metadata: { mode },
      });
      if (Array.isArray(response?.warnings) && response.warnings.length > 0) {
        setActionNotice(response.warnings[0]?.message ?? "Run enfileirado com aviso de quota.");
      }
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
      let message = err instanceof Error ? err.message : "Falha ao executar run.";
      if (err instanceof ApiError && err.status === 403 && err.body && typeof err.body === "object") {
        const body = err.body as {
          error?: {
            code?: string;
            message?: string;
            details?: {
              reasons?: Array<{ message?: string }>;
            };
          };
        };
        if (body.error?.code === "BILLING_GUARD_BLOCKED") {
          const reason = body.error.details?.reasons?.[0]?.message;
          message = reason
            ? `Bloqueado por quota de billing: ${reason}`
            : "Bloqueado por quota de billing (hard limit ou workspace desabilitado).";
        } else if (typeof body.error?.message === "string" && body.error.message.trim()) {
          message = body.error.message;
        }
      }
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
      {isImobDomain ? (
        hasImobAccess ? (
          <section className="glass-panel overflow-hidden p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">IMOB Command Center</p>
                <h2 className="text-2xl font-display font-semibold text-foreground">{commandCenterLabel}</h2>
                <p className="text-sm text-muted-foreground">
                  Visao executiva de funil e bloqueios para operacao imobiliaria.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill">{blockedLabelPlural}: {imobHealth?.summary.blockedTotal ?? runSummary.blocked}</span>
                <span className="pill">Aprovações pendentes: {imobHealth?.summary.pendingApprovals ?? runSummary.inFlight}</span>
                <span className="pill">Custo acumulado: {totalCostLabel}</span>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Bloqueios</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.blockedTotal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Pendente revisão</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.salesKitPendingReview ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Pendências legais</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.pendingLegal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Settlements parciais</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.partialSettlements ?? 0}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground"
                  value={imobStatusFilter}
                  onChange={(event) => setImobStatusFilter(event.target.value)}
                >
                  <option value="blocked">Estado: blocked</option>
                  <option value="pending">Estado: pending</option>
                  <option value="running">Estado: running</option>
                  <option value="error">Estado: error</option>
                </select>
                <select
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground"
                  value={imobReasonFilter}
                  onChange={(event) => setImobReasonFilter(event.target.value)}
                >
                  <option value="all">{riskLabel}: todos</option>
                  {(imobHealth?.byReasonCode ?? []).map((item) => (
                    <option key={item.reasonCode} value={item.reasonCode}>
                      {item.reasonCode}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fetchImobCommandCenter()}
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20"
                >
                  {imobLoading ? "Atualizando..." : `Atualizar ${queueLabel.toLowerCase()}`}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Workspace: {workspaceId}</p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-white/5 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{runLabelSingular}</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">{riskLabel}</th>
                    <th className="px-4 py-3">Idade</th>
                    <th className="px-4 py-3">Comprovantes</th>
                  </tr>
                </thead>
                <tbody>
                  {imobBlockedRuns.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-muted-foreground" colSpan={5}>
                        Nenhum caso para os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    imobBlockedRuns.map((item) => (
                      <tr key={item.runId} className="border-t border-white/10">
                        <td className="px-4 py-3 font-mono text-foreground/90">{formatRunId(item.runId)}</td>
                        <td className="px-4 py-3 text-foreground/90">{item.status}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.reasonCodes.join(", ") || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.ageHours.toFixed(1)}h</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void downloadImobArtifact("bundle", item.runId)}
                              className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-accent/40"
                            >
                              {bundleLabel}
                            </button>
                            <button
                              type="button"
                              onClick={() => void downloadImobArtifact("receipt", item.runId, item.txId)}
                              disabled={!item.txId}
                              className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-accent/40 disabled:opacity-40"
                            >
                              {receiptLabel}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">GateCard 403</p>
            <p className="mt-2 text-sm text-rose-100">
              Entitlement ausente para IMOB. Requer instalação ativa para habilitar a Central Operacional.
            </p>
          </section>
        )
      ) : null}

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
            <div className="flex flex-wrap items-center gap-2" data-tour="project-context">
              <span className="pill">Tenant: {tenantId ?? "—"}</span>
              <span className="pill">Workspace: {workspaceId}</span>
              <span className="pill">Agente: {agentId ?? "—"}</span>
              {tenantQuotaPct !== null ? <span className="pill">Quota: {tenantQuotaPct.toFixed(1)}%</span> : null}
            </div>
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">{runLabelPlural} totais</p>
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
        {actionNotice && !actionError ? (
          <p className="text-xs text-amber-200" role="status">
            {actionNotice}
          </p>
        ) : null}
      </section>

      <section className="glass-panel relative overflow-hidden p-0">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-1/3 translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
        <div className="space-y-6 p-6 sm:p-8">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-display font-semibold text-foreground">{runLabelPlural} recentes</h2>
              <p className="text-sm text-muted-foreground">
                Visualize execucoes, tempos de resposta e confirme resultados antes do envio on-chain.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="pill">{visibleRuns.length} {runLabelPlural.toLowerCase()}</span>
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
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Selecionar run
                </div>
                <select
                  value={selectedRun?.id ?? ""}
                  onChange={(event) => handleSelectRun(event.target.value)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground focus:border-accent/60 focus:outline-none"
                >
                  {visibleRuns.length === 0 ? (
                    <option value="">Nenhum run encontrado</option>
                  ) : (
                    visibleRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {formatAgentLabel(run.agent)} • {formatRunId(run.id)}
                      </option>
                    ))
                  )}
                </select>
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
