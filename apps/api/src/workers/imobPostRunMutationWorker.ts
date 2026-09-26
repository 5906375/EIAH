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
import {
  resolveImobApprovalGate,
  type ImobApprovalPolicyCriticality,
} from "../services/imob/imobApprovalGate";
import {
  ImobContractIntakeTemporarilyBlockedError,
  recordImobContractIntakeBlocked,
  resolveImobContractIntakeRuntimePolicy,
} from "../services/imob/intake/imobContractIntakeRuntime";

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
  // Phase 2: document intake via Chat IMOB
  // Case is CREATED (not updated) by the intake handler — no pre-existing caseId.
  // requiresTxId=false: no ledger receipt needed for document intake.
  "imob.contract.intake": {
    stage: "documents_collecting",
    status: "ready_for_review",
    nextStep: "Analisar documentação recebida e verificar itens pendentes com as partes",
    pendingItemsAdd: [],
    pendingItemsRemove: [],
    requiresTxId: false,
    isTerminal: false,
  },
};

const IMOB_ACTION_POLICY_CRITICALITY: Record<string, ImobApprovalPolicyCriticality> = {
  "owner.register": "HIGH",
  "property.create": "HIGH",
  "listing.activate": "MEDIUM",
  "lead.qualify": "MEDIUM",
  "visit.schedule": "LOW",
  "documents.review": "MEDIUM",
  "documents.collect": "MEDIUM",
  "proposal.create": "HIGH",
  "deal.review": "HIGH",
  "contract.prepare": "HIGH",
  "commission.settle": "HIGH",
  "imob.contract.intake": "LOW",
};

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function asString(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

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
  resolveIntakeRuntimePolicyFn: typeof resolveImobContractIntakeRuntimePolicy;
};

// ─── Core job processor (exported for testing) ────────────────────────────────

export async function processImobRunCompletedJob(
  job: ImobRunCompletedJobPayload,
  deps?: Partial<ImobWorkerDeps>,
): Promise<void> {
  const { runId, tenantId, workspaceId, caseId, actionId, eventRunId } = job;

  const _getRunFn = deps?.getRunFn ?? getRun;
  const _prisma = deps?.prisma ?? prismaGlobal;
  const _resolveIntakeRuntimePolicy = deps?.resolveIntakeRuntimePolicyFn ?? resolveImobContractIntakeRuntimePolicy;
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

  // Intake branch: imob.contract.intake creates a new ImobCase — handled separately
  if (actionId === "imob.contract.intake") {
    const policy = await _resolveIntakeRuntimePolicy({ tenantId, workspaceId });
    if (policy.enabled) {
      return processIntakeRun(job, logger, { getRunFn: _getRunFn, prisma: _prisma });
    }
    await recordImobContractIntakeBlocked({
      prisma: _prisma,
      tenantId,
      workspaceId,
      runId,
      operation: "worker",
      policy,
    });
    logger.warn(
      {
        reasonCode: policy.reasonCode,
        blockingCondition: policy.blockingCondition,
      },
      "imob-intake.temporarily_blocked",
    );
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, {
      actionId,
      reason: policy.reasonCode,
    });
    throw new ImobContractIntakeTemporarilyBlockedError(policy);
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

  const requestRoot = asRecord(run.request);
  const requestMetadata = asRecord(requestRoot?.metadata);
  const approval = resolveImobApprovalGate({
    tenantId,
    workspaceId,
    runId,
    actorId: typeof run.userId === "string" ? run.userId : null,
    actionType: actionId,
    policyCriticality: IMOB_ACTION_POLICY_CRITICALITY[actionId] ?? "LOW",
    approvalId:
      asString(requestMetadata?.approvalId) ??
      asString(asRecord(requestMetadata?.approval)?.id) ??
      null,
    approvalStatus:
      run.approvalStatus === "not_required" ||
      run.approvalStatus === "pending" ||
      run.approvalStatus === "approved" ||
      run.approvalStatus === "rejected"
        ? run.approvalStatus
        : null,
    approvedBy: typeof run.approvedBy === "string" ? run.approvedBy : null,
    approvedAt: run.approvedAt,
    approvalExpiresAt:
      asString(requestMetadata?.approvalExpiresAt) ??
      asString(asRecord(requestMetadata?.approval)?.expiresAt) ??
      null,
    approvalScopeTenantId:
      asString(requestMetadata?.approvalTenantId) ??
      asString(asRecord(requestMetadata?.approvalScope)?.tenantId) ??
      null,
    approvalScopeWorkspaceId:
      asString(requestMetadata?.approvalWorkspaceId) ??
      asString(asRecord(requestMetadata?.approvalScope)?.workspaceId) ??
      null,
    now: new Date(),
  });

  if (!approval.allowed) {
    logger.warn({ actionId, reasonCode: approval.reasonCode }, "imob-worker.approval_blocked");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, {
      actionId,
      reason: approval.reasonCode.toLowerCase(),
    });
    await recordCaseEvent(
      _prisma,
      caseId,
      tenantId,
      workspaceId,
      runId,
      "case.action.blocked",
      actionId,
      `Ação ${actionId} bloqueada por approval fail-closed`,
      {
        actionId,
        reasonCode: approval.reasonCode,
        approvalId: approval.approvalId,
        approvalStatus: run.approvalStatus ?? null,
        approvedBy: typeof run.approvedBy === "string" ? run.approvedBy : null,
        approvedAt: run.approvedAt instanceof Date ? run.approvedAt.toISOString() : null,
        policyCriticality: IMOB_ACTION_POLICY_CRITICALITY[actionId] ?? "LOW",
      },
    );
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
      approvalId: approval.approvalId,
      approvalDecision: approval.reasonCode,
      approvalStatus: run.approvalStatus ?? null,
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

// ─── Intake handler (imob.contract.intake) ───────────────────────────────────
//
// Creates a new ImobCase from a confirmed run.
// Idempotency:
//   1. By documentHash: if a case.document.intake event with the same evidenceRef
//      already exists in tenant/workspace → skip with EXISTING_CASE_FOUND.
//   2. By runId: if a case.action.completed event for this runId already exists
//      in tenant/workspace → skip (duplicate BullMQ delivery).

async function processIntakeRun(
  job: ImobRunCompletedJobPayload,
  logger: ReturnType<typeof bindLogger>,
  deps: Pick<ImobWorkerDeps, "getRunFn" | "prisma">,
): Promise<void> {
  const { runId, tenantId, workspaceId } = job;
  const _getRunFn = deps.getRunFn;
  const _prisma = deps.prisma;

  const run = await _getRunFn({ id: runId, tenantId, workspaceId });
  if (!run) {
    logger.warn("imob-intake.run_not_found");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "imob.contract.intake", reason: "run_not_found" });
    return;
  }

  if (run.status !== "success") {
    logger.info({ runStatus: run.status }, "imob-intake.run_not_success_skip");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "imob.contract.intake", reason: "run_not_success" });
    return;
  }

  if (shouldSkipImobPostRunMutationForSimulatedOutput(run)) {
    logger.warn("imob-intake.skipped_simulated_run");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "imob.contract.intake", reason: "simulated" });
    return;
  }

  // Read intake context from run.request (embedded by confirm endpoint)
  const request = (run.request as Record<string, unknown>) ?? {};
  const documentHash = typeof request.documentHash === "string" && request.documentHash ? request.documentHash : null;
  const documentKind = "lease_contract" as const;
  const pendingItems = Array.isArray(request.pendingItems) ? (request.pendingItems as string[]) : [];
  const riskFlags = Array.isArray(request.riskFlags) ? (request.riskFlags as string[]) : [];

  if (!documentHash) {
    logger.warn("imob-intake.missing_document_hash");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "imob.contract.intake", reason: "missing_document_hash" });
    return;
  }

  // Idempotency #1: document already ingested in this tenant/workspace
  const existingEvidence = await (_prisma as any).imobCaseEvent.findFirst({
    where: { tenantId, workspaceId, evidenceRef: documentHash, type: "case.document.intake" },
    select: { id: true, caseId: true },
  });
  if (existingEvidence) {
    logger.info({ documentHash }, "imob-intake.idempotent_skip_existing_case");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, {
      actionId: "imob.contract.intake",
      reason: "EXISTING_CASE_FOUND",
    });
    return;
  }

  // Idempotency #2: runId already processed (duplicate BullMQ delivery)
  const alreadyProcessedByRun = await (_prisma as any).imobCaseEvent.findFirst({
    where: { tenantId, workspaceId, runId, type: "case.action.completed" },
    select: { id: true },
  });
  if (alreadyProcessedByRun) {
    logger.info("imob-intake.already_processed_skip");
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "imob.contract.intake", reason: "already_processed" });
    return;
  }

  // Create ImobCase — flow "documents.collect" maps to journeyType "documentation"
  const outcome = IMOB_RUN_OUTCOME_MAP["imob.contract.intake"];
  const newCase = await (_prisma as any).imobCase.create({
    data: {
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      flow: "documents.collect",
      stage: outcome.stage,
      status: outcome.status,
      nextStep: outcome.nextStep,
      pendingItems,
      blockers: [],
      metadata: {
        intakeDocumentHash: documentHash,
        intakeDocumentKind: documentKind,
        piiMasked: true,
        riskFlags,
        intakeRunId: runId,
      },
    },
  });

  const bundlePath = `/api/runs/${encodeURIComponent(runId)}/bundle`;

  // Event 1: case.action.completed — links run to case
  await (_prisma as any).imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: newCase.id } },
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      run: { connect: { id: runId } },
      type: "case.action.completed",
      actorType: "system",
      actorRef: null,
      summary: "Contrato de locação recebido via Chat IMOB — caso de documentação iniciado",
      evidenceRef: documentHash,
      payload: {
        actionId: "imob.contract.intake",
        documentHash,
        documentKind,
        piiMasked: true,
        runId,
        outcomeStage: outcome.stage,
        outcomeStatus: outcome.status,
        bundlePath,
      },
    },
  });

  // Event 2: case.document.intake — idempotency anchor by documentHash
  await (_prisma as any).imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: newCase.id } },
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      run: { connect: { id: runId } },
      type: "case.document.intake",
      actorType: "system",
      actorRef: null,
      summary: "Documento de contrato de locação indexado com evidência mascarada",
      evidenceRef: documentHash,
      payload: { documentHash, documentKind, piiMasked: true },
    },
  });

  incrementCounter(IMOB_WORKER_COUNTER.MUTATIONS_APPLIED, {
    actionId: "imob.contract.intake",
    terminal: "false",
    requiresTxId: "false",
  });

  logger.info(
    {
      actionId: "imob.contract.intake",
      newCaseId: newCase.id,
      stage: outcome.stage,
      status: outcome.status,
      documentHash,
    },
    "imob-intake.case_created",
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
