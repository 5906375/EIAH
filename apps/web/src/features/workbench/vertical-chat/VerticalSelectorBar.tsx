import React from "react";
import type { VerticalId, VerticalSelectorBarProps, VerticalSelectorItem } from "./VerticalChatTypes";

const VERTICAL_COLORS: Record<VerticalId, string> = {
  imob: "#5DCAA5",
  legal: "#7F77DD",
};

function getPillClasses(item: VerticalSelectorItem, isActive: boolean): string {
  const color = VERTICAL_COLORS[item.id];
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-all select-none";

  if (item.state === "preview") {
    return `${base} cursor-default border-dashed border-slate-300 text-slate-400`;
  }
  if (isActive) {
    return `${base} cursor-default`;
  }
  return `${base} cursor-pointer hover:opacity-80`;
}

function getPillStyle(
  item: VerticalSelectorItem,
  isActive: boolean,
): React.CSSProperties {
  if (item.state === "preview") {
    return {};
  }
  const color = VERTICAL_COLORS[item.id];
  if (isActive) {
    return {
      backgroundColor: `${color}1A`,
      borderColor: color,
      color,
    };
  }
  return {
    borderColor: "rgba(148,163,184,0.5)",
    color: "rgba(71,85,105,0.4)",
  };
}

export function VerticalSelectorBar({
  verticals,
  activeVerticalId,
  onSelect,
  className,
}: VerticalSelectorBarProps) {
  const visible = verticals.filter((v) => v.state !== "disabled");

  return (
    <div
      role="tablist"
      aria-label="Seletor de vertical"
      className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}
    >
      {visible.map((item) => {
        const isActive = item.id === activeVerticalId && item.state === "active";
        const isClickable = item.state === "active" || item.state === "inactive";

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={!isClickable}
            title={item.tooltip}
            disabled={!isClickable}
            onClick={() => {
              if (isClickable && item.id !== activeVerticalId) {
                onSelect(item.id);
              }
            }}
            className={getPillClasses(item, isActive)}
            style={getPillStyle(item, isActive)}
          >
            {item.label}
            {item.state === "preview" ? (
              <span className="ml-0.5 text-[9px] normal-case tracking-normal opacity-70">
                Em breve
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default VerticalSelectorBar;
