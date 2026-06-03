import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import type { GenericAgentConfig } from "./config";
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

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug={config.slug} />
      {linkedRecipe ? (
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-accent">Recipe vinculada</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{linkedRecipe.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{linkedRecipe.summary}</p>
          {linkedRecipe.instructions ? (
            <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
              {linkedRecipe.instructions}
            </p>
          ) : null}
        </div>
      ) : null}
      <AgentFormShell<FormValues>
        agentId={config.agentId}
        title={config.title}
        description={config.description}
        initialValues={initialValues}
        buildRequest={(vals) => config.buildPrompt(vals)}
      >
        {({ values: formValues, setValue }) => (
          <div className="space-y-4">
            {config.fields.map((field) => {
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
