import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { resolvePlanPricingProfile, type PlanPricingCode } from "@eiah/core/services/tenantInvoiceService";
import { canUserActivateProducts } from "./products/productActivation";
import { listSettlementProviders, settleWithProvider, type SettlementProviderId } from "./settlementProviders";

/**
 * ADR-011 §2.8: conta de billing e primeira mensalidade pelo front door (`/app/chat`).
 * - Quem pode: Founder e quem tem `products.activate` (as mesmas pessoas que pedem a liberação).
 * - Planos: os perfis que já existem (`solo`, `starter`, `growth`, `scale`), com os preços atuais.
 * - Conta existente não é alterada (troca de plano fica fora).
 * - Pagamento só simulado: em modo `full` é recusado, porque não há integração real. O ledger recebe um evento
 *   de valor zero com o modo explícito, para não somar dinheiro inexistente. Não conta no score.
 */

export const FRONT_DOOR_PLAN_CODES: PlanPricingCode[] = ["solo", "starter", "growth", "scale"];

/** Meio usado na primeira mensalidade pela conversa. */
const FIRST_PAYMENT_PROVIDER: SettlementProviderId = "bank";

const FIRST_PAYMENT_MODEL = "front_door.first_payment.simulated";
const firstPaymentRequestId = (tenantId: string) => `front_door.first_payment:${tenantId}`;

export class FrontDoorBillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const FORBIDDEN = () =>
  new FrontDoorBillingError(403, "FRONT_DOOR_BILLING_FORBIDDEN", "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode cuidar do billing.");

type Scope = { prisma: PrismaClient; tenantId: string; workspaceId: string; userId: string };

const formatBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

export function listFrontDoorPlans() {
  return FRONT_DOOR_PLAN_CODES.map((code) => {
    const plan = resolvePlanPricingProfile(code);
    return {
      code: plan.code,
      label: plan.label,
      monthlyPriceCents: plan.basePriceCents,
      includedUsers: plan.includedUsers,
      includedRuns: plan.includedRuns,
      includedWorkspaces: plan.includedWorkspaces,
    };
  });
}

function paymentMode() {
  return listSettlementProviders().find((provider) => provider.id === FIRST_PAYMENT_PROVIDER)?.mode ?? "simulated";
}

async function readAccount(prisma: PrismaClient, tenantId: string) {
  const rows = await prisma.$queryRaw<Array<{ plan_code: string; status: string; currency: string; created_at: Date }>>`
    SELECT plan_code, status, currency, created_at FROM tenant_billing_account WHERE tenant_id = ${tenantId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const plan = resolvePlanPricingProfile(row.plan_code);
  return {
    planCode: plan.code,
    planLabel: plan.label,
    monthlyPriceCents: plan.basePriceCents,
    status: row.status,
    currency: row.currency,
    createdAt: row.created_at.toISOString(),
  };
}

async function readFirstPayment(prisma: PrismaClient, tenantId: string) {
  const rows = await prisma.$queryRaw<Array<{ description: string | null; created_at: Date }>>`
    SELECT description, created_at FROM billing_ledger
    WHERE tenant_id = ${tenantId} AND request_id = ${firstPaymentRequestId(tenantId)} AND model = ${FIRST_PAYMENT_MODEL}
    ORDER BY created_at ASC LIMIT 1
  `;
  const row = rows[0];
  return row ? { mode: "simulated" as const, paidAt: row.created_at.toISOString(), description: row.description } : null;
}

/** O que a conversa precisa para avisar e oferecer o próximo passo. Nunca mostra score. */
export async function readFrontDoorBilling(scope: Scope) {
  const [canManage, account, firstPayment] = await Promise.all([
    canUserActivateProducts(scope),
    readAccount(scope.prisma, scope.tenantId),
    readFirstPayment(scope.prisma, scope.tenantId),
  ]);
  return {
    canManage,
    account,
    accountActive: account?.status === "active",
    firstPayment,
    paymentMode: paymentMode(),
    plans: listFrontDoorPlans(),
  };
}

async function audit(prisma: PrismaClient, tenantId: string, eventType: string, message: string, metadata: Record<string, unknown>) {
  await (prisma as any).guardrailAuditLedger.create({
    data: { tenantId, eventType, severity: "info", message, metadata: { channel: "chat", ...metadata } },
  });
}

export async function createFrontDoorBillingAccount(scope: Scope & { planCode: PlanPricingCode }) {
  if (!(await canUserActivateProducts(scope))) throw FORBIDDEN();
  const existing = await readAccount(scope.prisma, scope.tenantId);
  if (existing) return { outcome: "already_exists" as const, account: existing };
  const plan = resolvePlanPricingProfile(scope.planCode);
  // `ON CONFLICT` cobre dois cliques ao mesmo tempo: a conta existente nunca é alterada.
  const inserted = await scope.prisma.$executeRaw`
    INSERT INTO tenant_billing_account (id, tenant_id, plan_code, currency, status, cycle_anchor_day, created_at, updated_at)
    VALUES (${`tba_${crypto.randomUUID()}`}, ${scope.tenantId}, ${plan.code}, 'BRL', 'active', 1, NOW(), NOW())
    ON CONFLICT (tenant_id) DO NOTHING
  `;
  const account = await readAccount(scope.prisma, scope.tenantId);
  if (!account) throw new Error("FRONT_DOOR_BILLING_ACCOUNT_WRITE_FAILED");
  if (inserted === 0) return { outcome: "already_exists" as const, account };
  await audit(scope.prisma, scope.tenantId, "billing.account.created", "Conta de billing criada pela conversa do front door.", {
    planCode: plan.code,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  return { outcome: "created" as const, account };
}

export async function payFrontDoorFirstMonth(scope: Scope) {
  if (!(await canUserActivateProducts(scope))) throw FORBIDDEN();
  const account = await readAccount(scope.prisma, scope.tenantId);
  if (!account || account.status !== "active") {
    throw new FrontDoorBillingError(409, "FRONT_DOOR_BILLING_ACCOUNT_REQUIRED", "Crie a conta de billing antes de pagar.");
  }
  const existing = await readFirstPayment(scope.prisma, scope.tenantId);
  if (existing) return { outcome: "already_paid" as const, payment: existing, account };
  if (paymentMode() !== "simulated") {
    throw new FrontDoorBillingError(
      409,
      "FRONT_DOOR_PAYMENT_NOT_CONNECTED",
      "O pagamento real ainda não está ligado à conversa. Nada foi cobrado.",
    );
  }
  const requestId = firstPaymentRequestId(scope.tenantId);
  const settlement = await settleWithProvider(FIRST_PAYMENT_PROVIDER, {
    paymentIntentId: requestId,
    amountCents: account.monthlyPriceCents,
    currency: account.currency,
    requestId,
    metadata: { source: "front_door", simulated: true },
  });
  const description = `Primeira mensalidade ${account.planLabel} ${formatBrl(account.monthlyPriceCents)} — pagamento simulado, sem cobrança real (${settlement.providerSettlementId}).`;
  await scope.prisma.$executeRaw`
    INSERT INTO billing_ledger (id, tenant_id, workspace_id, run_id, type, amount_cents, currency, description, request_id, provider, model, created_at)
    SELECT ${`bl_${crypto.randomUUID()}`}, ${scope.tenantId}, ${scope.workspaceId}, NULL, 'adjustment', 0, ${account.currency},
           ${description}, ${requestId}, ${FIRST_PAYMENT_PROVIDER}, ${FIRST_PAYMENT_MODEL}, NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM billing_ledger WHERE tenant_id = ${scope.tenantId} AND request_id = ${requestId} AND model = ${FIRST_PAYMENT_MODEL}
    )
  `;
  await audit(scope.prisma, scope.tenantId, "billing.first_payment.simulated", "Primeira mensalidade paga pela conversa (simulado).", {
    planCode: account.planCode,
    amountCents: account.monthlyPriceCents,
    provider: FIRST_PAYMENT_PROVIDER,
    adapterMode: "simulated",
    providerSettlementId: settlement.providerSettlementId,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
  const payment = await readFirstPayment(scope.prisma, scope.tenantId);
  if (!payment) throw new Error("FRONT_DOOR_FIRST_PAYMENT_WRITE_FAILED");
  return { outcome: "paid" as const, payment, account };
}
