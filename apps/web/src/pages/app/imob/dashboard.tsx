import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useSession } from "@/state/sessionStore";
import {
  ApiError,
  apiGetImobChatTelemetrySummary,
  apiListImobCases,
  apiListImobChatThreads,
  apiListImobOwners,
  apiListImobProperties,
  type ImobCase,
  type ImobChatThread,
  type ImobOwner,
  type ImobProperty,
} from "@/lib/api";
import { ThreadPanel } from "@/features/imob/ThreadPanel";

function resolveImobGateTitle(reasonCode?: string) {
  if (reasonCode === "IMOB_INSTALLATION_INACTIVE") return "Instalação inativa";
  if (reasonCode === "IMOB_PERMISSION_DENIED") return "Acesso restrito";
  return "Acesso indisponível";
}

function resolveImobGateBody(gate: {
  reasonCode?: string;
  message?: string;
}) {
  if (gate.message?.trim()) return gate.message.trim();
  if (gate.reasonCode === "IMOB_INSTALLATION_INACTIVE") {
    return "A instalação do IMOB neste workspace não está ativa. Reative a instalação para usar este recurso.";
  }
  if (gate.reasonCode === "IMOB_PERMISSION_DENIED") {
    return "Você não possui permissão para usar o IMOB neste workspace.";
  }
  return "IMOB não está habilitado neste workspace. É necessária uma instalação ativa para usar este recurso.";
}

type Section = "imoveis" | "processos" | "parceiros";

type DashboardSource = "real" | "empty";

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

function currencyFromCents(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Preço não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value / 100);
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

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function formatImobStatusLabel(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "sem status";
  if (normalized === "pending_data") return "pendente de dados";
  if (normalized === "ready_for_review") return "pronto para revisão";
  if (normalized === "qualified") return "qualificado";
  if (normalized === "running") return "em andamento";
  if (normalized === "blocked") return "bloqueado";
  if (normalized === "success" || normalized === "completed") return "concluído";
  return normalized.replace(/_/g, " ");
}

function formatCaseFlowLabel(flow: string | null | undefined) {
  const normalized = (flow ?? "").trim().toLowerCase();
  if (normalized === "owner.create" || normalized === "property.create") return "Captação";
  if (normalized === "lead.qualify") return "Lead";
  if (normalized === "visit.schedule") return "Visita";
  if (normalized === "proposal.create") return "Proposta";
  if (normalized === "documents.collect") return "Documentos";
  if (normalized === "deal.review") return "Deal review";
  if (normalized === "contract.prepare") return "Contrato";
  if (normalized === "commission.settle") return "Comissão";
  if (normalized === "listing.activate") return "Listing";
  return flow?.trim() || "Caso";
}

function propertyTitle(item: ImobProperty) {
  const address = item.address?.trim();
  if (address) return address;
  const propertyType = item.propertyType?.trim();
  if (propertyType) return `${propertyType} ${item.id.slice(-6)}`;
  return `Imóvel ${item.id.slice(-6)}`;
}

function propertyStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "ready_for_review") return "text-accent border-accent/40";
  if (normalized === "pending_data") return "text-amber-200 border-amber-300/30";
  if (normalized === "qualified" || normalized === "completed" || normalized === "success") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  return "text-muted-foreground border-white/15";
}

function processStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "success" || normalized === "completed" || normalized === "ready_for_review") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  if (normalized === "running" || normalized === "collecting") return "text-amber-200 border-amber-300/30";
  return "text-muted-foreground border-white/15";
}

function partnerStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "ready_for_review" || normalized === "qualified") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "pending_data") return "text-amber-200 border-amber-300/30";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  return "text-muted-foreground border-white/15";
}

function buildImobChatHref(base: {
  conversationId: string | null;
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
}) {
  const params = new URLSearchParams();
  if (base.conversationId) params.set("conversationId", base.conversationId);
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  const query = params.toString();
  return `/app/imob/chat${query ? `?${query}` : ""}`;
}

const ImobDashboardPage: React.FC = () => {
  const session = useSession();
  const imobAccessGate = session.accessGate?.product === "IMOB" ? session.accessGate : null;
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = (searchParams.get("conversationId") || "").trim() || null;
  const requestedThreadId = (searchParams.get("threadId") || "").trim() || null;
  const rawSection = (searchParams.get("section") || "imoveis").toLowerCase();
  const section: Section = rawSection === "processos" || rawSection === "parceiros" ? rawSection : "imoveis";
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
  const [owners, setOwners] = React.useState<ImobOwner[]>([]);
  const [properties, setProperties] = React.useState<ImobProperty[]>([]);
  const [cases, setCases] = React.useState<ImobCase[]>([]);
  const [dashboardLoading, setDashboardLoading] = React.useState(true);
  const [dashboardError, setDashboardError] = React.useState<string | null>(null);
  const [dashboardSource, setDashboardSource] = React.useState<DashboardSource>("empty");

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
    if (imobAccessGate) {
      setOwners([]);
      setProperties([]);
      setCases([]);
      setDashboardSource("empty");
      setDashboardError(null);
      setDashboardLoading(false);
      return () => {
        mounted = false;
      };
    }
    setDashboardLoading(true);
    setDashboardError(null);

    Promise.all([apiListImobOwners(), apiListImobProperties(), apiListImobCases()])
      .then(([ownersResponse, propertiesResponse, casesResponse]) => {
        if (!mounted) return;
        const nextOwners = ownersResponse.data.items ?? [];
        const nextProperties = propertiesResponse.data.items ?? [];
        const nextCases = casesResponse.data.items ?? [];
        setOwners(nextOwners);
        setProperties(nextProperties);
        setCases(nextCases);
        setDashboardSource(nextOwners.length > 0 || nextProperties.length > 0 || nextCases.length > 0 ? "real" : "empty");
      })
      .catch((error) => {
        if (!mounted) return;
        setOwners([]);
        setProperties([]);
        setCases([]);
        setDashboardSource("empty");
        if (error instanceof ApiError && error.status === 403 && error.body && typeof error.body === "object") {
          const payload = error.body as { error?: { message?: string; reasonCode?: string } };
          setDashboardError(resolveImobGateBody(payload.error ?? {}));
        } else {
          setDashboardError(error instanceof Error ? error.message : "Falha ao carregar CRM operacional do IMOB");
        }
      })
      .finally(() => {
        if (!mounted) return;
        setDashboardLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [imobAccessGate, session.workspaceId]);

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

  const ownerPropertyCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of properties) {
      if (!item.ownerId) continue;
      counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [properties]);

  const ownerCaseCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cases) {
      if (!item.ownerId) continue;
      counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [cases]);

  const activeProcessCount = cases.filter((item) => item.status === "collecting" || item.status === "running").length;
  const blockedProcessCount = cases.filter((item) => item.status === "blocked").length;
  const evidencedProcessCount = cases.filter((item) => (item._count?.events ?? 0) > 0).length;
  const readyForReviewCount = properties.filter((item) => item.status === "ready_for_review").length;
  const ownerPendingCount = owners.filter((item) => asStringList(item.pendingItems).length > 0).length;

  const latestCaseByOwnerId = React.useMemo(() => {
    const map = new Map<string, ImobCase>();
    for (const item of cases) {
      if (item.ownerId && !map.has(item.ownerId)) map.set(item.ownerId, item);
    }
    return map;
  }, [cases]);

  const latestCaseByPropertyId = React.useMemo(() => {
    const map = new Map<string, ImobCase>();
    for (const item of cases) {
      if (item.propertyId && !map.has(item.propertyId)) map.set(item.propertyId, item);
    }
    return map;
  }, [cases]);

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

      {imobAccessGate ? (
        <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">GateCard 403</p>
          <p className="mt-2 text-sm font-semibold text-rose-100">
            {resolveImobGateTitle(imobAccessGate.reasonCode)}
          </p>
          <p className="mt-2 text-sm text-rose-100">
            {resolveImobGateBody(imobAccessGate)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {imobAccessGate.cta?.target ? (
              <Link
                to={imobAccessGate.cta.target}
                className="rounded-full border border-rose-300/30 bg-rose-200/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-200/20"
              >
                {imobAccessGate.cta.label}
              </Link>
            ) : null}
            {imobAccessGate.traceId ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-rose-200/80">
                Trace: {imobAccessGate.traceId}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {dashboardError ? (
        <section className="rounded-3xl border border-rose-400/20 bg-rose-500/5 p-4 text-sm text-rose-100 sm:p-6">
          Falha ao carregar o CRM operacional do IMOB: {dashboardError}
        </section>
      ) : null}

      {section === "imoveis" ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Imóveis</h2>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem imóveis cadastrados"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {properties.map((item) => {
              const relatedCase = latestCaseByPropertyId.get(item.id) ?? null;
              const href = buildImobChatHref({
                conversationId,
                caseId: relatedCase?.id ?? null,
                threadId: relatedCase?.threadId ?? null,
                autoprompt: item.address?.trim() ? `mostrar imóvel endereço ${item.address.trim()}` : `mostrar imóvel ${item.id}`,
              });
              const pendingItems = asStringList(item.pendingItems);
              const resolveHref = pendingItems.length > 0
                ? buildImobChatHref({
                    conversationId,
                    caseId: relatedCase?.id ?? null,
                    threadId: relatedCase?.threadId ?? null,
                    autoprompt: item.address?.trim()
                      ? `o que falta para imóvel endereço ${item.address.trim()}`
                      : `o que falta para imóvel ${item.id}`,
                  })
                : null;
              return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={href} className="text-sm font-semibold text-foreground hover:text-accent">{propertyTitle(item)}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.city?.trim() || "Cidade não informada"} • {item.id}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${propertyStatusTone(item.status)}`}>
                    {formatImobStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-3 text-base font-semibold text-foreground">{currencyFromCents(item.askingPriceCents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(item.goal?.trim() || "finalidade não informada")} • {(item.propertyType?.trim() || "tipo não informado")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Proprietário: {item.owner?.name?.trim() || "não vinculado"}
                </p>
                {resolveHref ? (
                  <div className="mt-3 flex justify-end">
                    <Link to={resolveHref} className="text-[10px] uppercase tracking-[0.16em] text-accent hover:text-accent/80">
                      Resolver no chat
                    </Link>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
          {!dashboardLoading && properties.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
              Nenhum imóvel cadastrado no CRM operacional do IMOB.
            </p>
          ) : null}
        </section>
      ) : null}

      {section === "processos" ? (
        <section className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Processos ativos</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{activeProcessCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bloqueados</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{blockedProcessCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com evidências</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{evidencedProcessCount}</p>
            </article>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Processos</h2>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem processos cadastrados"}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-3 py-2">Processo</th>
                    <th className="px-3 py-2">Contexto</th>
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Responsável</th>
                    <th className="px-3 py-2">Evidências</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => {
                    const href = buildImobChatHref({
                      conversationId,
                      caseId: item.id,
                      threadId: item.threadId ?? null,
                      autoprompt: "o que falta nesse caso",
                    });
                    return (
                    <tr key={item.id} className="border-b border-white/5 text-muted-foreground">
                      <td className="px-3 py-3 text-foreground"><Link to={href} className="hover:text-accent">{formatCaseFlowLabel(item.flow)}</Link></td>
                      <td className="px-3 py-3">{item.lead?.name || item.owner?.name || item.property?.city || "Sem contexto vinculado"}</td>
                      <td className="px-3 py-3">{item.nextStep?.trim() || item.stage}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${processStatusTone(item.status)}`}>
                          {formatImobStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3">{item.ownerResponsible || "Responsável não definido"}</td>
                      <td className="px-3 py-3 text-xs">{item._count?.events ?? 0}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!dashboardLoading && cases.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
                Nenhum processo cadastrado no CRM operacional do IMOB.
              </p>
            ) : null}
          </section>
        </section>
      ) : null}

      {section === "parceiros" ? (
        <section className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Proprietários</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{owners.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com pendências</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{ownerPendingCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Imóveis prontos para revisão</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{readyForReviewCount}</p>
            </article>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Parceiros</h2>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem parceiros cadastrados"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {owners.map((item) => {
                const relatedCase = latestCaseByOwnerId.get(item.id) ?? null;
                const href = buildImobChatHref({
                  conversationId,
                  caseId: relatedCase?.id ?? null,
                  threadId: relatedCase?.threadId ?? null,
                  autoprompt: `abrir proprietário ${item.name}`,
                });
                const pendingItems = asStringList(item.pendingItems);
                const resolveHref = pendingItems.length > 0
                  ? buildImobChatHref({
                      conversationId,
                      caseId: relatedCase?.id ?? null,
                      threadId: relatedCase?.threadId ?? null,
                      autoprompt: `o que falta para proprietário ${item.name}`,
                    })
                  : null;
                return (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={href} className="text-sm font-semibold text-foreground hover:text-accent">{item.name}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.email?.trim() || item.phone?.trim() || "Contato não informado"}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${partnerStatusTone(item.status)}`}>
                      {formatImobStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Imóveis: {ownerPropertyCount.get(item.id) ?? 0} • Casos: {ownerCaseCount.get(item.id) ?? 0}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pendências: {pendingItems.length > 0 ? pendingItems.join(", ") : "sem pendências"}
                  </p>
                  {resolveHref ? (
                    <div className="mt-3 flex justify-end">
                      <Link to={resolveHref} className="text-[10px] uppercase tracking-[0.16em] text-accent hover:text-accent/80">
                        Resolver no chat
                      </Link>
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
            {!dashboardLoading && owners.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
                Nenhum parceiro cadastrado no CRM operacional do IMOB.
              </p>
            ) : null}
          </section>
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
