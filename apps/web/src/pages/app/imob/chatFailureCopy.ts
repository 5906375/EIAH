// Linguagem das falhas de turno no chat IMOB (P10-F). Antes, TODA falha (sessão expirada, recusa de permissão, erro de
// servidor, rede) aparecia como "restrição de segurança", sem explicação. Agora a mensagem descreve a causa provável sem
// inventar o motivo; o detalhe técnico segue em `reason` para diagnóstico e auditoria.

export type ChatTurnFailureKind = "turn" | "directed";

export type ChatTurnFailureCopy = {
  text: string;
  lines: string[];
  level: "high" | "medium";
  /** Detalhe técnico (não é texto de leitura): mantido para diagnóstico. */
  reason: string;
};

export function describeChatTurnFailure(error: unknown, kind: ChatTurnFailureKind, fallbackReason: string): ChatTurnFailureCopy {
  const status = typeof (error as { status?: unknown } | null)?.status === "number" ? ((error as { status: number }).status) : null;
  const technical = error instanceof Error && error.message ? (status ? `${error.message} (${status})` : error.message) : fallbackReason;
  const what = kind === "directed" ? "preparar esta ação" : "continuar essa solicitação";
  if (status === 401) {
    return { text: `Sua sessão expirou e não consegui ${what}.`, lines: ["Entre novamente para continuar. Nada foi alterado."], level: "medium", reason: technical };
  }
  if (status === 403) {
    return {
      text: `Seu perfil não tem permissão para ${what} neste workspace.`,
      lines: ["O servidor recusou este passo. Se você deveria poder fazê-lo, peça a um responsável do workspace."],
      level: "high",
      reason: technical,
    };
  }
  if (status !== null && status >= 400 && status < 500) {
    return {
      text: `Não consegui ${what}.`,
      lines: ["O servidor não aceitou os dados desta etapa. Revise as informações e tente de novo."],
      level: "medium",
      reason: technical,
    };
  }
  return {
    text: `Não consegui ${what} agora.`,
    lines: ["Houve uma falha temporária ao processar esta etapa. Nada foi alterado. Tente novamente em instantes."],
    level: "medium",
    reason: technical,
  };
}
