// Encaminhamento autorizado Radar -> MKT (etapa: adaptação da cadeia REAL).
//
// D6 — o Run de destino não é mais criado aqui (ver seção 22.7 do
// documento): forwardSignalToMkt só cria o SignalForwardRequest, aguardando
// confirmação humana. createRunRecord/assertWorkspaceAgentEnabled passam a
// ser usados em humanConfirmationService.ts, não neste arquivo.
//
// FUNÇÕES REAIS REUTILIZADAS (importadas do produto, não reimplementadas):
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

import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import { checkScopePermission } from "@eiah/core";
import { classifySignalForwardUniqueViolation } from "./classifier";
import {
  readAndValidateOrigin,
  buildOriginSnapshot,
  computeRequestFingerprint,
  FINGERPRINT_CONTRACT_VERSION,
} from "./originContract";

// requestFingerprint NÃO é mais um campo de entrada — nunca é aceito do
// chamador (achado de revisão corrigido). É sempre calculado no servidor a
// partir da origem validada, dentro de forwardSignalToMkt/recoverExisting...
export interface SignalForwardRequestInput {
  tenantId: string;
  workspaceId: string;
  requestedByUserId: string;
  sourceRunId: string;
  destinationAgent: string;
  idempotencyKey: string;
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

// D6 — createDestinationRun foi removida daqui: o Run de destino não é mais
// criado no encaminhamento (forwardSignalToMkt), e sim na conclusão de uma
// confirmação humana válida (humanConfirmationService.ts,
// confirmHumanConfirmation) — ver CONSULTATION_ORIGIN_AUTHZ_v2.md seção 22.7.

export interface ForwardSignalTestHooks {
  // Ponto de instrumentação EXCLUSIVO de teste (concorrência e rollback
  // deliberado). No fluxo real, `hooks` é sempre omitido — sem efeito sobre
  // comportamento ou tempo de vida da transação em produção. `afterRunCreate`
  // não existe mais aqui (D6) — o hook equivalente para a criação do Run
  // vive em `HumanConfirmationTestHooks` (humanConfirmationService.ts),
  // porque é lá que o Run passa a ser criado.
  afterInsert?: () => Promise<void>;
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

  // D6 — a atribuição do agente de destino (assertWorkspaceAgentEnabled,
  // via createRunRecord) não é mais verificada aqui: o Run de destino não é
  // mais criado neste momento. Essa verificação passa a ocorrer dentro de
  // humanConfirmationService.ts::confirmHumanConfirmation, na conclusão da
  // confirmação — WorkspaceAgentAssignmentError só pode ser lançado lá agora.
  try {
    return await db.$transaction(async (tx) => {
      // Leitura da origem ESCOPADA por tenant/workspace + validação estrutural
      // mínima, dentro da MESMA transação que cria a solicitação — evita uma
      // corrida entre validar e persistir. Lança SignalForwardOriginError se
      // a origem não existir neste escopo ou não satisfizer o mínimo exigido;
      // esse erro não é P2002/P2034, propaga como está (nenhuma criação
      // compensatória, nenhuma classificação indevida).
      const sourceRun = await readAndValidateOrigin(tx, {
        tenantId: input.tenantId, workspaceId: input.workspaceId, sourceRunId: input.sourceRunId,
      });
      const originSnapshot = buildOriginSnapshot(sourceRun);
      const requestFingerprint = computeRequestFingerprint({
        sourceRunId: input.sourceRunId, destinationAgent: input.destinationAgent, originSnapshot,
      });

      const forward = await tx.signalForwardRequest.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          sourceRunId: input.sourceRunId,
          destinationAgent: input.destinationAgent,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          // Definida pelo servidor, sempre a partir da mesma constante usada
          // para calcular requestFingerprint acima — nunca aceita do chamador
          // (SignalForwardRequestInput não tem esse campo).
          fingerprintVersion: FINGERPRINT_CONTRACT_VERSION,
          originSnapshot: originSnapshot as Prisma.InputJsonValue,
          requestedByUserId: input.requestedByUserId,
          status: "pending_dispatch",
        },
      });
      // se violar a unicidade, o erro propaga daqui para fora do callback

      if (hooks.afterInsert) {
        await hooks.afterInsert();
      }

      // D6 — o Run de destino NÃO é mais criado aqui. Encaminhar só cria o
      // SignalForwardRequest, aguardando confirmação humana
      // (humanConfirmationService.ts). destinationRunId permanece null até
      // uma confirmação concluir — o tipo SignalForwardResult já comporta
      // isso sem alteração. Ver seção 22.7.
      return {
        forwardRequestId: forward.id,
        destinationRunId: null,
        status: forward.status,
        reused: false,
      };
    }, { maxWait: 5000, timeout: 10000 });
  } catch (e) {
    // captura FORA do await db.$transaction(...), após o encerramento com
    // rollback. Nenhuma instrução abaixo usa `tx` — não existe mais aqui.
    // D6 — WorkspaceAgentAssignmentError não pode mais ocorrer aqui (ver
    // comentário acima); esse tratamento foi movido para
    // humanConfirmationService.ts::confirmHumanConfirmation.
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

  // Fingerprint recalculado a partir da origem informada NESTA tentativa
  // (input.sourceRunId), não do que foi armazenado — detecta tanto mudança
  // de conteúdo da mesma origem quanto uma origem diferente sob a mesma
  // chave. Reaplica a validação de escopo/estado da origem no reuso.
  const currentSourceRun = await readAndValidateOrigin(db, {
    tenantId: input.tenantId, workspaceId: input.workspaceId, sourceRunId: input.sourceRunId,
  });
  const currentFingerprint = computeRequestFingerprint({
    sourceRunId: input.sourceRunId,
    destinationAgent: input.destinationAgent,
    originSnapshot: buildOriginSnapshot(currentSourceRun),
  });

  if (existing.requestFingerprint !== currentFingerprint) {
    throw new ConflictError("idempotency_key_reused_incompatible_payload");
  }

  // D6 — correção: destinationRunId nulo deixa de ser sempre inconsistência.
  // Um encaminhamento aguardando confirmação humana (status "pending_dispatch")
  // tem destinationRunId nulo por design (seção 22.7) — não é mais um erro.
  // A checagem fica restrita aos estados que DEVERIAM ter Run associado.
  const STATUSES_REQUIRING_DESTINATION_RUN = ["dispatch_pending", "run_created"];
  if (STATUSES_REQUIRING_DESTINATION_RUN.includes(existing.status) && !existing.destinationRunId) {
    throw new SignalForwardInconsistencyError(
      "existing_request_without_destination_run",
      { forwardRequestId: existing.id, status: existing.status }
    );
  }

  return {
    forwardRequestId: existing.id,
    destinationRunId: existing.destinationRunId,
    status: existing.status,
    reused: true,
  };
}
