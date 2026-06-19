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
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 overflow-hidden rounded-[20px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#eef5ff_56%,#f8fbff_100%)] px-4 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <p className="shrink-0 text-[10px] uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
            <span className="shrink-0 text-slate-300" aria-hidden="true">·</span>
            <p className="truncate text-[13px] font-semibold text-slate-950">{title}</p>
            {description ? (
              <p className="hidden truncate text-[11px] leading-5 text-slate-500 xl:block">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-700">
              {verticalLabel}
            </span>
            <span className={`rounded-full border px-3 py-0.5 text-[10px] uppercase tracking-[0.18em] ${getStatusClasses(statusTone)}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        {helperText ? (
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{helperText}</p>
        ) : null}
      </div>

      <div className="flex-1 min-h-[520px] overflow-hidden rounded-[32px] border border-slate-200 bg-slate-100 shadow-[0_28px_80px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.04)]">
        <div className="grid min-h-[520px] h-full lg:grid-cols-[280px,minmax(0,1fr)] xl:grid-cols-[280px,minmax(0,1fr),360px]">
          <aside className="hidden h-full flex-col border-b border-slate-200 bg-[linear-gradient(180deg,#09111d_0%,#101c2b_100%)] lg:flex lg:border-b-0 lg:border-r">
            {sidebar}
          </aside>
          <div className="h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)]">{main}</div>
          <aside className="hidden h-full min-h-0 border-l border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] xl:flex xl:flex-col">
            {contextPanel}
          </aside>
        </div>
      </div>

      <div className="mt-1.5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] xl:hidden">
        <button
          type="button"
          onClick={onToggleContextPanel}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-slate-700"
        >
          <span>Painel contextual</span>
          <span className="text-slate-500">{isContextPanelOpen ? "Ocultar" : "Mostrar"}</span>
        </button>
        {isContextPanelOpen ? <div className="border-t border-slate-200">{contextPanel}</div> : null}
      </div>
    </div>
  );
}

export default VerticalWorkbenchShell;
