import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatBRL } from "@/lib/formatters";
import {
  ApiError,
  apiActivateMarketplaceInstallation,
  apiGetAgentBillingSummary,
  apiGetSessionContext,
  apiGetTenantBillingSummary,
  apiListMarketplaceInstallations,
  type AgentBillingSummaryItem,
  type TenantBillingSummary,
} from "@/lib/api";
import { updateSession, useSession } from "@/state/sessionStore";

type Product = "IMOB" | "LEGAL" | "HEALTH";

type InstallRow = {
  tenantId: string;
  workspaceId: string;
  product: string;
  status: string;
  activatedAt: string;
  activatedByUserId?: string | null;
};

type CheckResult = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

const VERTICALS: Array<{
  product: Product;
  title: string;
  summary: string;
  status: "ready" | "preview";
  routes: string[];
}> = [
  {
    product: "IMOB",
    title: "IMOB Network",
    summary: "Chat Operacional + Dashboard + processos auditáveis para imobiliária.",
    status: "ready",
    routes: ["/app/imob/chat", "/app/imob/dashboard"],
  },
  {
    product: "LEGAL",
    title: "LEGAL Network",
    summary: "Vertical jurídico (preview). Estrutura de instalação preparada para evolução.",
    status: "preview",
    routes: [],
  },
  {
    product: "HEALTH",
    title: "HEALTH Network",
    summary: "Vertical saúde (preview). Estrutura de instalação preparada para evolução.",
    status: "preview",
    routes: [],
  },
];

function isActiveInstall(items: InstallRow[], product: Product) {
  return items.some(
    (item) => item.product.trim().toUpperCase() === product && item.status.trim().toLowerCase() === "active"
  );
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function averageCostPerRun(item: { costCents: number; runs: number } | null | undefined) {
  if (!item || item.runs <= 0) return 0;
  return Math.round(item.costCents / item.runs);
}

const MarketplaceIndexPage: React.FC = () => {
  const session = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [installations, setInstallations] = React.useState<InstallRow[]>([]);
  const [activatingProduct, setActivatingProduct] = React.useState<Product | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [checks, setChecks] = React.useState<CheckResult[]>([]);
  const [runningChecks, setRunningChecks] = React.useState(false);
  const [billingSummary, setBillingSummary] = React.useState<TenantBillingSummary | null>(null);
  const [agentBilling, setAgentBilling] = React.useState<AgentBillingSummaryItem[]>([]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [installs, context, billing, agents] = await Promise.all([
        apiListMarketplaceInstallations(),
        apiGetSessionContext().catch(() => null),
        apiGetTenantBillingSummary().catch(() => null),
        apiGetAgentBillingSummary({ workspaceId: session.workspaceId }).catch(() => null),
      ]);
      setInstallations((installs.items ?? []) as InstallRow[]);
      setBillingSummary(billing?.data ?? null);
      setAgentBilling(Array.isArray(agents?.data?.items) ? agents.data.items : []);

      if (context?.ok && context.data) {
        updateSession({
          activeDomain: context.data.activeDomain,
          availableDomains: context.data.availableDomains,
          entitlements: context.data.entitlements,
          installedProducts: (context.data.productInstallations ?? []).map((entry) => entry.product),
          verticals: context.data.verticals,
          roles: context.data.roles,
          branding: {
            brandName: context.data.branding.brandName,
            logoUrl: context.data.branding.logoUrl,
            primaryColor: context.data.branding.primaryColor,
            workspaceLabel: context.data.branding.workspaceLabel,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar marketplace");
    } finally {
      setLoading(false);
    }
  }, [session.workspaceId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSmokeChecks = async () => {
    setRunningChecks(true);
    setChecks([]);
    const nextChecks: CheckResult[] = [];

    try {
      const coreCtx = await apiGetSessionContext();
      nextChecks.push({
        key: "session-core",
        label: "Session context (core)",
        ok: coreCtx.ok === true,
        detail: coreCtx.ok ? "OK" : "Falhou",
      });

      const imobInstalled = isActiveInstall(installations, "IMOB");
      if (imobInstalled) {
        try {
          const imobCtx = await apiGetSessionContext("imob");
          nextChecks.push({
            key: "session-imob",
            label: "Session context (imob)",
            ok: imobCtx.ok === true,
            detail: imobCtx.ok ? "OK" : "Sem acesso ao domínio IMOB",
          });
        } catch (err) {
          nextChecks.push({
            key: "session-imob",
            label: "Session context (imob)",
            ok: false,
            detail: err instanceof Error ? err.message : "Falhou",
          });
        }
      } else {
        nextChecks.push({
          key: "session-imob",
          label: "Session context (imob)",
          ok: false,
          detail: "Ative IMOB para testar este item",
        });
      }

      nextChecks.push({
        key: "installations",
        label: "Lista de instalações",
        ok: installations.length >= 0,
        detail: `${installations.length} instalação(ões) detectada(s)`,
      });
    } finally {
      setChecks(nextChecks);
      setRunningChecks(false);
    }
  };

  const activateImob = async () => {
    setActivatingProduct("IMOB");
    setNotice(null);
    setError(null);
    try {
      const response = await apiActivateMarketplaceInstallation({ product: "IMOB" });
      setNotice(`IMOB ativado com sucesso (${fmtDate(response.installation.activatedAt)}).`);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Falha ao ativar IMOB (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Falha ao ativar IMOB");
      }
    } finally {
      setActivatingProduct(null);
    }
  };

  const brand = session.branding?.brandName?.trim() || "Tenant";
  const workspace = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const activeWorkspaceBilling = React.useMemo(
    () => billingSummary?.byWorkspace.find((item) => item.workspaceId === session.workspaceId) ?? null,
    [billingSummary, session.workspaceId]
  );
  const topAgent = React.useMemo(() => {
    const items = [...agentBilling];
    items.sort((a, b) => b.costCents - a.costCents);
    return items[0] ?? null;
  }, [agentBilling]);
  const runnerUpAgent = React.useMemo(() => {
    const items = [...agentBilling].sort((a, b) => b.costCents - a.costCents);
    return items[1] ?? null;
  }, [agentBilling]);
  const activeCostAgents = React.useMemo(() => agentBilling.filter((item) => item.costCents > 0), [agentBilling]);
  const topAgentSharePct = React.useMemo(() => {
    const total = activeCostAgents.reduce((sum, item) => sum + item.costCents, 0);
    if (!topAgent || total <= 0) return 0;
    return (topAgent.costCents / total) * 100;
  }, [activeCostAgents, topAgent]);
  const workspaceCostOverview = billingSummary?.costOverview?.workspaceConsumption ?? null;
  const auditableCostOverview = billingSummary?.costOverview?.auditableCost ?? null;
  const verticalRegistry = session.verticals ?? [];
  const marketplaceStages = [
    { id: "discovery", label: "Discovery" },
    { id: "readiness", label: "Readiness" },
    { id: "impact", label: "Impacto" },
    { id: "activation", label: "Ativação" },
  ] as const;

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Marketplace</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Teste de Verticais</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ative e valide verticais por workspace. IMOB está pronto para teste completo ponta a ponta.
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brand} • {workspace}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {marketplaceStages.map((stage) => (
            <a
              key={stage.id}
              href={`#marketplace-${stage.id}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
            >
              {stage.label}
            </a>
          ))}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Consumo do tenant</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {formatBRL(billingSummary?.totals.costCents ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Workspace atual</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {formatBRL(activeWorkspaceBilling?.costCents ?? 0)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {activeWorkspaceBilling?.runs ?? 0} runs no ciclo
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Agentes com custo</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {agentBilling.filter((item) => item.costCents > 0).length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Agente dominante</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{topAgent?.agent ?? "-"}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {topAgent ? formatBRL(topAgent.costCents) : "Sem custo ainda"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {topAgent ? `${topAgentSharePct.toFixed(0)}% do custo dos agentes` : "—"}
            </p>
          </div>
        </div>
      </header>

      <section id="marketplace-discovery" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Discovery</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Descoberta das verticais disponíveis e leitura inicial do status de instalação por workspace.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface/70 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-accent/80">Vertical rollout registry</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Estágio canônico exposto pelo `session/context` para cada vertical do tenant atual.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {verticalRegistry.length ? (
              verticalRegistry.map((item) => (
                <div key={`vertical-registry-${item.verticalId}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <span className="pill">{item.rolloutStage}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Domínio: {item.activeDomain} • Enabled: {item.enabled ? "sim" : "não"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Front door: {item.frontDoorSurface ?? "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Hub operacional: {item.operationalHubSurface ?? "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma vertical registrada no contexto atual.</p>
            )}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
        {VERTICALS.map((vertical) => {
          const active = isActiveInstall(installations, vertical.product);
          const install = installations.find(
            (item) => item.product.trim().toUpperCase() === vertical.product && item.status.trim().toLowerCase() === "active"
          );
          const runtimeVertical = verticalRegistry.find((item) => item.verticalId === vertical.product);
          const rolloutStage = runtimeVertical?.rolloutStage ?? (vertical.status === "preview" ? "context_only" : "installed_surface");
          const rolloutBadgeClass = active
            ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
            : rolloutStage === "operationalized"
              ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
              : "border-white/20 bg-white/5 text-muted-foreground";
          const rolloutBadgeLabel = active
            ? "ativo"
            : rolloutStage === "operationalized"
              ? "operacional"
              : rolloutStage === "installed_surface"
                ? "instalado"
                : "contexto";
          return (
            <article key={vertical.product} className="rounded-2xl border border-white/10 bg-surface/70 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">{vertical.title}</h2>
                <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${rolloutBadgeClass}`}>
                  {rolloutBadgeLabel}
                </span>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{vertical.summary}</p>
              {runtimeVertical ? (
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    Rollout canônico: <span className="text-foreground">{runtimeVertical.rolloutStage}</span>
                  </p>
                  <p>
                    Front door: <span className="text-foreground">{runtimeVertical.frontDoorSurface ?? "—"}</span>
                  </p>
                  <p>
                    Hub operacional: <span className="text-foreground">{runtimeVertical.operationalHubSurface ?? "—"}</span>
                  </p>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">Ativado em: {fmtDate(install?.activatedAt)}</p>
              {active ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                  <p>
                    Consumo do workspace:{" "}
                    <span className="text-foreground">{formatBRL(activeWorkspaceBilling?.costCents ?? 0)}</span>
                  </p>
                  <p className="mt-1">
                    Runs do workspace:{" "}
                    <span className="text-foreground">
                      {new Intl.NumberFormat("pt-BR").format(activeWorkspaceBilling?.runs ?? 0)}
                    </span>
                  </p>
                  <p className="mt-1">
                    Agente mais custoso:{" "}
                    <span className="text-foreground">{topAgent?.agent ?? "Sem uso financeiro ainda"}</span>
                  </p>
                  <p className="mt-1">
                    Custo desta execução (médio por run):{" "}
                    <span className="text-foreground">{formatBRL(averageCostPerRun(activeWorkspaceBilling))}</span>
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {vertical.product === "IMOB" && !active ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-200">
                      Esta ativacao pode gerar cobranca conforme seu plano.{" "}
                      <Link to="/app/billing" className="underline text-accent">
                        Ver tabela de precos
                      </Link>
                    </p>
                    <button
                      type="button"
                      onClick={() => void activateImob()}
                      disabled={activatingProduct === "IMOB"}
                      className="rounded-full border border-accent/60 bg-accent/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:opacity-60"
                    >
                      {activatingProduct === "IMOB" ? "Ativando..." : "Ativar"}
                    </button>
                  </div>
                ) : null}

                {vertical.product === "IMOB" && active ? (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate("/app/imob/chat?domain=imob")}
                      className="rounded-full border border-accent/60 bg-accent/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:border-accent hover:bg-accent/30"
                    >
                      Abrir chat
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/app/imob/dashboard?section=threads#dashboard-hub")}
                      className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 hover:text-accent"
                    >
                      Abrir dashboard
                    </button>
                  </>
                ) : null}

                {vertical.product !== "IMOB" ? (
                  <span className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Em breve
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
        </div>
      </section>

      <section id="marketplace-impact" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Impacto</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Leitura financeira e operacional para entender custo, dominância e efeito no workspace atual.
          </p>
        </div>
        {(workspaceCostOverview || auditableCostOverview) ? (
          <div className="grid gap-4 md:grid-cols-2">
            {workspaceCostOverview ? (
              <article className="rounded-2xl border border-white/10 bg-surface/70 p-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent/80">{workspaceCostOverview.title}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{formatBRL(workspaceCostOverview.amountCents)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{workspaceCostOverview.summary}</p>
              </article>
            ) : null}
            {auditableCostOverview ? (
              <article className="rounded-2xl border border-white/10 bg-surface/70 p-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent/80">{auditableCostOverview.title}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{formatBRL(auditableCostOverview.amountCents)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{auditableCostOverview.summary}</p>
              </article>
            ) : null}
          </div>
        ) : null}
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-surface/70 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Comparação financeira</p>
          <p className="mt-3 text-sm text-foreground">
            {topAgent
              ? `${topAgent.agent} lidera o consumo com ${formatBRL(topAgent.costCents)}`
              : "Sem comparação financeira ainda neste workspace."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {runnerUpAgent
              ? `Segundo lugar: ${runnerUpAgent.agent} com ${formatBRL(runnerUpAgent.costCents)}`
              : "Ainda não há um segundo agente com custo material."}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/70 p-5 lg:col-span-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Agentes por custo</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {activeCostAgents.slice(0, 3).map((item) => (
              <div key={`marketplace-cost-${item.agent}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-foreground">{item.agent}</p>
                <p className="mt-2 text-sm text-foreground">{formatBRL(item.costCents)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {item.runs} runs • {formatBRL(averageCostPerRun(item))}/run
                </p>
              </div>
            ))}
            {!activeCostAgents.length ? (
              <p className="text-sm text-muted-foreground">Ainda não há agentes com custo real para comparar.</p>
            ) : null}
          </div>
        </article>
      </section>
      </section>

      <section id="marketplace-readiness" className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Readiness</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Smoke test e validação operacional mínima antes de tratar uma vertical como pronta para uso local.
          </p>
        </div>
      <section className="rounded-2xl border border-white/10 bg-surface/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">Smoke test do ambiente</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 hover:text-accent"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void runSmokeChecks()}
              disabled={runningChecks || loading}
              className="rounded-full border border-accent/60 bg-accent/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:opacity-60"
            >
              {runningChecks ? "Testando..." : "Rodar teste"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Execute o smoke test para validar marketplace + verticais neste workspace.</p>
          ) : (
            checks.map((check) => (
              <div key={check.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <span className="text-foreground">{check.label}</span>
                <span className={check.ok ? "text-emerald-300" : "text-amber-200"}>{check.detail}</span>
              </div>
            ))
          )}
        </div>

        {notice ? <p className="mt-4 text-sm text-emerald-300">{notice}</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </section>
      </section>

      <section id="marketplace-activation" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Ativação</p>
        <p className="mt-2">
          A ativação continua acontecendo dentro dos cards da vertical, para preservar o fluxo atual, mas agora a página deixa explícito o funil:
          descobrir, validar readiness, medir impacto e só então ativar.
        </p>
      </section>

      <footer className="text-xs text-muted-foreground">
        Compatível com fluxo legado: <Link to="/app/marketplace/imob" className="text-accent underline">/app/marketplace/imob</Link>
      </footer>
    </div>
  );
};

export default MarketplaceIndexPage;
