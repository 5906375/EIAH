import React, { useCallback, useState } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import { apiUploadDocuments, UploadedDocumentInfo, BASE_URL } from "@/lib/api";

type SupportingDocument = UploadedDocumentInfo;

type J360FormValues = {
  customerName: string;
  segment: string;
  painPoints: string;
  currentTools: string;
  supportingDocs: SupportingDocument[];
  journeyStages: string[];
  recentEvents: string;
  opportunities: string;
  risks: string;
  nextSteps: string;
};

type JourneyStageOption = {
  label: string;
  hint: string;
};

const stageOptions: JourneyStageOption[] = [
  {
    label: "Pre-contrato / Due diligence",
    hint: "Briefing inicial, NDAs, matriz de risco regulatorio e stakeholders-chave.",
  },
  {
    label: "Assinatura / Formalizacao",
    hint: "Contrato principal, condicoes suspensivas, politicas aplicaveis e checklist de onboarding.",
  },
  {
    label: "Execucao contratual",
    hint: "SLAs monitorados, entregas previstas, evidencias de conformidade e relatorios operacionais.",
  },
  {
    label: "Gestao de incidentes / Compliance",
    hint: "Chamados criticos, auditorias, pareceres, notificacoes de orgaos reguladores e planos de acao.",
  },
  {
    label: "Renegociacao / Aditivos",
    hint: "Renovacoes planejadas, aditivos em discussao, oportunidades de upsell e riscos de churn.",
  },
];

const initialValues: J360FormValues = {
  customerName: "",
  segment: "",
  painPoints: "",
  currentTools: "",
  supportingDocs: [],
  journeyStages: [],
  recentEvents: "",
  opportunities: "",
  risks: "",
  nextSteps: "",
};

function resolveDocumentUrl(doc: SupportingDocument) {
  if (doc.url.startsWith("http")) return doc.url;
  return new URL(doc.url, BASE_URL).toString();
}

export default function SelfServiceJ360Page() {
  const buildRequest = useCallback((values: J360FormValues) => {
    const absoluteDocs = values.supportingDocs.map((doc) => ({
      ...doc,
      url: resolveDocumentUrl(doc),
    }));

    const lines = [
      "Voce e o J_360.",
      "Monte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.",
      `Cliente/Conta: ${values.customerName || "nao informado"} (${values.segment || "segmento nao informado"}).`,
      `Estagios relevantes da jornada: ${
        values.journeyStages.length > 0 ? values.journeyStages.join(", ") : "nao informado"
      }.`,
      `Dores e desafios principais: ${values.painPoints || "nao informado"}.`,
      `Ferramentas/solucoes atuais: ${values.currentTools || "nao informado"}.`,
      absoluteDocs.length
        ? `Documentos de suporte: ${absoluteDocs.map((doc) => `${doc.name} (${doc.url})`).join(", ")}.`
        : "",
      values.recentEvents ? `Eventos recentes: ${values.recentEvents}.` : "",
      values.opportunities ? `Oportunidades identificadas: ${values.opportunities}.` : "",
      values.risks ? `Riscos e bloqueios: ${values.risks}.` : "",
      values.nextSteps ? `Acoes planejadas: ${values.nextSteps}.` : "",
      "Responda com secoes: Resumo Executivo, Estagio Atual, Insights, Riscos, Oportunidades, Recomendacoes.",
    ].filter(Boolean);

    const payload: J360FormValues = {
      ...values,
      supportingDocs: absoluteDocs,
    };

    return {
      prompt: lines.join("\n"),
      metadata: {
        form: payload,
        domain: "journey_360",
        documents: absoluteDocs,
      },
      rawPayload: payload,
    };
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadDocuments = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return null;

    const formData = new FormData();
    Array.from(fileList).forEach((file) => formData.append("files", file));

    setIsUploading(true);
    setUploadError(null);
    try {
      const response = await apiUploadDocuments(formData, "j360");
      return response.data;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Falha ao enviar arquivos.");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug="j360" />
      <AgentFormShell<J360FormValues>
        agentId="J_360"
        title="Visao 360 do Cliente"
        description="Reuna informacoes sobre a conta e obtenha um diagnostico com recomendacoes priorizadas pelo agente J_360."
        initialValues={initialValues}
        buildRequest={buildRequest}
      >
        {({ values, setValue }) => {
          const toggleStage = (stageLabel: string) => {
            const exists = values.journeyStages.includes(stageLabel);
            const next = exists
              ? values.journeyStages.filter((item) => item !== stageLabel)
              : [...values.journeyStages, stageLabel];
            setValue("journeyStages", next);
          };

          const handleDocsUpload = async (fileList: FileList | null) => {
            const uploaded = await uploadDocuments(fileList);
            if (!uploaded || uploaded.length === 0) return;

            const merged = [...values.supportingDocs];
            uploaded.forEach((doc) => {
              const exists = merged.some((item) => item.id === doc.id);
              if (!exists) {
                merged.push({ ...doc, url: resolveDocumentUrl(doc) });
              }
            });
            setValue("supportingDocs", merged);
          };

          const handleRemoveDoc = (id: string) => {
            setValue(
              "supportingDocs",
              values.supportingDocs.filter((doc) => doc.id !== id)
            );
          };

          return (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  Cliente / Conta ( analisado )
                  <input
                    type="text"
                    value={values.customerName}
                    onChange={(event) => setValue("customerName", event.target.value)}
                    placeholder="Nome da empresa ou squad"
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  Segmento ( contextualizar nuances regulatorias )
                  <input
                    type="text"
                    value={values.segment}
                    onChange={(event) => setValue("segment", event.target.value)}
                    placeholder="Ex.: SaaS fintech, varejo, enterprise..."
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-foreground">
                Dores principais ( problemas juridicos )
                <textarea
                  value={values.painPoints}
                  onChange={(event) => setValue("painPoints", event.target.value)}
                  placeholder="Quais problemas estamos tentando resolver?"
                  rows={3}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>

              <div className="space-y-2 rounded-xl border border-dashed border-white/15 bg-black/20 p-4">
                <p className="text-sm font-semibold text-foreground">Documentos de suporte</p>
                <p className="text-xs text-muted-foreground">
                  Carregue contratos, pareceres, notificacoes ou evidencias relevantes (PDF, DOCX, imagens). Apenas os
                  nomes sao enviados ao agente neste fluxo.
                </p>
                <label className="relative inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 hover:text-accent">
                  Selecionar arquivos
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(event) => {
                      void handleDocsUpload(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                {isUploading ? (
                  <p className="text-xs text-muted-foreground">Enviando documentos...</p>
                ) : null}
                {uploadError ? <p className="text-xs text-red-400">{uploadError}</p> : null}
                {values.supportingDocs.length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {values.supportingDocs.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 truncate">
                        <a
                          href={resolveDocumentUrl(doc)}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-accent hover:underline"
                        >
                          {doc.name}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveDoc(doc.id)}
                          className="rounded-full border border-white/10 bg-transparent px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground transition hover:border-red-400 hover:text-red-300"
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground/70">Nenhum arquivo selecionado.</p>
                )}
              </div>

              <label className="flex flex-col gap-2 text-sm text-foreground">
                Ferramentas / solucoes atuais
                <textarea
                  value={values.currentTools}
                  onChange={(event) => setValue("currentTools", event.target.value)}
                  placeholder="Stack atual, integracoes criticas, contratos em vigor..."
                  rows={3}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Estagios da jornada em foco</p>
                <div className="flex flex-wrap gap-2">
                  {stageOptions.map(({ label, hint }) => {
                    const active = values.journeyStages.includes(label);
                    return (
                      <div key={label} className="relative group">
                        <button
                          type="button"
                          onClick={() => toggleStage(label)}
                          className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                            active
                              ? "border-accent bg-accent/20 text-accent"
                              : "border-white/10 bg-white/5 text-foreground hover:border-accent/40 hover:text-accent"
                          }`}
                          aria-label={`${label}: ${hint}`}
                        >
                          {label}
                        </button>
                        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden max-w-xs -translate-x-1/2 rounded-lg border border-accent/40 bg-black/80 px-3 py-2 text-xs leading-relaxed text-muted-foreground shadow-lg shadow-black/40 group-hover:block">
                          <span>{hint}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col gap-2 text-sm text-foreground">
                Renovacoes contratuais, Notificacoes, Auditorias, Decisoes judiciais
                <textarea
                  value={values.recentEvents}
                  onChange={(event) => setValue("recentEvents", event.target.value)}
                  placeholder="Renovacao, churn, mudanca de stakeholder, incidentes..."
                  rows={3}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  Oportunidades
                  <textarea
                    value={values.opportunities}
                    onChange={(event) => setValue("opportunities", event.target.value)}
                    placeholder="Expandir modulo X, upsell, cross-sell..."
                    rows={3}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  Pendencias regulatorias, clausulas criticas, processos em curso
                  <textarea
                    value={values.risks}
                    onChange={(event) => setValue("risks", event.target.value)}
                    placeholder="Dependencia de stakeholder, gaps tecnicos, orcamento reduzido..."
                    rows={3}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-foreground">
                Proximos passos planejados
                <textarea
                  value={values.nextSteps}
                  onChange={(event) => setValue("nextSteps", event.target.value)}
                  placeholder="Follow-up, workshops, entregas do time, owners por acao..."
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

