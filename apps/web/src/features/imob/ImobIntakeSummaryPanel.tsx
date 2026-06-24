import React from "react";
import { WorkbenchPanelCard } from "@/features/workbench/WorkbenchPanelCard";

export type ImobIntakeSummaryPanelProps = {
  title: string;
  subtitle: string;
  stageLabel: string;
  statusLabel: string;
  nextStep: string | null;
  pendingItems: string[];
  riskFlags: string[];
  documentHash: string;
  documentKind?: string | null;
  draftExpiresAt?: string | null;
  extractedFields?: Array<{ label: string; value: string; masked: true }>;
};

function formatExpiry(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "Prazo indisponível";
  return `Expira em ${parsed.toLocaleString("pt-BR")}`;
}

export function ImobIntakeSummaryPanel({
  title,
  subtitle,
  stageLabel,
  statusLabel,
  nextStep,
  pendingItems,
  riskFlags,
  documentHash,
  documentKind,
  draftExpiresAt,
  extractedFields = [],
}: ImobIntakeSummaryPanelProps) {
  return (
    <div className="space-y-3">
      <WorkbenchPanelCard eyebrow={title} title={subtitle} tone="default">
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 shadow-sm">
            {stageLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
            {statusLabel}
          </span>
        </div>
        {nextStep ? (
          <div className="mt-3 rounded-[14px] border border-slate-200 bg-slate-50/75 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Próximo passo</p>
            <p className="mt-1 text-[12px] text-slate-700">{nextStep}</p>
          </div>
        ) : null}
        {(documentKind || draftExpiresAt) ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
            {documentKind ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Documento: {documentKind}</span> : null}
            {draftExpiresAt ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{formatExpiry(draftExpiresAt)}</span> : null}
          </div>
        ) : null}
      </WorkbenchPanelCard>

      <WorkbenchPanelCard eyebrow="Documento processado" tone="muted">
        <div className="rounded-[14px] border border-white/70 bg-white/78 px-3 py-2.5">
          <p className="font-mono text-[11px] text-slate-800">{documentHash.slice(0, 24)}…</p>
          <p className="mt-1 text-[11px] text-slate-500">Hash parcial exibido para manter a visualização mascarada.</p>
        </div>
      </WorkbenchPanelCard>

      <WorkbenchPanelCard eyebrow="Dados extraídos mascarados" tone="default">
        {extractedFields.length > 0 ? (
          <div className="space-y-1.5">
            {extractedFields.map((field) => (
              <div key={field.label} className="rounded-[14px] border border-slate-200 bg-slate-50/82 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{field.label}</p>
                <p className="mt-1 text-[12px] text-slate-900">{field.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">Sem dados mascarados adicionais no payload atual.</p>
        )}
      </WorkbenchPanelCard>

      <WorkbenchPanelCard eyebrow="Alertas e pendências" tone="default">
        {riskFlags.length > 0 ? (
          <ul className="space-y-1.5 text-[12px] text-rose-700">
            {riskFlags.map((flag) => (
              <li key={flag}>⚠ {flag}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-slate-500">Sem alertas de risco no payload atual.</p>
        )}
        {pendingItems.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5 text-[12px] text-slate-800">
            {pendingItems.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-slate-500">Nenhuma pendência listada no payload atual.</p>
        )}
      </WorkbenchPanelCard>
    </div>
  );
}

export default ImobIntakeSummaryPanel;
