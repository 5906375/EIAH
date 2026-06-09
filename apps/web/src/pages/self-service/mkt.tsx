import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import { apiListTenantRecipes, type TenantRecipe } from "@/lib/api";
import { buildMktRecipePrefillValues } from "./recipePrefill";

type MktFormValues = {
  goal: string;
  kpis: string;
  audience: string;
  channels: string[];
  budget: string;
  toneProfile: "Institucional" | "Inspirador" | "Pragmático";
  toneNotes: string;
  launchDate: string;
  deadline: string;
  notes: string;
};

const channelOptions = [
  "Email",
  "Redes sociais",
  "Eventos",
  "Paid media",
  "Influencers",
  "LinkedIn",
  "TikTok",
  "Instagram",
  "YouTube",
  "Twitter / X",
  "WhatsApp",
  "SMS",
  "Blog / SEO",
  "Podcasts",
  "Comunidades",
  "Parcerias",
];

const initialValues: MktFormValues = {
  goal: "",
  kpis: "",
  audience: "",
  channels: [],
  budget: "",
  toneProfile: "Inspirador",
  toneNotes: "",
  launchDate: "",
  deadline: "",
  notes: "",
};

export default function SelfServiceMktPage() {
  const [searchParams] = useSearchParams();
  const [linkedRecipe, setLinkedRecipe] = useState<TenantRecipe | null>(null);
  const recipeId = searchParams.get("recipeId");

  useEffect(() => {
    let active = true;
    if (!recipeId) {
      setLinkedRecipe(null);
      return () => {
        active = false;
      };
    }

    apiListTenantRecipes({ view: "tenant" })
      .then((response) => {
        if (!active) return;
        setLinkedRecipe(response.items.find((item) => item.id === recipeId) ?? null);
      })
      .catch(() => {
        if (!active) return;
        setLinkedRecipe(null);
      });

    return () => {
      active = false;
    };
  }, [recipeId]);

  const recipeInitialValues = useMemo<MktFormValues>(
    () => ({
      ...initialValues,
      ...buildMktRecipePrefillValues(linkedRecipe),
    }),
    [linkedRecipe]
  );

  const linkedRecipeMetadata = useMemo(
    () =>
      linkedRecipe
        ? {
            id: linkedRecipe.id,
            agentId: linkedRecipe.agentId,
            title: linkedRecipe.title,
            summary: linkedRecipe.summary,
            instructions: linkedRecipe.instructions ?? null,
            tags: linkedRecipe.tags,
            content: linkedRecipe.content ?? null,
            stageExecution:
              linkedRecipe.content?.mode === "staged" && (linkedRecipe.content.steps?.length ?? 0) > 1
                ? {
                    mode: "plan",
                    activeStepId: null,
                    activeStepTitle: null,
                  }
                : {
                    mode: "single",
                    activeStepId: null,
                    activeStepTitle: null,
                  },
          }
        : undefined,
    [linkedRecipe]
  );

  const buildRequest = useCallback((values: MktFormValues) => {
    const normalizedChannels = Array.isArray(values.channels) ? values.channels : [];
    const now = new Date();
    const todayIso = now.toISOString().split("T")[0];
    const todayDisplay = now.toLocaleDateString("pt-BR");

    const launchDate = values.launchDate ? new Date(`${values.launchDate}T00:00:00`) : null;
    const isValidLaunchDate = launchDate instanceof Date && !Number.isNaN(launchDate.getTime());
    const launchDateDisplay = isValidLaunchDate ? launchDate.toLocaleDateString("pt-BR") : "não informado";

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysToLaunch = isValidLaunchDate
      ? Math.ceil((launchDate.getTime() - startOfToday) / msPerDay)
      : null;
    const sprintMode = typeof daysToLaunch === "number" && daysToLaunch >= 0 && daysToLaunch <= 30;
    let launchTimingSuffix = "";
    if (typeof daysToLaunch === "number") {
      if (daysToLaunch > 0) {
        launchTimingSuffix = ` (faltam ${daysToLaunch} dias)`;
      } else if (daysToLaunch === 0) {
        launchTimingSuffix = " (lançamento ocorre hoje)";
      } else {
        launchTimingSuffix = ` (lançamento ocorreu há ${Math.abs(daysToLaunch)} dias)`;
      }
    }

    const channelList = normalizedChannels.length > 0 ? normalizedChannels.join(", ") : "não informado";

    const instructions = [
      "Você é o agente MKT. Entregue um plano de campanha executivo, compacto e acionável.",
      `Data-base (hoje): ${todayDisplay} (ISO ${todayIso}).`,
      `Data de lançamento informada: ${launchDateDisplay}${launchTimingSuffix}.`,
      sprintMode
        ? "Ative MODO SPRINT: priorize checkpoints semanais e tarefas críticas para execução em até 30 dias."
        : typeof daysToLaunch === "number" && daysToLaunch < 0
        ? "Lançamento já ocorreu: foque em quick wins de pós-lançamento e reengajamento."
        : "Modo padrão: organize a jornada com marcos quinzenais ou mensais.",
      "Responda em Markdown, com bullets curtos. Evite tabelas longas, parágrafos extensos e blocos redundantes.",
      "O engine já expande templates, checklist, cadência e estrutura final do relatório. Foque em síntese estratégica.",
      "Estrutura obrigatória da resposta:",
      "## Resumo executivo e KPIs — até 6 bullets com objetivo, público, budget, metas e principal CTA.",
      "## ICP e posicionamento — até 5 bullets com segmentos prioritários, proposta de valor e oferta.",
      "## Canais prioritários — até 4 canais, com abordagem curta e meta numérica por canal.",
      "## Cronograma — 3 a 5 bullets com fases e datas relativas.",
      "## Próximos passos — até 5 bullets com prioridades imediatas.",
      "## Compliance e riscos — até 4 bullets com alertas comerciais/jurídicos relevantes.",
      `Perfil de tom selecionado: ${values.toneProfile}. Ajuste linguagem, CTA e exemplos para refletir esse tom.`,
      values.toneNotes
        ? `Notas adicionais sobre tom/voz: ${values.toneNotes}.`
        : "Sem notas adicionais sobre tom além do preset.",
      "Sempre indique quando algum dado não foi fornecido e prefira datas relativas com referência à data-base.",
      "",
      "Dados fornecidos pelo usuário:",
      `Objetivo principal: ${values.goal || "não informado"}.`,
      `KPIs/métricas informados: ${values.kpis || "não informado"}.`,
      `Audiência alvo: ${values.audience || "não informado"}.`,
      `Canais selecionados: ${channelList}.`,
      `Data de lançamento (ISO): ${values.launchDate || "não informada"}.`,
      `Budget disponível: ${values.budget || "não informado"}.`,
      `Notas sobre marcos/cronograma: ${values.deadline || "não informado"}.`,
      `Observações adicionais: ${values.notes || "não informado"}.`,
    ];

    const request = {
      prompt: instructions.join("\n"),
      metadata: {
        form: {
          ...values,
          channels: normalizedChannels,
        },
        domain: "marketing",
        baseDate: todayIso,
        launchDate: isValidLaunchDate ? values.launchDate : null,
        daysToLaunch,
        sprintMode,
        toneProfile: values.toneProfile,
        toneNotes: values.toneNotes || null,
        compareRuns: true,
      },
      rawPayload: {
        ...values,
        channels: normalizedChannels,
      },
    };
    return linkedRecipeMetadata
      ? {
          ...request,
          metadata: {
            ...request.metadata,
            linkedRecipe: linkedRecipeMetadata,
          },
        }
      : request;
  }, [linkedRecipeMetadata]);

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug="mkt" />
      {linkedRecipe ? (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-accent">Recipe vinculada</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{linkedRecipe.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{linkedRecipe.summary}</p>
          {linkedRecipe.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {linkedRecipe.tags.map((tag) => (
                <span
                  key={`${linkedRecipe.id}-${tag}`}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {linkedRecipe.instructions ? (
            <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
              {linkedRecipe.instructions}
            </p>
          ) : null}
          {linkedRecipe.content?.steps && linkedRecipe.content.steps.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-accent">Etapas da recipe</p>
              <div className="grid gap-2 md:grid-cols-2">
                {linkedRecipe.content.steps.map((step, index) => (
                  <div key={step.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-semibold text-foreground">
                      {index + 1}. {step.title}
                    </p>
                    {step.objective ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{step.objective}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <AgentFormShell<MktFormValues>
        agentId="MKT"
        title="Briefing de Campanha"
        description="Reúna os dados principais e receba um plano de campanha multicanal personalizado pelo agente MKT."
        initialValues={recipeInitialValues}
        preserveValueKeysOnInitialChange={[
          "goal",
          "kpis",
          "audience",
          "channels",
          "budget",
          "toneNotes",
          "launchDate",
          "deadline",
          "notes",
        ]}
        buildRequest={buildRequest}
      >
        {({ values, setValue }) => {
        const selectedChannels = Array.isArray(values.channels) ? values.channels : [];
        const toggleChannel = (channel: string) => {
          const exists = selectedChannels.includes(channel);
          const next = exists
            ? selectedChannels.filter((c) => c !== channel)
            : [...selectedChannels, channel];
          setValue("channels", next);
        };

        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-foreground">
                Objetivo principal
                <input
                  type="text"
                  value={values.goal}
                  onChange={(e) => setValue("goal", e.target.value)}
                  placeholder="Ex.: aumentar leads em 30% no Q1"
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-foreground">
                KPIs / Métricas
                <input
                  type="text"
                  value={values.kpis}
                  onChange={(e) => setValue("kpis", e.target.value)}
                  placeholder="CPL, CAC, visitas, engajamento..."
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm text-foreground">
              Audiência alvo
              <textarea
                value={values.audience}
                onChange={(e) => setValue("audience", e.target.value)}
                placeholder="Quem queremos alcançar? Perfil demográfico, interesses, geografia..."
                rows={3}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Canais prioritários</p>
              <div className="flex flex-wrap gap-2">
                {channelOptions.map((channel) => {
                  const active = selectedChannels.includes(channel);
                  return (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => toggleChannel(channel)}
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                        active
                          ? "border-accent bg-accent/20 text-accent"
                          : "border-white/10 bg-white/5 text-foreground hover:border-accent/40 hover:text-accent"
                      }`}
                    >
                      {channel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm text-foreground">
                Budget disponível
                <input
                  type="text"
                  value={values.budget}
                  onChange={(e) => setValue("budget", e.target.value)}
                  placeholder="Ex.: R$ 50.000"
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-foreground">
                Data de lançamento (opcional)
                <input
                  type="date"
                  value={values.launchDate}
                  onChange={(e) => setValue("launchDate", e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-foreground">
                Perfil de tom
                <select
                  value={values.toneProfile}
                  onChange={(e) => setValue("toneProfile", e.target.value as MktFormValues["toneProfile"])}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="Institucional">Institucional — eventos / B2B</option>
                  <option value="Inspirador">Inspirador — campanhas sociais / engajamento</option>
                  <option value="Pragmático">Pragmático — SaaS e conversão</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm text-foreground">
              Notas adicionais sobre tom / linguagem
              <input
                type="text"
                value={values.toneNotes}
                onChange={(e) => setValue("toneNotes", e.target.value)}
                placeholder="Ex.: manter CTA direto, evitar jargões..."
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-foreground">
              Notas de marcos / cronograma
              <input
                type="text"
                value={values.deadline}
                onChange={(e) => setValue("deadline", e.target.value)}
                placeholder="Ex.: Pré-campanha T-45 dias, revisão legal T-20 dias..."
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-foreground">
              Observações adicionais
              <textarea
                value={values.notes}
                onChange={(e) => setValue("notes", e.target.value)}
                placeholder="Restrições, aprendizados de campanhas anteriores, integrações de CRM, stakeholders..."
                rows={3}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        );
      }}
      </AgentFormShell>
    </div>
  );
}
