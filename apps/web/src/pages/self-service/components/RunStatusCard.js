import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from "react";
import RunViewer from "@/components/runs/RunViewer";
export default function RunStatusCard({ run, error }) {
    if (!run && !error) {
        return (_jsx("div", { className: "rounded-2xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground", children: "As execu\u00E7\u00F5es ficam dispon\u00EDveis aqui ap\u00F3s o envio do formul\u00E1rio." }));
    }
    if (error) {
        return (_jsx("div", { className: "rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200", children: error }));
    }
    if (!run)
        return null;
    const runData = useMemo(() => {
        const traceId = run.meta?.traceId ?? run?.traceId;
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
    return _jsx(RunViewer, { run: runData });
}
