// Operações transacionais de D6 — confirmação humana. Ver
// CONSULTATION_ORIGIN_AUTHZ_v2.md seção 22, especialmente 22.2 (protocolo de
// concorrência) e 22.7 (integração com o encaminhamento).
//
// Ordem de travas, sempre: SignalForwardRequest primeiro (via
// `SELECT ... FOR UPDATE`, que localiza e trava no mesmo instante — nunca
// uma leitura solta revalidada depois), HumanConfirmation depois, quando já
// existente. Nenhuma operação aqui publica na fila, chama o LLM ou provisiona
// agentes.
import { Prisma, prismaGlobal, type PrismaClient, type TransactableClient } from "@repo/db";
import { recordGuardrailAudit } from "@eiah/core";
import { createRunRecord } from "../runs";
import { WorkspaceAgentAssignmentError } from "../workspaceAgentAssignments";
import type { RadarSignalResultV1 } from "./radarSignalResultValidator";
import { generateSuggestedPrompt, SUGGESTED_PROMPT_RULE_VERSION } from "./suggestedPromptGenerator";
import {
  HumanConfirmationError,
  HUMAN_CONFIRMATION_CONTRACT_VERSION,
  computeExpiresAt,
  reasonCodeForSubjectAuthorizationOutcome,
  type ConfirmedPayloadSnapshot,
  type HumanConfirmationDraftFields,
  type SubjectAuthorizationResolver,
} from "./humanConfirmationContract";

// Pontos de instrumentação EXCLUSIVOS de teste (concorrência controlada via
// barreiras, nunca sleep/atraso arbitrário) — mesmo padrão real já usado em
// `ForwardSignalTestHooks` (signalForwardingService.ts). No fluxo real,
// `hooks` é sempre omitido.
export interface HumanConfirmationTestHooks {
  afterLockAcquired?: () => Promise<void>;
  afterWindowInsert?: () => Promise<void>;
  afterRunCreate?: () => Promise<void>;
}

interface SignalForwardRequestLockedRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  activeHumanConfirmationId: string | null;
  concludedHumanConfirmationId: string | null;
  destinationRunId: string | null;
  requestedByUserId: string | null;
  status: string;
  originSnapshot: unknown;
  sourceRunId: string;
  destinationAgent: string;
}

async function lockSignalForwardRequest(
  tx: TransactableClient,
  params: { id: string; tenantId: string; workspaceId: string }
): Promise<SignalForwardRequestLockedRow | null> {
  const rows = await tx.$queryRaw<SignalForwardRequestLockedRow[]>(Prisma.sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      active_human_confirmation_id AS "activeHumanConfirmationId",
      concluded_human_confirmation_id AS "concludedHumanConfirmationId",
      destination_run_id AS "destinationRunId",
      requested_by_user_id AS "requestedByUserId",
      status,
      origin_snapshot AS "originSnapshot",
      source_run_id AS "sourceRunId",
      destination_agent AS "destinationAgent"
    FROM signal_forward_requests
    WHERE id = ${params.id} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function fail(reasonCode: string, context: Record<string, unknown> = {}): never {
  throw new HumanConfirmationError(reasonCode, context);
}

function assertRequester(row: SignalForwardRequestLockedRow, confirmedIdentity: string) {
  if (row.requestedByUserId !== confirmedIdentity) {
    fail("only_requester_can_act", { requestedByUserId: row.requestedByUserId });
  }
}

async function assertSubjectAuthorized(
  resolver: SubjectAuthorizationResolver,
  params: {
    confirmedIdentity: string;
    tenantId: string;
    workspaceId: string;
    originSnapshot: unknown;
    operation: "view" | "edit" | "confirm" | "recover";
  }
) {
  const radarSignal = params.originSnapshot as RadarSignalResultV1;
  const outcome = await resolver({
    confirmedIdentity: params.confirmedIdentity,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    subjectType: radarSignal.subject.subjectType,
    subjectId: radarSignal.subject.subjectId,
    operation: params.operation,
  });
  const reasonCode = reasonCodeForSubjectAuthorizationOutcome(outcome);
  if (reasonCode) {
    fail(reasonCode, { outcome });
  }
}

export interface CreateConfirmationWindowResult {
  humanConfirmationId: string;
  signalForwardRequestId: string;
  status: string;
  revision: number;
  suggestedPrompt: string;
  expiresAt: Date;
}

/**
 * Abre (ou reabre, depois de expirar/cancelar) a janela de confirmação de um
 * encaminhamento. Só o `requestedByUserId` do encaminhamento pode abrir —
 * política ratificada (V1). Bloqueia se já houver janela ativa, confirmação
 * concluída, ou (encaminhamento legado) um Run já existente sem confirmação.
 */
export async function createConfirmationWindow(
  db: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    signalForwardRequestId: string;
    confirmedIdentity: string;
    subjectAuthorizationResolver: SubjectAuthorizationResolver;
  },
  hooks: HumanConfirmationTestHooks = {}
): Promise<CreateConfirmationWindowResult> {
  return db.$transaction(async (tx) => {
    const forward = await lockSignalForwardRequest(tx, {
      id: params.signalForwardRequestId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    });
    if (hooks.afterLockAcquired) await hooks.afterLockAcquired();
    if (!forward) fail("signal_forward_request_not_found_in_scope");

    assertRequester(forward, params.confirmedIdentity);

    if (forward.destinationRunId) {
      fail("legacy_run_without_human_confirmation", { destinationRunId: forward.destinationRunId });
    }
    if (forward.concludedHumanConfirmationId) {
      fail("confirmation_already_concluded", { humanConfirmationId: forward.concludedHumanConfirmationId });
    }
    if (forward.activeHumanConfirmationId) {
      fail("active_confirmation_window_already_exists", { humanConfirmationId: forward.activeHumanConfirmationId });
    }

    await assertSubjectAuthorized(params.subjectAuthorizationResolver, {
      confirmedIdentity: params.confirmedIdentity,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      originSnapshot: forward.originSnapshot,
      operation: "view",
    });

    const radarSignal = forward.originSnapshot as RadarSignalResultV1;
    const suggestedPrompt = generateSuggestedPrompt(radarSignal);
    const createdAt = new Date();
    const expiresAt = computeExpiresAt(createdAt);

    const created = await tx.humanConfirmation.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        signalForwardRequestId: forward.id,
        status: "awaiting_human_completion",
        revision: 0,
        suggestedPrompt,
        suggestedPromptRuleVersion: SUGGESTED_PROMPT_RULE_VERSION,
        humanConfirmationContractVersion: HUMAN_CONFIRMATION_CONTRACT_VERSION,
        expiresAt,
      },
    });

    if (hooks.afterWindowInsert) await hooks.afterWindowInsert();

    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE signal_forward_requests
      SET active_human_confirmation_id = ${created.id}
      WHERE id = ${forward.id}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND active_human_confirmation_id IS NULL
        AND concluded_human_confirmation_id IS NULL
        AND destination_run_id IS NULL
    `);
    if (affected === 0) {
      // Defesa em profundidade: sob a trava adquirida em lockSignalForwardRequest,
      // isto não deveria poder falhar — se falhar, algo violou o protocolo.
      fail("active_confirmation_window_already_exists");
    }

    return {
      humanConfirmationId: created.id,
      signalForwardRequestId: forward.id,
      status: created.status,
      revision: created.revision,
      suggestedPrompt: created.suggestedPrompt,
      expiresAt: created.expiresAt,
    };
  });
}

export interface SaveDraftRevisionResult {
  humanConfirmationId: string;
  revision: number;
}

/**
 * Grava uma edição do rascunho, condicionada à revisão esperada e ao estado
 * `awaiting_human_completion`. Não toca `SignalForwardRequest` — por isso
 * precisa da própria guarda de `revision`+`status` (não compete pela trava
 * de `SignalForwardRequest`, seção 22.2).
 */
export async function saveDraftRevision(
  db: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    humanConfirmationId: string;
    expectedRevision: number;
    confirmedIdentity: string;
    draft: HumanConfirmationDraftFields;
    subjectAuthorizationResolver: SubjectAuthorizationResolver;
  }
): Promise<SaveDraftRevisionResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.humanConfirmation.findFirst({
      where: { id: params.humanConfirmationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { id: true, signalForwardRequestId: true },
    });
    if (!existing) fail("human_confirmation_not_found_in_scope");

    const forward = await tx.signalForwardRequest.findFirst({
      where: { id: existing.signalForwardRequestId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { requestedByUserId: true, originSnapshot: true },
    });
    if (!forward) fail("signal_forward_request_not_found_in_scope");

    if (forward.requestedByUserId !== params.confirmedIdentity) {
      fail("only_requester_can_act", { requestedByUserId: forward.requestedByUserId });
    }

    await assertSubjectAuthorized(params.subjectAuthorizationResolver, {
      confirmedIdentity: params.confirmedIdentity,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      originSnapshot: forward.originSnapshot,
      operation: "edit",
    });

    const draftChannels: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      params.draft.channels === undefined ? Prisma.JsonNull : (params.draft.channels as Prisma.InputJsonValue);

    const rows = await tx.$queryRaw<Array<{ revision: number }>>(Prisma.sql`
      UPDATE human_confirmations
      SET
        revision = revision + 1,
        draft_final_prompt = ${params.draft.finalPrompt ?? null},
        draft_objective = ${params.draft.objective ?? null},
        draft_audience = ${params.draft.audience ?? null},
        draft_channels = ${params.draft.channels === undefined ? null : JSON.stringify(params.draft.channels)}::jsonb,
        draft_budget = ${params.draft.budget ?? null},
        draft_tone_profile = ${params.draft.toneProfile ?? null},
        draft_tone_notes = ${params.draft.toneNotes ?? null},
        draft_launch_date = ${params.draft.launchDate ?? null},
        draft_deadline = ${params.draft.deadline ?? null}
      WHERE id = ${params.humanConfirmationId}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND revision = ${params.expectedRevision}
        AND status = 'awaiting_human_completion'
      RETURNING revision
    `);
    void draftChannels;

    if (rows.length === 0) {
      fail("confirmation_revision_conflict", { expectedRevision: params.expectedRevision });
    }

    return { humanConfirmationId: params.humanConfirmationId, revision: rows[0].revision };
  });
}

export interface CloseWindowResult {
  humanConfirmationId: string;
  status: "cancelled_by_human" | "expired";
}

/**
 * Cancela (ação humana) ou expira (TTL) uma janela ativa. Trava
 * `SignalForwardRequest` primeiro; revalida que o ponteiro ainda aponta para
 * esta janela antes de tocar `HumanConfirmation` — impede que uma operação
 * atrasada sobre uma janela antiga afete uma janela nova (seção 22.2.1).
 */
export async function closeConfirmationWindow(
  db: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    signalForwardRequestId: string;
    humanConfirmationId: string;
    reason: "cancelled_by_human" | "expired";
    confirmedIdentity?: string; // exigido só para cancelamento humano
  }
): Promise<CloseWindowResult> {
  return db.$transaction(async (tx) => {
    const forward = await lockSignalForwardRequest(tx, {
      id: params.signalForwardRequestId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    });
    if (!forward) fail("signal_forward_request_not_found_in_scope");

    if (params.reason === "cancelled_by_human") {
      if (!params.confirmedIdentity || forward.requestedByUserId !== params.confirmedIdentity) {
        fail("only_requester_can_act", { requestedByUserId: forward.requestedByUserId });
      }
    }

    if (forward.activeHumanConfirmationId !== params.humanConfirmationId) {
      // Operação atrasada sobre janela antiga (já substituída ou nunca ativa) —
      // nenhum efeito, nem sobre a janela referenciada nem sobre a atual.
      fail("stale_confirmation_window", { activeHumanConfirmationId: forward.activeHumanConfirmationId });
    }

    const closedRows = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      UPDATE human_confirmations
      SET status = ${params.reason}
      WHERE id = ${params.humanConfirmationId}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND status = 'awaiting_human_completion'
      RETURNING status
    `);
    if (closedRows.length === 0) {
      fail("confirmation_not_awaiting_completion");
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE signal_forward_requests
      SET active_human_confirmation_id = NULL
      WHERE id = ${params.signalForwardRequestId}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND active_human_confirmation_id = ${params.humanConfirmationId}
    `);

    return { humanConfirmationId: params.humanConfirmationId, status: params.reason };
  });
}

export interface ConfirmHumanConfirmationResult {
  humanConfirmationId: string;
  signalForwardRequestId: string;
  destinationRunId: string;
  status: "concluded";
  confirmedAt: Date;
  reused: boolean;
}

/**
 * Conclui a confirmação: valida a revisão persistida (sem novos campos
 * editáveis no corpo), cria o Run, grava o snapshot e associa os registros —
 * tudo numa única transação. `operationKey` identifica a operação para
 * recuperação idempotente (seção 22.3).
 */
export async function confirmHumanConfirmation(
  db: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    signalForwardRequestId: string;
    humanConfirmationId: string;
    expectedRevision: number;
    operationKey: string;
    confirmedIdentity: string;
    subjectAuthorizationResolver: SubjectAuthorizationResolver;
  },
  hooks: HumanConfirmationTestHooks = {}
): Promise<ConfirmHumanConfirmationResult> {
  try {
    return await db.$transaction(
      async (tx) => {
      const forward = await lockSignalForwardRequest(tx, {
        id: params.signalForwardRequestId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });
      if (hooks.afterLockAcquired) await hooks.afterLockAcquired();
      if (!forward) fail("signal_forward_request_not_found_in_scope");

      assertRequester(forward, params.confirmedIdentity);

      // Réplica idempotente: esta janela já concluiu antes. Autorização do
      // sujeito (camada 4) revalidada antes de tocar confirmedPayloadSnapshot
      // ou devolver destinationRunId — mesmo contrato de recoverHumanConfirmation
      // (operation: "recover", seção 22.3: "nenhuma tentativa, nova ou repetida,
      // lê confirmedPayloadSnapshot antes da autorização atual ser confirmada").
      if (forward.concludedHumanConfirmationId === params.humanConfirmationId) {
        await assertSubjectAuthorized(params.subjectAuthorizationResolver, {
          confirmedIdentity: params.confirmedIdentity,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          originSnapshot: forward.originSnapshot,
          operation: "recover",
        });

        const already = await tx.humanConfirmation.findFirst({
          where: { id: params.humanConfirmationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          select: { confirmedPayloadSnapshot: true, confirmedAt: true },
        });
        const snapshot = already?.confirmedPayloadSnapshot as ConfirmedPayloadSnapshot | null | undefined;
        if (snapshot && snapshot.operationKey === params.operationKey) {
          if (!forward.destinationRunId) {
            fail("existing_confirmation_without_destination_run", { humanConfirmationId: params.humanConfirmationId });
          }
          return {
            humanConfirmationId: params.humanConfirmationId,
            signalForwardRequestId: forward.id,
            destinationRunId: forward.destinationRunId,
            status: "concluded" as const,
            confirmedAt: already!.confirmedAt as Date,
            reused: true,
          };
        }
        fail("confirmation_operation_key_conflict");
      }

      if (forward.concludedHumanConfirmationId) {
        // Outra janela (não esta) já concluiu — conflito genuíno, não réplica.
        fail("confirmation_already_concluded", { humanConfirmationId: forward.concludedHumanConfirmationId });
      }
      if (forward.destinationRunId) {
        fail("legacy_run_without_human_confirmation", { destinationRunId: forward.destinationRunId });
      }
      if (forward.activeHumanConfirmationId !== params.humanConfirmationId) {
        fail("stale_confirmation_window", { activeHumanConfirmationId: forward.activeHumanConfirmationId });
      }

      await assertSubjectAuthorized(params.subjectAuthorizationResolver, {
        confirmedIdentity: params.confirmedIdentity,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        originSnapshot: forward.originSnapshot,
        operation: "confirm",
      });

      const draft = await tx.humanConfirmation.findFirst({
        where: { id: params.humanConfirmationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      });
      if (!draft) fail("human_confirmation_not_found_in_scope");
      if (!draft.draftFinalPrompt || draft.draftFinalPrompt.trim().length === 0) {
        fail("confirmation_final_prompt_required");
      }
      if (!draft.draftObjective || draft.draftObjective.trim().length === 0) {
        fail("confirmation_objective_required");
      }

      const finalPrompt = draft.draftFinalPrompt;
      const objective = draft.draftObjective;
      const businessFields = {
        audience: draft.draftAudience ?? undefined,
        channels: (draft.draftChannels as string[] | null) ?? undefined,
        budget: draft.draftBudget ?? undefined,
        toneProfile: draft.draftToneProfile ?? undefined,
        toneNotes: draft.draftToneNotes ?? undefined,
        launchDate: draft.draftLaunchDate ?? undefined,
        deadline: draft.draftDeadline ?? undefined,
      };

      // Guarda condicionada ao vivo: revisão + status + TTL, avaliados com o
      // relógio real do PostgreSQL no instante desta escrita (nunca `now()`
      // de início de transação) — seção 22.3.
      const confirmedRows = await tx.$queryRaw<Array<{ confirmedAt: Date }>>(Prisma.sql`
        UPDATE human_confirmations
        SET status = 'concluded', confirmed_at = clock_timestamp(), confirmed_by_user_id = ${params.confirmedIdentity}
        WHERE id = ${params.humanConfirmationId}
          AND tenant_id = ${params.tenantId}
          AND workspace_id = ${params.workspaceId}
          AND revision = ${params.expectedRevision}
          AND status = 'awaiting_human_completion'
          AND expires_at >= clock_timestamp()
        RETURNING confirmed_at AS "confirmedAt"
      `);
      if (confirmedRows.length === 0) {
        // Distingue expirado de revisão desatualizada com uma leitura extra,
        // só para relatar o reasonCode certo — não afeta a atomicidade acima.
        const current = await tx.humanConfirmation.findFirst({
          where: { id: params.humanConfirmationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
          select: { status: true, revision: true, expiresAt: true },
        });
        if (current && current.status === "awaiting_human_completion" && current.expiresAt.getTime() < Date.now()) {
          fail("confirmation_window_expired");
        }
        fail("confirmation_revision_conflict", { expectedRevision: params.expectedRevision });
      }
      const confirmedAt = confirmedRows[0].confirmedAt;

      const snapshot: ConfirmedPayloadSnapshot = {
        humanConfirmationContractVersion: HUMAN_CONFIRMATION_CONTRACT_VERSION,
        radarSignal: forward.originSnapshot as Record<string, unknown>,
        suggestedPrompt: draft.suggestedPrompt,
        suggestedPromptRuleVersion: draft.suggestedPromptRuleVersion,
        finalPrompt,
        objective,
        ...businessFields,
        confirmedByUserId: params.confirmedIdentity,
        confirmedAt: confirmedAt.toISOString(),
        operationKey: params.operationKey,
        revision: params.expectedRevision,
      };

      await tx.humanConfirmation.update({
        where: { id: params.humanConfirmationId },
        data: { confirmedPayloadSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });

      const run = await createRunRecord({
        prisma: tx,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.confirmedIdentity,
        agent: forward.destinationAgent,
        status: "pending",
        request: {
          prompt: finalPrompt,
          metadata: {
            form: businessFields,
            signalForwardRequestId: forward.id,
            sourceRunId: forward.sourceRunId,
            humanConfirmationId: params.humanConfirmationId,
          },
        },
      });

      if (hooks.afterRunCreate) await hooks.afterRunCreate();

      await tx.$executeRaw(Prisma.sql`
        UPDATE signal_forward_requests
        SET concluded_human_confirmation_id = ${params.humanConfirmationId},
            active_human_confirmation_id = NULL,
            destination_run_id = ${run.id},
            status = 'dispatch_pending'
        WHERE id = ${forward.id} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
      `);

      return {
        humanConfirmationId: params.humanConfirmationId,
        signalForwardRequestId: forward.id,
        destinationRunId: run.id,
        status: "concluded" as const,
        confirmedAt,
        reused: false,
      };
      },
      { maxWait: 5000, timeout: 10000 }
    );
  } catch (e) {
    // captura FORA da transação, após o encerramento com rollback — mesmo
    // padrão já usado em signalForwardingService.ts::forwardSignalToMkt
    // antes de D6 (a criação do Run, e a checagem de atribuição do agente
    // que ela dispara, moveram-se para cá, seção 22.7).
    if (e instanceof WorkspaceAgentAssignmentError) {
      try {
        await recordGuardrailAudit({
          prisma: prismaGlobal,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          eventType: "signal_forward.agent_assignment_refused",
          severity: "warn",
          message: e.message,
          metadata: { reasonCode: e.reasonCode, rolledBack: true, humanConfirmationId: params.humanConfirmationId },
        });
      } catch {
        // Falha na gravação da auditoria NUNCA transforma a recusa em
        // autorização — o erro original é relançado de qualquer forma.
      }
    }
    throw e;
  }
}

export interface RecoverHumanConfirmationResult {
  humanConfirmationId: string;
  signalForwardRequestId: string;
  status: string;
  revision: number;
  destinationRunId: string | null;
  confirmedPayloadSnapshot: ConfirmedPayloadSnapshot | null;
}

/**
 * Recuperação idempotente/leitura de uma janela — pura leitura, sem trava de
 * escrita: dado concluído é imutável (seção 22.1/22.4); dado ainda ativo é
 * lido consistente sob READ COMMITTED. Autorização sempre reavaliada antes
 * de revelar qualquer conteúdo (seção 22.3/22.5).
 */
export async function recoverHumanConfirmation(
  db: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    humanConfirmationId: string;
    confirmedIdentity: string;
    subjectAuthorizationResolver: SubjectAuthorizationResolver;
  }
): Promise<RecoverHumanConfirmationResult> {
  const existing = await db.humanConfirmation.findFirst({
    where: { id: params.humanConfirmationId, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
  if (!existing) fail("human_confirmation_not_found_in_scope");

  const forward = await db.signalForwardRequest.findFirst({
    where: { id: existing.signalForwardRequestId, tenantId: params.tenantId, workspaceId: params.workspaceId },
    select: { requestedByUserId: true, originSnapshot: true, destinationRunId: true },
  });
  if (!forward) fail("signal_forward_request_not_found_in_scope");

  if (forward.requestedByUserId !== params.confirmedIdentity) {
    fail("only_requester_can_act", { requestedByUserId: forward.requestedByUserId });
  }

  await assertSubjectAuthorized(params.subjectAuthorizationResolver, {
    confirmedIdentity: params.confirmedIdentity,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    originSnapshot: forward.originSnapshot,
    operation: "recover",
  });

  return {
    humanConfirmationId: existing.id,
    signalForwardRequestId: existing.signalForwardRequestId,
    status: existing.status,
    revision: existing.revision,
    destinationRunId: existing.status === "concluded" ? forward.destinationRunId : null,
    confirmedPayloadSnapshot: (existing.confirmedPayloadSnapshot as unknown as ConfirmedPayloadSnapshot) ?? null,
  };
}
