import { useEffect, useMemo, useState } from "react";
import { maskPII } from "@repo/utils";
import {
  apiCreateCalibration,
  apiGetRunGovernance,
  apiGetTrustHistory,
  type Gate,
  type GateDecision,
  type GateVerdict,
  type GovernanceSummary,
  type TrustHistory,
  type TrustPoint,
} from "@/lib/api";

type GateMode = "shadow" | "enforce";

function pillForDecision(decision: GateDecision) {
  switch (decision) {
    case "allowed":
      return "bg-emerald-500/20 text-emerald-200";
    case "observed":
      return "bg-amber-500/20 text-amber-200";
    case "blocked":
      return "bg-rose-500/20 text-rose-200";
    case "error":
      return "bg-red-500/20 text-red-200";
    default:
      return "bg-white/10 text-foreground";
  }
}

function labelForGate(gate: Gate) {
  if (gate === "intent") return "Nível de intenção B1";
  if (gate === "trust") return "Nível de confiança B2";
  return "Validação B3";
}

function formatScore(gate: Gate, score?: number) {
  if (score === undefined || score === null) return "—";
  if (gate === "judge") return `${Math.round(score * 100)}%`;
  return `${Math.round(score)}`;
}

function labelForDecision(decision: GateDecision) {
  if (decision === "allowed") return "permitido";
  if (decision === "observed") return "observado";
  if (decision === "blocked") return "bloqueado";
  return "erro";
}

function formatPtNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function normalizeReasonText(text: string) {
  return text
    .replace(/Violations/gi, "Violações")
    .replace(/Blocked Actions/gi, "Ações bloqueadas")
    .replace(/Intent Volume/gi, "Volume de intenções")
    .replace(/Error Rate/gi, "Taxa de erros")
    .replace(/Success Rate/gi, "Taxa de sucesso");
}

function formatReasons(reasonCodes?: string[]) {
  if (!reasonCodes || reasonCodes.length === 0) return null;
  const raw = reasonCodes.join(", ");
  const normalized = normalizeReasonText(raw).replace(
    /(\d+(?:\.\d+)?)%?\s*\(w=([0-9.]+)\)/gi,
    (_match, pct, weight) => `${formatPtNumber(Number(pct))}% (peso = ${formatPtNumber(Number(weight))})`
  );
  return normalized;
}

function Sparkline({ points }: { points: TrustPoint[] }) {
  const { d } = useMemo(() => {
    if (!points?.length) return { d: "" };
    const ys = points.map((p) => p.score);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const normY = (y: number) => {
      if (maxY === minY) return 10;
      return 20 - ((y - minY) / (maxY - minY)) * 18;
    };
    const stepX = points.length > 1 ? 100 / (points.length - 1) : 100;
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${normY(p.score)}`)
      .join(" ");
    return { d: path };
  }, [points]);

  return (
    <svg viewBox="0 0 100 22" className="h-6 w-full">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground/70" />
    </svg>
  );
}

export default function GovernancePanel({ runId, workspaceId }: { runId: string; workspaceId?: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [history, setHistory] = useState<TrustHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [calMsg, setCalMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const gov = await apiGetRunGovernance(runId);
        if (cancelled) return;
        setSummary(gov);

        const wsId = workspaceId ?? gov.workspaceId;
        if (wsId) {
          const h = await apiGetTrustHistory(wsId, "30d");
          if (!cancelled) setHistory(h);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao carregar governança.";
        if (!cancelled) setErr(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, runId, workspaceId]);

  const gates = useMemo(() => {
    if (!summary) return [];
    const items: GateVerdict[] = [];
    if (summary.gates.intent) items.push(summary.gates.intent);
    if (summary.gates.trust) items.push(summary.gates.trust);
    if (summary.gates.judge) items.push(summary.gates.judge);
    return items;
  }, [summary]);

  const handleCalibrate = async (gate: Gate, label: "false_positive" | "false_negative") => {
    if (!summary?.canCalibrate) return;
    try {
      await apiCreateCalibration({
        runId,
        gate,
        label,
        comment: "Reported via Runs Governance Console",
      });
      setCalMsg("Calibragem registrada (auditável).");
      setTimeout(() => setCalMsg(null), 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar calibragem.";
      setCalMsg(message);
      setTimeout(() => setCalMsg(null), 2500);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3"
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
            Governança (Fase 3)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Evidências (B1=Intenção, B2=Confiança, B3=Juiz) + histórico de confiança (lazy-load).
          </p>
        </div>
        <span className="pill bg-white/10 text-foreground">{open ? "Fechar" : "Abrir"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs">
              Carregando evidências de governança…
            </div>
          )}

          {err && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {err}
            </div>
          )}

          {summary && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {gates.map((gate) => (
                  <div key={gate.gate} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.35em] text-foreground/80">
                      {labelForGate(gate.gate)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-wide ${pillForDecision(
                        gate.decision
                      )}`}
                    >
                      {labelForDecision(gate.decision)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
                    {gate.mode && (
                      <span className="pill bg-white/10 text-foreground">
                        mode: {gate.mode as GateMode}
                      </span>
                    )}
                    {gate.threshold !== undefined && (
                      <span className="pill bg-white/10 text-foreground">
                        número:{" "}
                        {gate.gate === "judge" ? Math.round(gate.threshold * 100) + "%" : Math.round(gate.threshold)}
                      </span>
                    )}
                    {gate.score !== undefined && (
                      <span className="pill bg-white/10 text-foreground">
                        pontuação: {formatScore(gate.gate, gate.score)}
                      </span>
                    )}
                  </div>

                  {formatReasons(gate.reasonCodes) ? (
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2 text-[9px] text-foreground/85">
                      <span className="font-semibold text-foreground">motivos:</span>{" "}
                      {maskPII(formatReasons(gate.reasonCodes) ?? "")}
                    </div>
                  ) : null}

                    {(gate.gate === "judge" || gate.gate === "intent") && summary.canCalibrate ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
                          onClick={() => handleCalibrate(gate.gate, "false_positive")}
                        >
                          🚩 False positive
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
                          onClick={() => handleCalibrate(gate.gate, "false_negative")}
                        >
                          🚩 False negative
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {calMsg && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-foreground/85">
                  {calMsg}
                </div>
              )}

              {history?.points?.length ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-foreground/80">
                      Timeline de confiança (workspace)
                    </p>
                    <span className="pill bg-white/10 text-foreground">{history.window}</span>
                  </div>
                  <div className="mt-2 text-foreground/80">
                    <Sparkline points={history.points} />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}
