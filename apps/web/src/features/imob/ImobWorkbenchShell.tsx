import React from "react";
import { VerticalWorkbenchShell } from "@/features/workbench/VerticalWorkbenchShell";

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  contextPanel: React.ReactNode;
  isContextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  onBackClick?: () => void;
};

export function ImobWorkbenchShell({
  sidebar,
  main,
  contextPanel,
  isContextPanelOpen,
  onToggleContextPanel,
  onBackClick,
}: Props) {
  const shellCopy = {
    eyebrow: "IMOB Product Shell",
    title: "Document Intake / IMOB v2.1",
    description: "Workspace dedicado para intake documental, validação contextual e exportação segura sem expor dados sensíveis.",
    helperText: "Chat central, quick actions e painel contextual continuam orientados por payload real e contratos já existentes.",
    productTagline: "Experiência SaaS clara para a vertical IMOB",
    backLabel: "Voltar",
    verticalLabel: "IMOB",
    statusLabel: "Contexto IMOB",
    panelToggleLabel: "Resumo do intake",
  } as const;

  return (
    <VerticalWorkbenchShell
      sidebar={sidebar}
      main={main}
      contextPanel={contextPanel}
      isContextPanelOpen={isContextPanelOpen}
      onToggleContextPanel={onToggleContextPanel}
      onBackClick={onBackClick}
      eyebrow={shellCopy.eyebrow}
      title={shellCopy.title}
      description={shellCopy.description}
      helperText={shellCopy.helperText}
      productTagline={shellCopy.productTagline}
      backLabel={shellCopy.backLabel}
      verticalLabel={shellCopy.verticalLabel}
      statusLabel={shellCopy.statusLabel}
      panelToggleLabel={shellCopy.panelToggleLabel}
    />
  );
}

export default ImobWorkbenchShell;
