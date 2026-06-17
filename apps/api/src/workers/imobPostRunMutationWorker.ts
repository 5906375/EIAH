// ImobPostRunMutationWorker — Phase 4.1c
//
// Consumes imobRunCompletedQueue jobs and applies governed ImobCase mutation
// after a confirmed run.completed success event.
//
// INVARIANTES:
// 1. ImobCase.status é decidido exclusivamente aqui — nunca no React.
// 2. simulated=true → nunca mutar.
// 3. run.status !== "success" → nunca mutar.
// 4. Sem caseId/actionId/tenantId/workspaceId válido → nunca mutar.
// 5. cross-workspace → updateCase retorna not_found → nunca mutar.
// 6. commission.settle sem ownerResponsible → registra blocked, não muta.
// 7. HIGH tier sem txId → registra blocked, não muta.
// 8. Idempotência: BullMQ jobId + DB check por runId antes de mutar.

import { Worker } from "bullmq";
import { prismaGlobal } from "@repo/db";
import { createLogger, bindLogger } from "@eiah/core";
import { getRedisConnection } from "@eiah/core/queue/connection";
import {
  IMOB_RUN_COMPLETED_QUEUE_NAME,
  type ImobRunCompletedJobPayload,
} from "../queues/imobRunCompletedQueue";
import { getRun } from "../services/runs";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import {
  buildImobCanonicalCase,
  shouldSkipImobPostRunMutationForSimulatedOutput,
} from "../services/imob/imobCanonical";
import { IMOB_DISPATCHER_ACTION_IDS } from "../services/imob/crm/imobCrmActionDispatcher";
import { incrementCounter, IMOB_WORKER_COUNTER } from "./imobWorkerMetrics";

const workerLogger = createLogger({ component: "imob-post-run-mutation-worker" });

// ─── Outcome matrix (Phase 4.1a) ─────────────────────────────────────────────

type ImobRunOutcome = {
  stage: string;
  status: string;
  nextStep: string | null;
  pendingItemsAdd: string[];
  pendingItemsRemove: string[];
  requiresTxId: boolean;
  isTerminal: boolean;
};

export const IMOB_RUN_OUTCOME_MAP: Record<string, ImobRunOutcome> = {
  "owner.register": {
    stage: "property_collecting",
    status: "ready_for_review",
    nextStep: "Cadastrar o imóvel do proprietário para avançar a captação",
    pendingItemsAdd: [],
    pendingItemsRemove: ["Proprietário pendente de cadastro", "Dados do proprietário ausentes"],
    requiresTxId: true,
    isTerminal: false,
  },
  "property.create": {
    stage: "campaign_preparing",
    status: "ready_for_review",
    nextStep: "Ativar anúncio do imóvel cadastrado para exposição ao mercado",
    pendingItemsAdd: ["Ativação do anúncio pendente"],
    pendingItemsRemove: ["Imóvel pendente de cadastro", "Dados do imóvel ausentes"],
    requiresTxId: true,
    isTerminal: false,
  },
  "listing.activate": {
    stage: "lead_matching",
    status: "ready_for_review",
    nextStep: "Aguardar retorno de leads do anúncio ativo e qualificar primeiro contato",
    pendingItemsAdd: [],
    pendingItemsRemove: ["Ativação do anúncio pendente", "Anúncio não publicado"],
    requiresTxId: false,
    isTerminal: false,
  },
  "lead.qualify": {
    stage: "visit_scheduling",
    status: "ready_for_review",
    nextStep: "Agendar visita do lead qualificado ao imóvel",
    pendingItemsAdd: [],
    pendingItemsRemove: ["Qualificação de lead pendente", "Lead sem perfil completo"],
    requiresTxId: false,
    isTerminal: false,
  },
  "visit.schedule": {
    stage: "proposal_preparing",
    status: "pending_data",
    nextStep: "Realizar a visita agendada e registrar o resultado para avançar à proposta",
    pendingItemsAdd: ["Resultado da visita pendente de registro"],
    pendingItemsRemove: ["Visita pendente de agendamento"],
    requiresTxId: false,
    isTerminal: false,
  },
  "documents.review": {
    stage: "documents_collecting",
    status: "pending_data",
    nextStep: "Cobrar documentos faltantes com as partes e reagendar entrega",
    pendingItemsAdd: ["Documentos aguardando entrega ou correção das partes"],
    pendingItemsRemove: ["Revisão documental pendente"],
    requiresTxId: false,
    isTerminal: false,
  },
  "documents.collect": {
    stage: "documents_collecting",
    status: "pending_data",
    nextStep: "Aguardar entrega da documentação solicitada pelas partes",
    pendingItemsAdd: ["Documentação solicitada aguardando entrega das partes"],
    pendingItemsRemove: ["Coleta de documentos não iniciada"],
    requiresTxId: false,
    isTerminal: false,
  },
  "proposal.create": {
    stage: "proposal_preparing",
    status: "ready_for_review",
    nextStep: "Apresentar proposta às partes e aguardar aceite para abrir negociação",
    pendingItemsAdd: ["Aceite da proposta pelas partes pendente"],
    pendingItemsRemove: ["Proposta comercial não elaborada"],
    requiresTxId: true,
    isTerminal: false,
  },
  "deal.review": {
    stage: "contract_preparing",
    status: "ready_for_review",
    nextStep: "Preparar o contrato com as condições acordadas na negociação",
    pendingItemsAdd: [],
    pendingItemsRemove: ["Revisão de negociação pendente", "Deal não revisado formalmente"],
    requiresTxId: true,
    isTerminal: false,
  },
  "contract.prepare": {
    stage: "commission_review",
    status: "ready_for_review",
    nextStep: "Aguardar assinatura do contrato pelas partes para liberar comissão",
    pendingItemsAdd: ["Assinatura do contrato pelas partes pendente"],
    pendingItemsRemove: ["Contrato não elaborado"],
    requiresTxId: true,
    isTerminal: false,
  },
  "commission.settle": {
    stage: "done",
    status: "done",
    nextStep: null,
    pendingItemsAdd: [],
    pendingItemsRemove: [],
    requiresTxId: true,
    isTerminal: true,
  },
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function computeNextPendingItems(
  current: string[],
  toAdd: string[],
  toRemove: string[],
): string[] {
  const afterRemove = current.filter(
    (item) => !toRemove.some((r) => item.toLowerCase().includes(r.toLowerCase())),
  );
  for (const item of toAdd) {
    if (!afterRemove.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      afterRemove.push(item);
    }
  }
  return afterRemove;
}

export function resolveImobReceiptPaths(run: { id: string; txId?: string | null }): {
  receiptPath: string | null;
  bundlePath: string;
} {
  return {
    receiptPath: run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null,
    bundlePath: `/api/runs/${encodeURIComponent(run.id)}/bundle`,
  };
}

// ─── Injectable dependencies for testing ─────────────────────────────────────

export type ImobWorkerDeps = {
  getRunFn: typeof getRun;
  prisma: typeof prismaGlobal;
  mutationServiceFactory: (p: typeof prismaGlobal) => Pick<ImobCrmMutationService, "updateCase">;
};

// ─── Core job processor (exported for testing) ────────────────────────────────

export async function processImobRunCompletedJob(
  job: ImobRunCompletedJobPayload,
  deps?: Partial<ImobWorkerDeps>,
): Promise<void> {
  const { runId, tenantId, workspaceId, caseId, actionId, eventRunId } = job;

  const _getRunFn = deps?.getRunFn ?? getRun;
  const _prisma = deps?.prisma ?? prismaGlobal;
  const _mutationService =
    deps?.mutationServiceFactory
      ? deps.mutationServiceFactory(_prisma)
      : new ImobCrmMutationService(_prisma);

  const logger = bindLogger(workerLogger, { runId, tenantId, workspaceId, caseId, actionId });

  // Count every received job — label uses actionId if present, else "unknown"
  incrementCounter(IMOB_WORKER_COUNTER.JOBS_RECEIVED, { actionId: actionId ?? "unknown" });

  // Guard 1: required fields
  if (!runId || !tenantId || !workspaceId || !caseId || !actionId || !eventRunId) {
    logger.warn("imob-worker.missing_required_fields");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: actionId ?? "unknown", reason: "missing_required_fields" });
    return;
  }

  // Guard 2: actionId must be in canonical list
  if (!(IMOB_DISPATCHER_ACTION_IDS as readonly string[]).includes(actionId)) {
    logger.warn({ actionId }, "imob-worker.unknown_action_id");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "unknown_action_id" });
    return;
  }

  // Guard 3: outcome must exist for actionId
  const outcome = IMOB_RUN_OUTCOME_MAP[actionId];
  if (!outcome) {
    logger.warn({ actionId }, "imob-worker.no_outcome_for_action");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "no_outcome_for_action" });
    return;
  }

  // Fetch run from DB (scoped by tenantId+workspaceId — cross-workspace protection)
  const run = await _getRunFn({ id: runId, tenantId, workspaceId });
  if (!run) {
    logger.warn("imob-worker.run_not_found");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "run_not_found" });
    return;
  }

  // Guard 4: run must have succeeded
  if (run.status !== "success") {
    logger.info({ runStatus: run.status }, "imob-worker.run_not_success_skip");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "run_not_success" });
    await recordCaseEvent(_prisma, caseId, tenantId, workspaceId, runId, "case.action.failed", actionId,
      `Run ${runId} falhou com status=${run.status}`, { actionId, runStatus: run.status });
    return;
  }

  // Guard 5: simulated execution
  if (shouldSkipImobPostRunMutationForSimulatedOutput(run)) {
    logger.warn("imob-worker.skipped_simulated_run");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "simulated" });
    return;
  }

  // Guard 6: HIGH tier actions require txId for receipt
  if (outcome.requiresTxId && !run.txId) {
    logger.warn({ actionId }, "imob-worker.receipt_required_no_tx_id");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "receipt_required_no_tx_id" });
    await recordCaseEvent(_prisma, caseId, tenantId, workspaceId, runId, "case.action.blocked", actionId,
      `Ação ${actionId} requer txId para receipt — txId ausente no run`, {
        actionId,
        reasonCode: "RECEIPT_REQUIRED_NO_TX_ID",
      });
    return;
  }

  // DB-level idempotency check: one mutation per runId per case
  const alreadyProcessed = await _prisma.imobCaseEvent.findFirst({
    where: {
      caseId,
      tenantId,
      workspaceId,
      runId,
      type: "case.action.completed",
    },
    select: { id: true },
  } as any);
  if (alreadyProcessed) {
    logger.info("imob-worker.already_processed_skip");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "already_processed" });
    return;
  }

  // Load current case for pendingItems delta and canonical inputs
  const existingCase = await _prisma.imobCase.findFirst({
    where: { id: caseId, tenantId, workspaceId },
    include: {
      owner: { select: { id: true, name: true } },
      property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
      lead: { select: { id: true, name: true } },
    },
  });
  if (!existingCase) {
    logger.warn("imob-worker.case_not_found_or_cross_workspace");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "case_not_found" });
    return;
  }

  // Guard 7: commission.settle requires ownerResponsible
  if (actionId === "commission.settle" && !existingCase.ownerResponsible) {
    logger.warn("imob-worker.commission_settle_missing_owner_responsible");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "commission_settle_missing_owner" });
    await recordCaseEvent(_prisma, caseId, tenantId, workspaceId, runId, "case.action.blocked", actionId,
      "Liberação de comissão bloqueada: ownerResponsible não definido no caso", {
        actionId,
        reasonCode: "CASE_RESPONSIBLE_REQUIRED",
      });
    return;
  }

  // Compute new pendingItems and blockers
  const currentPendingItems = (existingCase.pendingItems as string[] | null) ?? [];
  const currentBlockers = (existingCase.blockers as string[] | null) ?? [];
  const nextPendingItems = outcome.isTerminal
    ? []
    : computeNextPendingItems(currentPendingItems, outcome.pendingItemsAdd, outcome.pendingItemsRemove);
  const nextBlockers = outcome.isTerminal ? [] : currentBlockers;

  // Receipt/bundle paths
  const { receiptPath, bundlePath } = resolveImobReceiptPaths(run);

  // Mutation via ImobCrmMutationService
  const scope = { tenantId, workspaceId };

  const result = await _mutationService.updateCase(scope, caseId, {
    stage: outcome.stage,
    status: outcome.status,
    nextStep: outcome.nextStep,
    pendingItems: nextPendingItems,
    blockers: nextBlockers,
    eventRunId,
    eventType: "case.action.completed",
    eventActorType: "system",
    eventSummary: `Run ${actionId} concluído com sucesso — caso atualizado`,
    eventPayload: {
      actionId,
      runId,
      outcomeStage: outcome.stage,
      outcomeStatus: outcome.status,
      receiptPath,
      bundlePath,
    },
  } as any);

  if (result.status === "not_found") {
    logger.warn("imob-worker.case_update_not_found");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "update_case_not_found" });
    return;
  }

  if (result.status === "responsible_required") {
    logger.warn("imob-worker.responsible_required");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId, reason: "update_case_responsible_required" });
    await recordCaseEvent(_prisma, caseId, tenantId, workspaceId, runId, "case.action.blocked", actionId,
      "Atualização bloqueada: ownerResponsible obrigatório para transição terminal", {
        actionId,
        reasonCode: "CASE_RESPONSIBLE_REQUIRED",
      });
    return;
  }

  if (result.status !== "updated") {
    logger.error({ resultStatus: result.status }, "imob-worker.update_unexpected_status");
    incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "update_unexpected_status" });
    return;
  }

  const updatedCase = result.data;

  // Canonical recalculation (pure function — no DB write needed; CC reads on next request)
  const canonical = buildImobCanonicalCase({
    flow: updatedCase.flow,
    stage: updatedCase.stage,
    status: updatedCase.status,
    ownerResponsible: updatedCase.ownerResponsible ?? null,
    nextStep: updatedCase.nextStep ?? null,
    blockers: (updatedCase.blockers as string[]) ?? [],
    pendingItems: (updatedCase.pendingItems as string[]) ?? [],
    lead: updatedCase.lead ?? null,
    owner: updatedCase.owner ?? null,
    property: updatedCase.property ?? null,
  });

  incrementCounter(IMOB_WORKER_COUNTER.MUTATIONS_APPLIED, {
    actionId,
    terminal: String(outcome.isTerminal),
    requiresTxId: String(outcome.requiresTxId),
  });

  logger.info(
    {
      actionId,
      outcomeStage: outcome.stage,
      outcomeStatus: outcome.status,
      isTerminal: outcome.isTerminal,
      canonicalJourneyType: canonical.journeyType,
      receiptPath,
      bundlePath,
    },
    "imob-worker.mutation_applied",
  );
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function recordCaseEvent(
  prisma: typeof prismaGlobal,
  caseId: string,
  tenantId: string,
  workspaceId: string,
  runId: string,
  type: string,
  actionId: string,
  summary: string,
  payload: Record<string, unknown>,
) {
  try {
    await (prisma as any).imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: caseId } },
        tenant: { connect: { id: tenantId } },
        workspace: { connect: { id: workspaceId } },
        run: { connect: { id: runId } },
        type,
        actorType: "system",
        actorRef: null,
        summary,
        evidenceRef: null,
        payload: payload as any,
      },
    });
  } catch {
    // Non-fatal: event recording failure should not crash the worker
  }
}

// ─── BullMQ Worker startup ────────────────────────────────────────────────────

let imobMutationWorkerInstance: Worker | null = null;

export function startImobPostRunMutationWorker() {
  if (imobMutationWorkerInstance) return;

  const concurrency = Number(process.env.IMOB_MUTATION_WORKER_CONCURRENCY ?? 3);

  imobMutationWorkerInstance = new Worker<ImobRunCompletedJobPayload>(
    IMOB_RUN_COMPLETED_QUEUE_NAME,
    async (job) => {
      try {
        await processImobRunCompletedJob(job.data, undefined);
      } catch (err) {
        incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "job_error" });
        workerLogger.error(
          { jobId: job.id, runId: job.data?.runId, err },
          "imob-worker.job_failed",
        );
        throw err;
      }
    },
    {
      concurrency,
      connection: getRedisConnection(),
    },
  );

  imobMutationWorkerInstance.on("ready", () => {
    workerLogger.info(
      { queue: IMOB_RUN_COMPLETED_QUEUE_NAME, concurrency },
      "imob-worker.started",
    );
  });

  imobMutationWorkerInstance.on("failed", (job, err) => {
    incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "job_permanently_failed" });
    workerLogger.error(
      { jobId: job?.id, runId: job?.data?.runId, caseId: job?.data?.caseId, err },
      "imob-worker.job_permanently_failed",
    );
  });
}
