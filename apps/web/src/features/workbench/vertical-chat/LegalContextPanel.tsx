import React from "react";
import { WorkbenchPanelCard } from "@/features/workbench/WorkbenchPanelCard";

type Props = {
  specialistAvailable?: boolean;
};

export function LegalContextPanel({ specialistAvailable = false }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f8ff_100%)] px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Contexto Jurídico</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.02em] text-slate-900">
              Análise jurídica
            </p>
            <p className="mt-1 text-[12px] text-slate-500">
              Painel contextual da vertical LEGAL.
            </p>
          </div>
          <span
            className="mt-0.5 shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] shadow-sm"
            style={{
              borderColor: "rgba(127,119,221,0.4)",
              backgroundColor: "rgba(127,119,221,0.08)",
              color: "#5c56b0",
            }}
          >
            LEGAL
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <WorkbenchPanelCard tone="muted">
          <div className="flex flex-col items-start gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border"
              style={{
                borderColor: "rgba(127,119,221,0.3)",
                backgroundColor: "rgba(127,119,221,0.06)",
              }}
              aria-hidden="true"
            >
              <span className="text-[15px]">⚖</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Análise jurídica</p>
              <p className="mt-2 text-[12px] leading-5 text-slate-600">
                Envie um contrato, cláusula ou documento jurídico para iniciar a análise.
              </p>
            </div>
          </div>
        </WorkbenchPanelCard>

        {specialistAvailable ? (
          <WorkbenchPanelCard eyebrow="Especialista disponível" tone="accent">
            <p className="text-[13px] font-medium text-slate-900">J-360 — Agente Jurídico</p>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-600">
              Análise de contratos e documentos jurídicos.
            </p>
          </WorkbenchPanelCard>
        ) : null}
      </div>
    </div>
  );
}

export default LegalContextPanel;
