import React from "react";

/**
 * Indicador de espera do Front Door: a solicitação está em andamento e o resultado ainda não chegou.
 * Só apresentação, sem regra: quem decide quando aparece é o estado compartilhado de trabalho pendente (lib/frontDoorPendingWork), igual para qualquer agente ou vertical.
 * O texto é estático (só a opacidade pulsa, via CSS), então o leitor de tela anuncia uma vez e não a cada pulsação.
 * Quando há uma execução acompanhada, as ações (cancelar a execução, parar de aguardar) ficam FORA da região de status, logo abaixo do texto.
 */
export const FRONT_DOOR_WAITING_LABEL = "Buscando informação...";

export type FrontDoorWaitingAction = { label: string; onClick: () => void; disabled?: boolean };

const FrontDoorWaitingIndicator = React.forwardRef<HTMLDivElement, { actions?: FrontDoorWaitingAction[]; note?: string }>(function FrontDoorWaitingIndicator(
  { actions, note },
  ref,
) {
  const status = (
    <div role="status" data-testid="front-door-waiting" className="front-door-waiting max-w-[85%] px-4 py-3 text-sm text-muted-foreground">
      <span className="front-door-waiting-label">{FRONT_DOOR_WAITING_LABEL}</span>
    </div>
  );
  if (!actions?.length && !note) return React.cloneElement(status, { ref } as React.Attributes);
  return (
    <div ref={ref} data-testid="front-door-waiting-group">
      {status}
      {note ? <p className="max-w-[85%] px-4 pb-1 text-xs text-muted-foreground" data-testid="front-door-waiting-note">{note}</p> : null}
      {actions?.length ? (
        <div className="flex max-w-[85%] flex-wrap gap-2 px-4 pb-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default FrontDoorWaitingIndicator;
