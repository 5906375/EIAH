import React from "react";
import { apiImobIntakeExportDownload, apiImobIntakePdfGuidance } from "@/lib/api";
import type { ImobWorkbenchIntakeContext } from "./imobWorkbenchContext";
import { ImobIntakeSummaryPanel } from "./ImobIntakeSummaryPanel";
import { WorkbenchPanelCard } from "@/features/workbench/WorkbenchPanelCard";

type ExportFormat = "html" | "docx";
type ExportStatus = "idle" | "loading" | "error";

type Props = {
  state: "loading" | "empty" | "error" | "ready";
  intakeContext: ImobWorkbenchIntakeContext | null;
  commandCenterHref?: string | null;
  funnelHref?: string | null;
  runArchiveHref?: string | null;
  errorMessage?: string | null;
};

function formatContextReference(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 12)}…${normalized.slice(-4)}`;
}

function humanStageLabel(stage: string) {
  if (stage === "documents_collecting") return "Coletando documentos";
  if (stage === "draft_ready") return "Rascunho pronto";
  return stage;
}

function humanStatusLabel(status: string) {
  if (status === "pending_confirmation") return "Aguardando confirmação";
  if (status === "ready_for_review") return "Pronto para revisão";
  if (status === "pending_data") return "Aguardando dados";
  if (status === "blocked") return "Bloqueado";
  if (status === "done") return "Concluído";
  return status;
}

export function ImobWorkbenchContextPanel({
  state,
  intakeContext,
  commandCenterHref,
  funnelHref,
  runArchiveHref,
  errorMessage,
}: Props) {
  const [exportStatus, setExportStatus] = React.useState<Partial<Record<ExportFormat, ExportStatus>>>({});
  const [pdfGuidanceMsg, setPdfGuidanceMsg] = React.useState<string | null>(null);
  const threadRef = formatContextReference(intakeContext?.threadId);
  const caseRef = formatContextReference(intakeContext?.caseId);
  const runRef = formatContextReference(intakeContext?.runId);
  const draftRef = formatContextReference(intakeContext?.draftId);
  const commandCenterLabel =
    intakeContext?.caseId || intakeContext?.threadId
      ? "Abrir contexto no Command Center"
      : "Abrir visão geral do Command Center";
  const funnelLabel = intakeContext?.caseId ? "Abrir Funil deste caso" : "Abrir no Funil";
  const runArchiveLabel = intakeContext?.runId ? "Abrir execução no RunArchive" : "Abrir RunArchive";

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      if (!intakeContext?.runId) return;
      setExportStatus((prev) => ({ ...prev, [format]: "loading" }));
      try {
        await apiImobIntakeExportDownload(intakeContext.runId, format);
        setExportStatus((prev) => ({ ...prev, [format]: "idle" }));
      } catch {
        setExportStatus((prev) => ({ ...prev, [format]: "error" }));
      }
    },
    [intakeContext?.runId],
  );

  const handlePdfGuidance = React.useCallback(async () => {
    if (!intakeContext?.runId) return;
    try {
      const guidance = await apiImobIntakePdfGuidance(intakeContext.runId);
      setPdfGuidanceMsg(guidance.message);
    } catch {
      setPdfGuidanceMsg("Use o HTML exportado para gerar o PDF no navegador.");
    }
  }, [intakeContext?.runId]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fafcff_0%,#f2f7fd_100%)] px-4 py-3.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Contexto IMOB</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-900">Resumo do intake</p>
          </div>
          <span className="mt-0.5 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-900 shadow-sm">
            Piloto controlado
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {state === "loading" ? (
          <WorkbenchPanelCard tone="muted">
            <p className="text-sm font-medium text-slate-900">Carregando contexto do intake...</p>
            <p className="mt-2 text-[12px] text-slate-600">
              Assim que o payload real estiver disponível, o painel atualiza resumo, referências mascaradas e destinos seguros.
            </p>
          </WorkbenchPanelCard>
        ) : null}

        {state === "error" ? (
          <WorkbenchPanelCard tone="danger">
            <p className="text-sm font-medium text-rose-800">Falha ao carregar o contexto do intake.</p>
            <p className="mt-2 text-[12px] text-rose-700">
              {errorMessage ?? "Tente continuar pelo histórico do chat ou reenviar a ação que originou o payload."}
            </p>
          </WorkbenchPanelCard>
        ) : null}

        {state === "empty" ? (
          <WorkbenchPanelCard tone="muted">
            <p className="text-sm font-medium text-slate-900">Sem intake ativo</p>
            <p className="mt-2 text-[12px] text-slate-600">
              Inicie uma conversa no chat para ver o resumo do intake aqui.
            </p>
          </WorkbenchPanelCard>
        ) : null}

        {state === "ready" && intakeContext ? (
          <>
            <ImobIntakeSummaryPanel
              title={intakeContext.kind === "draft" ? "Intake em revisão" : "Intake confirmado"}
              subtitle={intakeContext.threadLabel ? `Thread: ${intakeContext.threadLabel}` : "Contexto do intake atual"}
              stageLabel={humanStageLabel(intakeContext.stage)}
              statusLabel={humanStatusLabel(intakeContext.status)}
              nextStep={intakeContext.nextStep}
              pendingItems={intakeContext.pendingItems}
              riskFlags={intakeContext.riskFlags}
              documentHash={intakeContext.documentHash}
              documentKind={intakeContext.documentKind}
              draftExpiresAt={intakeContext.draftExpiresAt}
              extractedFields={intakeContext.extractedFields}
            />

            <WorkbenchPanelCard eyebrow="Referências seguras" tone="accent">
              <p className="mt-2 text-[12px] text-slate-600">
                Identificadores exibidos de forma parcial para facilitar leitura operacional sem expor dados sensíveis.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                {threadRef ? <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 font-mono text-cyan-900">thread {threadRef}</span> : null}
                {caseRef ? <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 font-mono text-cyan-900">case {caseRef}</span> : null}
                {runRef ? <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 font-mono text-cyan-900">run {runRef}</span> : null}
                {draftRef ? <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 font-mono text-cyan-900">draft {draftRef}</span> : null}
              </div>
            </WorkbenchPanelCard>

            <WorkbenchPanelCard eyebrow="Exportação" tone="default">
              <p className="mt-2 text-[12px] text-slate-600">
                Os botões abaixo reutilizam o client já existente para HTML, DOCX e orientação de PDF.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleExport("html")}
                  disabled={!intakeContext.runId || exportStatus.html === "loading"}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportStatus.html === "loading" ? "..." : "Exportar HTML"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("docx")}
                  disabled={!intakeContext.runId || exportStatus.docx === "loading"}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportStatus.docx === "loading" ? "..." : "Exportar DOCX"}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePdfGuidance()}
                  disabled={!intakeContext.runId}
                  className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm transition hover:border-slate-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Orientação PDF
                </button>
              </div>
              {pdfGuidanceMsg ? <p className="mt-3 text-[12px] text-slate-600">{pdfGuidanceMsg}</p> : null}
              {exportStatus.html === "error" ? <p className="mt-2 text-[12px] text-rose-700">Falha ao exportar HTML.</p> : null}
              {exportStatus.docx === "error" ? <p className="mt-2 text-[12px] text-rose-700">Falha ao exportar DOCX.</p> : null}
            </WorkbenchPanelCard>

            <WorkbenchPanelCard eyebrow="Navegação" tone="muted">
              <p className="mt-2 text-[12px] text-slate-600">
                Links exibidos somente quando o payload atual fornece rota e parâmetros já suportados pelas superfícies existentes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {commandCenterHref ? (
                  <a
                    href={commandCenterHref}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    {commandCenterLabel}
                  </a>
                ) : null}
                {funnelHref ? (
                  <a
                    href={funnelHref}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    {funnelLabel}
                  </a>
                ) : null}
                {runArchiveHref ? (
                  <a
                    href={runArchiveHref}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    {runArchiveLabel}
                  </a>
                ) : null}
              </div>
              {!runArchiveHref ? (
                <p className="mt-3 text-[12px] text-slate-600">
                  Dossiê indisponível neste piloto. Ainda não há rota frontend segura dedicada para essa abertura contextual.
                </p>
              ) : null}
              {!commandCenterHref && !funnelHref && !runArchiveHref ? (
                <p className="mt-3 text-[12px] text-slate-600">
                  Nenhum destino de navegação disponível no payload atual. O painel permanece informativo até que um contexto navegável seja emitido.
                </p>
              ) : null}
            </WorkbenchPanelCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ImobWorkbenchContextPanel;
