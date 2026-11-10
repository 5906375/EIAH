import React from "react";
import type { ImobActionMenu, ImobActionMenuItem } from "./imobActionMenus";

/**
 * Barra de menus do chat IMOB (Proprietários, Imóveis, Locações, Negócios).
 * Apenas apresentação: a ação de cada item é decidida por quem usa a barra.
 */
export function ImobActionMenuBar(props: {
  menus: ImobActionMenu[];
  onSelect: (item: ImobActionMenuItem) => void;
  layout?: "bar" | "sidebar";
  embedded?: boolean;
}) {
  const { menus, onSelect, layout = "bar", embedded = false } = props;
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navigationId = React.useId();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!openMenuId && !mobileOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          const target = mobileOpen
            ? rootRef.current?.querySelector<HTMLButtonElement>('[aria-controls]')
            : rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"][aria-expanded="true"]');
          target?.focus();
          setOpenMenuId(null);
          setMobileOpen(false);
        }
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openMenuId, mobileOpen]);

  const openMenu = menus.find((menu) => menu.id === openMenuId) ?? null;

  if (layout === "sidebar") {
    return (
      <div ref={rootRef} className="imob-sidebar-menu min-w-0">
        {!embedded ? <button type="button" aria-expanded={mobileOpen} aria-controls={navigationId}
          className="lg:hidden" onClick={() => setMobileOpen((open) => !open)}>
          Operações IMOB {mobileOpen ? "▴" : "▾"}
        </button> : null}
        <nav id={navigationId} aria-label="Operações IMOB"
          className={`${embedded || mobileOpen ? "block" : "hidden"} ${embedded ? "" : "no-scrollbar max-h-[40dvh] overflow-y-auto lg:max-h-none"} lg:block`}>
          {menus.map((menu) => (
            <div key={menu.id} className="mb-1">
              <button type="button" aria-haspopup="menu" aria-expanded={menu.id === openMenuId}
                className="w-full text-left" onClick={() => setOpenMenuId(menu.id === openMenuId ? null : menu.id)}>
                {menu.label} {menu.id === openMenuId ? "▴" : "▾"}
              </button>
              {menu.id === openMenuId ? (
                <div role="menu" aria-label={menu.label} className="pl-2">
                  {menu.items.map((item) => (
                    <button key={item.id} type="button" role="menuitem" className="block w-full text-left"
                      onClick={() => { setOpenMenuId(null); setMobileOpen(false); onSelect(item); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative mb-1 px-0.5">
      {openMenu ? (
        <div
          role="menu"
          aria-label={openMenu.label}
          className="absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs rounded-xl bg-black p-1 shadow-lg backdrop-blur-xl"
        >
          {openMenu.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMenuId(null);
                onSelect(item);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-[12px] normal-case tracking-normal text-foreground hover:bg-accent/10 hover:text-accent"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {menus.map((menu) => {
          const isOpen = menu.id === openMenuId;
          return (
            <button
              key={menu.id}
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpenMenuId(isOpen ? null : menu.id)}
              className={`min-h-[44px] shrink-0 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.12em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                isOpen
                  ? "text-accent underline"
                  : "text-muted-foreground hover:text-accent hover:underline"
              }`}
            >
              {menu.label} {isOpen ? "▴" : "▾"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
