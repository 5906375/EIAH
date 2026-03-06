import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { selfServiceConfigs } from "./config";
import {
  apiListDelegations,
  apiListMarketplace,
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
  const [subscribedIds, setSubscribedIds] = React.useState<Set<string>>(new Set());
  const [subscribeNotice, setSubscribeNotice] = React.useState<string | null>(null);
  const [itemErrors, setItemErrors] = React.useState<Record<string, string>>({});
  const [formValues, setFormValues] = React.useState<
    Record<string, { scope: "read" | "execute" | "admin"; trustMin: string; validUntil: string }>
  >({});

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
    return Number.isFinite(expiry) && expiry > Date.now();
  };

  const filteredMarketplaceItems = React.useMemo(() => {
    if (marketplaceFilter === "all") return marketplaceItems;
    return marketplaceItems.filter((item) => item.type === marketplaceFilter);
  }, [marketplaceItems, marketplaceFilter]);

  const refreshDelegations = React.useCallback(async () => {
    setDelegationsStatus("loading");
    setDelegationsError(null);
    try {
      const response = await apiListDelegations({ role: "delegatee", workspaceScoped: true });
      setDelegations(response.items ?? []);
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
      apiListDelegations({ role: "delegatee", workspaceScoped: true }),
    ])
      .then(([marketplaceResponse, delegationResponse]) => {
        if (!active) return;
        setMarketplaceItems(marketplaceResponse.items ?? []);
        setMarketplaceStatus("ready");
        setDelegations(delegationResponse.items ?? []);
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
  }, [session.workspaceId, session.tenantId, session.token]);

  React.useEffect(() => {
    const next = new Set<string>();
    delegations.forEach((delegation) => {
      if (delegation.marketplaceId && isDelegationActive(delegation)) {
        next.add(delegation.marketplaceId);
      }
    });
    setSubscribedIds(next);
  }, [delegations]);

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

  const handleSubscribe = async (item: MarketplaceItem) => {
    if (subscribingIds.has(item.id) || subscribedIds.has(item.id)) return;
    if (!session.token) {
      navigate(`/signup?marketplaceId=${encodeURIComponent(item.id)}&next=/self-service`);
      return;
    }
    setSubscribeNotice(null);
    setItemErrors((prev) => ({ ...prev, [item.id]: "" }));
    setSubscribingIds((prev) => new Set(prev).add(item.id));
    try {
      const form = formValues[item.id];
      const trustMinValue = form?.trustMin ? Number(form.trustMin) : undefined;
      const trustMin = Number.isFinite(trustMinValue) ? trustMinValue : undefined;
      const validUntilDate = form?.validUntil ? new Date(form.validUntil) : null;
      const validUntil =
        validUntilDate && Number.isFinite(validUntilDate.getTime())
          ? validUntilDate.toISOString()
          : undefined;
      await apiSubscribeMarketplace(item.id, {
        scope: form?.scope ?? "execute",
        trustMin,
        validUntil,
      });
      await refreshDelegations();
      setSubscribeNotice(`Assinatura criada para ${item.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao assinar item";
      setItemErrors((prev) => ({ ...prev, [item.id]: message }));
    } finally {
      setSubscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-10">
      

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
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredMarketplaceItems.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
                Nenhum item publicado no marketplace ainda.
              </div>
            ) : (
              filteredMarketplaceItems.map((item) => {
                const isSubscribing = subscribingIds.has(item.id);
                const delegation = delegationByMarketplaceId.get(item.id);
                const isSubscribed = subscribedIds.has(item.id);
                const isActive = isDelegationActive(delegation);
                const buttonLabel = isActive
                  ? "Ativo"
                  : delegation
                  ? "Renovar"
                  : "Assinar";
                const itemError = itemErrors[item.id];
                return (
                  <div
                    key={item.id}
                    id={`marketplace-${item.id}`}
                    className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-[#0a1527] p-5"
                  >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent">
                      <span className="rounded-full bg-accent/20 px-2 py-1">
                        {item.type}
                      </span>
                      <span>{item.version}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-foreground">{item.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {item.description || "Sem descrição registrada."}
                    </p>
                  </div>
                    {item.approvalStatus === "pending" ? (
                      <span className="mt-3 inline-flex w-fit items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200">
                        Aguardando aprovacao
                      </span>
                    ) : null}
                    {isSubscribing ? (
                      <span className="mt-2 inline-flex w-fit items-center rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-sky-200">
                        Processando
                      </span>
                    ) : null}
                    {isActive ? (
                      <span className="mt-2 inline-flex w-fit items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-emerald-200">
                        Ativo
                      </span>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Trust sugerido: {item.trustScore ?? "—"}</span>
                      <span>{item.isPublic ? "Publico" : "Privado"}</span>
                    </div>
                    {delegation && !isActive ? (
                      <span className="mt-2 inline-flex w-fit items-center rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-rose-200">
                        Expirado
                      </span>
                    ) : null}
                    {delegation && !isActive ? (
                      <span className="mt-2 inline-flex w-fit items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200">
                        Renovar
                      </span>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Publisher: {item.publisherName ?? item.publisherId}
                    </p>
                    {delegationsStatus === "error" ? (
                      <p className="mt-3 text-xs text-red-300">{delegationsError}</p>
                    ) : null}
                    {itemError ? (
                      <p className="mt-3 text-xs text-red-300">{itemError}</p>
                    ) : null}
                    {(() => {
                      const delegation = delegationByMarketplaceId.get(item.id);
                      const active = isDelegationActive(delegation);
                      if (!delegation) {
                        return (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Status: nao assinado.
                          </p>
                        );
                      }
                      return (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Status: {active ? "ativo" : "expirado"} (ate {formatDate(delegation.validUntil)}).
                        </p>
                      );
                    })()}
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
                        <span className="uppercase tracking-[0.2em] text-[10px]">Trust minimo</span>
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
                      disabled={isSubscribing || isSubscribed}
                      className="mt-5 inline-flex items-center justify-center rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubscribing ? "Assinando..." : buttonLabel}
                    </button>
                  </div>
                );
              })
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
