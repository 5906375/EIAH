import React, { useMemo } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
import type { GenericAgentConfig } from "./config";

type FormValues = Record<string, string>;

export default function GenericAgentFormPage({ config }: { config: GenericAgentConfig }) {
  const initialValues = useMemo<FormValues>(() => {
    const entries = config.fields.map((field) => [field.key, ""]);
    return Object.fromEntries(entries);
  }, [config.fields]);

  return (
    <div className="space-y-6">
      <SelfServiceNav currentSlug={config.slug} />
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
