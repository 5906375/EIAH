export interface RunAtivoEventBase {
  runId: string;
  traceId?: string | null;
  timestamp: number;
}

export interface RunAtivoInterpretedEvent extends RunAtivoEventBase {
  type: "runAtivo.interpreted";
}

export interface RunAtivoLandingGeneratedEvent extends RunAtivoEventBase {
  type: "runAtivo.landing.generated";
}

export interface RunAtivoPdfGeneratedEvent extends RunAtivoEventBase {
  type: "runAtivo.pdf.generated";
}

export interface RunAtivoAlertGeneratedEvent extends RunAtivoEventBase {
  type: "runAtivo.alert.generated";
}

export type RunAtivoEvents =
  | RunAtivoInterpretedEvent
  | RunAtivoLandingGeneratedEvent
  | RunAtivoPdfGeneratedEvent
  | RunAtivoAlertGeneratedEvent;
