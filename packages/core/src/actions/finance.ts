import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  encodeGuardrailKey,
  rateLimit,
  requireIdempotency,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";
import { getFinanceAdapter } from "./integrations/finance/financeAdapter";

export type RegisterFinanceActionsOptions = {
  idempotencyStore: IdempotencyStore;
  rateLimiter: RateLimiter;
};

const validateDocumentInputSchema = z.object({
  documentId: z.string().optional(),
  fileName: z.string().optional(),
  supplierName: z.string().optional(),
  supplierTaxId: z.string().optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional(),
  currency: z.string().default("BRL"),
  source: z.enum(["email", "upload", "erp", "api"]).default("upload"),
  metadata: z.record(z.unknown()).optional(),
});

const validateDocumentOutputSchema = z.object({
  status: z.enum(["validated", "needs_review"]),
  documentId: z.string(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string(),
  dueDate: z.string().nullable(),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const registerPayableInputSchema = z.object({
  supplierName: z.string().min(1),
  supplierTaxId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default("BRL"),
  dueDate: z.string().min(1),
  documentId: z.string().optional(),
  costCenter: z.string().optional(),
  category: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

const registerPayableOutputSchema = z.object({
  payableId: z.string(),
  status: z.literal("registered"),
  externalRef: z.string().nullable(),
});

const monitorDueDatesInputSchema = z.object({
  payables: z.array(
    z.object({
      payableId: z.string(),
      dueDate: z.string(),
      amount: z.number(),
      currency: z.string().default("BRL"),
      status: z.enum(["open", "scheduled", "paid"]).default("open"),
    })
  ),
  horizonDays: z.number().int().positive().max(90).default(7),
});

const monitorDueDatesOutputSchema = z.object({
  horizonDays: z.number().int().positive(),
  summary: z.object({
    totalOpen: z.number().int().nonnegative(),
    totalDueSoon: z.number().int().nonnegative(),
    totalAmountDueSoon: z.number().nonnegative(),
  }),
  dueSoon: z.array(
    z.object({
      payableId: z.string(),
      dueDate: z.string(),
      amount: z.number(),
      currency: z.string(),
      daysToDue: z.number().int(),
    })
  ),
});

const reconcileInputSchema = z.object({
  bankTransactions: z.array(
    z.object({
      id: z.string(),
      postedAt: z.string(),
      amount: z.number(),
      currency: z.string().default("BRL"),
      reference: z.string().optional(),
      counterpartyTaxId: z.string().optional(),
    })
  ),
  payables: z.array(
    z.object({
      payableId: z.string(),
      amount: z.number(),
      currency: z.string().default("BRL"),
      dueDate: z.string().optional(),
      supplierTaxId: z.string().optional(),
      externalRef: z.string().optional(),
    })
  ),
});

const reconcileOutputSchema = z.object({
  matched: z.array(
    z.object({
      payableId: z.string(),
      transactionId: z.string(),
      strategy: z.enum(["reference", "amount_taxid"]),
    })
  ),
  unmatchedTransactions: z.array(z.string()),
  unmatchedPayables: z.array(z.string()),
});

const generateReportInputSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  payables: z.array(
    z.object({
      amount: z.number(),
      currency: z.string().default("BRL"),
      status: z.enum(["open", "scheduled", "paid", "overdue"]),
    })
  ),
});

const generateReportOutputSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  currency: z.string(),
  totals: z.object({
    open: z.number(),
    scheduled: z.number(),
    paid: z.number(),
    overdue: z.number(),
    grandTotal: z.number(),
  }),
});

const archiveDocumentInputSchema = z.object({
  documentId: z.string().min(1),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  storagePath: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

const archiveDocumentOutputSchema = z.object({
  archived: z.literal(true),
  location: z.string(),
  checksum: z.string(),
});

export function registerFinanceActions(options: RegisterFinanceActionsOptions) {
  const adapter = getFinanceAdapter();

  registerAction({
    name: "finance.validatePaymentDocument",
    description: "Validate invoices/contracts/payment slips before payment scheduling.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: validateDocumentInputSchema,
      output: validateDocumentOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["finance", "validate-doc", context.workspaceId ?? context.tenantId ?? "global"].join(":"),
        onLimitExceededMessage: "Document validation rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = validateDocumentInputSchema.parse(input);
      logger?.("finance.validate_document.start", {
        documentId: payload.documentId ?? null,
        source: payload.source,
      });
      const output = await adapter.validatePaymentDocument(payload);
      return { status: "success", output: validateDocumentOutputSchema.parse(output) };
    },
  });

  registerAction({
    name: "finance.registerPayable",
    description: "Create accounts-payable title/entry in ERP or financial system.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: registerPayableInputSchema,
      output: registerPayableOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof registerPayableInputSchema>;
          return encodeGuardrailKey({
            tenantId: context.tenantId ?? "global",
            actionType: context.action,
            idempotencyKey:
              payload?.idempotencyKey ??
              [payload?.supplierTaxId, payload?.dueDate, payload?.amount].filter(Boolean).join(":"),
          });
        },
        ttlMs: 60 * 60 * 1000,
        onDuplicateMessage: "Payable already registered recently with same key.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = registerPayableInputSchema.parse(input);
      logger?.("finance.register_payable.start", {
        supplierName: payload.supplierName,
        amount: payload.amount,
        dueDate: payload.dueDate,
      });
      const output = await adapter.registerPayable(payload);
      return { status: "success", output: registerPayableOutputSchema.parse(output) };
    },
  });

  registerAction({
    name: "finance.monitorDueDates",
    description: "Monitor AP due dates and summarize upcoming obligations.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: monitorDueDatesInputSchema,
      output: monitorDueDatesOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["finance", "monitor-due", context.workspaceId ?? context.tenantId ?? "global"].join(":"),
        onLimitExceededMessage: "Due-date monitoring rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = monitorDueDatesInputSchema.parse(input);
      logger?.("finance.monitor_due_dates.start", {
        payables: payload.payables.length,
        horizonDays: payload.horizonDays,
      });
      const output = await adapter.monitorDueDates(payload);
      return { status: "success", output: monitorDueDatesOutputSchema.parse(output) };
    },
  });

  registerAction({
    name: "finance.reconcileBankTransactions",
    description: "Reconcile bank transactions against AP records.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: reconcileInputSchema,
      output: reconcileOutputSchema,
    },
    handler: async ({ input, logger }) => {
      const payload = reconcileInputSchema.parse(input);
      logger?.("finance.reconcile.start", {
        bankTransactions: payload.bankTransactions.length,
        payables: payload.payables.length,
      });
      const output = await adapter.reconcileBankTransactions(payload);
      return { status: "success", output: reconcileOutputSchema.parse(output) };
    },
  });

  registerAction({
    name: "finance.generateFinancialReport",
    description: "Generate AP report and aggregate totals by status.",
    version: "1.0.0",
    criticality: "medium",
    contract: {
      input: generateReportInputSchema,
      output: generateReportOutputSchema,
    },
    handler: async ({ input, logger }) => {
      const payload = generateReportInputSchema.parse(input);
      logger?.("finance.report.start", {
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        entries: payload.payables.length,
      });
      const output = await adapter.generateFinancialReport(payload);
      return { status: "success", output: generateReportOutputSchema.parse(output) };
    },
  });

  registerAction({
    name: "finance.archivePaymentDocument",
    description: "Archive payment proof and financial documents in configured storage.",
    version: "1.0.0",
    criticality: "high",
    contract: {
      input: archiveDocumentInputSchema,
      output: archiveDocumentOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof archiveDocumentInputSchema>;
          return encodeGuardrailKey({
            tenantId: context.tenantId ?? "global",
            actionType: context.action,
            idempotencyKey: payload?.idempotencyKey ?? payload?.documentId ?? context.runId ?? "",
          });
        },
        ttlMs: 24 * 60 * 60 * 1000,
        onDuplicateMessage: "Document already archived in the last 24h with same key.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = archiveDocumentInputSchema.parse(input);
      logger?.("finance.archive_document.start", {
        documentId: payload.documentId,
      });
      const output = await adapter.archivePaymentDocument(payload);
      return { status: "success", output: archiveDocumentOutputSchema.parse(output) };
    },
  });
}

