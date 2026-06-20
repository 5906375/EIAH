import React from "react";
import { VerticalWorkbenchShell } from "@/features/workbench/VerticalWorkbenchShell";

type Props = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  contextPanel: React.ReactNode;
  isContextPanelOpen: boolean;
  onToggleContextPanel: () => void;
};

export function ImobWorkbenchShell({
  sidebar,
  main,
  contextPanel,
  isContextPanelOpen,
  onToggleContextPanel,
}: Props) {
  const shellCopy = {
    eyebrow: "IMOB Product Shell",
    title: "Document Intake / IMOB v2.1",
    description: "Workspace dedicado para intake documental, validação contextual e exportação segura sem expor dados sensíveis.",
    helperText: "Chat central, quick actions e painel contextual continuam orientados por payload real e contratos já existentes.",
    productTagline: "Experiência SaaS clara para a vertical IMOB",
    backHref: "/app/imob/dashboard?cc=open#command-center",
    backLabel: "Voltar ao Command Center",
    verticalLabel: "IMOB",
    statusLabel: "Piloto controlado",
    panelToggleLabel: "Resumo do intake",
    heroHighlights: [
      { eyebrow: "Experiência", value: "Shell imersivo" },
      { eyebrow: "Painel lateral", value: "Resumo render-only" },
    ],
  } as const;

  return (
    <VerticalWorkbenchShell
      sidebar={sidebar}
      main={main}
      contextPanel={contextPanel}
      isContextPanelOpen={isContextPanelOpen}
      onToggleContextPanel={onToggleContextPanel}
      eyebrow={shellCopy.eyebrow}
      title={shellCopy.title}
      description={shellCopy.description}
      helperText={shellCopy.helperText}
      productTagline={shellCopy.productTagline}
      backHref={shellCopy.backHref}
      backLabel={shellCopy.backLabel}
      verticalLabel={shellCopy.verticalLabel}
      statusLabel={shellCopy.statusLabel}
      panelToggleLabel={shellCopy.panelToggleLabel}
      heroHighlights={shellCopy.heroHighlights}
    />
  );
}

export default ImobWorkbenchShell;
