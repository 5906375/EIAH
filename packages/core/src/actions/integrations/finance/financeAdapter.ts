export type PaymentDocumentInput = {
  documentId?: string;
  fileName?: string;
  supplierName?: string;
  supplierTaxId?: string;
  amount?: number;
  dueDate?: string;
  currency?: string;
  source?: "email" | "upload" | "erp" | "api";
  metadata?: Record<string, unknown>;
};

export type ValidatedPaymentDocument = {
  status: "validated" | "needs_review";
  documentId: string;
  supplierName: string | null;
  supplierTaxId: string | null;
  amount: number | null;
  currency: string;
  dueDate: string | null;
  warnings: string[];
  confidence: number;
};

export type RegisterPayableInput = {
  supplierName: string;
  supplierTaxId?: string;
  amount: number;
  currency?: string;
  dueDate: string;
  documentId?: string;
  costCenter?: string;
  category?: string;
  metadata?: Record<string, unknown>;
};

export type RegisterPayableOutput = {
  payableId: string;
  status: "registered";
  externalRef: string | null;
};

export type DueMonitorInput = {
  payables: Array<{
    payableId: string;
    dueDate: string;
    amount: number;
    currency?: string;
    status?: "open" | "scheduled" | "paid";
  }>;
  horizonDays?: number;
};

export type DueMonitorOutput = {
  horizonDays: number;
  summary: {
    totalOpen: number;
    totalDueSoon: number;
    totalAmountDueSoon: number;
  };
  dueSoon: Array<{
    payableId: string;
    dueDate: string;
    amount: number;
    currency: string;
    daysToDue: number;
  }>;
};

export type ReconcileBankInput = {
  bankTransactions: Array<{
    id: string;
    postedAt: string;
    amount: number;
    currency?: string;
    reference?: string;
    counterpartyTaxId?: string;
  }>;
  payables: Array<{
    payableId: string;
    amount: number;
    currency?: string;
    dueDate?: string;
    supplierTaxId?: string;
    externalRef?: string;
  }>;
};

export type ReconcileBankOutput = {
  matched: Array<{ payableId: string; transactionId: string; strategy: "reference" | "amount_taxid" }>;
  unmatchedTransactions: string[];
  unmatchedPayables: string[];
};

export type FinancialReportInput = {
  periodStart: string;
  periodEnd: string;
  payables: Array<{
    amount: number;
    currency?: string;
    status: "open" | "scheduled" | "paid" | "overdue";
  }>;
};

export type FinancialReportOutput = {
  periodStart: string;
  periodEnd: string;
  currency: string;
  totals: {
    open: number;
    scheduled: number;
    paid: number;
    overdue: number;
    grandTotal: number;
  };
};

export type ArchivePaymentDocumentInput = {
  documentId: string;
  fileName?: string;
  contentType?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
};

export type ArchivePaymentDocumentOutput = {
  archived: true;
  location: string;
  checksum: string;
};

export interface FinanceAdapter {
  validatePaymentDocument(input: PaymentDocumentInput): Promise<ValidatedPaymentDocument>;
  registerPayable(input: RegisterPayableInput): Promise<RegisterPayableOutput>;
  monitorDueDates(input: DueMonitorInput): Promise<DueMonitorOutput>;
  reconcileBankTransactions(input: ReconcileBankInput): Promise<ReconcileBankOutput>;
  generateFinancialReport(input: FinancialReportInput): Promise<FinancialReportOutput>;
  archivePaymentDocument(input: ArchivePaymentDocumentInput): Promise<ArchivePaymentDocumentOutput>;
}

class MockFinanceAdapter implements FinanceAdapter {
  async validatePaymentDocument(input: PaymentDocumentInput): Promise<ValidatedPaymentDocument> {
    const warnings: string[] = [];
    if (!input.amount) warnings.push("amount_missing");
    if (!input.dueDate) warnings.push("due_date_missing");
    if (!input.supplierTaxId) warnings.push("supplier_tax_id_missing");
    return {
      status: warnings.length > 0 ? "needs_review" : "validated",
      documentId: input.documentId ?? `doc-${Date.now()}`,
      supplierName: input.supplierName ?? null,
      supplierTaxId: input.supplierTaxId ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? "BRL",
      dueDate: input.dueDate ?? null,
      warnings,
      confidence: warnings.length > 0 ? 0.74 : 0.96,
    };
  }

  async registerPayable(input: RegisterPayableInput): Promise<RegisterPayableOutput> {
    return {
      payableId: `pay-${Math.random().toString(36).slice(2, 10)}`,
      status: "registered",
      externalRef: input.documentId ?? null,
    };
  }

  async monitorDueDates(input: DueMonitorInput): Promise<DueMonitorOutput> {
    const horizonDays = input.horizonDays ?? 7;
    const now = new Date();
    const dueSoon = input.payables
      .filter((payable) => (payable.status ?? "open") !== "paid")
      .map((payable) => {
        const due = new Date(payable.dueDate);
        const daysToDue = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return {
          payableId: payable.payableId,
          dueDate: payable.dueDate,
          amount: payable.amount,
          currency: payable.currency ?? "BRL",
          daysToDue,
        };
      })
      .filter((item) => item.daysToDue <= horizonDays)
      .sort((a, b) => a.daysToDue - b.daysToDue);

    return {
      horizonDays,
      summary: {
        totalOpen: input.payables.filter((p) => (p.status ?? "open") !== "paid").length,
        totalDueSoon: dueSoon.length,
        totalAmountDueSoon: dueSoon.reduce((sum, item) => sum + item.amount, 0),
      },
      dueSoon,
    };
  }

  async reconcileBankTransactions(input: ReconcileBankInput): Promise<ReconcileBankOutput> {
    const matched = new Map<string, { payableId: string; transactionId: string; strategy: "reference" | "amount_taxid" }>();
    const txByReference = new Map<string, string>();
    input.bankTransactions.forEach((tx) => {
      if (tx.reference) txByReference.set(tx.reference, tx.id);
    });

    for (const payable of input.payables) {
      if (payable.externalRef && txByReference.has(payable.externalRef)) {
        matched.set(payable.payableId, {
          payableId: payable.payableId,
          transactionId: txByReference.get(payable.externalRef)!,
          strategy: "reference",
        });
        continue;
      }
      const tx = input.bankTransactions.find(
        (item) =>
          item.amount === payable.amount &&
          (payable.supplierTaxId ? item.counterpartyTaxId === payable.supplierTaxId : true)
      );
      if (tx) {
        matched.set(payable.payableId, {
          payableId: payable.payableId,
          transactionId: tx.id,
          strategy: "amount_taxid",
        });
      }
    }

    const matchedTransactionIds = new Set(Array.from(matched.values()).map((item) => item.transactionId));
    const unmatchedTransactions = input.bankTransactions
      .filter((tx) => !matchedTransactionIds.has(tx.id))
      .map((tx) => tx.id);
    const unmatchedPayables = input.payables
      .filter((payable) => !matched.has(payable.payableId))
      .map((payable) => payable.payableId);

    return {
      matched: Array.from(matched.values()),
      unmatchedTransactions,
      unmatchedPayables,
    };
  }

  async generateFinancialReport(input: FinancialReportInput): Promise<FinancialReportOutput> {
    const totals = input.payables.reduce(
      (acc, item) => {
        acc[item.status] += item.amount;
        acc.grandTotal += item.amount;
        return acc;
      },
      { open: 0, scheduled: 0, paid: 0, overdue: 0, grandTotal: 0 }
    );
    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.payables[0]?.currency ?? "BRL",
      totals,
    };
  }

  async archivePaymentDocument(
    input: ArchivePaymentDocumentInput
  ): Promise<ArchivePaymentDocumentOutput> {
    const ts = new Date().toISOString().slice(0, 10);
    const fileName = input.fileName ?? `${input.documentId}.pdf`;
    const location = input.storagePath ?? `mock://finance-archive/${ts}/${fileName}`;
    return {
      archived: true,
      location,
      checksum: `sha256:${Buffer.from(`${input.documentId}:${fileName}`).toString("hex").slice(0, 32)}`,
    };
  }
}

class HttpFinanceAdapter implements FinanceAdapter {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  private async call<T>(path: string, input: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Finance adapter request failed (${response.status}) on ${path}`);
    }
    return (await response.json()) as T;
  }

  async validatePaymentDocument(input: PaymentDocumentInput) {
    return this.call<ValidatedPaymentDocument>("/finance/validate-payment-document", input);
  }
  async registerPayable(input: RegisterPayableInput) {
    return this.call<RegisterPayableOutput>("/finance/register-payable", input);
  }
  async monitorDueDates(input: DueMonitorInput) {
    return this.call<DueMonitorOutput>("/finance/monitor-due-dates", input);
  }
  async reconcileBankTransactions(input: ReconcileBankInput) {
    return this.call<ReconcileBankOutput>("/finance/reconcile-bank-transactions", input);
  }
  async generateFinancialReport(input: FinancialReportInput) {
    return this.call<FinancialReportOutput>("/finance/generate-report", input);
  }
  async archivePaymentDocument(input: ArchivePaymentDocumentInput) {
    return this.call<ArchivePaymentDocumentOutput>("/finance/archive-payment-document", input);
  }
}

let cachedAdapter: FinanceAdapter | null = null;

export function getFinanceAdapter(): FinanceAdapter {
  if (cachedAdapter) return cachedAdapter;
  const baseUrl = process.env.FINANCE_ADAPTER_BASE_URL?.trim();
  if (baseUrl) {
    cachedAdapter = new HttpFinanceAdapter(baseUrl.replace(/\/$/, ""), process.env.FINANCE_ADAPTER_API_KEY);
    return cachedAdapter;
  }
  cachedAdapter = new MockFinanceAdapter();
  return cachedAdapter;
}

