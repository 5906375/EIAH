import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import { resolveRecipeAwareFields, type GenericAgentConfig } from "./config";
import { apiListTenantRecipes, type TenantRecipe } from "@/lib/api";
import { buildRecipePrefillValues } from "./recipePrefill";

type FormValues = Record<string, string>;

export default function GenericAgentFormPage({ config }: { config: GenericAgentConfig }) {
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

  const initialValues = useMemo<FormValues>(
    () => buildRecipePrefillValues(config, linkedRecipe),
    [config, linkedRecipe]
  );
  const resolvedFields = useMemo(
    () => resolveRecipeAwareFields(config, linkedRecipe),
    [config, linkedRecipe]
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

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug={config.slug} />
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
      <AgentFormShell<FormValues>
        agentId={config.agentId}
        title={config.title}
        description={config.description}
        initialValues={initialValues}
        buildRequest={(vals) => {
          const request = config.buildPrompt(vals);
          return linkedRecipeMetadata
            ? {
                ...request,
                metadata: {
                  ...request.metadata,
                  linkedRecipe: linkedRecipeMetadata,
                },
              }
            : request;
        }}
      >
        {({ values: formValues, setValue }) => (
          <div className="space-y-4">
            {resolvedFields.map((field) => {
              const type = field.type ?? "textarea";
              const value = formValues[field.key] ?? "";
              if (type === "text") {
                return (
                  <label key={field.key} className="flex flex-col gap-2 text-sm text-foreground">
                    {field.label}
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setValue(field.key as keyof FormValues, e.target.value)}
                      placeholder={field.placeholder}
                      className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                    />
                    {field.helper && <span className="text-xs text-muted-foreground">{field.helper}</span>}
                  </label>
                );
              }

              return (
                <label key={field.key} className="flex flex-col gap-2 text-sm text-foreground">
                  {field.label}
                  <textarea
                    value={value}
                    onChange={(e) => setValue(field.key as keyof FormValues, e.target.value)}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 3}
                    className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                  {field.helper && <span className="text-xs text-muted-foreground">{field.helper}</span>}
                </label>
              );
            })}
          </div>
        )}
      </AgentFormShell>
    </div>
  );
}
