// Contrato de D6 — confirmação humana (rascunho, revisão, snapshot, TTL e a
// interface obrigatória de autorização do sujeito). Ver
// CONSULTATION_ORIGIN_AUTHZ_v2.md seção 22.
//
// Só tipos/erros/constantes puras aqui — nenhuma operação transacional
// (isso vive em humanConfirmationService.ts) e nenhuma implementação real do
// resolvedor de sujeito (seção 22.5: só a interface entra nesta unidade).

export class HumanConfirmationError extends Error {
  constructor(readonly reasonCode: string, readonly context: Record<string, unknown> = {}) {
    super(`human_confirmation_invalid:${reasonCode}`);
    this.name = "HumanConfirmationError";
  }
}

// Análoga a FINGERPRINT_CONTRACT_VERSION (originContract.ts) — versiona o
// formato do confirmedPayloadSnapshot em si, não o RadarSignalResultV1
// (D5) nem o algoritmo de fingerprint (inalterados, seção 22.4/22.7).
export const HUMAN_CONFIRMATION_CONTRACT_VERSION = "human-confirmation.v1" as const;

// 7 dias corridos (168h), política ratificada — "Decisões ratificadas",
// "Aprovação de políticas de produto — confirmação humana D6 V1" (2026-09-12).
// Sem renovação por edição/recarga: sempre calculado a partir da criação da
// janela, nunca reiniciado.
export const CONFIRMATION_WINDOW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const HUMAN_CONFIRMATION_STATUSES = [
  "awaiting_human_completion",
  "cancelled_by_human",
  "expired",
  "concluded",
] as const;
export type HumanConfirmationStatus = (typeof HUMAN_CONFIRMATION_STATUSES)[number];

export const TERMINAL_HUMAN_CONFIRMATION_STATUSES: readonly HumanConfirmationStatus[] = [
  "cancelled_by_human",
  "expired",
  "concluded",
];

// Campos de negócio do rascunho (seção 10) — finalPrompt e objective são
// obrigatórios na confirmação; os demais, opcionais. channels é lista.
export interface HumanConfirmationDraftFields {
  finalPrompt?: string;
  objective?: string;
  audience?: string;
  channels?: string[];
  budget?: string;
  toneProfile?: string;
  toneNotes?: string;
  launchDate?: string;
  deadline?: string;
}

// Snapshot imutável gravado só na conclusão (seção 22.4) — cópia de tudo
// exibido + preenchido no instante da confirmação. `radarSignal` vem do
// `originSnapshot` do encaminhamento (D5), lido por referência, nunca por
// releitura direta da origem (seção 22.7).
export interface ConfirmedPayloadSnapshot {
  humanConfirmationContractVersion: string;
  radarSignal: Record<string, unknown>;
  suggestedPrompt: string;
  suggestedPromptRuleVersion: string;
  finalPrompt: string;
  objective: string;
  audience?: string;
  channels?: string[];
  budget?: string;
  toneProfile?: string;
  toneNotes?: string;
  launchDate?: string;
  deadline?: string;
  confirmedByUserId: string;
  confirmedAt: string;
  operationKey: string;
  revision: number;
}

// --- Interface obrigatória de autorização do sujeito (seção 22.5) ---------
//
// Só o contrato entra nesta unidade — nenhuma implementação real. Em
// produção, ninguém pode montar humanConfirmationService sem fornecer um
// resolvedor real (que não existe hoje); essa ausência É o bloqueio
// operacional. Substitutos controlados ficam exclusivamente em __tests__/.

export interface SubjectAuthorizationInput {
  confirmedIdentity: string; // authContext.userId — nunca do corpo
  tenantId: string; // authContext.tenantId
  workspaceId: string; // authContext.workspaceId
  subjectType: "internal_reference";
  subjectId: string; // lido do originSnapshot já validado (D5) — nunca solto do corpo
  operation: "view" | "edit" | "confirm" | "recover";
}

export const SUBJECT_AUTHORIZATION_OUTCOMES = [
  "authorized",
  "subject_not_found",
  "subject_out_of_scope",
  "access_denied",
  "resolver_unavailable",
  "resolution_failed",
] as const;
export type SubjectAuthorizationOutcome = (typeof SUBJECT_AUTHORIZATION_OUTCOMES)[number];

export type SubjectAuthorizationResolver = (
  input: SubjectAuthorizationInput
) => Promise<SubjectAuthorizationOutcome>;

// Todo outcome != "authorized" bloqueia, fail-closed, sem exceção — nenhum
// fallback permissivo. reasonCode dedicado por outcome, usado por
// humanConfirmationService.ts.
export function reasonCodeForSubjectAuthorizationOutcome(outcome: SubjectAuthorizationOutcome): string | null {
  if (outcome === "authorized") return null;
  return `subject_authorization_${outcome}`;
}

// --- Helpers puros de tempo/TTL (seção 22.3) ------------------------------
//
// O relógio autoritativo é sempre o do PostgreSQL (clock_timestamp()),
// obtido via SQL em humanConfirmationService.ts — estas funções só calculam
// o valor de expiresAt a partir de um instante já obtido do banco, nunca a
// partir de `new Date()` da aplicação.
export function computeExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CONFIRMATION_WINDOW_TTL_MS);
}
