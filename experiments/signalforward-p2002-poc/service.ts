// Reprodução experimental do mecanismo A (transação única cobrindo solicitação +
// run de destino + vínculo), com o catch externo corrigido e o classificador
// baseado em evidência real (classifier.ts).
//
// FUNÇÕES REAIS REUTILIZADAS (conceitualmente, não importadas do produto):
//   - padrão de transação única já usado em apps/api/src/services/imob/crm/imobCrmMutationService.ts
//   - padrão de captura/relançamento de P2002 já usado em apps/api/src/services/guardrailLedgerStore.ts
// ADAPTAÇÕES EXPERIMENTAIS:
//   - createRunFixtureRecord substitui createRunRecord (mesma ideia: insert simples
//     dentro do mesmo tx, sem a lógica de atribuição de agente/assignment real)
// COMPONENTES SIMULADOS (stub, declarado explicitamente):
//   - reauthorizeSignalForward é um STUB — sempre autoriza. NÃO comprova
//     integração real com checkScopePermission/requireScope/AUTHZ-RUNS.

import type { PrismaClient, Prisma } from "./prisma/generated/client/client.ts";
import { classifySignalForwardUniqueViolation } from "./classifier.ts";

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

function isP2034(error: unknown): boolean {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined;
  return typed?.code === "P2034";
}

// STUB — declarado explicitamente. Sempre autoriza nesta prova. Não comprova
// autorização integrada (checkScopePermission/requireScope/AUTHZ-RUNS ficam
// fora do escopo desta prova, conforme instrução).
export async function reauthorizeSignalForward(_params: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  sourceRunId: string;
}): Promise<void> {
  return;
}

// Substitui createRunRecord nesta prova — insere uma linha mínima em RunFixture
// dentro do MESMO client (tx) recebido.
async function createRunFixtureRecord(
  client: PrismaClient | Prisma.TransactionClient,
  params: { tenantId: string; workspaceId: string; agent: string }
) {
  return client.runFixture.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agent: params.agent,
      status: "queued",
    },
  });
}

export interface ForwardSignalTestHooks {
  // Ponto de instrumentação EXCLUSIVO da prova de concorrência (teste A).
  // No fluxo real, `hooks` é sempre omitido — `afterInsert` fica undefined e
  // o `await` abaixo é um no-op, sem qualquer efeito sobre o comportamento
  // ou sobre o tempo de vida da transação em produção.
  afterInsert?: () => Promise<void>;
}

// Lógica de despacho pós-transação, EXTRAÍDA para ser reutilizada literalmente
// (não reimplementada) tanto por forwardSignalToMkt quanto pelo teste do
// cenário C (outra violação de unicidade), garantindo que o teste exercite o
// mesmo código de decisão do mecanismo real, não uma cópia divergente.
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
  db: PrismaClient,
  input: SignalForwardRequestInput,
  hooks: ForwardSignalTestHooks = {}
): Promise<SignalForwardResult> {
  try {
    // 1. await prisma.$transaction(...) — nenhum catch interno ao redor do create/update.
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
      // 2. se violar a unicidade, o erro propaga daqui para fora do callback

      if (hooks.afterInsert) {
        await hooks.afterInsert();
      }

      const run = await createRunFixtureRecord(tx, {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        agent: input.destinationAgent,
      });

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
    // 3. captura FORA do await prisma.$transaction(...), após o encerramento
    //    com rollback. Nenhuma instrução abaixo usa `tx` — não existe mais aqui.
    return await dispatchAfterTransactionError(db, input, e);
  }
}

export async function recoverExistingSignalForwardRequest(
  db: PrismaClient,
  input: SignalForwardRequestInput
): Promise<SignalForwardResult> {
  // 5. releitura com o cliente do harness (equivalente a prismaGlobal), NUNCA `tx`.
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

  // 6. autorização (stub nesta prova, ver aviso no topo do arquivo)
  await reauthorizeSignalForward({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.requestedByUserId,
    sourceRunId: existing.sourceRunId,
  });

  // 7. validar fingerprint
  if (existing.requestFingerprint !== input.requestFingerprint) {
    throw new ConflictError("idempotency_key_reused_incompatible_payload");
  }

  if (!existing.destinationRunId) {
    throw new SignalForwardInconsistencyError(
      "existing_request_without_destination_run",
      { forwardRequestId: existing.id }
    );
  }

  // 8. retorno normalizado, reused:true — nenhuma publicação/nenhum novo run
  return {
    forwardRequestId: existing.id,
    destinationRunId: existing.destinationRunId,
    status: existing.status,
    reused: true,
  };
}
