import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { selfServiceConfigs } from "./config";
import {
  apiApproveDelegation,
  apiListDelegations,
  apiListMarketplace,
  apiRejectDelegation,
  apiSubscribeMarketplace,
  type DelegationPolicy,
  type MarketplaceItem,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import eiahAgentsVideo from "../../assets/eiah-agentes.mp4";
import eiahMarketingVideo from "../../assets/eiah-marketing.mp4";
import eiahJ360Video from "../../assets/eiah-j360.mp4";
import eiahFlowOrchestratorVideo from "../../assets/eiah-flow-orchestrator.mp4";
import eiahRiskAnalyzerVideo from "../../assets/eiah-risk-analyzer.mp4";
import eiahOnchainMonitorVideo from "../../assets/eiah-onchain-monitor.mp4";
import eiahIBCVideo from "../../assets/eiah-i-bc.mp4";
import eiahDiariasVideo from "../../assets/eiah-diarias.mp4";
import eiahNftPyVideo from "../../assets/eiah-nft-py.mp4";
import eiahImagenftDiariasVideo from "../../assets/eiah-imagenftdiarias.mp4";
import eiahDefiVideo from "../../assets/eiah-defi.mp4";
import eiahPitchVideo from "../../assets/eiah-pitch.mp4";
import eiahCoreVideo from "../../assets/eiah-core.mp4";
import eiahGeralVideo from "../../assets/eiah-geral.mp4";
import SelfServiceNav from "./components/SelfServiceNav";
import NeedMoreInfoDialog from "./components/NeedMoreInfoDialog";

const primaryAgent = selfServiceConfigs[0];
const agentArtwork: Record<string, string> = {};
const agentVideoMap: Record<string, string> = {
  mkt: eiahMarketingVideo,
  j360: eiahJ360Video,
  "flow-orchestrator": eiahFlowOrchestratorVideo,
  "risk-analyzer": eiahRiskAnalyzerVideo,
  guardian: eiahCoreVideo,
  "fin-nexus": eiahGeralVideo,
  "onchain-monitor": eiahOnchainMonitorVideo,
  "i-bc": eiahIBCVideo,
  diarias: eiahDiariasVideo,
  "nft-py": eiahNftPyVideo,
  imagenftdiarias: eiahImagenftDiariasVideo,
  "defi-1": eiahDefiVideo,
  pitch: eiahPitchVideo,
  eiah: eiahCoreVideo,
};

export default function SelfServiceIndexPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [marketplaceItems, setMarketplaceItems] = React.useState<MarketplaceItem[]>([]);
  const [marketplaceFilter, setMarketplaceFilter] = React.useState<"all" | "agent" | "action">(
    "all"
  );
  const [marketplaceStatus, setMarketplaceStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [marketplaceError, setMarketplaceError] = React.useState<string | null>(null);
  const [delegations, setDelegations] = React.useState<DelegationPolicy[]>([]);
  const [delegationsStatus, setDelegationsStatus] = React.useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [delegationsError, setDelegationsError] = React.useState<string | null>(null);
  const [subscribingIds, setSubscribingIds] = React.useState<Set<string>>(new Set());
  const [subscribeNotice, setSubscribeNotice] = React.useState<string | null>(null);
  const [itemErrors, setItemErrors] = React.useState<Record<string, string>>({});
  const [decisionErrors, setDecisionErrors] = React.useState<Record<string, string>>({});
  const [formValues, setFormValues] = React.useState<
    Record<string, { scope: "read" | "execute" | "admin"; trustMin: string; validUntil: string }>
  >({});
  const [providerDelegations, setProviderDelegations] = React.useState<DelegationPolicy[]>([]);
  const [viewMode, setViewMode] = React.useState<"catalog" | "approvals">("catalog");
  const [decisionLoading, setDecisionLoading] = React.useState<Record<string, "approve" | "reject">>(
    {}
  );
  const [termsItem, setTermsItem] = React.useState<MarketplaceItem | null>(null);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [termsSubmitting, setTermsSubmitting] = React.useState(false);

  const delegationByMarketplaceId = React.useMemo(() => {
    const map = new Map<string, DelegationPolicy>();
    delegations.forEach((delegation) => {
      if (delegation.marketplaceId) {
        map.set(delegation.marketplaceId, delegation);
      }
    });
    return map;
  }, [delegations]);

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("pt-BR");
  };

  const toDateInputValue = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const isDelegationActive = (delegation?: DelegationPolicy | null) => {
    if (!delegation?.validUntil) return false;
    const expiry = new Date(delegation.validUntil).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    if (delegation.status && delegation.status !== "active") return false;
    return true;
  };

  const getDelegationStatus = (delegation?: DelegationPolicy | null) => {
    if (!delegation) return "none";
    if (delegation.status === "pending_approval") return "pending_approval";
    if (delegation.status === "rejected") return "rejected";
    if (delegation.status === "revoked") return "revoked";
    const expiry = new Date(delegation.validUntil).getTime();
    if (Number.isFinite(expiry) && expiry <= Date.now()) return "expired";
    return "active";
  };

  const renderStatusChip = (status: string) => {
    const styles: Record<string, { label: string; className: string }> = {
      pending_approval: {
        label: "Aguardando aprovacao",
        className: "border-amber-400/40 bg-amber-400/10 text-amber-200",
      },
      active: {
        label: "Ativo",
        className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
      },
      expired: {
        label: "Expirado",
        className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
      },
      rejected: {
        label: "Rejeitado",
        className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
      },
      revoked: {
        label: "Revogado",
        className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
      },
      none: {
        label: "Nao assinado",
        className: "border-white/10 bg-white/5 text-muted-foreground",
      },
    };

    const style = styles[status] ?? styles.none;
    return (
      <span
        className={`mt-2 inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] ${style.className}`}
      >
        {style.label}
      </span>
    );
  };

  const formatDelegationStatus = (status: string) => {
    const labels: Record<string, string> = {
      pending_approval: "aguardando aprovacao",
      active: "ativo",
      rejected: "rejeitado",
      revoked: "revogado",
      expired: "expirado",
      none: "nao assinado",
    };
    return labels[status] ?? status;
  };

  const activeDelegations = React.useMemo(
    () => delegations.filter((delegation) => isDelegationActive(delegation)),
    [delegations]
  );
  const expiredDelegations = React.useMemo(
    () => delegations.filter((delegation) => getDelegationStatus(delegation) === "expired"),
    [delegations]
  );
  const pendingApprovals = React.useMemo(
    () =>
      providerDelegations.filter((delegation) => delegation.status === "pending_approval"),
    [providerDelegations]
  );
  const filteredMarketplaceItems = React.useMemo(() => {
    if (marketplaceFilter === "all") return marketplaceItems;
    return marketplaceItems.filter((item) => item.type === marketplaceFilter);
  }, [marketplaceItems, marketplaceFilter]);

  const refreshDelegations = React.useCallback(async () => {
    setDelegationsStatus("loading");
    setDelegationsError(null);
    try {
      const [delegateeResponse, delegatorResponse] = await Promise.all([
        apiListDelegations({ role: "delegatee" }),
        apiListDelegations({ role: "delegator" }),
      ]);
      setDelegations(delegateeResponse.items ?? []);
      setProviderDelegations(delegatorResponse.items ?? []);
      setDelegationsStatus("ready");
    } catch (error) {
      setDelegationsStatus("error");
      setDelegationsError(error instanceof Error ? error.message : "Falha ao carregar delegacoes");
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    setMarketplaceStatus("loading");
    setMarketplaceError(null);
    setDelegationsStatus("loading");
    setDelegationsError(null);

    Promise.all([
      apiListMarketplace(),
      apiListDelegations({ role: "delegatee" }),
      apiListDelegations({ role: "delegator" }),
    ])
      .then(([marketplaceResponse, delegationResponse, delegatorResponse]) => {
        if (!active) return;
        setMarketplaceItems(marketplaceResponse.items ?? []);
        setMarketplaceStatus("ready");
        setDelegations(delegationResponse.items ?? []);
        setProviderDelegations(delegatorResponse.items ?? []);
        setDelegationsStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setMarketplaceStatus("error");
        setMarketplaceError(error instanceof Error ? error.message : "Falha ao carregar marketplace");
        setDelegationsStatus("error");
        setDelegationsError(error instanceof Error ? error.message : "Falha ao carregar delegacoes");
      });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    setFormValues((prev) => {
      const next = { ...prev };
      marketplaceItems.forEach((item) => {
        if (next[item.id]) return;
        const delegation = delegationByMarketplaceId.get(item.id);
        const defaultValidUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        next[item.id] = {
          scope: delegation?.scope ?? "execute",
          trustMin: delegation?.trustMin?.toString() ?? (item.trustScore?.toString() ?? ""),
          validUntil: toDateInputValue(delegation?.validUntil) || defaultValidUntil,
        };
      });
      return next;
    });
  }, [marketplaceItems, delegationByMarketplaceId]);

  const termsRequest = React.useMemo(() => {
    if (!termsItem) return null;
    return {
      title: "Termos de Delegacao",
      message:
        "Revise os limites desta delegacao antes de assinar. O hash oficial sera calculado no backend.",
      fields: [
        {
          key: "scope",
          label: "Scope",
          type: "select" as const,
          options: [
            { value: "read", label: "read" },
            { value: "execute", label: "execute" },
            { value: "admin", label: "admin" },
          ],
        },
        {
          key: "trustMin",
          label: "Trust minimo",
          type: "text" as const,
          helper: "Use valores entre 0 e 100.",
        },
        {
          key: "validUntil",
          label: "Valido ate",
          type: "text" as const,
          helper: "Formato AAAA-MM-DD.",
        },
      ],
    };
  }, [termsItem]);

  const termsCurrentValues = React.useMemo(() => {
    if (!termsItem) return {};
    const current = formValues[termsItem.id];
    return {
      scope: current?.scope ?? "execute",
      trustMin: current?.trustMin ?? "",
      validUntil: current?.validUntil ?? "",
    };
  }, [termsItem, formValues]);

  const handleSubscribe = (item: MarketplaceItem) => {
    if (subscribingIds.has(item.id)) return;
    const status = getDelegationStatus(delegationByMarketplaceId.get(item.id));
    if (status === "active" || status === "pending_approval") return;
    if (!session.token) {
      navigate(`/signup?marketplaceId=${encodeURIComponent(item.id)}&next=/self-service`);
      return;
    }
    setSubscribeNotice(null);
    setItemErrors((prev) => ({ ...prev, [item.id]: "" }));
    setTermsItem(item);
    setTermsOpen(true);
  };

  const handleConfirmSubscribe = async (values: Record<string, string>) => {
    if (!termsItem) return;
    setTermsSubmitting(true);
    setSubscribingIds((prev) => new Set(prev).add(termsItem.id));
    try {
      const nextScope =
        values.scope === "read" || values.scope === "execute" || values.scope === "admin"
          ? values.scope
          : formValues[termsItem.id]?.scope ?? "execute";
      const trustMinValue = values.trustMin ? Number(values.trustMin) : undefined;
      const trustMin = Number.isFinite(trustMinValue) ? trustMinValue : undefined;
      const validUntilDate = values.validUntil ? new Date(values.validUntil) : null;
      const validUntil =
        validUntilDate && Number.isFinite(validUntilDate.getTime())
          ? validUntilDate.toISOString()
          : undefined;
      setFormValues((prev) => ({
        ...prev,
        [termsItem.id]: {
          scope: nextScope,
          trustMin: values.trustMin ?? prev[termsItem.id]?.trustMin ?? "",
          validUntil: values.validUntil ?? prev[termsItem.id]?.validUntil ?? "",
        },
      }));
      await apiSubscribeMarketplace(termsItem.id, {
        scope: nextScope,
        trustMin,
        validUntil,
      });
      await refreshDelegations();
      setSubscribeNotice(`Assinatura criada para ${termsItem.name}.`);
      setTermsOpen(false);
      setTermsItem(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao assinar item";
      setItemErrors((prev) => ({ ...prev, [termsItem.id]: message }));
    } finally {
      setTermsSubmitting(false);
      setSubscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(termsItem.id);
        return next;
      });
    }
  };

  const handleApprove = async (delegation: DelegationPolicy) => {
    if (decisionLoading[delegation.id]) return;
    setDecisionErrors((prev) => ({ ...prev, [delegation.id]: "" }));
    setDecisionLoading((prev) => ({ ...prev, [delegation.id]: "approve" }));
    try {
      await apiApproveDelegation(delegation.id);
      await refreshDelegations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao aprovar delegacao";
      setDecisionErrors((prev) => ({ ...prev, [delegation.id]: message }));
    } finally {
      setDecisionLoading((prev) => {
        const next = { ...prev };
        delete next[delegation.id];
        return next;
      });
    }
  };

  const handleReject = async (delegation: DelegationPolicy) => {
    if (decisionLoading[delegation.id]) return;
    setDecisionErrors((prev) => ({ ...prev, [delegation.id]: "" }));
    setDecisionLoading((prev) => ({ ...prev, [delegation.id]: "reject" }));
    try {
      await apiRejectDelegation(delegation.id);
      await refreshDelegations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao rejeitar delegacao";
      setDecisionErrors((prev) => ({ ...prev, [delegation.id]: message }));
    } finally {
      setDecisionLoading((prev) => {
        const next = { ...prev };
        delete next[delegation.id];
        return next;
      });
    }
  };

  return (
    <div className="space-y-10">
      <NeedMoreInfoDialog
        open={termsOpen && !!termsItem}
        request={termsRequest}
        currentValues={termsCurrentValues}
        isSubmitting={termsSubmitting}
        onCancel={() => {
          setTermsOpen(false);
          setTermsItem(null);
        }}
        onSubmit={handleConfirmSubscribe}
        submitLabel="Assinar e submeter"
        cancelLabel="Voltar"
      />
      

      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Consultoria assistida por IA</p>
        <div className="mt-0.3 grid gap-6 md:grid-cols-[1.6fr,1fr] md:items-center">

          <div className="space-y-16"> {/* Ajustado para space-y-10 para espaçamento entre título e parágrafo */}
            <h1 className="text-4xl font-display font-semibold tracking-[0.09em] text-foreground md:text-5xl md:tracking-[0.07em]">
              Transforme ideias em planos acionáveis em minutos
            </h1>
            <p className="text-base leading-relaxed tracking-[0.03em] text-muted-foreground md:text-lg md:tracking-[0.05em]">
              Escolha um agente especializado, preencha um formulário guiado e receba um plano pronto com histórico auditável.
              Sem esperar consultorias, sem aprender prompts complexos.
            </p>

            {/* AQUI ESTÃO AS ALTERAÇÕES: mt-12 para descer e justify-center para centralizar */}
            <div className="flex flex-wrap gap-4 md:gap-6 mt-12 justify-center">
              {primaryAgent ? (
                <Link
                  to={`/self-service/${primaryAgent.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/20 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30"
                >
                  Começar agora
                </Link>
              ) : null}
              <a
                href="admin@carlos-alberto-merlo.com"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
              >
                Falar com especialista
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/70 shadow-lg shadow-accent/10">
              <video
                className="h-full w-full object-cover"
                src={eiahAgentsVideo}
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
            <div className="rounded-3xl border border-white/10 bg-surface/70 p-5 shadow-lg shadow-accent/10">
              <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Como funciona</p>
              <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li>
                  <span className="font-semibold text-foreground">1.</span> Escolha um plano pronto ( Pitch, Compliance,
                  DeFi, Monitoramento)
                </li>
                <li>
                  <span className="font-semibold text-foreground">2.</span> Responda perguntas simples traduzidas do jargão
                  técnico
                </li>
                <li>
                  <span className="font-semibold text-foreground">3.</span> Receba relatório + plano de ação em {"< 2"} minutos,
                  com histórico e custo estimado
                </li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {selfServiceConfigs.map((config) => {
          const artworkSrc = agentArtwork[config.slug];
          const cardVideoSrc = agentVideoMap[config.slug];
          const isJ360 = config.slug === "j360" && artworkSrc;

          if (isJ360) {
            return (
              <Link
                key={config.slug}
                to={`/self-service/${config.slug}`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1527] p-6 transition hover:border-accent/60 hover:bg-[#0f2039]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent" aria-hidden />
                <div className="relative z-10 flex min-h-[260px] flex-col justify-between gap-6 pr-40">
                  <div className="space-y-4">
                    <span className="pill inline-block bg-accent/20 text-[10px] uppercase tracking-[0.25em] text-accent">
                      {config.label}
                    </span>
                    <div className="space-y-3">
                      <h2 className="text-2xl font-semibold text-foreground">{config.title}</h2>
                      <p className="text-sm leading-relaxed text-foreground/80">{config.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">
                      Interagir com Agente
                      <span aria-hidden>→</span>
                    </span>
                    <span className="text-2xl font-bold text-white">J_360</span>
                  </div>
                </div>
                <img
                  src={artworkSrc}
                  alt="Agente J_360"
                  className="pointer-events-none absolute top-6 right-6 h-48 w-auto drop-shadow-[0_28px_38px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </Link>
            );
          }

          return (
            <Link
              key={config.slug}
              to={`/self-service/${config.slug}`}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-surface/70 p-5 transition hover:border-accent/50 hover:bg-accent/10"
            >
              {artworkSrc ? (
                <img
                  src={artworkSrc}
                  alt="Ilustração do agente"
                  className="pointer-events-none absolute -bottom-8 -right-6 w-32 opacity-40 transition duration-300 group-hover:scale-105 group-hover:opacity-70"
                  loading="lazy"
                />
              ) : null}
              <div className="mb-3 flex items-center gap-3">
                <span className="pill inline-block bg-accent/20 text-[10px] uppercase tracking-[0.25em] text-accent">
                  {config.label}
                </span>
                {cardVideoSrc ? (
                  <video
                    className="h-25 w-60 rounded-xl border border-white/10 object-cover shadow-sm shadow-accent/20"
                    src={cardVideoSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : null}
              </div>
              <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Interagir com Agente
                <span aria-hidden>→</span>
              </span>
            </Link>
          );
        })}
      </section>

      <section className="rounded-3xl border border-white/10 bg-surface/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Marketplace</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Assine fluxos publicados</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Itens do marketplace podem ser assinados e passam a obedecer às políticas de delegação.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10"
            >
              Registrar
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setViewMode("catalog")}
                className={`rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.25em] transition ${
                  viewMode === "catalog"
                    ? "bg-accent/30 text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Catalogo
              </button>
              <button
                type="button"
                onClick={() => setViewMode("approvals")}
                className={`rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.25em] transition ${
                  viewMode === "approvals"
                    ? "bg-accent/30 text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Aprovacoes
              </button>
            </div>
            <select
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-foreground"
              value={marketplaceFilter}
              onChange={(event) => {
                setMarketplaceFilter(event.target.value as "all" | "agent" | "action");
              }}
            >
              <option value="all">Todos</option>
              <option value="agent">Agents</option>
              <option value="action">Actions</option>
            </select>
            {subscribeNotice ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                {subscribeNotice}
              </span>
            ) : null}
          </div>
        </div>
        {marketplaceStatus === "loading" ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando itens do marketplace...</p>
        ) : null}
        {marketplaceStatus === "error" ? (
          <p className="mt-6 text-sm text-red-300">{marketplaceError ?? "Falha ao carregar marketplace"}</p>
        ) : null}
        {marketplaceStatus === "ready" ? (
          viewMode === "catalog" ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredMarketplaceItems.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
                  Nenhum item publicado no marketplace ainda.
                </div>
              ) : (
                filteredMarketplaceItems.map((item) => {
                  const isSubscribing = subscribingIds.has(item.id);
                  const delegation = delegationByMarketplaceId.get(item.id);
                  const delegationStatus = getDelegationStatus(delegation);
                  const buttonLabel =
                    delegationStatus === "active"
                      ? "Ativo"
                      : delegationStatus === "pending_approval"
                      ? "Aguardando"
                      : delegationStatus === "rejected" || delegationStatus === "revoked"
                      ? "Reenviar"
                      : delegationStatus === "expired"
                      ? "Renovar"
                      : "Solicitar acesso";
                  const itemError = itemErrors[item.id];
                  return (
                    <div
                      key={item.id}
                      id={`marketplace-${item.id}`}
                      className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-[#0a1527] p-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent">
                          <span className="rounded-full bg-accent/20 px-2 py-1">{item.type}</span>
                          <span>{item.version}</span>
                        </div>
                        <h4 className="text-lg font-semibold text-foreground">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {item.description || "Sem descrição registrada."}
                        </p>
                      </div>
                      {isSubscribing ? (
                        <span className="mt-2 inline-flex w-fit items-center rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-sky-200">
                          Processando
                        </span>
                      ) : null}
                      {renderStatusChip(delegationStatus)}
                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Trust sugerido: {item.trustScore ?? "—"}</span>
                        <span>{item.isPublic ? "Publico" : "Privado"}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Publisher: {item.publisherName ?? item.publisherId}
                      </p>
                      {delegationsStatus === "error" ? (
                        <p className="mt-3 text-xs text-red-300">{delegationsError}</p>
                      ) : null}
                      {itemError ? <p className="mt-3 text-xs text-red-300">{itemError}</p> : null}
                      {delegation ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Status: {formatDelegationStatus(delegationStatus)} (ate{" "}
                          {formatDate(delegation.validUntil)}).
                        </p>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">Status: nao assinado.</p>
                      )}
                      <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
                        <label className="flex flex-col gap-2">
                          <span className="uppercase tracking-[0.2em] text-[10px]">Scope</span>
                          <select
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                            value={formValues[item.id]?.scope ?? "execute"}
                            onChange={(event) => {
                              const value = event.target.value as "read" | "execute" | "admin";
                              setFormValues((prev) => ({
                                ...prev,
                                [item.id]: {
                                  scope: value,
                                  trustMin: prev[item.id]?.trustMin ?? "",
                                  validUntil: prev[item.id]?.validUntil ?? "",
                                },
                              }));
                            }}
                          >
                            <option value="read">read</option>
                            <option value="execute">execute</option>
                            <option value="admin">admin</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="uppercase tracking-[0.2em] text-[10px]">
                            Trust minimo
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                            value={formValues[item.id]?.trustMin ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setFormValues((prev) => ({
                                ...prev,
                                [item.id]: {
                                  scope: prev[item.id]?.scope ?? "execute",
                                  trustMin: value,
                                  validUntil: prev[item.id]?.validUntil ?? "",
                                },
                              }));
                            }}
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="uppercase tracking-[0.2em] text-[10px]">Valido ate</span>
                          <input
                            type="date"
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                            value={formValues[item.id]?.validUntil ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setFormValues((prev) => ({
                                ...prev,
                                [item.id]: {
                                  scope: prev[item.id]?.scope ?? "execute",
                                  trustMin: prev[item.id]?.trustMin ?? "",
                                  validUntil: value,
                                },
                              }));
                            }}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSubscribe(item)}
                        disabled={
                          isSubscribing ||
                          delegationStatus === "active" ||
                          delegationStatus === "pending_approval"
                        }
                        className="mt-5 inline-flex items-center justify-center rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubscribing ? "Assinando..." : buttonLabel}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingApprovals.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
                  Nenhuma delegacao aguardando aprovacao.
                </div>
              ) : (
                pendingApprovals.map((delegation) => {
                  const item = marketplaceItems.find(
                    (marketplaceItem) => marketplaceItem.id === delegation.marketplaceId
                  );
                  const decision = decisionLoading[delegation.id];
                  const decisionError = decisionErrors[delegation.id];
                  return (
                    <div
                      key={delegation.id}
                      className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-[#0a1527] p-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent">
                          <span className="rounded-full bg-accent/20 px-2 py-1">
                            {item?.type ?? "agent"}
                          </span>
                          <span>{item?.version ?? "v1"}</span>
                        </div>
                        <h4 className="text-lg font-semibold text-foreground">
                          {item?.name ?? delegation.marketplaceId ?? "Item desconhecido"}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {item?.description || "Sem descrição registrada."}
                        </p>
                      </div>
                      {renderStatusChip("pending_approval")}
                      <div className="mt-4 text-xs text-muted-foreground">
                        <p>Solicitante: {delegation.delegateeId}</p>
                        <p>Scope: {delegation.scope}</p>
                        <p>Trust minimo: {delegation.trustMin}</p>
                        <p>Valido ate: {formatDate(delegation.validUntil)}</p>
                      </div>
                      {decisionError ? (
                        <p className="mt-3 text-xs text-red-300">{decisionError}</p>
                      ) : null}
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleApprove(delegation)}
                          disabled={!!decision}
                          className="inline-flex items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {decision === "approve" ? "Aprovando..." : "Aprovar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(delegation)}
                          disabled={!!decision}
                          className="inline-flex items-center justify-center rounded-full border border-rose-400/50 bg-rose-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:border-rose-400 hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {decision === "reject" ? "Rejeitando..." : "Rejeitar"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )
        ) : null}
        {delegationsStatus === "ready" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-foreground">
                Delegacoes ativas
              </h4>
              <span className="text-xs text-muted-foreground">
                {activeDelegations.length} ativo(s)
              </span>
            </div>
            {activeDelegations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma delegacao ativa encontrada.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {activeDelegations.map((delegation) => {
                  const item = marketplaceItems.find(
                    (marketplaceItem) => marketplaceItem.id === delegation.marketplaceId
                  );
                  const publisherLabel =
                    item?.publisherName ?? item?.publisherId ?? delegation.delegatorId;
                  return (
                    <div
                      key={delegation.id}
                      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {item?.name ?? delegation.marketplaceId ?? "Item desconhecido"}
                      </span>
                      <span>Publisher: {publisherLabel}</span>
                      <span>Scope: {delegation.scope}</span>
                      <span>Trust minimo: {delegation.trustMin}</span>
                      <span>Valido ate: {formatDate(delegation.validUntil)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
        {delegationsStatus === "ready" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-foreground">
                Delegacoes expiradas
              </h4>
              <span className="text-xs text-muted-foreground">
                {expiredDelegations.length} expirado(s)
              </span>
            </div>
            {expiredDelegations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma delegacao expirada encontrada.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {expiredDelegations.map((delegation) => {
                  const item = marketplaceItems.find(
                    (marketplaceItem) => marketplaceItem.id === delegation.marketplaceId
                  );
                  const publisherLabel =
                    item?.publisherName ?? item?.publisherId ?? delegation.delegatorId;
                  return (
                    <div
                      key={delegation.id}
                      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0a1527] p-4 text-xs text-muted-foreground"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {item?.name ?? delegation.marketplaceId ?? "Item desconhecido"}
                      </span>
                      <span>Publisher: {publisherLabel}</span>
                      <span>Scope: {delegation.scope}</span>
                      <span>Trust minimo: {delegation.trustMin}</span>
                      <span>Valido ate: {formatDate(delegation.validUntil)}</span>
                      {delegation.marketplaceId ? (
                        <a
                          className="mt-2 inline-flex w-fit items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200"
                          href={`#marketplace-${delegation.marketplaceId}`}
                        >
                          Renovar agora
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-surface/60 p-6 md:grid-cols-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Plano Starter</h3>
          <p className="mt-1 text-sm text-muted-foreground">50 execuções/mês + 3 formulários</p>
          <p className="mt-2 text-xl font-semibold text-accent">R$ 49/mês</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Plano Pro</h3>
          <p className="mt-1 text-sm text-muted-foreground">200 execuções/mês, todos os agentes, export CSV/JSON</p>
          <p className="mt-2 text-xl font-semibold text-accent">R$ 149/mês</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Add-ons</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Acoes externas (Slack, PagerDuty, DeFi) cobradas por uso. Alertas proativos e memorias persistentes.
          </p>
          <a
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent"
            href="mailto:contato@eiah.ai"
          >
            Solicitar proposta
                <span aria-hidden>→</span>
          </a>
        </div>
      </section>
    </div>
  );
}
