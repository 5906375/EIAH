import { z } from "zod";

import {
  evaluateVerticalEntitlementGate,
  type TenantProductInstallationLike,
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
// de status. PRE_DUIMP e sempre avaliado como acao de leitura/observacao
// ("read_history"), porque nenhuma acao com efeito externo e permitida
// enquanto os criterios de saida de PRE_DUIMP nao forem satisfeitos.

export function evaluatePreDuimpEntitlementGate(input: {
  installation: TenantProductInstallationLike | null;
  billingPastDue?: boolean;
  gracePeriodActive?: boolean;
}) {
  return evaluateVerticalEntitlementGate({
    installation: input.installation,
    action: "read_history",
    billingPastDue: input.billingPastDue ?? false,
    gracePeriodActive: input.gracePeriodActive ?? false,
  });
}
