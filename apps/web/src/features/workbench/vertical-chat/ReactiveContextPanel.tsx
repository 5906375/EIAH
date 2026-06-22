/**
 * Wrapper que não altera ImobWorkbenchContextPanel.
 * Redireciona para o painel correto pela vertical ativa.
 * Fallback sempre para IMOB — comportamento atual preservado.
 */
import React from "react";
import type { VerticalId } from "./VerticalChatTypes";
import { ImobWorkbenchContextPanel } from "@/features/imob/ImobWorkbenchContextPanel";
import { LegalContextPanel } from "./LegalContextPanel";
import type { ImobWorkbenchIntakeContext } from "@/features/imob/imobWorkbenchContext";

type ImobProps = {
  state: "loading" | "empty" | "error" | "ready";
  intakeContext: ImobWorkbenchIntakeContext | null;
  commandCenterHref?: string | null;
  funnelHref?: string | null;
  runArchiveHref?: string | null;
  errorMessage?: string | null;
};

type Props = {
  activeVerticalId: VerticalId;
  imobProps: ImobProps;
  legalSpecialistAvailable?: boolean;
};

export function ReactiveContextPanel({
  activeVerticalId,
  imobProps,
  legalSpecialistAvailable = false,
}: Props) {
  if (activeVerticalId === "legal") {
    return <LegalContextPanel specialistAvailable={legalSpecialistAvailable} />;
  }
  return <ImobWorkbenchContextPanel {...imobProps} />;
}

export default ReactiveContextPanel;
