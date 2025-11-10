import React, { useEffect, useMemo, useState } from "react";

export type NeedMoreInfoOption = { value: string; label: string };

export type NeedMoreInfoField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select";
  placeholder?: string;
  helper?: string;
  required?: boolean;
  rows?: number;
  options?: NeedMoreInfoOption[];
};

export type NeedMoreInfoRequest = {
  title?: string;
  message?: string;
  fields: NeedMoreInfoField[];
};

type NeedMoreInfoDialogProps = {
  open: boolean;
  request: NeedMoreInfoRequest | null;
  currentValues: Record<string, string | undefined>;
  isSubmitting?: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
};

type ErrorMap = Record<string, string>;

function normalizeInitialValue(
  key: string,
  request: NeedMoreInfoRequest | null,
  currentValues: Record<string, string | undefined>
) {
  if (!request) return "";
  const fromCurrent = currentValues[key];
  if (typeof fromCurrent === "string" && fromCurrent.length > 0) {
    return fromCurrent;
  }

  const field = request.fields.find((item) => item.key === key);
  if (!field) return "";

  const placeholder = field.placeholder ?? "";
  if (typeof placeholder === "string" && placeholder.startsWith("ex:")) {
    return "";
  }

  return "";
}

export default function NeedMoreInfoDialog({
  open,
  request,
  currentValues,
  isSubmitting,
  onCancel,
  onSubmit,
}: NeedMoreInfoDialogProps) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ErrorMap>({});

  useEffect(() => {
    if (!open || !request) {
      setLocalValues({});
      setErrors({});
      return;
    }

    const initialEntries = (request.fields ?? []).map((field) => {
      const initial = normalizeInitialValue(field.key, request, currentValues);
      return [field.key, initial] as const;
    });
    setLocalValues(Object.fromEntries(initialEntries));
    setErrors({});
  }, [open, request, currentValues]);

  const fields = request?.fields ?? [];
  const hasFields = fields.length > 0;
  const dialogTitle = request?.title ?? "Informações adicionais necessárias";
  const dialogMessage = request?.message ?? "Preencha os dados abaixo para que o agente prossiga.";

  const actionDisabled = useMemo(() => {
    if (!request || isSubmitting) return true;
    if (!hasFields) return false;
    return fields.some((field) => {
      const required = field.required ?? true;
      if (!required) return false;
      const value = localValues[field.key];
      return !value || value.trim().length === 0;
    });
  }, [request, localValues, hasFields, isSubmitting]);

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    if (!request) return;
    const nextErrors: ErrorMap = {};

    fields.forEach((field) => {
      const required = field.required ?? true;
      if (!required) return;
      const value = localValues[field.key];
      if (!value || value.trim().length === 0) {
        nextErrors[field.key] = "Campo obrigatório.";
      }
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSubmit(localValues);
  };

  if (!open || !request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-surface/95 p-6 shadow-2xl shadow-black/50">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-accent/80">Etapa complementar</p>
          <h2 className="text-xl font-semibold text-foreground">{dialogTitle}</h2>
          <p className="text-sm text-muted-foreground">{dialogMessage}</p>
        </header>

        {hasFields ? (
          <div className="mt-5 space-y-4">
            {request!.fields.map((field) => {
              const value = localValues[field.key] ?? "";
              const fieldError = errors[field.key];
              const helperText = fieldError ?? field.helper;

              if (field.type === "select" && field.options && field.options.length > 0) {
                return (
                  <label key={field.key} className="flex flex-col gap-2 text-sm text-foreground">
                    {field.label}
                    <select
                      value={value}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="">{field.placeholder ?? "Selecione uma opção"}</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {helperText ? (
                      <span
                        className={`text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`}
                      >
                        {helperText}
                      </span>
                    ) : null}
                  </label>
                );
              }

              if (field.type === "textarea") {
                return (
                  <label key={field.key} className="flex flex-col gap-2 text-sm text-foreground">
                    {field.label}
                    <textarea
                      value={value}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      rows={field.rows ?? 4}
                      className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                    />
                    {helperText ? (
                      <span
                        className={`text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`}
                      >
                        {helperText}
                      </span>
                    ) : null}
                  </label>
                );
              }

              return (
                <label key={field.key} className="flex flex-col gap-2 text-sm text-foreground">
                  {field.label}
                  <input
                    type="text"
                    value={value}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                  />
                  {helperText ? (
                    <span
                      className={`text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`}
                    >
                      {helperText}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-muted-foreground">
            Nenhum campo adicional foi solicitado. Confirme para reenviar ao agente.
          </div>
        )}

        <footer className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full border border-accent/70 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionDisabled}
          >
            {isSubmitting ? "Reenviando..." : "Reenviar ao agente"}
          </button>
        </footer>
      </div>
    </div>
  );
}

