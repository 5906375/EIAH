import React from "react";
import { Link } from "react-router-dom";
import { apiGetTenantEconomyOpportunities } from "@/lib/api";
import { formatBRL } from "@/lib/formatters";
import { useSession } from "@/state/sessionStore";
import type { EconomyOpportunitySnapshot } from "@/types";

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

export default function EconomyPage() {
  const session = useSession();
  const roleProfile = session.experience?.roleProfile ?? "workspace_member";
  const isAdminView =
    roleProfile === "workspace_admin" ||
    roleProfile === "tenant_admin" ||
    roleProfile === "founder_global" ||
    roleProfile === "service_operator";

  const [snapshot, setSnapshot] = React.useState<EconomyOpportunitySnapshot | null>(null);
  const [scope, setScope] = React.useState<"tenant" | "workspace">("workspace");
  const [cycle, setCycle] = React.useState<"current" | "previous">("current");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);
    apiGetTenantEconomyOpportunities({ scope, cycle })
      .then((response) => {
        if (!active) return;
        if (!response.ok || !response.data) {
          setStatus("error");
          setError("Falha ao carregar diagnóstico econômico do tenant.");
          return;
        }
        setSnapshot(response.data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Falha ao carregar diagnóstico econômico do tenant.");
      });
    return () => {
      active = false;
    };
  }, [cycle, scope, session.tenantId, session.workspaceId]);

  if (!isAdminView) {
    return (
      <section className="rounded-3xl border border-white/10 bg-surface/80 p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-accent">Economy</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Diagnóstico econômico interno</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Esta superfície é reservada a perfis administrativos.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-surface/80 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-accent">Economy</p>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">Diagnóstico econômico do tenant</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Superfície interna única para economy hardening, consumindo a rota canônica do tenant.
            </p>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setScope("workspace")}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  scope === "workspace" ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Workspace atual
              </button>
              <button
                type="button"
                onClick={() => setScope("tenant")}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  scope === "tenant" ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tenant-wide
              </button>
            </div>
            <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setCycle("current")}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  cycle === "current" ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ciclo atual
              </button>
              <button
                type="button"
                onClick={() => setCycle("previous")}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  cycle === "previous" ? "bg-accent/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ciclo anterior
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/billing" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              Voltar para Billing
            </Link>
            <Link to="/profile" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              Ver Profile
            </Link>
          </div>
        </div>
      </div>

      {session.verticals?.length ? (
        <div className="rounded-3xl border border-white/10 bg-surface/70 p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-accent">Vertical rollout registry</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Leitura canônica do rollout transversal das verticais no mesmo contexto administrativo do diagnóstico econômico.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {session.verticals.map((item) => (
              <div key={`economy-vertical-${item.verticalId}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <span className="pill">{item.rolloutStage}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Domínio: {item.activeDomain} • Enabled: {item.enabled ? "sim" : "não"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Front door: {item.frontDoorSurface ?? "—"} • Hub: {item.operationalHubSurface ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="rounded-3xl border border-white/10 bg-surface/70 p-6 text-sm text-muted-foreground">
          Carregando snapshot econômico canônico...
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">
          {error ?? "Falha ao carregar diagnóstico econômico."}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Escopo</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {scope === "tenant" ? "tenant-wide" : "workspace atual"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Ciclo</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {cycle === "current" ? "atual" : "anterior"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Top status</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{snapshot.topStatus}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Top priority</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{snapshot.topPriority ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Total</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{snapshot.total}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Atualizado em</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{formatDate(snapshot.generatedAt)}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-surface/70 p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-accent">Priorização operacional</p>
            <p className="mt-3 text-sm text-muted-foreground">{snapshot.summary}</p>
            <p className="mt-2 text-sm text-muted-foreground">{snapshot.consolidatedSummary}</p>
            <p className="mt-4 text-sm text-foreground">Recomendação: {snapshot.tenantRecommendation}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Janela: {formatDate(snapshot.scope.cycleStart)} até {formatDate(snapshot.scope.cycleEnd)}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Fonte oficial: {snapshot.sourceOfTruth.cost} / {snapshot.sourceOfTruth.usage} / {snapshot.sourceOfTruth.audit}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-white/10 bg-surface/70 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-accent">Oportunidades de custo</p>
              <div className="mt-4 space-y-3">
                {snapshot.costOpportunities.length ? snapshot.costOpportunities.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-sm text-foreground">{formatBRL(item.estimatedSavingsCents)}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Workspace: {item.workspaceId ?? "tenant-wide"} • Confiança: {Math.round(item.confidence * 100)}%
                    </p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">Nenhuma oportunidade direta de custo no ciclo atual.</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-surface/70 p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-accent">Fleet policy</p>
                <div className="mt-4 space-y-3">
                  {snapshot.fleetPolicyOpportunities.length ? snapshot.fleetPolicyOpportunities.map((item) => (
                    <div key={item.subjectId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Priority: {item.priority} • Modelo: {item.model ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ação: {item.suggestedAction.label}
                      </p>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Nenhuma oportunidade de fleet policy no ciclo atual.</p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-surface/70 p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-accent">Auditable cost attention</p>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {snapshot.auditableCostAttention.classification}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{snapshot.auditableCostAttention.summary}</p>
                <p className="mt-3 text-sm text-foreground">
                  Valor auditável: {formatBRL(snapshot.auditableCostAttention.amountCents)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Reason codes: {snapshot.auditableCostAttention.reasonCodes.join(", ") || "—"}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
