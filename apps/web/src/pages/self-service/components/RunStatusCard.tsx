import React, { useMemo } from "react";
import type { Run } from "@/lib/api";
import RunViewer from "@/components/runs/RunViewer";

type Props = {
  run?: Run | null;
  error?: string | null;
};

export default function RunStatusCard({ run, error }: Props) {
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

  return <RunViewer run={runData} />;
}
