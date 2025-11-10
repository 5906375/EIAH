import React, { useCallback } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";

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
  const buildRequest = useCallback((values: MktFormValues) => {
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

    const channelList = values.channels.length > 0 ? values.channels.join(", ") : "não informado";

    const instructions = [
      "Você é o agente MKT. Aplique o modelo padronizado abaixo para entregar um briefing coeso.",
      `Data-base (hoje): ${todayDisplay} (ISO ${todayIso}).`,
      `Data de lançamento informada: ${launchDateDisplay}${launchTimingSuffix}.`,
      sprintMode
        ? "Ative MODO SPRINT: detalhe checkpoints semanais, priorize tarefas críticas e indicativos de risco para execução em até 30 dias."
        : typeof daysToLaunch === "number" && daysToLaunch < 0
        ? "Lançamento já ocorreu: foque em retroativo, quick wins de pós-lançamento e planos de reengajamento imediato."
        : "Modo padrão: organize a jornada com marcos quinzenais/mensais e monitoramento contínuo.",
      "Estrutura obrigatória da resposta (use Markdown):",
      "## 1. Resumo e KPIs — objetivo, público, orçamento e KPIs com metas quantitativas por canal (ex.: CTR ≥ 2,5%, CPL ≤ R$ 40).",
      "## 2. Timeline — tabela Markdown com cabeçalho '| Período | Atividade | Descrição |'. Utilize datas relativas ao dia de hoje e/ou ao lançamento (ex.: 'Semana 0-1', 'T-15 dias', '+30 dias').",
      "   - Concentre-se em 4 a 6 linhas que cubram fases de pré, lançamento e pós-campanha.",
      "## 3. Canais e estratégias — para cada canal selecionado, descreva abordagem, conteúdo-chave e meta numérica. Inclua recomendação de revisão semanal.",
      "   - Utilize um bloco <details><summary>Detalhar canais</summary> ... </details> quando possível para listar táticas por canal sem perder legibilidade.",
      "## 4. Integração e mensuração — detalhe fontes de dados (GA4, HubSpot, RD Station, etc.), frequência de atualização e formato de relatório (dashboard, PDF).",
      "## 5. Próximos passos com datas-chave — lista numerada com responsável sugerido e prazo (relativo ou data).",
      "## 6. Aprendizados e cross-run — se houver histórico em metadata.previousRuns, compare resultados e extraia 3 recomendações. Caso contrário, registre que nenhum histórico foi informado.",
      "## 7. Insights automatizados — destaque top 3 recomendações priorizadas para a próxima semana, como se fossem um mini dashboard de aprendizado.",
      `Perfil de tom selecionado: ${values.toneProfile}. Ajuste linguagem, CTA e exemplos para refletir esse tom.`,
      values.toneNotes
        ? `Notas adicionais sobre tom/voz: ${values.toneNotes}.`
        : "Sem notas adicionais sobre tom além do preset.",
      "Sempre indique quando algum dado não foi fornecido e evite anos absolutos inconsistentes; prefira datas relativas com referência à data-base.",
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

    return {
      prompt: instructions.join("\n"),
      metadata: {
        form: values,
        domain: "marketing",
        baseDate: todayIso,
        launchDate: isValidLaunchDate ? values.launchDate : null,
        daysToLaunch,
        sprintMode,
        toneProfile: values.toneProfile,
        toneNotes: values.toneNotes || null,
        compareRuns: true,
      },
      rawPayload: values,
    };
  }, []);

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug="mkt" />
      <AgentFormShell<MktFormValues>
        agentId="MKT"
        title="Briefing de Campanha"
        description="Reúna os dados principais e receba um plano de campanha multicanal personalizado pelo agente MKT."
        initialValues={initialValues}
        buildRequest={buildRequest}
      >
        {({ values, setValue }) => {
        const toggleChannel = (channel: string) => {
          const exists = values.channels.includes(channel);
          const next = exists
            ? values.channels.filter((c) => c !== channel)
            : [...values.channels, channel];
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
                  const active = values.channels.includes(channel);
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
