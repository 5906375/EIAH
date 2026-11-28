import { ORACULO_SOURCE_QUERY_SCOPE, ORACULO_SOURCE_SCOPE_PREFIX, type LogisticaContextAccess } from "@eiah/contracts";
import type { ScopeDecision } from "@eiah/core/policy/TenantPolicyStore";
import type { PrismaClient } from "@repo/db";
import { hasLogisticaMemberCapability, resolveLogisticaContextAccess } from "./logisticaContextAccess";
import type { CasePort, SourceQueryAccessPort, SourceQueryAuditSink, TrustedServerContext } from "../oraculo/sourceQuery/types";

/**
 * Ligação com os mecanismos EXISTENTES do Core. Nada aqui decide acesso por conta própria: compõe as mesmas verificações que a rota de
 * preparação do Oráculo já aplica (acesso de contexto da vertical + política exata do workspace + capacidade explícita do membro).
 */
export type CoreAccessDeps = {
  resolveContext(identity: TrustedServerContext): Promise<Pick<LogisticaContextAccess, "allowed" | "usage">>;
  resolveScopeDecision(tenantId: string, workspaceId: string, scope: string): Promise<ScopeDecision>;
  hasMemberCapability(identity: TrustedServerContext, scope: string): Promise<boolean>;
};

/**
 * Implementação de produção: as funções reais, ligadas a um cliente Prisma. Os módulos do Core/DB são carregados sob demanda (`import()`),
 * como já faz `resolveLogisticaContextAccess`, para que importar este arquivo não exija o cliente Prisma gerado nem conexão.
 */
export function createDefaultCoreAccessDeps(prisma: PrismaClient): CoreAccessDeps {
  return {
    resolveContext: (identity) => resolveLogisticaContextAccess(prisma, identity),
    resolveScopeDecision: async (tenantId, workspaceId, scope) => {
      const { TenantPolicyStore } = await import("@eiah/core/policy/TenantPolicyStore");
      return TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(tenantId, workspaceId, scope);
    },
    hasMemberCapability: (identity, scope) => hasLogisticaMemberCapability(prisma, identity, scope),
  };
}

const normalize = (scope: string) => scope.trim().toLowerCase();

async function exactPolicyAllows(deps: CoreAccessDeps, identity: TrustedServerContext, scope: string) {
  const decision = await deps.resolveScopeDecision(identity.tenantId, identity.workspaceId, scope);
  // Mesma exigência do acesso de contexto: a decisão precisa ser do MESMO tenant/workspace/escopo; política de outro escopo não vale.
  return decision.allowed === true && decision.tenantId === identity.tenantId && decision.workspaceId === identity.workspaceId && decision.scope === normalize(scope);
}

/**
 * Consultar uma fonte exige, cumulativamente:
 *  1. acesso de contexto da Logística disponível e uso INTEGRAL (a vertical é `context_only` e declara `externalTransmissionAllowed: false`;
 *     uma consulta externa não pode ser feita em modo somente leitura/revogado);
 *  2. política exata do workspace para `ORACULO_SOURCE_QUERY_SCOPE` + capacidade explícita desse escopo no vínculo do membro;
 *  3. (por conexão) política exata do escopo referenciado pela conexão, sob o prefixo do Oráculo, + capacidade explícita do membro.
 * Qualquer erro ou dúvida nega.
 */
export function createCoreSourceQueryAccess(deps: CoreAccessDeps): SourceQueryAccessPort {
  return {
    async checkQueryAccess(identity) {
      try {
        const context = await deps.resolveContext(identity);
        if (!context.allowed || context.usage !== "full") return { allowed: false, reasonCode: "ACCESS_CONTEXT_DENIED" };
        if (!(await exactPolicyAllows(deps, identity, ORACULO_SOURCE_QUERY_SCOPE)) || !(await deps.hasMemberCapability(identity, ORACULO_SOURCE_QUERY_SCOPE))) {
          return { allowed: false, reasonCode: "QUERY_SCOPE_DENIED" };
        }
        return { allowed: true };
      } catch {
        return { allowed: false, reasonCode: "ACCESS_CONTEXT_DENIED" };
      }
    },
    async checkConnectionPolicy(identity, policyScope) {
      try {
        if (!normalize(policyScope).startsWith(ORACULO_SOURCE_SCOPE_PREFIX)) return { allowed: false };
        return { allowed: await exactPolicyAllows(deps, identity, policyScope) && await deps.hasMemberCapability(identity, policyScope) };
      } catch {
        return { allowed: false };
      }
    },
  };
}

/**
 * Auditoria pelo mecanismo existente (`recordGuardrailAudit` → `guardrailAuditLedger`). Só reporta `persisted` DEPOIS de a escrita
 * resolver; se ela falhar, a exceção propaga (o serviço então nega antes do despacho ou marca a auditoria como não durável).
 * Os parâmetros da consulta não são gravados — apenas o hash.
 */
export type GuardrailAuditRecorder = typeof import("@eiah/core/services/guardrailLedgerStore").recordGuardrailAudit;
export function createGuardrailAuditSink(deps: { prisma: PrismaClient; record?: GuardrailAuditRecorder }): SourceQueryAuditSink {
  return {
    name: "guardrail_audit_ledger",
    async record(event) {
      const { tenantId, workspaceId, ...rest } = event;
      const record = deps.record ?? (await import("@eiah/core/services/guardrailLedgerStore")).recordGuardrailAudit;
      await record({
        prisma: deps.prisma, tenantId, workspaceId, runId: null, eventType: event.event,
        severity: event.event === "oraculo.source_query.denied" ? "warn" : "info",
        message: `${event.event} ${event.sourceId ?? "-"}/${event.operation ?? "-"}`,
        metadata: { ...rest, userId: event.userId },
      });
      return { durability: "persisted" };
    },
  };
}

/** Caso do Oráculo pelo repositório existente (já escopado por tenant/workspace). Só leitura: expõe apenas `get`. */
export function createPreparationCasePort(repositoryFor: (scope: { tenantId: string; workspaceId: string }) => { get(caseId: string): Promise<{ caseId: string; caseType: string; revision: number } | null> }): CasePort {
  return {
    async get(scope, caseId) {
      const record = await repositoryFor(scope).get(caseId);
      return record ? { caseId: record.caseId, caseType: record.caseType, revision: record.revision } : null;
    },
  };
}
