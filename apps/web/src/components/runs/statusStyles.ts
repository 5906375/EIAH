import type { RunStatus } from "@/lib/api";

export const RUN_STATUS_STYLES: Record<RunStatus, { label: string; badgeClass: string; indicatorClass: string }> = {
  pending: {
    label: "Na fila",
    badgeClass: "border-amber-400/40 bg-amber-400/10 text-amber-200 animate-pulse",
    indicatorClass: "from-amber-400/70 via-amber-400/20 to-transparent",
  },
  running: {
    label: "Em execução",
    badgeClass: "border-amber-300/50 bg-amber-300/15 text-amber-100 animate-pulse",
    indicatorClass: "from-amber-300/70 via-amber-300/20 to-transparent",
  },
  success: {
    label: "Sucesso",
    badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    indicatorClass: "from-emerald-400/60 via-emerald-400/20 to-transparent",
  },
  error: {
    label: "Erro",
    badgeClass: "border-rose-500/50 bg-rose-500/15 text-rose-200",
    indicatorClass: "from-rose-500/70 via-rose-500/20 to-transparent",
  },
  blocked: {
    label: "Revisão",
    badgeClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
    indicatorClass: "from-yellow-500/60 via-yellow-500/20 to-transparent",
  },
};
