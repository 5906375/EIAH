import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { selfServiceConfigs } from "./config";
import {
  apiCreateTenantRecipe,
  apiGetOnboardingContext,
  apiListDelegations,
  apiListMarketplace,
  apiListTenantRecipes,
  apiSubscribeMarketplace,
  apiUpdateTenantRecipe,
  type DelegationPolicy,
  type MarketplaceItem,
  type OnboardingContext,
  type TenantRecipe,
} from "@/lib/api";
import { formatBRL } from "@/lib/formatters";
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

function normalizeCatalogText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isImobTenantRecipe(recipe: TenantRecipe) {
  const normalizedAgent = normalizeCatalogText(recipe.agentId);
  const normalizedTags = recipe.tags.map((tag) => normalizeCatalogText(tag));
  const normalizedTitle = normalizeCatalogText(recipe.title);
  const normalizedSummary = normalizeCatalogText(recipe.summary);
  return (
    normalizedAgent === "imob"
    || normalizedTags.includes("imob")
    || normalizedTitle === "imob"
    || normalizedTitle.includes("imob")
    || normalizedSummary.includes("imob")
    || normalizedSummary.includes("crmimob")
  );
}

function hasSupportedImobMission(recipe: TenantRecipe) {
  const normalizedAgent = normalizeCatalogText(recipe.agentId);
  const normalizedTags = recipe.tags.map((tag) => normalizeCatalogText(tag));
  const hasImobScope = normalizedAgent === "imob" || normalizedTags.includes("imob");
  const hasMissionTag = normalizedTags.some((tag) => (
    tag === "captureseasonalproperty"
    || tag === "temporada"
    || tag === "aluguelportemporada"
    || tag === "locacaotemporada"
    || tag === "capturesaleproperty"
    || tag === "venda"
    || tag === "capturerentalproperty"
    || tag === "locacao"
    || tag === "locacaoanual"
  ));
  return hasImobScope && hasMissionTag;
}

function hasFounderAccess(session: ReturnType<typeof useSession>) {
  const roles = session.roles?.map((role) => normalizeCatalogText(role)) ?? [];
  const roleProfile = normalizeCatalogText(session.experience?.roleProfile);
  return roleProfile === "founder_global" || roles.includes("founder") || roles.includes("global_admin");
}

function buildImobRecipeChatPath(recipe: TenantRecipe, options?: { includeRecipeId?: boolean }) {
  const params = new URLSearchParams({
    autoprompt: `abrir recipe ${recipe.title}`,
    startNew: "1",
  });
  if (options?.includeRecipeId) {
    params.set("recipeId", recipe.id);
  }
  return `/app/imob/chat?${params.toString()}`;
}

type PricingPlanId = "solo" | "starter" | "growth" | "scale";

const PRICING_PLANS: Array<{
  id: PricingPlanId;
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  overageRunCents: number;
  extraUserCents: number;
  includes: string[];
}> = [
  {
    id: "solo",
    label: "Solo",
    basePriceCents: 49_000,
    includedUsers: 3,
    includedRuns: 1_500,
    overageRunCents: 35,
    extraUserCents: 3_900,
    includes: [
      "3 usuários inclusos para operação enxuta",
      "1.500 runs/mês para atendimento e follow-up",
      "Trilha auditável por run com evidência exportável",
      "Governança base: intent + trust + guardrails",
      "Ideal para corretor autônomo ou micro-time",
      "Suporte padrão em horário comercial",
    ],
  },
  {
    id: "starter",
    label: "Starter",
    basePriceCents: 149_000,
    includedUsers: 10,
    includedRuns: 5_000,
    overageRunCents: 30,
    extraUserCents: 3_900,
    includes: [
      "10 usuários inclusos no tenant/workspace",
      "5.000 runs/mês com trilha auditável por run",
      "Governança base: intent + trust score + guardrails",
      "Evidência exportável (JSON/PDF/HTML) por execução",
      "Chat operacional + dashboard de processos",
      "Suporte padrão em horário comercial",
    ],
  },
  {
    id: "growth",
    label: "Growth",
    basePriceCents: 399_000,
    includedUsers: 25,
    includedRuns: 25_000,
    overageRunCents: 22,
    extraUserCents: 2_900,
    includes: [
      "25 usuários inclusos no tenant/workspace",
      "25.000 runs/mês com PoU + Trust Gate",
      "Aprovação humana e policies autoaplicáveis",
      "Auditoria pública por txId com vínculo canônico",
      "Interop A2A (discovery/negotiate/execute) pronta para operação",
      "Suporte prioritário para operação B2B",
    ],
  },
  {
    id: "scale",
    label: "Scale",
    basePriceCents: 990_000,
    includedUsers: 100,
    includedRuns: 100_000,
    overageRunCents: 15,
    extraUserCents: 1_900,
    includes: [
      "100 usuários inclusos no tenant/workspace",
      "100.000 runs/mês para operação crítica em escala",
      "Economy avançada: PoU-gated payment + disputas auditáveis",
      "Settlement provider com reconciliação e idempotência",
      "Command center por vertical e rollout controlado",
      "Suporte enterprise com acompanhamento dedicado",
    ],
  },
];

const PROPOSAL_OPTIONS = [
  {
    id: "micro-imob",
    title: "Micro Imobiliaria",
    profile: "Corretor + assistente + gestor",
    recommendation: "Solo",
    objective: "Entrada rapida com operacao enxuta e upgrade progressivo.",
    nextStep: "Comece com Solo e revise em 30 dias.",
  },
  {
    id: "operacao-starter",
    title: "Operacao Estruturada",
    profile: "Time comercial com multiplos atendentes",
    recommendation: "Starter",
    objective: "Escalar atendimento com governanca e trilha auditavel.",
    nextStep: "Ative Starter e configure limites por workspace.",
  },
  {
    id: "expansao-growth",
    title: "Expansao Regional",
    profile: "Multiplas frentes e alta demanda mensal",
    recommendation: "Growth",
    objective: "Ganhar escala sem perder controle de custo e qualidade.",
    nextStep: "Ative Growth e acompanhe previsao de invoice no billing.",
  },
  {
    id: "enterprise-custom",
    title: "Enterprise Custom",
    profile: "Operacao critica com requisitos proprios",
    recommendation: "Enterprise",
    objective: "Compor proposta tecnica e comercial sob consulta.",
    nextStep: "Abrir proposta assistida com agente EIAH.",
  },
] as const;

export default function SelfServiceIndexPage() {
  const session = useSession();
  const navigate = useNavigate();
  const founderAccess = hasFounderAccess(session);
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
  const [workspaceRecipes, setWorkspaceRecipes] = React.useState<TenantRecipe[]>([]);
  const [tenantRecipes, setTenantRecipes] = React.useState<TenantRecipe[]>([]);
  const [tenantRecipesStatus, setTenantRecipesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [tenantRecipesError, setTenantRecipesError] = React.useState<string | null>(null);
  const [tenantRecipeNotice, setTenantRecipeNotice] = React.useState<string | null>(null);
  const [tenantRecipeSubmitting, setTenantRecipeSubmitting] = React.useState(false);
  const [onboardingContext, setOnboardingContext] = React.useState<OnboardingContext | null>(null);
  const [onboardingContextStatus, setOnboardingContextStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [onboardingContextError, setOnboardingContextError] = React.useState<string | null>(null);
  const [tenantRecipeForm, setTenantRecipeForm] = React.useState({
    agentId: selfServiceConfigs[0]?.agentId ?? "EIAH",
    title: "",
    summary: "",
    instructions: "",
    scopeMode: "current_workspace" as "current_workspace" | "all_workspaces",
  });
  const [formValues, setFormValues] = React.useState<
    Record<string, { scope: "read" | "execute" | "admin"; trustMin: string; validUntil: string }>
  >({});
  const [selectedPlan, setSelectedPlan] = React.useState<PricingPlanId>("solo");
  const [calcUsers, setCalcUsers] = React.useState("3");
  const [calcRuns, setCalcRuns] = React.useState("1500");
  const [selectedProposalOption, setSelectedProposalOption] = React.useState(PROPOSAL_OPTIONS[0].id);

  const delegationByMarketplaceId = React.useMemo(() => {
    const map = new Map<string, DelegationPolicy>();
    delegations.forEach((delegation) => {
      if (delegation.marketplaceId) {
        map.set(delegation.marketplaceId, delegation);
      }
    });
    return map;
  }, [delegations]);
  const canonicalMarketplaceDisplay = React.useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        description: string;
      }
    >();

    selfServiceConfigs.forEach((config) => {
      const canonical = {
        name: config.title,
        description: config.description,
      };
      map.set(normalizeCatalogText(config.title), canonical);
      map.set(normalizeCatalogText(config.slug), canonical);
      map.set(normalizeCatalogText(config.agentId), canonical);
    });

    return map;
  }, []);
  const selfServiceConfigByAgentId = React.useMemo(() => {
    const map = new Map<string, (typeof selfServiceConfigs)[number]>();
    selfServiceConfigs.forEach((config) => {
      map.set(normalizeCatalogText(config.agentId), config);
    });
    return map;
  }, []);

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
  const selectedPlanDetails = React.useMemo(
    () => PRICING_PLANS.find((plan) => plan.id === selectedPlan) ?? PRICING_PLANS[0],
    [selectedPlan]
  );
  const formatInt = React.useCallback((value: number) => value.toLocaleString("pt-BR"), []);
  const calculator = React.useMemo(() => {
    const users = Number(calcUsers) > 0 ? Math.trunc(Number(calcUsers)) : 0;
    const runs = Number(calcRuns) > 0 ? Math.trunc(Number(calcRuns)) : 0;
    const extraRuns = Math.max(0, runs - selectedPlanDetails.includedRuns);
    const extraUsers = Math.max(0, users - selectedPlanDetails.includedUsers);
    const runOverageCents = extraRuns * selectedPlanDetails.overageRunCents;
    const userOverageCents = extraUsers * selectedPlanDetails.extraUserCents;
    const totalCents = selectedPlanDetails.basePriceCents + runOverageCents + userOverageCents;
    return { users, runs, extraRuns, extraUsers, runOverageCents, userOverageCents, totalCents };
  }, [calcRuns, calcUsers, selectedPlanDetails]);
  React.useEffect(() => {
    setCalcUsers(String(selectedPlanDetails.includedUsers));
    setCalcRuns(String(selectedPlanDetails.includedRuns));
  }, [selectedPlanDetails.id, selectedPlanDetails.includedUsers, selectedPlanDetails.includedRuns]);
  const pricingUpdatedAtLabel = React.useMemo(() => {
    return new Date().toLocaleDateString("pt-BR");
  }, []);
  const selectedProposal = React.useMemo(
    () => PROPOSAL_OPTIONS.find((option) => option.id === selectedProposalOption) ?? PROPOSAL_OPTIONS[0],
    [selectedProposalOption]
  );

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

  const refreshTenantRecipes = React.useCallback(async () => {
    if (!session.token) {
      setWorkspaceRecipes([]);
      setTenantRecipes([]);
      setTenantRecipesStatus("idle");
      setTenantRecipesError(null);
      return;
    }
    setTenantRecipesStatus("loading");
    setTenantRecipesError(null);
    try {
      const [workspaceResponse, tenantResponse] = await Promise.all([
        apiListTenantRecipes({ view: "workspace" }),
        apiListTenantRecipes({ view: "tenant" }),
      ]);
      setWorkspaceRecipes(workspaceResponse.items ?? []);
      setTenantRecipes(tenantResponse.items ?? []);
      setTenantRecipesStatus("ready");
    } catch (error) {
      setTenantRecipesStatus("error");
      setTenantRecipesError(error instanceof Error ? error.message : "Falha ao carregar recipes do tenant");
    }
  }, [session.token]);

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
    void refreshTenantRecipes();
  }, [refreshTenantRecipes]);

  React.useEffect(() => {
    if (!session.token) {
      setOnboardingContext(null);
      setOnboardingContextStatus("idle");
      setOnboardingContextError(null);
      return;
    }

    let active = true;
    setOnboardingContextStatus("loading");
    setOnboardingContextError(null);

    apiGetOnboardingContext()
      .then((response) => {
        if (!active) return;
        setOnboardingContext(response.data);
        setOnboardingContextStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setOnboardingContext(null);
        setOnboardingContextStatus("error");
        setOnboardingContextError(
          error instanceof Error ? error.message : "Falha ao carregar onboarding contextual."
        );
      });

    return () => {
      active = false;
    };
  }, [session.token, session.workspaceId]);

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

  const handleCreateTenantRecipe = async (status: "draft" | "homologated") => {
    if (!session.token || tenantRecipeSubmitting) return;
    setTenantRecipeSubmitting(true);
    setTenantRecipeNotice(null);
    setTenantRecipesError(null);
    try {
      await apiCreateTenantRecipe({
        agentId: tenantRecipeForm.agentId,
        title: tenantRecipeForm.title.trim(),
        summary: tenantRecipeForm.summary.trim(),
        instructions: tenantRecipeForm.instructions.trim() || undefined,
        status,
        workspaceScope:
          tenantRecipeForm.scopeMode === "all_workspaces"
            ? { mode: "all_workspaces", workspaceIds: [] }
            : { mode: "selected_workspaces", workspaceIds: [session.workspaceId] },
      });
      setTenantRecipeForm((prev) => ({
        ...prev,
        title: "",
        summary: "",
        instructions: "",
      }));
      await refreshTenantRecipes();
      setTenantRecipeNotice(
        status === "homologated"
          ? "Recipe homologada e publicada para consumo."
          : "Recipe salva como rascunho."
      );
    } catch (error) {
      setTenantRecipesError(error instanceof Error ? error.message : "Falha ao salvar tenant recipe");
    } finally {
      setTenantRecipeSubmitting(false);
    }
  };

  const handleUpdateTenantRecipeStatus = async (
    recipe: TenantRecipe,
    status: "homologated" | "deprecated"
  ) => {
    if (!session.token) return;
    setTenantRecipeNotice(null);
    setTenantRecipesError(null);
    try {
      await apiUpdateTenantRecipe(recipe.id, { status });
      await refreshTenantRecipes();
      setTenantRecipeNotice(
        status === "homologated"
          ? `Recipe ${recipe.title} homologada.`
          : `Recipe ${recipe.title} marcada como deprecated.`
      );
    } catch (error) {
      setTenantRecipesError(error instanceof Error ? error.message : "Falha ao atualizar tenant recipe");
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
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Onboarding contextual</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Guia de sobrevivência do workspace</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Leitura curta do que já está liberado e de qual trilha faz mais sentido abrir primeiro.
            </p>
          </div>
        </div>
        {!session.token ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Entre com um workspace ativo para receber onboarding contextual por recipes e produtos liberados.
          </p>
        ) : onboardingContextStatus === "loading" ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando onboarding contextual...</p>
        ) : onboardingContextStatus === "error" ? (
          <p className="mt-6 text-sm text-red-300">
            {onboardingContextError ?? "Falha ao carregar onboarding contextual."}
          </p>
        ) : onboardingContext ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
            <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-accent">
                {onboardingContext.roleProfile} • {onboardingContext.activeDomain}
              </p>
              <p className="mt-3 text-sm text-foreground">{onboardingContext.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {onboardingContext.installedProducts.length === 0 ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    sem produtos instalados
                  </span>
                ) : (
                  onboardingContext.installedProducts.map((product) => (
                    <span
                      key={`product-${product}`}
                      className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent"
                    >
                      {product}
                    </span>
                  ))
                )}
              </div>
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                <p className="uppercase tracking-[0.2em] text-[10px]">Recipes visíveis</p>
                {onboardingContext.visibleRecipes.length === 0 ? (
                  <p>Nenhuma recipe homologada visível neste workspace.</p>
                ) : (
                  onboardingContext.visibleRecipes.map((recipe) => (
                    <p key={`context-recipe-${recipe.id}`}>
                      {recipe.title} • {recipe.agentId}
                    </p>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Próximos passos</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {onboardingContext.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Restrições</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {onboardingContext.constraints.map((constraint) => (
                    <li key={constraint}>{constraint}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-surface/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Tenant recipes</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Catálogo interno homologado</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Recipes do tenant permitem homologar um agente e liberar um caminho guiado por workspace.
            </p>
          </div>
          {tenantRecipeNotice ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              {tenantRecipeNotice}
            </span>
          ) : null}
        </div>

        {!session.token ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Entre com um workspace ativo para ver e publicar recipes do tenant.
          </p>
        ) : null}
        {session.token && tenantRecipesStatus === "loading" ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando recipes do tenant...</p>
        ) : null}
        {session.token && tenantRecipesStatus === "error" ? (
          <p className="mt-6 text-sm text-red-300">{tenantRecipesError ?? "Falha ao carregar recipes do tenant"}</p>
        ) : null}
        {session.token && tenantRecipesStatus !== "error" && tenantRecipesError ? (
          <p className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {tenantRecipesError}
          </p>
        ) : null}

        {session.token ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-accent">Receitas visíveis neste workspace</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Apenas recipes homologadas e liberadas para o workspace atual aparecem aqui.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {workspaceRecipes.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
                    Nenhuma recipe homologada disponível para este workspace.
                  </div>
                ) : (
                  workspaceRecipes.map((recipe) => {
                    const config = selfServiceConfigByAgentId.get(normalizeCatalogText(recipe.agentId));
                    const recipePath = config ? `/self-service/${config.slug}` : null;
                    const isImobRecipe = isImobTenantRecipe(recipe);
                    const hasPlannerMission = hasSupportedImobMission(recipe);
                    const canOpenImobChat = isImobRecipe || founderAccess;
                    return (
                      <div key={recipe.id} className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-accent">
                          <span className="rounded-full bg-accent/20 px-2 py-1">{recipe.status}</span>
                          <span>{recipe.agentId}</span>
                        </div>
                        <h4 className="mt-3 text-lg font-semibold text-foreground">{recipe.title}</h4>
                        <p className="mt-2 text-sm text-muted-foreground">{recipe.summary}</p>
                        {recipe.instructions ? (
                          <p className="mt-3 text-xs text-muted-foreground">{recipe.instructions}</p>
                        ) : null}
                        <p className="mt-3 text-xs text-muted-foreground">
                          Escopo:{" "}
                          {recipe.workspaceScope.mode === "all_workspaces"
                            ? "todos os workspaces"
                            : "workspace selecionado"}
                        </p>
                        {recipe.tags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {recipe.tags.map((tag) => (
                              <span
                                key={`${recipe.id}-${tag}`}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {recipePath ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              to={recipePath}
                              className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent transition hover:border-accent hover:bg-accent/30"
                            >
                              Abrir no self-service
                            </Link>
                            {canOpenImobChat ? (
                              <Link
                                to={buildImobRecipeChatPath(recipe, { includeRecipeId: hasPlannerMission })}
                                className="inline-flex items-center gap-2 rounded-full border border-sky-400/60 bg-sky-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200 transition hover:border-sky-300 hover:bg-sky-400/25"
                              >
                                Abrir no Chat IMOB
                              </Link>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                              Agente sem rota guiada
                            </span>
                            {canOpenImobChat ? (
                              <Link
                                to={buildImobRecipeChatPath(recipe, { includeRecipeId: hasPlannerMission })}
                                className="inline-flex items-center gap-2 rounded-full border border-sky-400/60 bg-sky-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200 transition hover:border-sky-300 hover:bg-sky-400/25"
                              >
                                Abrir no Chat IMOB
                              </Link>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-accent">Publicar nova recipe</p>
                <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
                  <label className="flex flex-col gap-2">
                    <span className="uppercase tracking-[0.2em] text-[10px]">Agente</span>
                    <select
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                      value={tenantRecipeForm.agentId}
                      onChange={(event) =>
                        setTenantRecipeForm((prev) => ({ ...prev, agentId: event.target.value }))
                      }
                    >
                      {selfServiceConfigs.map((config) => (
                        <option key={config.slug} value={config.agentId}>
                          {config.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="uppercase tracking-[0.2em] text-[10px]">Título</span>
                    <input
                      type="text"
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                      value={tenantRecipeForm.title}
                      onChange={(event) =>
                        setTenantRecipeForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="uppercase tracking-[0.2em] text-[10px]">Resumo</span>
                    <textarea
                      rows={3}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                      value={tenantRecipeForm.summary}
                      onChange={(event) =>
                        setTenantRecipeForm((prev) => ({ ...prev, summary: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="uppercase tracking-[0.2em] text-[10px]">Instruções</span>
                    <textarea
                      rows={4}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                      value={tenantRecipeForm.instructions}
                      onChange={(event) =>
                        setTenantRecipeForm((prev) => ({ ...prev, instructions: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="uppercase tracking-[0.2em] text-[10px]">Escopo</span>
                    <select
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                      value={tenantRecipeForm.scopeMode}
                      onChange={(event) =>
                        setTenantRecipeForm((prev) => ({
                          ...prev,
                          scopeMode: event.target.value as "current_workspace" | "all_workspaces",
                        }))
                      }
                    >
                      <option value="current_workspace">Workspace atual</option>
                      <option value="all_workspaces">Todos os workspaces</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={
                      tenantRecipeSubmitting ||
                      !tenantRecipeForm.title.trim() ||
                      !tenantRecipeForm.summary.trim()
                    }
                    onClick={() => void handleCreateTenantRecipe("draft")}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Salvar draft
                  </button>
                  <button
                    type="button"
                    disabled={
                      tenantRecipeSubmitting ||
                      !tenantRecipeForm.title.trim() ||
                      !tenantRecipeForm.summary.trim()
                    }
                    onClick={() => void handleCreateTenantRecipe("homologated")}
                    className="rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Homologar e publicar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-accent">Gerenciar catálogo do tenant</p>
                <div className="mt-4 space-y-3">
                  {tenantRecipes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma recipe criada neste tenant ainda.</p>
                  ) : (
                    tenantRecipes.map((recipe) => (
                      <div key={`tenant-recipe-${recipe.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{recipe.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {recipe.agentId} • {recipe.status}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {recipe.status !== "homologated" ? (
                              <button
                                type="button"
                                onClick={() => void handleUpdateTenantRecipeStatus(recipe, "homologated")}
                                className="rounded-full border border-accent/60 bg-accent/20 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-accent transition hover:border-accent hover:bg-accent/30"
                              >
                                Homologar
                              </button>
                            ) : null}
                            {recipe.status !== "deprecated" ? (
                              <button
                                type="button"
                                onClick={() => void handleUpdateTenantRecipeStatus(recipe, "deprecated")}
                                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200 transition hover:bg-amber-400/20"
                              >
                                Deprecar
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">{recipe.summary}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
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
                const canonicalDisplay =
                  canonicalMarketplaceDisplay.get(normalizeCatalogText(item.name)) ??
                  canonicalMarketplaceDisplay.get(normalizeCatalogText(item.description));
                const itemName = canonicalDisplay?.name ?? item.name;
                const itemDescription =
                  canonicalDisplay?.description ?? item.description ?? "Sem descrição registrada.";
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
                    <h4 className="text-lg font-semibold text-foreground">{itemName}</h4>
                    <p className="text-sm text-muted-foreground">{itemDescription}</p>
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
                    <p className="mt-4 text-xs text-amber-200">
                      Esta ativacao pode gerar cobranca conforme seu plano.{" "}
                      <Link to="/app/billing" className="underline text-accent">
                        Ver tabela de precos
                      </Link>
                    </p>
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

      <section id="pricing-oficial" className="rounded-3xl border border-white/10 bg-surface/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Pricing oficial</h3>
            <p className="text-sm text-muted-foreground">
              Planos B2B para plataforma agentic com governança auditável e economia verificável.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {`Atualizado em ${pricingUpdatedAtLabel}`}
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                <th className="pb-2">Plano</th>
                <th className="pb-2">Base mensal</th>
                <th className="pb-2">Usuarios</th>
                <th className="pb-2">Runs/mês</th>
                <th className="pb-2">Excedente run</th>
                <th className="pb-2">Usuario extra</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {PRICING_PLANS.map((plan) => {
                const isActive = selectedPlan === plan.id;
                return (
                  <tr key={plan.id} className="border-t border-white/10">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPlan(plan.id)}
                        className={`font-semibold underline-offset-4 transition ${
                          isActive ? "text-accent underline" : "text-foreground hover:text-accent hover:underline"
                        }`}
                        aria-pressed={isActive}
                      >
                        {plan.label}
                      </button>
                    </td>
                    <td className="py-2">{formatBRL(plan.basePriceCents)}</td>
                    <td className="py-2">{formatInt(plan.includedUsers)}</td>
                    <td className="py-2">{formatInt(plan.includedRuns)}</td>
                    <td className="py-2">{formatBRL(plan.overageRunCents)}</td>
                    <td className="py-2">{`${formatBRL(plan.extraUserCents)}/mês`}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-white/10 text-muted-foreground">
                <td className="py-2 font-semibold">Enterprise</td>
                <td className="py-2">Sob consulta</td>
                <td className="py-2">Custom</td>
                <td className="py-2">Custom</td>
                <td className="py-2">Custom</td>
                <td className="py-2">Custom</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">
            O que está incluso no plano {selectedPlanDetails.label}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-foreground md:grid-cols-2">
            {selectedPlanDetails.includes.map((item) => (
              <p key={`${selectedPlanDetails.id}-${item}`}>• {item}</p>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="font-semibold text-foreground">Exemplo 1 (Solo)</p>
            <p>5 usuarios e 2.000 runs no mês:</p>
            <p className="mt-1">R$ 490 + (500 x R$ 0,35) + (2 x R$ 39) = R$ 743</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="font-semibold text-foreground">Exemplo 2 (Starter)</p>
            <p>12 usuarios e 6.200 runs no mês:</p>
            <p className="mt-1">R$ 1.490 + (1.200 x R$ 0,30) + (2 x R$ 39) = R$ 1.928</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Calculadora interativa</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-muted-foreground">
              Plano
              <select
                value={selectedPlan}
                onChange={(event) => setSelectedPlan(event.target.value as PricingPlanId)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground"
              >
                {PRICING_PLANS.map((plan) => (
                  <option key={`calc-${plan.id}`} value={plan.id}>
                    {plan.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-muted-foreground">
              Usuarios
              <input
                type="number"
                min={0}
                step={1}
                value={calcUsers}
                onChange={(event) => setCalcUsers(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Runs/mês
              <input
                type="number"
                min={0}
                step={1}
                value={calcRuns}
                onChange={(event) => setCalcRuns(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          <p className="mt-3 text-sm text-foreground">
            {`${formatBRL(selectedPlanDetails.basePriceCents)} + ${formatBRL(
              calculator.runOverageCents
            )} + ${formatBRL(calculator.userOverageCents)} = ${formatBRL(calculator.totalCents)}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {`Extras: ${calculator.extraRuns.toLocaleString("pt-BR")} runs e ${calculator.extraUsers.toLocaleString("pt-BR")} usuários.`}
          </p>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Agente EIAH | atendimento de proposta</p>
          <p className="text-sm text-foreground">
            O agente EIAH sugere a proposta ideal conforme o perfil do solicitante.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {PROPOSAL_OPTIONS.map((option) => {
              const isActive = option.id === selectedProposal.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedProposalOption(option.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "border-accent/60 bg-accent/20 text-foreground"
                      : "border-white/10 bg-black/20 text-muted-foreground hover:border-accent/40 hover:text-foreground"
                  }`}
                >
                  <p className="font-semibold">{option.title}</p>
                  <p className="text-xs">{option.profile}</p>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
            <p className="text-foreground">
              <span className="text-muted-foreground">Proposta sugerida:</span> {selectedProposal.recommendation}
            </p>
            <p className="mt-1 text-muted-foreground">{selectedProposal.objective}</p>
            <p className="mt-1 text-muted-foreground">{selectedProposal.nextStep}</p>
          </div>
          <Link
            to={`/app/chat?agent=eiah&topic=proposal&plan=${encodeURIComponent(selectedProposal.recommendation)}#chat-agent-launcher`}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent"
          >
            Solicitar proposta
            <span aria-hidden>→</span>
          </Link>
          <p className="text-xs text-muted-foreground">
            Enterprise: runs e usuários customizados, preço sob consulta.
          </p>
        </div>
      </section>
    </div>
  );
}
