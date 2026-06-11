import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Run } from "@/lib/api";
import RunViewer from "@/components/runs/RunViewer";
import { formatRunErrorSummary } from "./runErrorSummary";

const TERMINAL_STATUSES = new Set(["success", "error", "blocked"] as const);

type Props = {
  run?: Run | null;
  error?: string | null;
  onRerun?: (formValues: Record<string, string>) => void;
};

export default function RunStatusCard({ run, error, onRerun }: Props) {
  if (!run && !error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground">
        As execuções ficam disponíveis aqui após o envio do formulário.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!run) return null;

  const runErrorSummary = formatRunErrorSummary(run);

  const runData = useMemo(() => {
    const traceId = run.meta?.traceId ?? (run as unknown as { traceId?: string })?.traceId;
    return {
      id: run.id,
      agent: run.agent,
      status: run.status,
      meta: {
        traceId,
        tookMs: run.meta?.tookMs,
      },
      request: run.request,
      response: run.response,
      costCents: run.costCents,
    };
  }, [run]);

  const isTerminal = TERMINAL_STATUSES.has(run.status as "success" | "error" | "blocked");

  return (
    <div className="space-y-3">
      {runErrorSummary ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {runErrorSummary}
        </div>
      ) : null}
      <RunViewer run={runData} onRerun={onRerun} />
      {isTerminal ? (
        <div className="flex justify-end">
          <Link
            to={`/app/runs?runId=${encodeURIComponent(run.id)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent/70 transition hover:text-accent"
          >
            Ver no histórico de runs
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
