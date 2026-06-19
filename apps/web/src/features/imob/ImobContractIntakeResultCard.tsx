// Render-only card for IMOB contract intake result.
// Pure presentational view exported for SSR testing.
// Interactive wrapper handles export downloads via internal state.
// PII guarantee: all displayed fields come from masked backend data.

import React from "react";
import type { ImobContractIntakeResultWidget } from "@/lib/api";
import { apiImobIntakeExportDownload, apiImobIntakePdfGuidance } from "@/lib/api";

type ExportFormat = "html" | "docx";
type ExportStatus = "idle" | "loading" | "error";

function stageLabel(stage: string): string {
  if (stage === "documents_collecting") return "Coletando documentos";
  return stage;
}

function statusLabel(status: string): string {
  if (status === "ready_for_review") return "Pronto para revisão";
  if (status === "pending_data") return "Aguardando dados";
  if (status === "blocked") return "Bloqueado";
  if (status === "done") return "Concluído";
  return status;
}

// ─── Pure view — testable with renderToStaticMarkup ──────────────────────────

export type ImobContractIntakeResultCardViewProps = {
  widget: ImobContractIntakeResultWidget;
  exportStatus: Partial<Record<ExportFormat, ExportStatus>>;
  pdfGuidanceMsg: string | null;
  onExportClick?: (format: ExportFormat) => void;
  onPdfGuidanceClick?: () => void;
  commandCenterHref?: string;
};

export function ImobContractIntakeResultCardView({
  widget,
  exportStatus,
  pdfGuidanceMsg,
  onExportClick,
  onPdfGuidanceClick,
  commandCenterHref,
}: ImobContractIntakeResultCardViewProps) {
  const pendingList = widget.pendingItems.length > 0 ? widget.pendingItems : null;
  const riskList = widget.riskFlags.length > 0 ? widget.riskFlags : null;

  return (
    <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
          Intake Registrado
        </p>
        <div className="flex gap-1">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
            {stageLabel(widget.stage)}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-muted-foreground">
            {statusLabel(widget.status)}
          </span>
        </div>
      </div>

      {widget.nextStep ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Próximo passo: {widget.nextStep}
        </p>
      ) : null}

      {pendingList ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Itens Pendentes
          </p>
          <ul className="mt-1 space-y-1">
            {pendingList.map((item, i) => (
              <li key={i} className="text-xs text-foreground/80">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {riskList ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Alertas de Risco
          </p>
          <ul className="mt-1 space-y-1">
            {riskList.map((flag, i) => (
              <li key={i} className="text-xs text-rose-300">
                ⚠ {flag}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Export buttons */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Exportar Relatório
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onExportClick?.("html")}
            disabled={exportStatus.html === "loading"}
            className="rounded-full border border-white/20 bg-black/20 px-3 py-1 text-[11px] text-foreground transition hover:border-accent/40 disabled:opacity-50"
          >
            {exportStatus.html === "loading" ? "..." : "Exportar HTML"}
          </button>
          <button
            type="button"
            onClick={() => onExportClick?.("docx")}
            disabled={exportStatus.docx === "loading"}
            className="rounded-full border border-white/20 bg-black/20 px-3 py-1 text-[11px] text-foreground transition hover:border-accent/40 disabled:opacity-50"
          >
            {exportStatus.docx === "loading" ? "..." : "Exportar DOCX"}
          </button>
          <button
            type="button"
            onClick={onPdfGuidanceClick}
            className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] text-muted-foreground transition hover:border-white/20"
          >
            Orientação PDF
          </button>
        </div>
        {exportStatus.html === "error" && (
          <p className="mt-1 text-[10px] text-rose-300">Falha ao exportar HTML</p>
        )}
        {exportStatus.docx === "error" && (
          <p className="mt-1 text-[10px] text-rose-300">Falha ao exportar DOCX</p>
        )}
        {pdfGuidanceMsg ? (
          <p className="mt-2 text-[10px] text-muted-foreground">{pdfGuidanceMsg}</p>
        ) : null}
      </div>

      {/* Navigation buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        {commandCenterHref ? (
          <a
            href={commandCenterHref}
            className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-foreground transition hover:border-accent/40"
          >
            Ver no Command Center
          </a>
        ) : null}
        <span className="self-center font-mono text-[9px] text-muted-foreground/50">
          run:{widget.runId.slice(0, 12)}…
        </span>
      </div>
    </div>
  );
}

// ─── Interactive wrapper ──────────────────────────────────────────────────────

export const ImobContractIntakeResultCard: React.FC<{
  widget: ImobContractIntakeResultWidget;
  commandCenterHref?: string;
}> = ({ widget, commandCenterHref }) => {
  const [exportStatus, setExportStatus] = React.useState<
    Partial<Record<ExportFormat, ExportStatus>>
  >({});
  const [pdfGuidanceMsg, setPdfGuidanceMsg] = React.useState<string | null>(null);

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      setExportStatus((s) => ({ ...s, [format]: "loading" }));
      try {
        await apiImobIntakeExportDownload(widget.runId, format);
        setExportStatus((s) => ({ ...s, [format]: "idle" }));
      } catch {
        setExportStatus((s) => ({ ...s, [format]: "error" }));
      }
    },
    [widget.runId],
  );

  const handlePdfGuidance = React.useCallback(async () => {
    try {
      const guidance = await apiImobIntakePdfGuidance(widget.runId);
      setPdfGuidanceMsg(guidance.message);
    } catch {
      setPdfGuidanceMsg("Gere o PDF a partir do HTML exportado usando jspdf ou impressão do navegador.");
    }
  }, [widget.runId]);

  return (
    <ImobContractIntakeResultCardView
      widget={widget}
      exportStatus={exportStatus}
      pdfGuidanceMsg={pdfGuidanceMsg}
      onExportClick={handleExport}
      onPdfGuidanceClick={handlePdfGuidance}
      commandCenterHref={commandCenterHref}
    />
  );
};
