import React from "react";

type WorkbenchPanelCardTone = "default" | "muted" | "accent" | "warning" | "danger";

type Props = {
  eyebrow?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  tone?: WorkbenchPanelCardTone;
  className?: string;
  bodyClassName?: string;
};

const TONE_CLASSNAME: Record<WorkbenchPanelCardTone, string> = {
  default: "border-slate-200/90 bg-white/96",
  muted: "border-slate-200/80 bg-slate-50/82",
  accent: "border-cyan-200/90 bg-cyan-50/68",
  warning: "border-amber-200/90 bg-amber-50/72",
  danger: "border-rose-200/90 bg-rose-50/72",
};

export function WorkbenchPanelCard({
  eyebrow,
  title,
  description,
  children,
  tone = "default",
  className = "",
  bodyClassName = "",
}: Props) {
  return (
    <section
      className={`rounded-[20px] border p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.045),inset_0_1px_0_rgba(255,255,255,0.88)] ${TONE_CLASSNAME[tone]} ${className}`.trim()}
    >
      {eyebrow ? <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p> : null}
      {title ? <p className="mt-1.5 text-[14px] font-semibold tracking-[-0.02em] text-slate-900">{title}</p> : null}
      {description ? <p className="mt-1.5 text-[12px] leading-5 text-slate-600">{description}</p> : null}
      {children ? <div className={`${eyebrow || title || description ? "mt-3" : ""} ${bodyClassName}`.trim()}>{children}</div> : null}
    </section>
  );
}

export default WorkbenchPanelCard;
