import React, { useEffect, useMemo, useState } from "react";

const DIALOG_TTL_MS = 30 * 60 * 1000;

function storageKey(runId: string) {
  return `need_more_info:${runId}`;
}

function saveDialogValues(runId: string, values: Record<string, string>) {
  try {
    sessionStorage.setItem(storageKey(runId), JSON.stringify({ values, savedAt: Date.now() }));
  } catch {
    // sessionStorage indisponível
  }
}

function loadDialogValues(runId: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { values: Record<string, string>; savedAt: number };
    if (Date.now() - parsed.savedAt > DIALOG_TTL_MS) {
      sessionStorage.removeItem(storageKey(runId));
      return null;
    }
    return parsed.values;
  } catch {
    return null;
  }
}

function clearDialogValues(runId: string) {
  try {
    sessionStorage.removeItem(storageKey(runId));
  } catch {
    // sessionStorage indisponível
  }
}

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
  runId?: string;
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
  runId,
  onCancel,
  onSubmit,
}: NeedMoreInfoDialogProps) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ErrorMap>({});
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  useEffect(() => {
    if (!open || !request) {
      setLocalValues({});
      setErrors({});
      setRestoredFromStorage(false);
      return;
    }

    const saved = runId ? loadDialogValues(runId) : null;
    const initialEntries = (request.fields ?? []).map((field) => {
      const fromSaved = saved?.[field.key];
      if (typeof fromSaved === "string" && fromSaved.length > 0) {
        return [field.key, fromSaved] as const;
      }
      const initial = normalizeInitialValue(field.key, request, currentValues);
      return [field.key, initial] as const;
    });
    setLocalValues(Object.fromEntries(initialEntries));
    setErrors({});
    setRestoredFromStorage(saved !== null && Object.keys(saved).some((k) => (saved[k] ?? "").length > 0));
  }, [open, request, currentValues, runId]);

  useEffect(() => {
    if (!open || !runId || Object.keys(localValues).length === 0) return;
    saveDialogValues(runId, localValues);
  }, [localValues, open, runId]);

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

    if (runId) clearDialogValues(runId);
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

        {restoredFromStorage ? (
          <div className="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-[11px] text-accent">
            Campos restaurados da sessão anterior. Revise e reenvie.
          </div>
        ) : null}

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

