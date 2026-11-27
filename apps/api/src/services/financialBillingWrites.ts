import { z } from "zod";
import { FINANCIAL_AUTHORITY_SCOPES } from "@eiah/core";
import {
  BillingLedgerService,
  QuotaUsageService,
  ensureTenantBillingDefaults,
} from "./tenantBilling";
import {
  FINANCIAL_EVIDENCE_REF_PATTERN,
  FinancialAuditError,
  INT32_MAX,
  evaluateFinancialAuthority,
  financialAppliedMetadata,
  writeFinancialAuditEvent,
  type FinancialActor,
  type FinancialAuditWriter,
  type FinancialAuthorityGranted,
  type FinancialLimits,
} from "./financialAuthority";

/**
 * Escritas financeiras AUTORIZADAS (AUTHZ-FIN-1, proposta; BILLING-003). Todas rodam numa ÚNICA transação PostgreSQL: o efeito
 * financeiro e o evento de auditoria nascem juntos ou não nascem. Falha da auditoria desfaz o efeito (`BILLING_AUDIT_UNAVAILABLE`);
 * qualquer outra falha desfaz tudo (`BILLING_WRITE_UNAVAILABLE`). Nada aqui concede autoridade: a decisão de autoridade é feita
 * antes (`requireFinancialAuthority`) e os parâmetros chegam já verificados.
 */

type Prisma = any;

export type WriteFailure = { ok: false; status: number; code: string; message: string };

class DomainAbort extends Error {
  constructor(readonly failure: WriteFailure) {
    super(failure.code);
  }
}
const abort = (status: number, code: string, message: string): never => {
  throw new DomainAbort({ ok: false, status, code, message });
};

function toFailure(error: unknown): WriteFailure {
  if (error instanceof DomainAbort) return error.failure;
  if (error instanceof FinancialAuditError) {
    return {
      ok: false,
      status: 503,
      code: "BILLING_AUDIT_UNAVAILABLE",
      message: "Não foi possível registrar a evidência da operação. Nada foi alterado.",
    };
  }
  return {
    ok: false,
    status: 503,
    code: "BILLING_WRITE_UNAVAILABLE",
    message: "Não foi possível concluir a operação financeira. Nada foi alterado.",
  };
}

const V2_UNAVAILABLE: WriteFailure = {
  ok: false,
  status: 409,
  code: "TENANT_BILLING_V2_UNAVAILABLE",
  message: "Tenant billing v2 not available in current runtime",
};

function hasTenantBillingV2(client: Prisma) {
  return Boolean(
    client &&
      typeof client === "object" &&
      client.tenantBillingAccount &&
      client.tenantQuotaPolicy &&
      client.tenantQuotaUsage &&
      client.workspaceQuotaGrant &&
      client.billingLedger,
  );
}

// ───────────────────────────── corpos estritos ─────────────────────────────

const reasonField = z.string().trim().min(3).max(300);
const evidenceRefField = z.string().regex(FINANCIAL_EVIDENCE_REF_PATTERN);
const limitInt = z.number().int().min(0).max(INT32_MAX);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{2,127}$/;

const justification = { reason: reasonField, evidenceRef: evidenceRefField, confirmed: z.literal(true) };

export const quotasBodySchema = z
  .object({
    softLimitPct: z.number().int().optional(),
    hardLimitPct: z.number().int().optional(),
    monthlyRunsLimit: limitInt.optional(),
    monthlyCostCentsLimit: limitInt.optional(),
    ...justification,
  })
  .strict();

export const grantBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    localRunLimit: limitInt.optional(),
    localCostCentsLimit: limitInt.optional(),
    ...justification,
  })
  .strict();

const adjustmentFields = {
  amountCents: z.number().int().min(-INT32_MAX).max(INT32_MAX),
  currency: z.literal("BRL").optional(),
  workspaceId: z.string().min(1).max(128).optional(),
  runId: z.string().min(1).max(128).optional(),
  provider: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(128).optional(),
  description: z.string().max(300).optional(),
  requestId: z.string().regex(REQUEST_ID_PATTERN),
};

export const adjustmentBodySchema = z.object({ ...adjustmentFields, ...justification }).strict();
/** Pedido de ajuste sem o `confirmed` da rota: a confirmação humana vem da aprovação, não do corpo. */
export const adjustmentRequestSchema = z
  .object({ ...adjustmentFields, reason: reasonField, evidenceRef: evidenceRefField })
  .strict();
export type AdjustmentRequest = z.infer<typeof adjustmentRequestSchema>;

export function invalidPayload(error: z.ZodError): WriteFailure & { details: unknown } {
  return { ok: false, status: 400, code: "INVALID_PAYLOAD", message: "Corpo inválido.", details: error.flatten() };
}

export function adjustmentAmountFailure(amountCents: number): WriteFailure | null {
  if (amountCents === 0) {
    return { ok: false, status: 400, code: "INVALID_AMOUNT", message: "amountCents must be a non-zero integer" };
  }
  return null;
}

/** Teto por lançamento da designação (obrigatório, sem valor padrão). */
export function adjustmentCeilingFailure(limits: FinancialLimits, amountCents: number): WriteFailure | null {
  const cap = limits.maxAdjustmentCents;
  if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1) {
    return { ok: false, status: 403, code: "BILLING_AUTHORITY_REQUIRED", message: "A designação não tem um teto de ajuste válido." };
  }
  if (Math.abs(amountCents) > cap) {
    return { ok: false, status: 403, code: "BILLING_LIMIT_EXCEEDED", message: "O valor excede o teto de ajuste da sua designação." };
  }
  return null;
}

type WriteOptions = { audit?: FinancialAuditWriter; now?: Date };

// ───────────────────────────── quotas ─────────────────────────────

export type QuotaInput = {
  softLimitPct: number | null;
  hardLimitPct: number | null;
  monthlyRunsLimit: number | null;
  monthlyCostCentsLimit: number | null;
};

const pickPolicy = (row: any) =>
  row
    ? {
        softLimitPct: row.softLimitPct,
        hardLimitPct: row.hardLimitPct,
        monthlyRunsLimit: row.monthlyRunsLimit ?? null,
        monthlyCostCentsLimit: row.monthlyCostCentsLimit ?? null,
      }
    : null;

export async function applyQuotaUpdate(
  prisma: Prisma,
  args: { authority: FinancialAuthorityGranted; quotas: QuotaInput; reason: string; evidenceRef: string },
  options: WriteOptions = {},
): Promise<{ ok: true; policy: unknown } | WriteFailure> {
  if (!hasTenantBillingV2(prisma)) return V2_UNAVAILABLE;
  const audit = options.audit ?? writeFinancialAuditEvent;
  const { authority, quotas } = args;
  try {
    const policy = await prisma.$transaction(async (tx: Prisma) => {
      const existing = await tx.tenantQuotaPolicy.findUnique({ where: { tenantId: authority.tenantId } });
      const nextSoft = quotas.softLimitPct ?? existing?.softLimitPct ?? 80;
      const nextHard = quotas.hardLimitPct ?? existing?.hardLimitPct ?? 100;
      if (nextSoft < 0 || nextSoft > 100 || nextHard < 0 || nextHard > 100 || nextSoft > nextHard) {
        abort(400, "INVALID_LIMITS", "soft/hard limits must be 0-100 and soft<=hard");
      }
      const saved = await tx.tenantQuotaPolicy.upsert({
        where: { tenantId: authority.tenantId },
        create: {
          tenantId: authority.tenantId,
          softLimitPct: nextSoft,
          hardLimitPct: nextHard,
          monthlyRunsLimit: quotas.monthlyRunsLimit,
          monthlyCostCentsLimit: quotas.monthlyCostCentsLimit,
        },
        update: {
          softLimitPct: nextSoft,
          hardLimitPct: nextHard,
          ...(quotas.monthlyRunsLimit !== null ? { monthlyRunsLimit: quotas.monthlyRunsLimit } : {}),
          ...(quotas.monthlyCostCentsLimit !== null ? { monthlyCostCentsLimit: quotas.monthlyCostCentsLimit } : {}),
          updatedAt: new Date(),
        },
      });
      await audit(tx, {
        eventType: "billing.quota.updated",
        message: "billing.quota updated",
        metadata: financialAppliedMetadata(
          authority,
          {
            operation: "quota.update",
            reason: args.reason,
            evidenceRef: args.evidenceRef,
            before: pickPolicy(existing),
            after: pickPolicy(saved),
          },
          options.now,
        ),
      });
      return saved;
    });
    return { ok: true, policy };
  } catch (error) {
    return toFailure(error);
  }
}

// ───────────────────────────── concessão por workspace ─────────────────────────────

const pickGrant = (row: any) =>
  row
    ? {
        enabled: row.enabled,
        localRunLimit: row.localRunLimit ?? null,
        localCostCentsLimit: row.localCostCentsLimit ?? null,
      }
    : null;

export async function applyWorkspaceGrantUpdate(
  prisma: Prisma,
  args: {
    authority: FinancialAuthorityGranted;
    workspaceId: string;
    enabled: boolean | undefined;
    localRunLimit: number | null;
    localCostCentsLimit: number | null;
    reason: string;
    evidenceRef: string;
  },
  options: WriteOptions = {},
): Promise<{ ok: true; grant: unknown } | WriteFailure> {
  if (!hasTenantBillingV2(prisma)) return V2_UNAVAILABLE;
  const audit = options.audit ?? writeFinancialAuditEvent;
  const { authority } = args;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: args.workspaceId },
      select: { id: true, tenantId: true },
    });
    if (!workspace || workspace.tenantId !== authority.tenantId) {
      return { ok: false, status: 404, code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" };
    }
    const grant = await prisma.$transaction(async (tx: Prisma) => {
      await ensureTenantBillingDefaults(tx, { tenantId: authority.tenantId, workspaceId: args.workspaceId });
      const where = { workspace_quota_grant_unique: { tenantId: authority.tenantId, workspaceId: args.workspaceId } };
      const existing = await tx.workspaceQuotaGrant.findUnique({ where });
      const saved = await tx.workspaceQuotaGrant.upsert({
        where,
        create: {
          tenantId: authority.tenantId,
          workspaceId: args.workspaceId,
          enabled: typeof args.enabled === "boolean" ? args.enabled : true,
          localRunLimit: args.localRunLimit,
          localCostCentsLimit: args.localCostCentsLimit,
        },
        update: {
          ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {}),
          ...(args.localRunLimit !== null ? { localRunLimit: args.localRunLimit } : {}),
          ...(args.localCostCentsLimit !== null ? { localCostCentsLimit: args.localCostCentsLimit } : {}),
          updatedAt: new Date(),
        },
      });
      await audit(tx, {
        eventType: "billing.workspace_grant.updated",
        message: "billing.workspace_grant updated",
        metadata: financialAppliedMetadata(
          authority,
          {
            operation: "workspace_grant.update",
            reason: args.reason,
            evidenceRef: args.evidenceRef,
            targetWorkspaceId: args.workspaceId,
            before: pickGrant(existing),
            after: pickGrant(saved),
          },
          options.now,
        ),
      });
      return saved;
    });
    return { ok: true, grant };
  } catch (error) {
    return toFailure(error);
  }
}

// ───────────────────────────── ajuste aprovado (futuro; SEM rota) ─────────────────────────────

export type AdjustmentApproval = {
  /** Quem propôs o ajuste. */
  proposer: FinancialActor;
  /** Quem aprovou: pessoa DISTINTA do proponente, com autoridade própria. */
  approver: FinancialActor;
  /** Referência da decisão humana de aprovação (mesmo formato de `evidenceRef`). */
  approvalRef: string;
};

export type AppliedAdjustment = {
  ok: true;
  inserted: boolean;
  ledger: unknown;
  usage: unknown;
  cycleStart: Date;
  cycleEnd: Date;
};

/**
 * Aplica um ajuste JÁ APROVADO por duas pessoas distintas. Ainda NÃO é chamada por nenhuma rota: o mecanismo de aprovação por
 * duas pessoas não está ratificado e a rota `POST /billing/tenant/adjustment` segue negada. Existe para que a futura aprovação
 * tenha um único ponto atômico, idempotente e auditado, e é verificada de forma isolada em banco descartável.
 *
 * Garantias: (1) proponente e aprovador são pessoas distintas e cada um tem autoridade `billing.ledger.adjust` válida (vínculo
 * ativo + designação com teto) revalidada aqui; (2) o valor cabe no MENOR dos dois tetos; (3) lançamento, uso de cota e auditoria
 * numa só transação, serializados por `requestId`; (4) replay do mesmo `requestId` não insere, não soma o uso e não audita de novo.
 */
export async function applyApprovedFinancialAdjustment(
  prisma: Prisma,
  input: { tenantId: string; approval: AdjustmentApproval; request: unknown },
  options: WriteOptions = {},
): Promise<AppliedAdjustment | WriteFailure> {
  const audit = options.audit ?? writeFinancialAuditEvent;
  const parsed = adjustmentRequestSchema.safeParse(input.request);
  if (!parsed.success) return invalidPayload(parsed.error);
  const request = parsed.data;
  const amountFailure = adjustmentAmountFailure(request.amountCents);
  if (amountFailure) return amountFailure;

  const { proposer, approver, approvalRef } = input.approval;
  if (!FINANCIAL_EVIDENCE_REF_PATTERN.test(String(approvalRef))) {
    return { ok: false, status: 400, code: "INVALID_PAYLOAD", message: "approvalRef inválido." };
  }
  if (proposer.tenantId !== input.tenantId || approver.tenantId !== input.tenantId) {
    return { ok: false, status: 403, code: "BILLING_AUTHORITY_REQUIRED", message: "Autoridade de outro tenant não vale." };
  }
  const proposerId = String(proposer.userId ?? "").trim();
  const approverId = String(approver.userId ?? "").trim();
  if (!proposerId || !approverId || proposerId === approverId) {
    return {
      ok: false,
      status: 403,
      code: "BILLING_APPROVER_NOT_INDEPENDENT",
      message: "O ajuste exige aprovação de uma pessoa diferente de quem o propôs.",
    };
  }

  const proposerDecision = await evaluateFinancialAuthority(prisma, proposer, FINANCIAL_AUTHORITY_SCOPES.ledgerAdjust, options.now);
  if (!proposerDecision.ok) return { ok: false, status: proposerDecision.status, code: proposerDecision.code, message: proposerDecision.message };
  const approverDecision = await evaluateFinancialAuthority(prisma, approver, FINANCIAL_AUTHORITY_SCOPES.ledgerAdjust, options.now);
  if (!approverDecision.ok) return { ok: false, status: approverDecision.status, code: approverDecision.code, message: approverDecision.message };

  for (const decision of [proposerDecision, approverDecision]) {
    const ceiling = adjustmentCeilingFailure(decision.limits, request.amountCents);
    if (ceiling) return ceiling;
  }

  if (!hasTenantBillingV2(prisma)) return V2_UNAVAILABLE;
  if (request.workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: request.workspaceId }, select: { id: true, tenantId: true } });
    if (!workspace || workspace.tenantId !== input.tenantId) {
      return { ok: false, status: 404, code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" };
    }
  }

  try {
    return await prisma.$transaction(async (tx: Prisma): Promise<AppliedAdjustment> => {
      // Serializa o mesmo (tenant, requestId): o ledger não tem índice único em request_id.
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`billing.adjustment:${input.tenantId}:${request.requestId}`}, 0))) AS l`;

      const quotaUsage = new QuotaUsageService(tx);
      const existing = await tx.billingLedger.findFirst({
        where: { tenantId: input.tenantId, requestId: request.requestId, entryType: "adjustment" },
      });
      if (existing) {
        const cycle = await quotaUsage.resolveCycle({ tenantId: input.tenantId });
        const usage = await tx.tenantQuotaUsage.findUnique({
          where: { tenant_quota_usage_cycle_unique: { tenantId: input.tenantId, cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd } },
        });
        return { ok: true, inserted: false, ledger: existing, usage, cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd };
      }

      const ledgerResult = await new BillingLedgerService(tx).insertAdjustment({
        tenantId: input.tenantId,
        workspaceId: request.workspaceId ?? null,
        runId: request.runId ?? null,
        amountCents: request.amountCents,
        currency: "BRL",
        description: request.description ?? request.reason,
        requestId: request.requestId,
        provider: request.provider ?? null,
        model: request.model ?? null,
      });
      if (!ledgerResult.inserted) abort(503, "BILLING_WRITE_UNAVAILABLE", "O lançamento não foi gravado. Nada foi alterado.");

      const snapshot = await quotaUsage.incrementFromEvent({
        tenantId: input.tenantId,
        amountCents: request.amountCents,
        entryType: "adjustment",
      });

      await audit(tx, {
        eventType: "billing.adjustment.applied",
        message: "billing.adjustment applied (two-person approval)",
        metadata: financialAppliedMetadata(
          approverDecision,
          {
            operation: "adjustment.apply",
            reason: request.reason,
            evidenceRef: request.evidenceRef,
            requestId: request.requestId,
            ledgerEntryId: (ledgerResult.entry as { id?: string }).id ?? null,
            amountCents: request.amountCents,
            currency: "BRL",
            targetWorkspaceId: request.workspaceId ?? null,
            proposerUserId: proposerDecision.actorUserId,
            proposerDesignationId: proposerDecision.designationId,
            approverUserId: approverDecision.actorUserId,
            approverDesignationId: approverDecision.designationId,
            approvalRef,
          },
          options.now,
        ),
      });

      return {
        ok: true,
        inserted: true,
        ledger: ledgerResult.entry,
        usage: snapshot.usage,
        cycleStart: snapshot.cycle.cycleStart,
        cycleEnd: snapshot.cycle.cycleEnd,
      };
    });
  } catch (error) {
    return toFailure(error);
  }
}
