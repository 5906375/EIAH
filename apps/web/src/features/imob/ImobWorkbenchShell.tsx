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
  return (
    <VerticalWorkbenchShell
      sidebar={sidebar}
      main={main}
      contextPanel={contextPanel}
      isContextPanelOpen={isContextPanelOpen}
      onToggleContextPanel={onToggleContextPanel}
      eyebrow="IMOB Conversation Workbench"
      title="Document Intake / IMOB v2.1"
      description=""
      helperText=""
      verticalLabel="IMOB"
      statusLabel="Piloto controlado"
    />
  );
}

export default ImobWorkbenchShell;
