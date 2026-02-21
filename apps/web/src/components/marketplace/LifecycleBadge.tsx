import React from "react";

type LifecycleStatus = "DRAFT" | "ACTIVE" | "DISABLED";

const styles: Record<LifecycleStatus, { label: string; className: string }> = {
  DRAFT: {
    label: "DRAFT",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-200",
  },
  ACTIVE: {
    label: "ACTIVE",
    className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  },
  DISABLED: {
    label: "DISABLED",
    className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  },
};

export type { LifecycleStatus };

export default function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  const style = styles[status];
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.25em] ${style.className}`}
    >
      {style.label}
    </span>
  );
}
