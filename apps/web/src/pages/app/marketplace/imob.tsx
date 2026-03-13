import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  apiActivateMarketplaceInstallation,
  apiGetSessionContext,
  apiListMarketplaceInstallations,
} from "@/lib/api";
import { updateSession, useSession } from "@/state/sessionStore";

function hasActiveImobInstall(items: Array<{ product: string; status: string }>) {
  return items.some(
    (item) => item.product.trim().toUpperCase() === "IMOB" && item.status.trim().toLowerCase() === "active"
  );
}

const ImobMarketplacePage: React.FC = () => {
  const session = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [activating, setActivating] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const [activatedAt, setActivatedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;

  const refreshStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [installations, context] = await Promise.all([
        apiListMarketplaceInstallations(),
        apiGetSessionContext().catch(() => null),
      ]);

      const active = hasActiveImobInstall(installations.items ?? []);
      setIsInstalled(active);

      const last = (installations.items ?? []).find(
        (item) => item.product.trim().toUpperCase() === "IMOB" && item.status.trim().toLowerCase() === "active"
      );
      setActivatedAt(last?.activatedAt ?? null);

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
      const message = err instanceof Error ? err.message : "Falha ao consultar status do IMOB";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiActivateMarketplaceInstallation({ product: "IMOB" });
      setIsInstalled(true);
      setActivatedAt(response.installation.activatedAt ?? null);
      setNotice("IMOB ativado com sucesso para este workspace.");

      const imobContext = await apiGetSessionContext("imob");
      if (imobContext.ok && imobContext.data) {
        updateSession({
          activeDomain: imobContext.data.activeDomain,
          availableDomains: imobContext.data.availableDomains,
          entitlements: imobContext.data.entitlements,
          installedProducts: (imobContext.data.productInstallations ?? []).map((entry) => entry.product),
          roles: imobContext.data.roles,
          branding: {
            brandName: imobContext.data.branding.brandName,
            logoUrl: imobContext.data.branding.logoUrl,
            primaryColor: imobContext.data.branding.primaryColor,
            workspaceLabel: imobContext.data.branding.workspaceLabel,
          },
        });
      }

      navigate("/app/imob/chat?domain=imob", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Falha ao ativar IMOB (${err.status}).`);
      } else {
        setError(err instanceof Error ? err.message : "Falha ao ativar IMOB");
      }
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Marketplace</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">IMOB Network</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ative a vertical imobiliária para liberar Chat Operacional, Properties, Processes e Partners.
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          White-label ativo: {brandName} • {workspaceLabel}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
        <article className="rounded-3xl border border-white/10 bg-surface/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Estado da instalação</h2>
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {session.workspaceId}
            </span>
          </div>

          {loading ? <p className="mt-4 text-sm text-muted-foreground">Carregando status...</p> : null}

          {!loading ? (
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                Produto: <span className="text-foreground">IMOB</span>
              </p>
              <p>
                Status: <span className="text-foreground">{isInstalled ? "ativo" : "não instalado"}</span>
              </p>
              <p>
                Ativado em: <span className="text-foreground">{activatedAt ? new Date(activatedAt).toLocaleString("pt-BR") : "—"}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {isInstalled ? (
              <button
                type="button"
                onClick={() => navigate("/app/imob/chat?domain=imob")}
                className="rounded-full border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-accent transition hover:border-accent hover:bg-accent/30"
              >
                Abrir IMOB
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-200">
                  Esta ativacao pode gerar cobranca conforme seu plano.{" "}
                  <Link to="/app/billing" className="underline text-accent">
                    Ver tabela de precos
                  </Link>
                </p>
                <button
                  type="button"
                  onClick={() => void handleActivate()}
                  disabled={activating}
                  className="rounded-full border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activating ? "Ativando..." : "Ativar módulo"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-foreground transition hover:border-accent/40 hover:text-accent"
            >
              Atualizar
            </button>
          </div>

          {notice ? <p className="mt-4 text-sm text-emerald-300">{notice}</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        </article>

        <aside className="rounded-3xl border border-white/10 bg-surface/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">Rotas liberadas</h3>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li>/app/imob/chat</li>
            <li>/app/imob/properties</li>
            <li>/app/imob/processes</li>
            <li>/app/imob/partners</li>
          </ul>
        </aside>
      </section>
    </div>
  );
};

export default ImobMarketplacePage;
