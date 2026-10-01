import React from "react";
import type { ImobActionMenu, ImobActionMenuItem } from "./imobActionMenus";

/**
 * Barra de menus do chat IMOB (Proprietários, Imóveis, Locações, Negócios).
 * Apenas apresentação: a ação de cada item é decidida por quem usa a barra.
 */
export function ImobActionMenuBar(props: {
  menus: ImobActionMenu[];
  onSelect: (item: ImobActionMenuItem) => void;
}) {
  const { menus, onSelect } = props;
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!openMenuId) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpenMenuId(null);
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openMenuId]);

  const openMenu = menus.find((menu) => menu.id === openMenuId) ?? null;

  return (
    <div ref={rootRef} className="relative mb-1 px-0.5">
      {openMenu ? (
        <div
          role="menu"
          aria-label={openMenu.label}
          className="absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs rounded-xl border border-white/10 bg-surface-strong/95 p-1 shadow-lg backdrop-blur-xl"
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
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.12em] transition ${
                isOpen
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/10 bg-white/[0.04] text-muted-foreground hover:border-accent/30 hover:bg-accent/8 hover:text-accent"
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
