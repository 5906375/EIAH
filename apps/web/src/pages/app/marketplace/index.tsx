import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  apiActivateMarketplaceInstallation,
  apiGetSessionContext,
  apiListMarketplaceInstallations,
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

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [installs, context] = await Promise.all([
        apiListMarketplaceInstallations(),
        apiGetSessionContext().catch(() => null),
      ]);
      setInstallations((installs.items ?? []) as InstallRow[]);

      if (context?.ok && context.data) {
        updateSession({
          activeDomain: context.data.activeDomain,
          availableDomains: context.data.availableDomains,
          entitlements: context.data.entitlements,
          installedProducts: (context.data.productInstallations ?? []).map((entry) => entry.product),
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
  }, []);

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
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {VERTICALS.map((vertical) => {
          const active = isActiveInstall(installations, vertical.product);
          const install = installations.find(
            (item) => item.product.trim().toUpperCase() === vertical.product && item.status.trim().toLowerCase() === "active"
          );
          return (
            <article key={vertical.product} className="rounded-2xl border border-white/10 bg-surface/70 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">{vertical.title}</h2>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                    active
                      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                      : vertical.status === "preview"
                      ? "border-white/20 bg-white/5 text-muted-foreground"
                      : "border-amber-300/40 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {active ? "ativo" : vertical.status === "preview" ? "preview" : "disponível"}
                </span>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{vertical.summary}</p>
              <p className="mt-3 text-xs text-muted-foreground">Ativado em: {fmtDate(install?.activatedAt)}</p>

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
      </section>

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

      <footer className="text-xs text-muted-foreground">
        Compatível com fluxo legado: <Link to="/app/marketplace/imob" className="text-accent underline">/app/marketplace/imob</Link>
      </footer>
    </div>
  );
};

export default MarketplaceIndexPage;
