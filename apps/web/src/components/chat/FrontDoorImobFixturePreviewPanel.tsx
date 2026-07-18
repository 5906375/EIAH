import React from "react";

import { ChatVerticalHandoffSurface } from "./ChatVerticalHandoffSurface";
import {
  IMOB_FRONTDOOR_FIXTURE_PREVIEW_ROUTE,
  imobPilot2FixturePreview,
  type ImobPilot2FixturePreview,
} from "../../features/imob/imobPilot2FixturePreview";

type FrontDoorImobFixturePreviewPanelProps = {
  preview?: ImobPilot2FixturePreview;
};

function PreviewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function FrontDoorImobFixturePreviewPanel({
  preview = imobPilot2FixturePreview,
}: FrontDoorImobFixturePreviewPanelProps) {
  return (
    <section
      aria-label="Preview IMOB não operacional"
      className="mt-6 rounded-2xl border border-amber-300/25 bg-surface/85 p-5 shadow-lg shadow-black/15"
      data-entry-route={IMOB_FRONTDOOR_FIXTURE_PREVIEW_ROUTE}
      data-fixture-id={preview.fixtureId}
    >
      <div
        role="status"
        className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        Preview IMOB não operacional
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">Front Door EIAH</p>
          <h3 className="mt-1 text-xl font-display font-semibold text-foreground">Resultado visual IMOB read-only</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Fixture sintética/sanitizada exibida em `/app/chat` para anunciar handoff IMOB sem criar chat paralelo.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
          IMOB
        </span>
      </div>

      <div className="mt-4">
        <ChatVerticalHandoffSurface snapshot={preview.handoffSnapshot} />
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <PreviewField label="Fixture" value={preview.fixtureId} />
        <PreviewField label="Origem" value={preview.sourceFixturePath} />
        <PreviewField
          label="Dados"
          value={preview.dataPolicy.syntheticOnly && preview.dataPolicy.sanitized ? "Sintéticos e sanitizados" : "Restrito"}
        />
      </dl>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div
          aria-label={preview.hitlGateState.accessibilityLabel}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            HITL gate read-only
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <PreviewField label="Estado" value={preview.hitlGateState.approvalState} />
            <PreviewField label="ReasonCode" value={preview.hitlGateState.reasonCode} />
            <PreviewField label="RiskLevel" value={preview.hitlGateState.riskLevel} />
            <PreviewField label="Ações permitidas" value={preview.hitlGateState.allowedUserActions.join(", ")} />
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{preview.hitlGateState.message}</p>
        </div>

        <div
          aria-label={preview.proofReceiptBundleState.accessibilityLabel}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Proof/receipt/bundle state read-only
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <PreviewField label="ProofStatus" value={preview.proofReceiptBundleState.proofStatus} />
            <PreviewField label="ReasonCode" value={preview.proofReceiptBundleState.reasonCode} />
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Nenhum receipt, bundle, proof, ledger ou referência produtiva é gerado nesta superfície.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/15 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">ReasonCodes</p>
          <ul className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {preview.reasonCodes.map((reasonCode) => (
              <li key={reasonCode} className="break-words rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {reasonCode}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/15 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Boundaries</p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {preview.boundaries.map((boundary) => (
              <li key={boundary} className="break-words rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {boundary}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default FrontDoorImobFixturePreviewPanel;
