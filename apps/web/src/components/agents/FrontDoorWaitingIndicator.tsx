import React from "react";

/**
 * Indicador de espera do Front Door: a solicitação está em andamento e o resultado ainda não chegou.
 * Só apresentação, sem regra: quem decide quando aparece é o estado compartilhado de trabalho pendente (lib/frontDoorPendingWork), igual para qualquer agente ou vertical.
 * O texto é estático (só a opacidade pulsa, via CSS), então o leitor de tela anuncia uma vez e não a cada pulsação.
 */
export const FRONT_DOOR_WAITING_LABEL = "Buscando informação...";

const FrontDoorWaitingIndicator = React.forwardRef<HTMLDivElement>(function FrontDoorWaitingIndicator(_props, ref) {
  return (
    <div ref={ref} role="status" data-testid="front-door-waiting" className="front-door-waiting max-w-[85%] px-4 py-3 text-sm text-muted-foreground">
      <span className="front-door-waiting-label">{FRONT_DOOR_WAITING_LABEL}</span>
    </div>
  );
});

export default FrontDoorWaitingIndicator;
