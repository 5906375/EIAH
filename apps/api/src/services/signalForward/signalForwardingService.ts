// Encaminhamento autorizado Radar -> MKT (etapa: adaptação da cadeia REAL).
//
// FUNÇÕES REAIS REUTILIZADAS (importadas do produto, não reimplementadas):
//   - createRunRecord / assertWorkspaceAgentEnabled (../runs, ../workspaceAgentAssignments)
//   - checkScopePermission (@eiah/core -> packages/core/src/security/rbac.ts),
//     backed por TenantPolicyStore real (fail-closed, tabela tenant_action_policy real)
//   - prismaGlobal (@repo/db)
//
// AINDA EXPERIMENTAL/PARCIAL, DECLARADO EXPLICITAMENTE:
//   - O scope usado ("runs.execute") é o mesmo nome já verificado no documento
//     docs/ops/authz-runs-scope-matrix.md (PR #441, NÃO integrado a `main`).
//     Reaplicar esse nome aqui NÃO é "integrar a frente AUTHZ-RUNS/R0A" — é usar
//     o mecanismo genérico já real (checkScopePermission) para uma operação NOVA
//     (encaminhamento de sinal) que não consta na matriz ratificada. Ativação em
//     produção depende de reconciliar esse nome com a ratificação daquela frente
//     antes de qualquer uso real — este caminho permanece bloqueado por padrão
//     (fail-closed: nenhuma concessão é feita aqui, apenas consultada).

import { Prisma, PrismaClient, prismaGlobal, type TransactableClient } from "@repo/db";
import { checkScopePermission, recordGuardrailAudit } from "@eiah/core";
import { createRunRecord } from "../runs";
import { WorkspaceAgentAssignmentError } from "../workspaceAgentAssignments";
import { classifySignalForwardUniqueViolation } from "./classifier";

export interface SignalForwardRequestInput {
  tenantId: string;
  workspaceId: string;
  requestedByUserId: string;
  sourceRunId: string;
  destinationAgent: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface SignalForwardResult {
  forwardRequestId: string;
  destinationRunId: string | null;
  status: string;
  reused: boolean;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class SignalForwardInconsistencyError extends Error {
  constructor(message: string, readonly context: Record<string, unknown> = {}) {
    super(message);
    this.name = "SignalForwardInconsistencyError";
  }
}

export class SignalForwardAuthorizationError extends Error {
  constructor(readonly reasonCode: string) {
    super(`signal_forward_authorization_denied:${reasonCode}`);
    this.name = "SignalForwardAuthorizationError";
  }
}

function isP2034(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined;
  return typed?.code === "P2034";
}

// Escopo provisório — ver aviso no topo do arquivo. NÃO é uma decisão de
// AUTHZ-RUNS; reusa o mesmo nome já verificado naquele documento para a MESMA
// ação de fundo (criar um run), aplicado aqui a uma operação nova.
const SIGNAL_FORWARD_SCOPE = "runs.execute";

// Autorização REAL (não stub): usa checkScopePermission real, fail-closed,
// backed por TenantActionPolicy real. Retorna false por padrão na ausência
// de concessão explícita — não há bypass.
export async function reauthorizeSignalForward(params: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  sourceRunId: string;
}): Promise<void> {
  const decision = await checkScopePermission({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    scope: SIGNAL_FORWARD_SCOPE,
  });
  if (!decision.allowed) {
    throw new SignalForwardAuthorizationError(decision.reasonCode);
  }
}

async function createDestinationRun(
  client: TransactableClient,
  params: { tenantId: string; workspaceId: string; userId: string; agent: string; sourceRunId: string; forwardId: string }
) {
  return createRunRecord({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    agent: params.agent,
    status: "pending",
    request: { metadata: { signalForwardRequestId: params.forwardId, sourceRunId: params.sourceRunId } },
  });
}

export interface ForwardSignalTestHooks {
  // Pontos de instrumentação EXCLUSIVOS de teste (concorrência e rollback
  // deliberado). No fluxo real, `hooks` é sempre omitido — sem efeito sobre
  // comportamento ou tempo de vida da transação em produção.
  afterInsert?: () => Promise<void>;
  afterRunCreate?: () => Promise<void>;
}

export async function dispatchAfterTransactionError(
  db: PrismaClient,
  input: SignalForwardRequestInput,
  e: unknown
): Promise<SignalForwardResult> {
  if (isP2034(e)) {
    throw e;
  }

  const classification = classifySignalForwardUniqueViolation(e);

  if (classification.kind === "idempotency_key_violation") {
    return await recoverExistingSignalForwardRequest(db, input);
  }

  throw e;
}

export async function forwardSignalToMkt(
  input: SignalForwardRequestInput,
  hooks: ForwardSignalTestHooks = {},
  db: PrismaClient = prismaGlobal
): Promise<SignalForwardResult> {
  // Autorização ANTES de abrir a transação — fail-fast, não autoritativa por
  // si só (a atribuição real do agente é verificada dentro da transação via
  // createRunRecord -> assertWorkspaceAgentEnabled).
  await reauthorizeSignalForward({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.requestedByUserId,
    sourceRunId: input.sourceRunId,
  });

  try {
    return await db.$transaction(async (tx) => {
      const forward = await tx.signalForwardRequest.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          sourceRunId: input.sourceRunId,
          destinationAgent: input.destinationAgent,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          requestedByUserId: input.requestedByUserId,
          status: "pending_dispatch",
        },
      });
      // se violar a unicidade, o erro propaga daqui para fora do callback

      if (hooks.afterInsert) {
        await hooks.afterInsert();
      }

      // createRunRecord REAL — inclui assertWorkspaceAgentEnabled REAL
      // (atribuição do agente MKT), participando do MESMO tx.
      const run = await createDestinationRun(tx, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        userId: input.requestedByUserId,
        agent: input.destinationAgent,
        sourceRunId: input.sourceRunId,
        forwardId: forward.id,
      });

      if (hooks.afterRunCreate) {
        await hooks.afterRunCreate();
      }

      const linked = await tx.signalForwardRequest.update({
        where: { id: forward.id },
        data: { destinationRunId: run.id, status: "run_created" },
      });

      return {
        forwardRequestId: linked.id,
        destinationRunId: run.id,
        status: "run_created",
        reused: false,
      };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    // captura FORA do await db.$transaction(...), após o encerramento com
    // rollback. Nenhuma instrução abaixo usa `tx` — não existe mais aqui.

    if (e instanceof WorkspaceAgentAssignmentError) {
      // A auditoria de recusa que assertWorkspaceAgentEnabled tentou gravar
      // DENTRO da transação (via recordAssignmentRefusal -> recordGuardrailAudit)
      // foi revertida junto com o rollback. Reemitimos aqui, fora da transação
      // encerrada, usando prismaGlobal (nunca `tx`), para que a evidência de
      // recusa sobreviva independentemente do resultado da operação.
      try {
        await recordGuardrailAudit({
          prisma: prismaGlobal,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          eventType: "signal_forward.agent_assignment_refused",
          severity: "warn",
          message: e.message,
          metadata: { reasonCode: e.reasonCode, rolledBack: true },
        });
      } catch {
        // Falha na gravação da auditoria NUNCA transforma a recusa em
        // autorização — o erro original é relançado de qualquer forma.
      }
      throw e;
    }

    return await dispatchAfterTransactionError(db, input, e);
  }
}

export async function recoverExistingSignalForwardRequest(
  db: PrismaClient,
  input: SignalForwardRequestInput
): Promise<SignalForwardResult> {
  const existing = await db.signalForwardRequest.findUnique({
    where: {
      signalForwardIdempotencyKey: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        destinationAgent: input.destinationAgent,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  if (!existing) {
    throw new SignalForwardInconsistencyError(
      "unique_violation_without_matching_row",
      { tenantId: input.tenantId, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey }
    );
  }

  // autorização revalidada no reuso — repetição não dispensa autorização
  await reauthorizeSignalForward({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.requestedByUserId,
    sourceRunId: existing.sourceRunId,
  });

  if (existing.requestFingerprint !== input.requestFingerprint) {
    throw new ConflictError("idempotency_key_reused_incompatible_payload");
  }

  if (!existing.destinationRunId) {
    throw new SignalForwardInconsistencyError(
      "existing_request_without_destination_run",
      { forwardRequestId: existing.id }
    );
  }

  return {
    forwardRequestId: existing.id,
    destinationRunId: existing.destinationRunId,
    status: existing.status,
    reused: true,
  };
}
