import React from "react";

type WorkbenchPanelCardTone = "default" | "muted" | "accent" | "warning" | "danger";

type Props = {
  eyebrow?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  tone?: WorkbenchPanelCardTone;
  className?: string;
};

const TONE_CLASSNAME: Record<WorkbenchPanelCardTone, string> = {
  default: "border-slate-200 bg-white",
  muted: "border-slate-200 bg-slate-50/90",
  accent: "border-cyan-200 bg-cyan-50/80",
  warning: "border-amber-200 bg-amber-50/80",
  danger: "border-rose-200 bg-rose-50/80",
};

export function WorkbenchPanelCard({
  eyebrow,
  title,
  description,
  children,
  tone = "default",
  className = "",
}: Props) {
  return (
    <section className={`rounded-[24px] border p-4 shadow-[0_16px_36px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.85)] ${TONE_CLASSNAME[tone]} ${className}`.trim()}>
      {eyebrow ? <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p> : null}
      {title ? <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p> : null}
      {description ? <p className="mt-2 text-[12px] leading-5 text-slate-600">{description}</p> : null}
      {children ? <div className={eyebrow || title || description ? "mt-3" : ""}>{children}</div> : null}
    </section>
  );
}

export default WorkbenchPanelCard;
