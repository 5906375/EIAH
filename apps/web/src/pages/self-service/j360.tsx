import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import { apiListTenantRecipes, apiUploadDocuments, UploadedDocumentInfo, BASE_URL, type TenantRecipe } from "@/lib/api";
import { buildJ360RecipePrefillValues } from "./recipePrefill";

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

const initialValuesBase: J360FormValues = {
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

function getJ360UploadStorageKey(recipeId: string | null) {
  return recipeId ? `j360-supporting-docs:${recipeId}` : "j360-supporting-docs:default";
}

function normalizeUploadedFileName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) return fileName;

  const looksMojibake = /Ã.|Â.|�/.test(trimmed);
  if (!looksMojibake) return trimmed;

  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      Uint8Array.from(trimmed, (char) => char.charCodeAt(0))
    ).trim();
  } catch {
    return trimmed;
  }
}

function resolveDocumentUrl(doc: SupportingDocument) {
  if (doc.url.startsWith("http")) return doc.url;

  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const baseCandidates = [BASE_URL, browserOrigin]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const base of baseCandidates) {
    try {
      return new URL(doc.url, base).toString();
    } catch {
      continue;
    }
  }

  return doc.url;
}

function normalizeUploadedDocument(doc: SupportingDocument): SupportingDocument {
  try {
    return { ...doc, name: normalizeUploadedFileName(doc.name), url: resolveDocumentUrl(doc) };
  } catch {
    return { ...doc, name: normalizeUploadedFileName(doc.name) };
  }
}

export default function SelfServiceJ360Page() {
  const [searchParams] = useSearchParams();
  const [linkedRecipe, setLinkedRecipe] = useState<TenantRecipe | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<SupportingDocument[]>([]);
  const recipeId = searchParams.get("recipeId");
  const uploadStorageKey = useMemo(() => getJ360UploadStorageKey(recipeId), [recipeId]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(uploadStorageKey);
      if (!raw) {
        setUploadedDocs([]);
        return;
      }
      const parsed = JSON.parse(raw) as SupportingDocument[];
      setUploadedDocs(Array.isArray(parsed) ? parsed : []);
    } catch {
      setUploadedDocs([]);
    }
  }, [uploadStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(uploadStorageKey, JSON.stringify(uploadedDocs));
  }, [uploadStorageKey, uploadedDocs]);

  const initialValues = useMemo<J360FormValues>(
    () => ({
      ...initialValuesBase,
      ...buildJ360RecipePrefillValues(linkedRecipe),
      supportingDocs: [],
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

  const buildRequest = useCallback((values: J360FormValues) => {
    const docs = values.supportingDocs.length > 0 ? values.supportingDocs : uploadedDocs;
    const absoluteDocs = docs.map((doc) => ({
      ...doc,
      url: normalizeUploadedDocument(doc).url,
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

    const request = {
      prompt: lines.join("\n"),
      metadata: {
        form: payload,
        domain: "journey_360",
        documents: absoluteDocs,
      },
      rawPayload: payload,
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
  }, [linkedRecipeMetadata, uploadedDocs]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadDocuments = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return null;

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

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
        </div>
      ) : null}
      <AgentFormShell<J360FormValues>
        agentId="J_360"
        title="Visao 360 do Cliente"
        description="Reuna informacoes sobre a conta e obtenha um diagnostico com recomendacoes priorizadas pelo agente J_360."
        initialValues={initialValues}
        preserveValueKeysOnInitialChange={["supportingDocs"]}
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

          const handleDocsUpload = async (files: File[]) => {
            const uploaded = await uploadDocuments(files);
            if (!uploaded || uploaded.length === 0) return;

            try {
              const merged = [...uploadedDocs];
              const normalizedUploaded = Array.isArray(uploaded)
                ? uploaded.map((doc) => normalizeUploadedDocument(doc))
                : [];
              normalizedUploaded.forEach((doc) => {
                const exists = merged.some((item) => item.id === doc.id);
                if (!exists) {
                  merged.push(doc);
                }
              });
              setUploadedDocs(merged);
              setValue("supportingDocs", merged);
              setUploadError(null);
            } catch (error) {
              setUploadError(
                error instanceof Error
                  ? `Falha ao processar documentos enviados: ${error.message}`
                  : "Falha ao processar documentos enviados."
              );
            }
          };

          const handleRemoveDoc = (id: string) => {
            const nextDocs = uploadedDocs.filter((doc) => doc.id !== id);
            setUploadedDocs(nextDocs);
            setValue(
              "supportingDocs",
              nextDocs
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
                      const files = event.target.files ? Array.from(event.target.files) : [];
                      if (files.length > 0) {
                        void handleDocsUpload(files);
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
                {isUploading ? (
                  <p className="text-xs text-muted-foreground">Enviando documentos...</p>
                ) : null}
                {uploadError ? <p className="text-xs text-red-400">{uploadError}</p> : null}
                {uploadedDocs.length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {uploadedDocs.map((doc) => (
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
