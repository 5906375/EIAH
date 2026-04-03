import React from "react";
import { Link } from "react-router-dom";
import type { ImobAccessGateState } from "@/state/sessionStore";
import { resolveImobAccessGateCopy } from "@/features/imob/accessGateCatalog";

export function ImobAccessGateCard({
  gate,
  className = "",
}: {
  gate: Partial<ImobAccessGateState> | null | undefined;
  className?: string;
}) {
  const copy = resolveImobAccessGateCopy(gate);
  const ctaTarget = gate?.cta?.target;
  const ctaLabel = gate?.cta?.label;
  const workspaceId = gate?.scope?.workspaceId;
  const traceId = gate?.traceId;

  return (
    <section className={`rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">GateCard 403</p>
      <p className="mt-2 text-sm font-semibold text-rose-100">{copy.title}</p>
      <p className="mt-2 text-sm text-rose-100">{copy.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {ctaTarget ? (
          <Link
            to={ctaTarget}
            className="rounded-full border border-rose-300/30 bg-rose-200/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-200/20"
          >
            {ctaLabel}
          </Link>
        ) : null}
        {workspaceId ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-rose-200/80">
            Workspace: {workspaceId}
          </span>
        ) : null}
        {traceId ? (
          <span className="text-[10px] uppercase tracking-[0.2em] text-rose-200/80">
            Trace: {traceId}
          </span>
        ) : null}
      </div>
    </section>
  );
}
