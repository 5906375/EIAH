import React from "react";

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  contextPanel: React.ReactNode;
  isContextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  onBackClick?: () => void;
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
  onBackClick,
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
    <div className="flex min-h-0 flex-1 flex-col px-0.5 py-0.5 sm:px-1.5 sm:py-1.5 lg:px-2.5 lg:py-2.5">
      {backHref || onBackClick ? (
        <div className="mb-1 overflow-hidden rounded-[16px] border border-accent/16 bg-[linear-gradient(135deg,rgba(8,14,26,0.88)_0%,rgba(10,23,48,0.82)_55%,rgba(8,14,26,0.92)_100%)] px-2 py-1.5 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_16px_36px_-30px_rgba(56,189,248,0.32),inset_0_1px_0_rgba(255,255,255,0.04)] sm:mb-1.5 sm:rounded-[18px] sm:px-2.5 sm:py-2">
          <div className="flex items-center justify-between gap-2">
            {onBackClick ? (
              <button
                type="button"
                onClick={onBackClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-foreground transition hover:border-accent/40 hover:text-accent sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]"
              >
                <span aria-hidden="true">←</span>
                <span>{backLabel}</span>
              </button>
            ) : backHref ? (
              <a
                href={backHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-foreground transition hover:border-accent/40 hover:text-accent sm:gap-2 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]"
              >
                <span aria-hidden="true">←</span>
                <span>{backLabel}</span>
              </a>
            ) : null}
            <div className="hidden h-5 w-5 rounded-full border border-white/8 bg-white/[0.03] sm:block" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-[520px] overflow-hidden rounded-[22px] border border-accent/24 bg-surface/80 shadow-[0_0_0_1px_rgba(56,189,248,0.16),0_22px_56px_-34px_rgba(56,189,248,0.34)] sm:rounded-[24px] xl:rounded-[28px]">
        <div className="grid h-full min-h-[520px] lg:grid-cols-[208px,minmax(0,1fr)] xl:justify-center xl:grid-cols-[216px,minmax(760px,920px),272px] 2xl:grid-cols-[224px,minmax(820px,980px),280px]">
          <aside className="hidden h-full min-h-0 flex-col border-b border-white/10 bg-[linear-gradient(180deg,rgba(6,11,21,0.94)_0%,rgba(9,17,31,0.98)_100%)] lg:flex lg:border-b-0 lg:border-r">
            {sidebar}
          </aside>
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(7,13,24,0.96)_0%,rgba(9,18,34,0.98)_100%)]">{main}</div>
          <aside className="hidden h-full min-h-0 border-l border-white/10 bg-[linear-gradient(180deg,rgba(8,14,26,0.94)_0%,rgba(10,18,34,0.98)_100%)] xl:flex xl:flex-col">
            {contextPanel}
          </aside>
        </div>
      </div>

      <div className="mt-1 overflow-hidden rounded-[14px] border border-white/10 bg-surface/90 shadow-[0_14px_28px_-24px_rgba(56,189,248,0.24)] sm:mt-1.5 sm:rounded-[16px] xl:hidden">
        <button
          type="button"
          onClick={onToggleContextPanel}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[10px] uppercase tracking-[0.16em] text-foreground"
        >
          <span>{panelToggleLabel}</span>
          <span className="text-[9px] text-muted-foreground">{isContextPanelOpen ? "Ocultar" : "Mostrar"}</span>
        </button>
        {isContextPanelOpen ? <div className="border-t border-white/10">{contextPanel}</div> : null}
      </div>
    </div>
  );
}

export default VerticalWorkbenchShell;
