import type { ActivatableProductId } from "@eiah/contracts";

import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { canActivateProducts, readWorkspaceResponsibleProfile } from "../workspaceResponsibility";
import { provisionWorkspaceAgentAssignments } from "../workspaceAgentProvisioning";
import { provisionWorkspaceActionPolicies } from "../workspaceActionPolicyProvisioning";
import { insertVerticalAccessEvent, lockVerticalAccessRow, readVerticalAccess } from "./verticalAccessApproval";
import {
  evaluateActivationAuthorization,
  grantTermsIntegrity,
  hashEvaluationTerms,
  PRODUCTION_EVALUATION_DEPS,
  resolveEvaluationPolicyActions,
  type EvaluationDeps,
} from "./verticalEvaluationContract";
import { getProductDefaultActionPolicies } from "@eiah/core/catalog/workspaceActionPolicyProvisioning";
import {
  getProductProvisionedAgents,
  WORKSPACE_AGENT_PROVISIONING_VERSION,
} from "@eiah/core/catalog/workspaceAgentProvisioning";

/**
 * Ativação de produto no workspace (instalação + agentes + políticas padrão,
 * atômica — ADR-010 PR A/A2). Mesmo caminho para o Marketplace e para a
 * ativação pelo chat do front door (ADR-010 etapa F).
 */

export type ActivatableProduct = ActivatableProductId;

export const PRODUCT_RELEASED_ROUTES: Record<ActivatableProduct, string[]> = {
  LOGISTICA: ["/app/chat?domain=logistica"],
  IMOB: ["/app/imob/chat", "/app/imob/properties", "/app/imob/processes", "/app/imob/partners"],
};

let tenantProductInstallationTableReady = false;

export async function ensureTenantProductInstallationTable(prisma: PrismaClient | null | undefined) {
  if (tenantProductInstallationTableReady) return;
  if (!prisma) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tenant_product_installations" (
      "id" TEXT NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "workspace_id" TEXT NOT NULL,
      "product" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "activated_by_user_id" TEXT,
      "metadata" JSONB,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "tenant_product_installations_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "tenant_product_installations_tenant_workspace_product_key"
      ON "tenant_product_installations"("tenant_id", "workspace_id", "product");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_tenant_status_idx"
      ON "tenant_product_installations"("tenant_id", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "tenant_product_installations_workspace_product_status_idx"
      ON "tenant_product_installations"("workspace_id", "product", "status");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_tenant_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_tenant_id_fkey"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_workspace_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_workspace_id_fkey"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'tenant_product_installations_activated_by_user_id_fkey'
          AND table_name = 'tenant_product_installations'
      ) THEN
        ALTER TABLE "tenant_product_installations"
          ADD CONSTRAINT "tenant_product_installations_activated_by_user_id_fkey"
          FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  tenantProductInstallationTableReady = true;
}

export type ProductInstallationRow = {
  tenantId: string;
  workspaceId: string;
  product: string;
  status: string;
  activatedAt: Date;
  activatedByUserId: string | null;
};

export type ProductActivationResult =
  | { ok: true; installation: ProductInstallationRow; releasedRoutes: string[] }
  | { ok: false; code: "VERTICAL_NOT_APPROVED"; accessStatus: string | null; reason?: string }
  | { ok: false; code: "WORKSPACE_AGENT_PROVISIONING_FAILED"; error: unknown }
  | { ok: false; code: "INSTALLATION_WRITE_FAILED" };

export type ProductActivationParams = {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string | null;
  product: ActivatableProduct;
};

/** Operação real (Marketplace, chat): oferta e relógio de produção. Nenhum parâmetro público substitui as decisões obrigatórias. */
export function activateProductInstallation(params: ProductActivationParams): Promise<ProductActivationResult> {
  return activateProductInstallationCore(params, PRODUCTION_EVALUATION_DEPS);
}

class EvaluationActivationDenied extends Error {
  constructor(readonly accessStatus: string | null, readonly reason: string) {
    super(reason);
  }
}
class EvaluationActivationConflict extends Error {}

/** Núcleo com dependências explícitas (relógio e oferta): composição de testes. */
export async function activateProductInstallationCore(params: ProductActivationParams, deps: EvaluationDeps): Promise<ProductActivationResult> {
  await ensureTenantProductInstallationTable(params.prisma);
  const { tenantId, workspaceId, product } = params;
  const preCheckAt = deps.clock();
  // ADR-011 §2.4: sem liberação aprovada pela EIAH, nada é ativado (mesma barreira para
  // Marketplace, chat e, no futuro, WhatsApp — todos passam por aqui).
  const access = await readVerticalAccess({ prisma: params.prisma, tenantId, workspaceId, vertical: product, now: preCheckAt });
  const evaluationGrant = Boolean(access?.grantKind);
  if (evaluationGrant && access) {
    // Avaliação gratuita: a decisão humana (`pre_ativacao`) e o aceite NÃO são uso. Esta checagem só falha rápido; a
    // autorização que vale é a refeita DENTRO da transação, sobre a linha travada.
    const early = evaluateActivationAuthorization(access, preCheckAt, deps.offer());
    if (!early.ok) return { ok: false, code: "VERTICAL_NOT_APPROVED", accessStatus: access.status, reason: early.reason };
    if (early.mode === "already_active") {
      // Idempotência: só é sucesso com instalação ATIVA e grant efetivamente válido (esta leitura já é a efetiva).
      const installed = await readInstallation(params.prisma, tenantId, workspaceId, product);
      if (installed?.status === "active") {
        return { ok: true, installation: installed, releasedRoutes: PRODUCT_RELEASED_ROUTES[product] ?? [] };
      }
    }
  } else if (access?.status !== "aprovado") {
    return { ok: false, code: "VERTICAL_NOT_APPROVED", accessStatus: access?.status ?? null };
  }
  const activatedByUserId = params.userId;
  try {
    const productAgents = getProductProvisionedAgents(product);
    await params.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      let policyActions: readonly string[] = getProductDefaultActionPolicies(product);
      let installedAt: Date | null = null;
      if (evaluationGrant) {
        // Releitura com trava: termos, aceite, escopo e autorização são revalidados sobre a versão que vai mudar. Uma mudança
        // concorrente (novos termos, encerramento, revogação) entre a checagem acima e aqui nega a ativação.
        const locked = await lockVerticalAccessRow(client, { tenantId, workspaceId, vertical: product });
        if (!locked) throw new EvaluationActivationDenied(null, "approval_not_found");
        // O início do prazo é capturado AQUI, depois da trava (não antes de possíveis esperas por banco ou lock).
        const startedAt = deps.clock();
        const authorization = evaluateActivationAuthorization(locked, startedAt, deps.offer());
        if (!authorization.ok) throw new EvaluationActivationDenied(locked.status, authorization.reason);
        const integrity = grantTermsIntegrity(locked);
        if (!integrity.ok) throw new EvaluationActivationDenied(locked.status, integrity.reason);
        // Policies = exatamente o subconjunto aceito, dentro do catálogo versionado; nada além do concedido.
        const actions = resolveEvaluationPolicyActions(integrity.terms);
        if (!actions.ok) throw new EvaluationActivationDenied(locked.status, actions.reason);
        policyActions = actions.actions;
        installedAt = startedAt;
        if (authorization.mode === "first_activation") {
          const termsHash = hashEvaluationTerms(authorization.terms);
          const validUntil = new Date(startedAt.getTime() + authorization.terms.durationDays * 86_400_000);
          // Única transição `pre_ativacao → aprovado`: só altera se o aceite ainda for o do hash vigente e nada tiver iniciado.
          const started = await client.$executeRaw`
            UPDATE vertical_access_approvals
            SET status = 'aprovado', grant_started_at = ${startedAt}::timestamp, grant_valid_until = ${validUntil}::timestamp,
                evaluation_used_at = ${startedAt}::timestamp, revocation_mode = NULL, updated_at = NOW()
            WHERE id = ${locked.id} AND status = 'pre_ativacao' AND grant_kind = 'evaluation' AND grant_started_at IS NULL
              AND grant_terms_hash = ${termsHash} AND grant_accepted_hash = ${termsHash}
          `;
          if (!started) throw new EvaluationActivationConflict();
          await insertVerticalAccessEvent(client, locked, {
            from: "pre_ativacao",
            to: "aprovado",
            actor: `user:${activatedByUserId ?? "unknown"}`,
            channel: "chat",
            detail: { evaluation: true, stage: "activated", termsHash, startedAt: startedAt.toISOString(), validUntil: validUntil.toISOString() },
          });
        }
      }
      const now = installedAt ?? deps.clock();
      await tx.$executeRaw`
        INSERT INTO tenant_product_installations (
          id,
          tenant_id,
          workspace_id,
          product,
          status,
          activated_at,
          activated_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          ${crypto.randomUUID()},
          ${tenantId},
          ${workspaceId},
          ${product},
          'active',
          ${now},
          ${activatedByUserId},
          ${now},
          ${now}
        )
        ON CONFLICT (tenant_id, workspace_id, product)
        DO UPDATE SET
          status = 'active',
          activated_at = EXCLUDED.activated_at,
          activated_by_user_id = EXCLUDED.activated_by_user_id,
          updated_at = EXCLUDED.updated_at;
      `;
      await provisionWorkspaceAgentAssignments({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        workspaceId,
        agents: productAgents,
        trigger: `product_activation:${product}`,
        catalogVersion: WORKSPACE_AGENT_PROVISIONING_VERSION,
      });
      // ADR-010 (PR A2): grant only the approved default action policies (avaliação: só o subconjunto aceito).
      await provisionWorkspaceActionPolicies({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        workspaceId,
        actionNames: policyActions,
      });
    });
  } catch (error) {
    if (error instanceof EvaluationActivationDenied) {
      return { ok: false, code: "VERTICAL_NOT_APPROVED", accessStatus: error.accessStatus, reason: error.reason };
    }
    if (error instanceof EvaluationActivationConflict) {
      // Outro processo alterou a linha primeiro. Só é sucesso idempotente com instalação ATIVA e grant efetivamente válido.
      const after = await readVerticalAccess({ prisma: params.prisma, tenantId, workspaceId, vertical: product, now: deps.clock() });
      const installed = await readInstallation(params.prisma, tenantId, workspaceId, product);
      if (after?.grantKind && after.status === "aprovado" && installed?.status === "active") {
        return { ok: true, installation: installed, releasedRoutes: PRODUCT_RELEASED_ROUTES[product] ?? [] };
      }
      return { ok: false, code: "VERTICAL_NOT_APPROVED", accessStatus: after?.status ?? null, reason: "activation_conflict" };
    }
    return { ok: false, code: "WORKSPACE_AGENT_PROVISIONING_FAILED", error };
  }

  const installation = await readInstallation(params.prisma, tenantId, workspaceId, product);
  if (!installation) return { ok: false, code: "INSTALLATION_WRITE_FAILED" };
  return { ok: true, installation, releasedRoutes: PRODUCT_RELEASED_ROUTES[product] ?? [] };
}

async function readInstallation(prisma: PrismaClient, tenantId: string, workspaceId: string, product: string) {
  const rows = await prisma.$queryRaw<ProductInstallationRow[]>`
    SELECT
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      product,
      status,
      activated_at AS "activatedAt",
      activated_by_user_id AS "activatedByUserId"
    FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
      AND product = ${product}
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

/**
 * Quem pode ativar produtos no workspace: Founder ou quem tem
 * `products.activate`. Sem usuário identificado, nega (fail-closed).
 */
export async function canUserActivateProducts(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string | null | undefined;
}) {
  if (!params.userId) return false;
  const profile = await readWorkspaceResponsibleProfile({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
  }).catch(() => null);
  return canActivateProducts(profile);
}

export const PRODUCT_ACTIVATION_DENIED = {
  code: "PRODUCT_ACTIVATION_FORBIDDEN",
  message: "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode ativar verticais neste workspace.",
} as const;

/** Mensagens para o cliente conforme o estado da liberação pela EIAH (ADR-011 §2.4). */
export function verticalNotApprovedError(accessStatus: string | null | undefined) {
  if (accessStatus === "pendente" || accessStatus === "em_analise" || accessStatus === "aguardando_humano") {
    return { code: "VERTICAL_APPROVAL_PENDING", message: "O pedido de liberação está em análise pela EIAH.", accessStatus };
  }
  if (accessStatus === "recusado") {
    return { code: "VERTICAL_APPROVAL_REFUSED", message: "A EIAH não liberou esta vertical. Fale com a EIAH para entender o motivo.", accessStatus };
  }
  if (accessStatus === "revogado") {
    return { code: "VERTICAL_APPROVAL_REVOKED", message: "A liberação desta vertical foi revogada pela EIAH.", accessStatus };
  }
  if (accessStatus === "pre_ativacao") {
    return {
      code: "VERTICAL_EVALUATION_NOT_ACTIVATABLE",
      message: "A avaliação ainda não pode ser ativada: ela exige as condições propostas pela EIAH, o seu aceite e a confirmação da ativação, nesta ordem.",
      accessStatus,
    };
  }
  if (accessStatus === "encerrado") {
    return { code: "VERTICAL_EVALUATION_ENDED", message: "A avaliação desta vertical foi encerrada.", accessStatus };
  }
  return { code: "VERTICAL_NOT_APPROVED", message: "Esta vertical precisa ser liberada pela EIAH antes de ativar. Solicite a liberação.", accessStatus: accessStatus ?? null };
}
