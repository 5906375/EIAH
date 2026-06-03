import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, type Agent, type Run, type ShadowExecutionContract } from "@/lib/api";
import {
  apiCreateShadowExecutionPreview,
  apiEstimateCost,
  apiGetRun,
  apiListAgents,
  apiPromoteShadowExecution,
} from "@/lib/api";
import EstimateBadge from "./EstimateBadge";
import RunStatusCard from "./RunStatusCard";
import { useSession } from "@/state/sessionStore";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import NeedMoreInfoDialog, {
  NeedMoreInfoField,
  NeedMoreInfoRequest,
} from "./NeedMoreInfoDialog";

type EstimateStatus = "idle" | "loading" | "ready" | "error";

export type AgentFormShellChildProps<FormValues> = {
  values: FormValues;
  setValue: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  updateValues: (patch: Partial<FormValues>) => void;
  isSubmitting: boolean;
};

export type AgentFormShellProps<FormValues> = {
  agentId: string;
  title: string;
  description: string;
  initialValues: FormValues;
  buildRequest: (values: FormValues) => {
    prompt: string;
    metadata?: Record<string, unknown>;
    rawPayload?: unknown;
  };
  children: (props: AgentFormShellChildProps<FormValues>) => React.ReactNode;
};

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "workspace-demo";

type NeedMoreInfoDialogState = (NeedMoreInfoRequest & { runId: string; raw?: unknown }) | null;
type ScalarRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNeedMoreInfoOption(option: unknown) {
  if (typeof option === "string") {
    return { value: option, label: option };
  }
  if (!isPlainObject(option)) return null;
  const value =
    typeof option.value === "string"
      ? option.value
      : typeof option.id === "string"
      ? option.id
      : undefined;
  if (!value) return null;
  const label =
    typeof option.label === "string"
      ? option.label
      : typeof option.name === "string"
      ? option.name
      : value;
  return { value, label };
}

function toNeedMoreInfoField(entry: unknown): NeedMoreInfoField | null {
  if (typeof entry === "string") {
    return {
      key: entry,
      label: entry,
      type: "text",
      required: true,
    };
  }

  if (!isPlainObject(entry)) return null;

  const key =
    typeof entry.key === "string"
      ? entry.key
      : typeof entry.name === "string"
      ? entry.name
      : typeof entry.id === "string"
      ? entry.id
      : undefined;
  if (!key) return null;

  const label =
    typeof entry.label === "string"
      ? entry.label
      : typeof entry.prompt === "string"
      ? entry.prompt
      : key;

  const helper =
    typeof entry.helper === "string"
      ? entry.helper
      : typeof entry.description === "string"
      ? entry.description
      : undefined;

  const placeholder = typeof entry.placeholder === "string" ? entry.placeholder : undefined;
  const rows =
    typeof entry.rows === "number"
      ? entry.rows
      : typeof entry.minLines === "number"
      ? entry.minLines
      : undefined;

  const declaredType = typeof entry.type === "string" ? entry.type.toLowerCase() : undefined;
  const type: NeedMoreInfoField["type"] =
    declaredType === "textarea" || declaredType === "select" ? declaredType : "text";

  const required =
    typeof entry.required === "boolean"
      ? entry.required
      : typeof entry.optional === "boolean"
      ? !entry.optional
      : true;

  let options: NeedMoreInfoField["options"];
  let rawOptions = entry.options ?? entry.choices ?? entry.values;
  if (isPlainObject(rawOptions)) {
    rawOptions = Object.values(rawOptions);
  }
  if (Array.isArray(rawOptions)) {
    const normalized = rawOptions
      .map((item) => toNeedMoreInfoOption(item))
      .filter((item): item is { value: string; label: string } => item !== null);
    if (normalized.length > 0) {
      options = normalized;
    }
  }

  return {
    key,
    label,
    helper,
    placeholder,
    rows,
    type,
    required,
    options,
  };
}

function collectFieldCandidates(source: Record<string, unknown>): unknown[] {
  const candidates: unknown[] = [];
  if (Array.isArray(source.fields)) candidates.push(...source.fields);
  if (Array.isArray(source.missingFields)) candidates.push(...source.missingFields);
  if (Array.isArray(source.missing_fields)) candidates.push(...source.missing_fields);
  if (isPlainObject(source.details) && Array.isArray(source.details.fields)) {
    candidates.push(...(source.details.fields as unknown[]));
  }
  if (Array.isArray(source.required)) candidates.push(...source.required);
  return candidates;
}

function findNeedMoreInfoNode(payload: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5 || !isPlainObject(payload)) return null;

  const node = payload as Record<string, unknown>;
  const markers = ["status", "state", "kind", "code", "reason"];
  const hasMarker = markers.some((marker) => {
    const value = node[marker];
    return typeof value === "string" && value.toLowerCase() === "need_more_info";
  });
  if (hasMarker) {
    return node;
  }

  if (node.needMoreInfo === true) {
    return node;
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findNeedMoreInfoNode(item, depth + 1);
        if (found) return found;
      }
    } else if (isPlainObject(value)) {
      const found = findNeedMoreInfoNode(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function extractNeedMoreInfo(payload: unknown): NeedMoreInfoRequest | null {
  const node = findNeedMoreInfoNode(payload);
  if (!node) return null;

  const fields = collectFieldCandidates(node)
    .map((item) => toNeedMoreInfoField(item))
    .filter((field): field is NeedMoreInfoField => field !== null);

  const messageCandidates = [
    node.message,
    node.reason,
    node.prompt,
    node.detail,
    node.description,
  ];
  const titleCandidates = [node.title, node.heading];

  const message = messageCandidates.find((item) => typeof item === "string") as string | undefined;
  const title = titleCandidates.find((item) => typeof item === "string") as string | undefined;

  if (fields.length === 0 && !message && !title) {
    return null;
  }

  return { title, message, fields };
}

export default function AgentFormShell<FormValues>({
  agentId,
  title,
  description,
  initialValues,
  buildRequest,
  children,
}: AgentFormShellProps<FormValues>) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [estimateStatus, setEstimateStatus] = useState<EstimateStatus>("idle");
  const [estimateCents, setEstimateCents] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackedRunId, setTrackedRunId] = useState<string | null>(null);
  const [followUpDialog, setFollowUpDialog] = useState<NeedMoreInfoDialogState>(null);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [shadowPreview, setShadowPreview] = useState<ShadowExecutionContract | null>(null);
  const [dismissedFollowUpRunId, setDismissedFollowUpRunId] = useState<string | null>(null);
  const { workspaceId = DEFAULT_WORKSPACE_ID } = useSession();
  const { executeAgent } = useAgentExecution();

  const initialValuesKey = useMemo(() => JSON.stringify(initialValues), [initialValues]);

  useEffect(() => {
    setValues(initialValues);
    setExtraValues({});
    setLastRun(null);
    setError(null);
    setTrackedRunId(null);
    setFollowUpDialog(null);
    setIsFollowUpOpen(false);
    setDismissedFollowUpRunId(null);
  }, [initialValuesKey, initialValues]);

  useEffect(() => {
    apiListAgents()
      .then((res) => {
        const found = res.items.find((item) => item.id === agentId);
        setAgent(found ?? null);
      })
      .catch(() => setAgent(null));
  }, [agentId]);

  const combineValues = useCallback(
    (base: FormValues, extra: Record<string, string>) =>
      ({ ...(base as ScalarRecord), ...extra } as FormValues),
    []
  );

  const mergedValues = useMemo(
    () => combineValues(values, extraValues),
    [values, extraValues, combineValues]
  );

  const request = useMemo(() => buildRequest(mergedValues), [buildRequest, mergedValues]);

  const mergedValuesAsStringMap = useMemo(() => {
    const entries = Object.entries(mergedValues as ScalarRecord)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key, value]);
    return Object.fromEntries(entries) as Record<string, string>;
  }, [mergedValues]);

  useEffect(() => {
    const payloadReference = JSON.stringify(request.rawPayload ?? mergedValues);

    if (!request.prompt?.trim() || payloadReference === initialValuesKey) {
      setEstimateStatus("idle");
      setEstimateCents(null);
      return;
    }
    let active = true;
    setEstimateStatus("loading");
    const timeout = setTimeout(() => {
      const encoder = new TextEncoder();
      const bodyForEstimate = {
        prompt: request.prompt,
        metadata: request.metadata,
        rawPayload: request.rawPayload,
      };
      const inputBytes = encoder.encode(JSON.stringify(bodyForEstimate)).length;
      apiEstimateCost({
        agent: agentId,
        inputBytes,
        workspaceId,
      })
        .then((res) => {
          if (!active) return;
          setEstimateStatus("ready");
          setEstimateCents(res.data.estimateCents);
        })
        .catch(() => {
          if (!active) return;
          setEstimateStatus("error");
          setEstimateCents(null);
        });
    }, 450);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [agentId, initialValuesKey, request, mergedValues, workspaceId]);

  const setValue = useCallback(
    <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const updateValues = useCallback((patch: Partial<FormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const executeRun = useCallback(
    async (
      mode: "simulate" | "execute",
      overrides?: { values?: FormValues; extra?: Record<string, string> }
    ) => {
      const targetValues = overrides?.values ?? values;
      const targetExtra = overrides?.extra ?? extraValues;
      const combined = combineValues(targetValues, targetExtra);
      const currentRequest = buildRequest(combined);

      if (!currentRequest.prompt?.trim()) {
        setError("Preencha o formulario antes de enviar.");
        return;
      }

      setError(null);
      setIsSubmitting(true);
      try {
        const formInput =
          currentRequest.metadata && isPlainObject(currentRequest.metadata.form)
            ? (currentRequest.metadata.form as Record<string, unknown>)
            : null;
        const executionInput = formInput ?? currentRequest.rawPayload ?? combined;
        const metadata: Record<string, unknown> = {
          mode,
          ...currentRequest.metadata,
          executionInput,
        };
        if (currentRequest.rawPayload && currentRequest.rawPayload !== executionInput) {
          metadata.rawPayload = currentRequest.rawPayload;
        }
        const payload = {
          agent: agentId,
          prompt: currentRequest.prompt,
          workspaceId,
          metadata,
        };

        if (mode === "simulate") {
          const previewResponse = await apiCreateShadowExecutionPreview({
            agent: agentId,
            prompt: currentRequest.prompt,
            workspaceId,
            metadata: payload.metadata,
            inputRef: `self-service:${agentId}:${workspaceId}`,
          });
          setShadowPreview(previewResponse.data);
          setLastRun(null);
          setTrackedRunId(null);
          return;
        }

        const response = await executeAgent(agentId, payload);
        setLastRun(response.data);
        setTrackedRunId(response.data.id);
        setShadowPreview(null);
      } catch (err) {
        let message = err instanceof Error ? err.message : "Falha ao executar.";
        if (err instanceof ApiError && err.status === 403 && err.body && typeof err.body === "object") {
          const body = err.body as {
            error?: {
              code?: string;
              message?: string;
              details?: {
                reasons?: Array<{ message?: string }>;
              };
            };
          };
          if (body.error?.code === "BILLING_GUARD_BLOCKED") {
            const reason = body.error.details?.reasons?.[0]?.message;
            message = reason
              ? `Bloqueado por quota de billing: ${reason}`
              : "Bloqueado por quota de billing (hard limit ou workspace desabilitado).";
          } else if (typeof body.error?.message === "string" && body.error.message.trim()) {
            message = body.error.message;
          }
        }
        setError(message);
        setLastRun(null);
        setTrackedRunId(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [agentId, buildRequest, combineValues, extraValues, values, workspaceId]
  );

  useEffect(() => {
    if (!trackedRunId) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const fresh = await apiGetRun(trackedRunId);
        if (cancelled) return;
        setLastRun(fresh);

        if (fresh.status === "pending" || fresh.status === "running" || fresh.status === "blocked") {
          timeout = setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) {
          timeout = setTimeout(poll, 4000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [trackedRunId]);

  useEffect(() => {
    if (!lastRun) return;

    const followUp = extractNeedMoreInfo(lastRun.response ?? lastRun.meta);
    if (!followUp) return;

    if (dismissedFollowUpRunId && dismissedFollowUpRunId === lastRun.id) {
      return;
    }

    if (followUpDialog?.runId === lastRun.id && isFollowUpOpen) {
      return;
    }

    setFollowUpDialog({ ...followUp, runId: lastRun.id, raw: lastRun.response });
    setIsFollowUpOpen(true);
    setDismissedFollowUpRunId(null);
  }, [lastRun, followUpDialog, dismissedFollowUpRunId, isFollowUpOpen]);

  const handleFollowUpSubmit = useCallback(
    (additionalValues: Record<string, string>) => {
      const nextExtra = { ...extraValues, ...additionalValues };
      setExtraValues(nextExtra);
      setIsFollowUpOpen(false);
      setFollowUpDialog(null);
      setDismissedFollowUpRunId(null);
      void executeRun("execute", { extra: nextExtra });
    },
    [executeRun, extraValues]
  );

  const handleFollowUpCancel = useCallback(() => {
    if (followUpDialog?.runId) {
      setDismissedFollowUpRunId(followUpDialog.runId);
    }
    setIsFollowUpOpen(false);
  }, [followUpDialog]);

  const promoteShadowToProduction = useCallback(async () => {
    if (!shadowPreview) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await apiPromoteShadowExecution(shadowPreview.shadowExecutionId, {
        target: "workspace_production",
      });
      setShadowPreview(response.data.shadowExecution);
      setLastRun(response.data.productionRun);
      setTrackedRunId(response.data.productionRun.id);
    } catch (err) {
      let message = err instanceof Error ? err.message : "Falha ao promover preview para produção.";
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const body = err.body as {
          error?: {
            message?: string;
          };
        };
        if (typeof body.error?.message === "string" && body.error.message.trim()) {
          message = body.error.message;
        }
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [shadowPreview]);

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-3xl border border-white/10 bg-surface/80 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Formulario Self-service
            </p>
            <h1 className="text-2xl font-display font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <span className="pill bg-accent/20 text-[10px] uppercase tracking-[0.25em] text-accent">
              {agent?.name ?? agentId}
            </span>
            {agent?.pricing?.perRunCents !== undefined && (
              <span className="text-xs text-muted-foreground">
                A partir de R$ {(agent.pricing.perRunCents / 100).toFixed(2)} + payload
              </span>
            )}
          </div>
        </div>
        <EstimateBadge status={estimateStatus} cents={estimateCents} />
      </header>

      <section className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-surface/80 p-6">
          <form className="space-y-4">
            {children({ values, setValue, updateValues, isSubmitting })}
          </form>
          {error && (
            <p className="mt-4 text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => executeRun("simulate")}
              className="rounded-full border border-accent/60 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Executando..." : "Simular"}
            </button>
            <button
              type="button"
              onClick={() => executeRun("execute")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Executando..." : "Rodar agora"}
            </button>
          </div>
          {shadowPreview ? (
            <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs text-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-accent">Shadow preview</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{shadowPreview.preview.summary}</p>
                </div>
                <span className="pill">{shadowPreview.currentStage}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Custo estimado</p>
                  <p className="mt-2 text-sm text-foreground">
                    {(shadowPreview.preview.estimatedCostCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: shadowPreview.preview.currency || "BRL",
                    })}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval</p>
                  <p className="mt-2 text-sm text-foreground">{shadowPreview.approvalStatus}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Side effect</p>
                  <p className="mt-2 text-xs text-foreground">{shadowPreview.sideEffectMode}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Shadow ID</p>
                  <p className="mt-2 break-all text-xs text-foreground">{shadowPreview.shadowExecutionId}</p>
                </div>
              </div>
              {shadowPreview.preview.warnings.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                  {shadowPreview.preview.warnings[0]}
                </div>
              ) : null}
              {shadowPreview.preview.nextActions.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Próximos passos</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {shadowPreview.preview.nextActions.map((step) => (
                      <li key={step}>- {step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void promoteShadowToProduction()}
                  className="rounded-full border border-accent/60 bg-accent/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting || shadowPreview.approvalStatus === "pending"}
                >
                  {isSubmitting ? "Promovendo..." : "Promover para produção"}
                </button>
                {shadowPreview.approvalStatus === "pending" ? (
                  <p className="text-[11px] text-muted-foreground">
                    Este preview ainda exige aprovação antes da promoção.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <RunStatusCard run={lastRun} error={error} />
      </section>

      <NeedMoreInfoDialog
        open={isFollowUpOpen && !!followUpDialog}
        request={followUpDialog}
        currentValues={mergedValuesAsStringMap}
        isSubmitting={isSubmitting}
        onCancel={handleFollowUpCancel}
        onSubmit={handleFollowUpSubmit}
      />
    </div>
  );
}
