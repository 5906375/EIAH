import React, { useId, useRef, useState, type ReactNode } from "react";

/** Painel de apresentação: recebe valores e controles já resolvidos pelo runtime. */
export default function FrontDoorSidebar({ status, controls, children }: {
  status?: ReactNode;
  controls?: ReactNode;
  children?: ReactNode;
}) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelId = useId();
  const mobileToggle = useRef<HTMLButtonElement>(null);
  return (
    <aside aria-label="Workspace e operações"
      className={`front-door-sidebar front-door-context-panel flex min-h-0 min-w-0 shrink-0 flex-col ${desktopOpen ? "lg:w-60" : "lg:w-12"}`}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest('[role="menuitem"]')) setMobileOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && mobileOpen) {
          event.preventDefault();
          event.stopPropagation();
          setMobileOpen(false);
          mobileToggle.current?.focus();
        }
      }}>
      <button ref={mobileToggle} type="button" aria-expanded={mobileOpen} aria-controls={panelId}
        className="lg:hidden" onClick={() => setMobileOpen((open) => !open)}>
        Painel do workspace {mobileOpen ? "▴" : "▾"}
      </button>
      <button type="button" aria-expanded={desktopOpen} aria-controls={panelId}
        aria-label={desktopOpen ? "Recolher painel do workspace" : "Expandir painel do workspace"}
        title={desktopOpen ? "Recolher painel" : "Expandir painel"}
        className="hidden lg:block" onClick={() => setDesktopOpen((open) => !open)}>
        {desktopOpen ? "‹ Painel" : "›"}
      </button>
      <div id={panelId}
        className={`front-door-sidebar-content no-scrollbar min-h-0 max-h-[45dvh] space-y-4 overflow-y-auto pt-2 lg:max-h-none ${mobileOpen ? "block" : "hidden"} ${desktopOpen ? "lg:block" : "lg:hidden"}`}>
        {status ? <div className="front-door-sidebar-status min-w-0" aria-label="Consumo do workspace">{status}</div> : null}
        {controls ? <div className="front-door-sidebar-controls min-w-0 space-y-2">{controls}</div> : null}
        {children}
      </div>
    </aside>
  );
}
