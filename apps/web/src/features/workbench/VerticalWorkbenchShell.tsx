import React from "react";

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  contextPanel: React.ReactNode;
  isContextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  eyebrow: string;
  title: string;
  description: string;
  helperText: string;
  verticalLabel: string;
  statusLabel: string;
  statusTone?: "warning" | "info";
  productTagline?: string;
  backHref?: string;
  backLabel?: string;
  panelToggleLabel?: string;
  heroHighlights?: Array<{
    eyebrow: string;
    value: string;
  }>;
};

function getStatusClasses(tone: Props["statusTone"]) {
  if (tone === "info") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function VerticalWorkbenchShell({
  sidebar,
  main,
  contextPanel,
  isContextPanelOpen,
  onToggleContextPanel,
  eyebrow,
  title,
  description,
  helperText,
  verticalLabel,
  statusLabel,
  statusTone = "warning",
  productTagline,
  backHref,
  backLabel = "Voltar ao Command Center",
  panelToggleLabel = "Painel contextual",
  heroHighlights = [],
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-4 sm:py-4">
      <div className="mb-2 overflow-hidden rounded-[26px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(244,249,255,0.98)_45%,rgba(236,244,255,0.95)_100%)] px-3.5 py-3.5 shadow-[0_24px_60px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.96)] sm:mb-3 sm:rounded-[32px] sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            {backHref ? (
              <a
                href={backHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]"
              >
                <span aria-hidden="true">←</span>
                <span>{backLabel}</span>
              </a>
            ) : null}
            <div className={backHref ? "mt-3 sm:mt-4" : ""}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-cyan-700 sm:text-[10px] sm:tracking-[0.32em]">{eyebrow}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-2.5">
                <p className="text-[16px] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[31px]">{title}</p>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-900 shadow-sm">
                  {verticalLabel}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-sm ${getStatusClasses(statusTone)}`}>
                  {statusLabel}
                </span>
              </div>
              {description ? (
                <p className="mt-2 hidden max-w-3xl text-[12px] leading-6 text-slate-600 sm:block sm:text-[13px]">{description}</p>
              ) : null}
              {productTagline ? (
                <p className="mt-3 hidden text-[12px] uppercase tracking-[0.18em] text-slate-500 sm:block">{productTagline}</p>
              ) : null}
              {helperText ? (
                <p className="mt-2 hidden max-w-2xl text-[12px] leading-5 text-slate-500 sm:block">{helperText}</p>
              ) : null}
            </div>
          </div>
          {heroHighlights.length > 0 ? (
            <div className="hidden shrink-0 gap-2 sm:grid sm:grid-cols-2 xl:w-[19rem]">
              {heroHighlights.map((highlight) => (
                <div key={`${highlight.eyebrow}-${highlight.value}`} className="rounded-[22px] border border-slate-200/80 bg-white/92 px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{highlight.eyebrow}</p>
                  <p className="mt-1.5 text-[13px] font-medium text-slate-900">{highlight.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-[520px] overflow-hidden rounded-[38px] border border-white/75 bg-[#ecf3fb] shadow-[0_30px_80px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.04)]">
        <div className="grid h-full min-h-[520px] lg:grid-cols-[280px,minmax(0,1fr)] xl:grid-cols-[280px,minmax(0,1fr),360px]">
          <aside className="hidden h-full min-h-0 flex-col border-b border-slate-200 bg-[linear-gradient(180deg,#09111d_0%,#101c2b_100%)] lg:flex lg:border-b-0 lg:border-r">
            {sidebar}
          </aside>
          <div className="h-full min-h-0 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)]">{main}</div>
          <aside className="hidden h-full min-h-0 border-l border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] xl:flex xl:flex-col">
            {contextPanel}
          </aside>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] sm:mt-3 sm:rounded-[28px] xl:hidden">
        <button
          type="button"
          onClick={onToggleContextPanel}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-slate-700"
        >
          <span>{panelToggleLabel}</span>
          <span className="text-slate-500">{isContextPanelOpen ? "Ocultar" : "Mostrar"}</span>
        </button>
        {isContextPanelOpen ? <div className="border-t border-slate-200">{contextPanel}</div> : null}
      </div>
    </div>
  );
}

export default VerticalWorkbenchShell;
