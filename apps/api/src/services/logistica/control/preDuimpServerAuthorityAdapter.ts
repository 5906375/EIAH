import { checkScopePermission } from "@eiah/core";
import { getPrismaForTenant } from "@repo/db";

import {
  resolvePreDuimpServerAuthoritySnapshot,
  type PreDuimpAction,
  type PreDuimpServerAuthoritySnapshot,
} from "./preDuimpActionCatalog";
import type { TenantProductInstallationLike } from "../../../types/verticalEntitlementGateContract";

// Adapter server-side que resolve PreDuimpServerAuthoritySnapshot a
// partir de mecanismos canonicos ja existentes no repositorio, em vez
// de aceitar esses valores prontos de algum lugar.
//
// - RBAC/scope: checkScopePermission (TenantPolicyStore real, via
//   packages/core) — mesma funcao usada por requireScope/governance.ts.
//   O binding produtivo (PRODUCTION_DEPS, abaixo) usa sempre o
//   checkScopePermission real e continua gravando em guardrail_ledger
//   normalmente; nenhuma auditoria e' contornada em producao.
// - Instalacao/entitlement: tabela generica TenantProductInstallation
//   (Prisma, tenant-scoped via getPrismaForTenant), filtrada por
//   product="LOGISTICA". Nenhuma migration nova — a tabela ja existe
//   para todas as verticais.
//
// Testabilidade: em vez de um singleton mutavel sobrescrito por
// Object.defineProperty, a dependencia de checkScopePermission e'
// injetada via factory (createPreDuimpServerAuthorityResolver). Cada
// instancia recebe suas proprias dependencias imutaveis — o teste cria
// uma instancia isolada com um fake local; producao usa
// PRODUCTION_DEPS (privado, congelado, nao exportado).
//
// HITL: nao existe, em nenhum lugar do repositorio, mecanismo canonico
// de aprovacao persistida generico o suficiente para reutilizar aqui
// sem uma migration nova (proibida neste corte). Este adapter portanto
// nao aceita hitlApproval como entrada — sempre produz hitlApproval:
// null. Consequencia: log.duimp_context.review permanece fail-closed
// (PRE_DUIMP_HITL_REQUIRED) ate existir um corte de integracao HITL
// dedicado, com schema e resolver proprios.
//
// Billing/grace period: nenhuma fonte canonica esta conectada a este
// adapter nesta task; nao sao aceitos como entrada nem inventados —
// ficam ausentes (undefined) no snapshot resolvido.
//
// Nunca aceita requester, scopes, installation, entitlement, policy
// decision, HITL ou authority vindos do body/payload do cliente —
// apenas identity ja autenticada pelo servidor (equivalente a
// req.authContext de um adapter HTTP real futuro) e a action
// solicitada.

export type PreDuimpAuthenticatedIdentity = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId?: string;
};

const PRE_DUIMP_INSTALLATION_PRODUCT = "LOGISTICA";

export type PreDuimpServerAuthorityAdapterDeps = Readonly<{
  checkScopePermission: typeof checkScopePermission;
}>;

export function createPreDuimpServerAuthorityResolver(
  deps: PreDuimpServerAuthorityAdapterDeps,
) {
  return async function resolvePreDuimpServerAuthorityFromCanonicalSources(input: {
    identity: PreDuimpAuthenticatedIdentity;
    action: PreDuimpAction;
  }): Promise<PreDuimpServerAuthoritySnapshot> {
    const scopeDecision = await deps.checkScopePermission({
      tenantId: input.identity.tenantId,
      workspaceId: input.identity.workspaceId,
      userId: input.identity.userId,
      tokenId: input.identity.tokenId,
      scope: input.action,
    });

    const grantedScopes: readonly string[] = scopeDecision.allowed ? [input.action] : [];

    const tenantPrisma = getPrismaForTenant(input.identity.tenantId, input.identity.workspaceId);
    const installationRow = await tenantPrisma.tenantProductInstallation.findUnique({
      where: {
        tenant_workspace_product_unique: {
          tenantId: input.identity.tenantId,
          workspaceId: input.identity.workspaceId,
          product: PRE_DUIMP_INSTALLATION_PRODUCT,
        },
      },
    });

    const installation: TenantProductInstallationLike | null = installationRow
      ? {
          tenantId: installationRow.tenantId,
          workspaceId: installationRow.workspaceId,
          product: installationRow.product,
          status: installationRow.status,
        }
      : null;

    return resolvePreDuimpServerAuthoritySnapshot({
      requester: { tenantId: input.identity.tenantId, workspaceId: input.identity.workspaceId },
      grantedScopes,
      installation,
      hitlApproval: null,
    });
  };
}

const PRODUCTION_DEPS: PreDuimpServerAuthorityAdapterDeps = Object.freeze({
  checkScopePermission,
});

export const resolvePreDuimpServerAuthorityFromCanonicalSources =
  createPreDuimpServerAuthorityResolver(PRODUCTION_DEPS);
