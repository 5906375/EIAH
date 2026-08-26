import { z } from "zod";

import {
  evaluateVerticalEntitlementGate,
  type TenantProductInstallationLike,
  type VerticalEntitlementStatus,
} from "./verticalEntitlementGateContract";

// PRE_DUIMP — contrato minimo de contexto para o recorte Comex/DUIMP,
// interno a vertical publica Logistica (roadmap v8.1 secao 15).
//
// PRE_DUIMP nao e uma vertical publica. `verticalId` e fixo em "log"
// (Logistica); nenhum registry/enum paralelo ao multi-vertical existente
// e criado aqui. Sem transmissao real ao Portal Unico/Siscomex enquanto
// os criterios de saida de PRE_DUIMP nao forem satisfeitos.

export const preDuimpVerticalIdSchema = z.literal("log");

export const preDuimpRecordTypeSchema = z.literal("log.comex_duimp_context");

export const preDuimpModeSchema = z.literal("shadow");

export const preDuimpContextContractSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  verticalId: preDuimpVerticalIdSchema,
  recordType: preDuimpRecordTypeSchema,
  recordId: z.string().min(1),
  mode: preDuimpModeSchema.default("shadow"),
  externalTransmissionAllowed: z.literal(false).default(false),
});

export type PreDuimpVerticalId = z.infer<typeof preDuimpVerticalIdSchema>;
export type PreDuimpRecordType = z.infer<typeof preDuimpRecordTypeSchema>;
export type PreDuimpMode = z.infer<typeof preDuimpModeSchema>;
export type PreDuimpContextContract = z.infer<typeof preDuimpContextContractSchema>;

export function buildPreDuimpContextContract(input: unknown): PreDuimpContextContract {
  return preDuimpContextContractSchema.parse(input);
}

// Isolamento tenantId + workspaceId: um contexto PRE_DUIMP so pode ser
// avaliado por um requester no mesmo par tenant/workspace que o originou.
// Fail-closed: qualquer divergencia nega o acesso.

export interface TenantWorkspaceScope {
  tenantId: string;
  workspaceId: string;
}

export type PreDuimpIsolationResult =
  | { allowed: true }
  | { allowed: false; reason: "tenant_mismatch" | "workspace_mismatch" };

export function evaluatePreDuimpIsolation(
  context: Pick<PreDuimpContextContract, "tenantId" | "workspaceId">,
  requester: TenantWorkspaceScope
): PreDuimpIsolationResult {
  if (context.tenantId !== requester.tenantId) {
    return { allowed: false, reason: "tenant_mismatch" };
  }

  if (context.workspaceId !== requester.workspaceId) {
    return { allowed: false, reason: "workspace_mismatch" };
  }

  return { allowed: true };
}

// Entitlement: reutiliza o gate generico multi-vertical existente em
// verticalEntitlementGateContract.ts em vez de reimplementar a resolucao
// de status.
//
// Correcao (cut 3): a versao original (cut 1) avaliava PRE_DUIMP sempre
// como acao de leitura/observacao ("read_history"), o que a tornava
// permissiva por padrao (installation=null ainda retornava allowed=true)
// — um mapeamento incorreto que nunca chegou a ser conectado a nenhum
// fluxo de autorizacao real nos cuts 1-2. As duas actions do catalogo
// PRE_DUIMP (log.duimp_context.create, log.duimp_context.review) sao
// mutacoes de estado (ainda que shadow), nao leituras passivas, e agora
// sao avaliadas como "start_new_execution" no gate generico. Instalacao
// e obrigatoria; a instalacao precisa pertencer exatamente ao mesmo
// tenant/workspace da autoridade avaliada e ao produto LOGISTICA.

export type PreDuimpEntitlementDenialReason =
  | "installation_missing"
  | "installation_scope_mismatch"
  | "installation_product_mismatch"
  | "status_denied";

export type PreDuimpEntitlementResult =
  | { allowed: true; status: VerticalEntitlementStatus }
  | {
      allowed: false;
      reason: PreDuimpEntitlementDenialReason;
      status?: VerticalEntitlementStatus;
      gateReason?: string;
    };

export function evaluatePreDuimpEntitlementGate(input: {
  context: Pick<PreDuimpContextContract, "tenantId" | "workspaceId">;
  installation: TenantProductInstallationLike | null;
  billingPastDue?: boolean;
  gracePeriodActive?: boolean;
}): PreDuimpEntitlementResult {
  if (!input.installation) {
    return { allowed: false, reason: "installation_missing" };
  }

  if (
    input.installation.tenantId !== input.context.tenantId ||
    input.installation.workspaceId !== input.context.workspaceId
  ) {
    return { allowed: false, reason: "installation_scope_mismatch" };
  }

  if (input.installation.product !== "LOGISTICA") {
    return { allowed: false, reason: "installation_product_mismatch" };
  }

  const gate = evaluateVerticalEntitlementGate({
    installation: input.installation,
    action: "start_new_execution",
    billingPastDue: input.billingPastDue ?? false,
    gracePeriodActive: input.gracePeriodActive ?? false,
  });

  if (!gate.allowed) {
    return { allowed: false, reason: "status_denied", status: gate.status, gateReason: gate.reason };
  }

  return { allowed: true, status: gate.status };
}
