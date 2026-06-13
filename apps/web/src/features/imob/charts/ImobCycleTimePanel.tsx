import React from "react";

type Props = {
  docsResolved48hPct: number;
  averageDurationHours: number | null;
  durationSampleSize?: number;
  resolutionSampleSize?: number;
  loading: boolean;
  windowDays?: 7 | 15 | 30;
};

function RadialGauge({ pct, size = 120, showValue = true }: { pct: number; size?: number; showValue?: boolean }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.37;
  const sw = size * 0.1;
  const arcDeg = 240;
  const startDeg = 150;
  const circ = 2 * Math.PI * r;
  const arcLen = (arcDeg / 360) * circ;
  const fillLen = Math.max(0, Math.min(1, pct / 100)) * arcLen;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const ptOnCircle = (deg: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });

  const p0 = ptOnCircle(startDeg);
  const pEnd = ptOnCircle(startDeg + arcDeg);

  function arcPath(lengthDeg: number, color: string) {
    const end = ptOnCircle(startDeg + lengthDeg);
    const large = lengthDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    );
  }

  const fillColor = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#f43f5e";
  const fillDeg = (pct / 100) * arcDeg;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcPath(arcDeg, "rgba(255,255,255,0.07)")}
      {fillDeg > 0.5 ? arcPath(fillDeg, fillColor) : null}
      <text
        x={cx}
        y={cy + size * 0.05}
        textAnchor="middle"
        fill="#e5e7eb"
        fontSize={size * 0.2}
        fontWeight={700}
        fontFamily="inherit"
      >
        {showValue ? `${pct.toFixed(0)}%` : "—"}
      </text>
    </svg>
  );
}

export function ImobCycleTimePanel({
  docsResolved48hPct,
  averageDurationHours,
  durationSampleSize = 0,
  resolutionSampleSize = 0,
  loading,
  windowDays = 30,
}: Props) {
  const hasResolutionCoverage = resolutionSampleSize > 0;
  const hasDurationCoverage = durationSampleSize > 0 && averageDurationHours != null;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ciclo operacional</h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          snapshot {windowDays}d
        </span>
      </div>

      {loading ? (
        <div className="mt-4 flex h-28 items-center justify-center text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-8 sm:flex-nowrap">
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <RadialGauge pct={docsResolved48hPct} size={120} showValue={hasResolutionCoverage} />
            <p className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Resolvidas em 48h
            </p>
            <p className="text-center text-[10px] text-muted-foreground">
              {hasResolutionCoverage ? `${resolutionSampleSize} fechamento(s) medidos` : "Sem dados suficientes"}
            </p>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Ciclo médio até fechamento
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-foreground">
                {hasDurationCoverage ? `${averageDurationHours.toFixed(0)}h` : "—"}
              </p>
              {hasDurationCoverage ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {(averageDurationHours / 24).toFixed(1)} dias corridos em média
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">Sem dados suficientes para calcular ciclo médio</p>
              )}
            </div>
            <p className="text-[10px] italic text-muted-foreground/50">
              Série histórica disponível na próxima fase — requer endpoint temporal no backend.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
