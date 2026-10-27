import React from "react";
import {
  ApiError,
  apiGetImobExecutiveSummary,
  apiGetImobFunnelHealth,
  apiGetImobKpiFunnel,
  apiGetImobKpiPerformance,
  apiListImobApprovalContext,
  apiListImobBottleneckHeatmap,
  apiListImobCases,
  apiListImobCaseCosts,
  apiListImobPriorityQueue,
  apiListImobWaitingOnBoard,
  apiPostImobApprovalAction,
  apiRequestChatVerticalHandoff,
  type ImobApprovalContextItem,
  type ImobFunnelHealth,
  type ImobHeatmapCell,
  type ImobKpiFunnel,
  type ImobKpiPerformance,
  type ImobPriorityQueueItem,
  type ImobRescueMetric,
  type ImobSpecialistLoadMetric,
  type ImobWaitingOnBucket,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import { resolveImobAccessGateCopy } from "@/features/imob/accessGateCatalog";
import { IMOB_MANAGEMENT_CARD_TITLE } from "@/components/agents/imobManagementConversationEngine";
import { ImobCommandCenter } from "@/features/imob/ImobCommandCenter";
import { ImobFunnelTab } from "@/features/imob/funnel/ImobFunnelTab";
import {
  buildImobCaseList,
  DEFAULT_COMMAND_CENTER_STATUS_FILTER,
  mapImobStatusFilterToCaseStatus,
  type ImobCommandCenterCaseRow,
} from "@/features/imob/imobCommandCenterHelper";
import { buildImobApprovalActionInput, type ImobApprovalActionKind } from "@/features/imob/imobApprovalActions";
import { saveImobArtifactHtml, saveImobArtifactPdf } from "@/features/imob/imobArtifactExport";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "https://api.eiah.local/api";
/** Os painéis oferecem links por item; na conversa todos voltam ao próprio Front Door (nenhuma tela operacional separada). */
const FRONT_DOOR_IMOB_HREF = "/app/chat?domain=imob";
type KpiWindow = 7 | 15 | 30;
/**
 * O cartão vive na largura de uma mensagem (não da página): `contain: inline-size` impede que o conteúdo largo (tabela de casos,
 * tiles) alargue a conversa, e os breakpoints de viewport (`xl:`) dos painéis reaproveitados são rebaixados para essa largura.
 */
const CARD_CLASS = [
  "mt-3 w-full min-w-0 max-w-full space-y-4 overflow-x-auto rounded-2xl border border-accent/30 bg-black/20 p-3 sm:p-4 [contain:inline-size]",
  "[&_[class*='xl:grid-cols-5']]:grid-cols-3 [&_[class*='xl:grid-cols-4']]:grid-cols-2 [&_[class*='xl:grid-cols-3']]:grid-cols-2 [&_[class*='xl:grid-cols-2']]:grid-cols-1",
].join(" ");

export type ImobManagementData = {
  approvals: ImobApprovalContextItem[];
  priorityQueue: ImobPriorityQueueItem[];
  waitingOn: ImobWaitingOnBucket[];
  heatmap: ImobHeatmapCell[];
  specialistLoad: ImobSpecialistLoadMetric[];
  rescueIndex: ImobRescueMetric[];
  health: ImobFunnelHealth | null;
  cases: Awaited<ReturnType<typeof apiListImobCases>>["data"]["items"];
  caseCosts: Map<string, number>;
  kpiFunnel: ImobKpiFunnel | null;
  kpiPerformance: ImobKpiPerformance | null;
};

/** Mesmo conjunto de leituras que o command center usava; cada uma é autorizada pelo servidor (tenant/workspace/papel). */
export async function loadImobManagementData(
  workspaceId: string,
  statusFilter: string = DEFAULT_COMMAND_CENTER_STATUS_FILTER,
  kpiWindowDays: KpiWindow = 30,
): Promise<ImobManagementData> {
  const [approvals, priority, waiting, heatmap, summary, health, cases, costs, funnel, performance] = await Promise.all([
    apiListImobApprovalContext({ limit: 8 }),
    apiListImobPriorityQueue({ limit: 8 }),
    apiListImobWaitingOnBoard(),
    apiListImobBottleneckHeatmap(),
    apiGetImobExecutiveSummary(),
    apiGetImobFunnelHealth({ workspaceId, window: "7d" }),
    apiListImobCases({ status: mapImobStatusFilterToCaseStatus(statusFilter), workspaceId }),
    apiListImobCaseCosts({ windowDays: 30, workspaceId }),
    apiGetImobKpiFunnel({ windowDays: kpiWindowDays }),
    apiGetImobKpiPerformance({ windowDays: kpiWindowDays }),
  ]);
  const caseCosts = new Map<string, number>();
  for (const item of costs.data.items ?? []) {
    if (typeof item.caseId === "string" && item.caseId.trim().length > 0) caseCosts.set(item.caseId, item.costCents);
  }
  return {
    approvals: approvals.data.items ?? [],
    priorityQueue: priority.data.items ?? [],
    waitingOn: waiting.data.items ?? [],
    heatmap: heatmap.data.items ?? [],
    specialistLoad: summary.data.specialistLoad ?? [],
    rescueIndex: summary.data.rescueIndex ?? [],
    health: health.data,
    cases: cases.data.items ?? [],
    caseCosts,
    kpiFunnel: funnel.data,
    kpiPerformance: performance.data,
  };
}

type View =
  | { status: "loading" }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: ImobManagementData };

type GateInput = Parameters<typeof resolveImobAccessGateCopy>[0];

function describeError(error: unknown): View {
  if (error instanceof ApiError && error.status === 403) {
    const body = error.body && typeof error.body === "object" ? (error.body as { error?: GateInput }).error : undefined;
    return { status: "blocked", message: resolveImobAccessGateCopy(body).body };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Falha ao carregar a gestão do IMOB." };
}

/**
 * FD-SINGLE-ENTRY-001 — o painel de gestão do IMOB renderizado NA conversa do Front Door. Reaproveita os componentes e os endpoints do
 * antigo dashboard (/app/imob/dashboard); as ações (aprovar/delegar/escalar) usam o mesmo endpoint e o servidor revalida. Sem permissão,
 * a API responde 403 e o cartão mostra só o bloqueio.
 */
export function ImobManagementConversationCard() {
  const session = useSession();
  const gate = session.accessGate?.product === "IMOB" ? session.accessGate : null;
  const [view, setView] = React.useState<View>({ status: "loading" });
  const [statusFilter, setStatusFilter] = React.useState<string>(DEFAULT_COMMAND_CENTER_STATUS_FILTER);
  const [reasonFilter, setReasonFilter] = React.useState("all");
  const [kpiWindowDays, setKpiWindowDays] = React.useState<KpiWindow>(30);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (gate) {
      setView({ status: "blocked", message: resolveImobAccessGateCopy(gate).body });
      return;
    }
    if (!session.workspaceId) {
      setView({ status: "error", message: "Workspace não identificado." });
      return;
    }
    setView((current) => (current.status === "ready" ? current : { status: "loading" }));
    try {
      // AUTHZ-IMOB-HANDOFF-001: antes de qualquer leitura, o Core confirma a autoridade (handoff somente leitura). Sem ela, nada é pedido.
      const authority = await apiRequestChatVerticalHandoff({ verticalId: "imob", capabilityId: "knowledge.search", mode: "read_only" });
      if (authority.data.ok !== true) {
        setView({ status: "blocked", message: "Seu usuário não tem autoridade confirmada para o IMOB neste workspace." });
        return;
      }
      setView({ status: "ready", data: await loadImobManagementData(session.workspaceId, statusFilter, kpiWindowDays) });
    } catch (error) {
      setView(describeError(error));
    }
  }, [gate, session.workspaceId, statusFilter, kpiWindowDays]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprovalAction = React.useCallback(async (item: ImobApprovalContextItem, action: ImobApprovalActionKind) => {
    setNotice(null);
    try {
      await apiPostImobApprovalAction(buildImobApprovalActionInput(item, action, "conversa"));
      setNotice("Ação registrada no caso.");
      await refresh();
    } catch (error) {
      const body = error instanceof ApiError && error.body && typeof error.body === "object" ? (error.body as { error?: { message?: string } }).error : undefined;
      setNotice(body?.message ?? (error instanceof Error ? error.message : "Falha ao registrar a ação no caso."));
    }
  }, [refresh]);

  const downloadArtifact = React.useCallback(async (type: "bundle" | "receipt", format: "pdf" | "html", caseId: string) => {
    if (!session.token) {
      setNotice("Sessão sem token para download de artefato.");
      return;
    }
    const path = type === "bundle" ? `/imob/cases/${caseId}/dossier` : `/imob/cases/${caseId}/receipt`;
    const response = await fetch(`${API_BASE_URL}${path}`, { method: "GET", headers: { Authorization: `Bearer ${session.token}` } });
    if (!response.ok) {
      setNotice(`Falha ao baixar ${type} (${response.status}).`);
      return;
    }
    const payload = await response.json();
    if (format === "html") saveImobArtifactHtml(type, payload, caseId);
    else await saveImobArtifactPdf(type, payload, caseId);
  }, [session.token]);

  const caseRows: ImobCommandCenterCaseRow[] = React.useMemo(
    () => (view.status === "ready" ? buildImobCaseList(view.data.cases ?? [], reasonFilter, statusFilter) : []),
    [view, reasonFilter, statusFilter],
  );

  return (
    <section aria-label="Gestão IMOB nesta conversa" data-testid="imob-management-card" className={CARD_CLASS}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">IMOB · nesta conversa</p>
          <h3 className="text-lg font-semibold">{IMOB_MANAGEMENT_CARD_TITLE}</h3>
          <p className="text-xs text-muted-foreground">Aprovações, prioridades, gargalos, funil e casos. Cadastros e contratos seguem pelo menu do IMOB desta conversa.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="min-h-[40px] rounded-lg border border-white/15 px-3 text-xs">Atualizar</button>
      </header>
      {notice ? <p role="status" data-testid="imob-management-notice" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">{notice}</p> : null}
      {view.status === "loading" ? <p role="status" data-testid="imob-management-loading">Carregando a gestão do IMOB…</p> : null}
      {view.status === "blocked" ? (
        <div role="status" data-testid="imob-management-blocked" className="space-y-1 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="font-semibold">Gestão IMOB indisponível nesta conversa</p>
          <p>{view.message}</p>
          <p className="text-xs">Nenhum dado foi exibido.</p>
        </div>
      ) : null}
      {view.status === "error" ? <p role="alert" data-testid="imob-management-error" className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm">{view.message}</p> : null}
      {view.status === "ready" ? (
        <div className="space-y-4" data-testid="imob-management-ready">
          <ImobCommandCenter
            health={view.data.health}
            cases={caseRows}
            loading={false}
            statusFilter={statusFilter}
            reasonFilter={reasonFilter}
            totalCostLabel={`${kpiWindowDays}d`}
            caseCostWindowDays={30}
            caseCostMap={view.data.caseCosts}
            priorityQueue={view.data.priorityQueue}
            waitingOnBoard={view.data.waitingOn}
            bottleneckHeatmap={view.data.heatmap}
            onStatusFilterChange={setStatusFilter}
            onReasonFilterChange={setReasonFilter}
            onRefresh={() => void refresh()}
            onDownloadArtifact={downloadArtifact}
            conversationId={null}
            buildCaseRoute={() => null}
            buildPriorityQueueHref={() => FRONT_DOOR_IMOB_HREF}
          />
          <ImobFunnelTab
            kpiFunnel={view.data.kpiFunnel}
            kpiPerformance={view.data.kpiPerformance}
            kpiLoading={false}
            kpiWindowDays={kpiWindowDays}
            onWindowChange={setKpiWindowDays}
            specialistLoad={view.data.specialistLoad}
            rescueIndex={view.data.rescueIndex}
            approvalContext={view.data.approvals}
            buildApprovalHref={() => FRONT_DOOR_IMOB_HREF}
            onApprovalAction={handleApprovalAction}
          />
        </div>
      ) : null}
    </section>
  );
}

export default ImobManagementConversationCard;
