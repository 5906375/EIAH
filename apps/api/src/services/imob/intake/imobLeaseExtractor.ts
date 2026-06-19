// Deterministic lease contract extractor — pure text parser, no LLM.
// Accepts plain text (pre-extracted from .docx or pasted).
// All monetary values returned as integer cents (no floats).
// Caller must run PII masking before passing text here.

export type ImobExtractedLease = {
  propertyLabel: string | null;
  city: string | null;
  state: string | null;
  monthlyRentCents: number | null;
  condoFeeCents: number | null;
  depositCents: number | null;
  depositInstallmentCents: number | null;
  startDate: string | null;
  endDate: string | null;
  adjustmentIndex: string | null;
  lateFeePercent: number | null;
  monthlyInterestPercent: number | null;
  gracePeriodBusinessDays: number | null;
  contractPurpose: string | null;
};

export type ImobLeaseExtractionResult = {
  ok: boolean;
  lease: ImobExtractedLease;
  pendingItems: string[];
  riskFlags: string[];
  parserVersion: "1.0";
};

// ─── Monetary helpers ─────────────────────────────────────────────────────────

function parseBRLToCents(raw: string): number | null {
  // "1.800,00" → 180000 | "900,00" → 90000 | "1800,00" → 180000
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (!isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function extractBRLValue(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  return parseBRLToCents(match[1]);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseBRDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

// ─── Field extractors ─────────────────────────────────────────────────────────

function extractPropertyLabel(text: string): string | null {
  // "Imóvel: apartamento 101" or "apartamento 101" or "Tipo: locação residencial + Imóvel: ..."
  const patterns = [
    /im[oó]vel\s*:\s*([^\n\r,;.]+)/i,
    /unidade\s*:\s*([^\n\r,;.]+)/i,
    /(apartamento\s+\w+)/i,
    /(casa\s+\w+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractCityState(text: string): { city: string | null; state: string | null } {
  // "Cidade: Balneário Camboriú/SC" or "Balneário Camboriú/SC" or "Balneário Camboriú - SC"
  const patterns = [
    /cidade\s*:\s*([^/\n\r,;]+?)\/([A-Z]{2})\b/i,
    /cidade\s*:\s*([^/\n\r,;]+?)\s*[-–]\s*([A-Z]{2})\b/i,
    /\b([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s]+?)\/([A-Z]{2})\b/,
    /\b([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s]+?)\s*[-–]\s*([A-Z]{2})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1] && m?.[2]) {
      return { city: m[1].trim(), state: m[2].trim().toUpperCase() };
    }
  }
  // Fallback: look for explicit "cidade:" label without state
  const cityOnly = text.match(/cidade\s*:\s*([^\n\r,;/]+)/i);
  if (cityOnly?.[1]) return { city: cityOnly[1].trim(), state: null };
  return { city: null, state: null };
}

function extractMonthlyRent(text: string): number | null {
  return extractBRLValue(text, /aluguel\s*:\s*R\$\s*([\d.,]+)/i);
}

function extractCondoFee(text: string): number | null {
  return extractBRLValue(text, /condom[íi]nio\s*:\s*R\$\s*([\d.,]+)/i);
}

function extractDeposit(text: string): { depositCents: number | null; installmentCents: number | null } {
  // Total caução: first occurrence of "caução: R$ X"
  const totalMatch = text.match(/cau[çc][aã]o\s*:\s*R\$\s*([\d.,]+)/i);
  const depositCents = totalMatch?.[1] ? parseBRLToCents(totalMatch[1]) : null;

  // Installment: "R$ 900,00 + R$ 900,00" or "parcelas: R$ 900,00"
  const installmentMatch = text.match(/R\$\s*([\d.,]+)\s*\+\s*R\$\s*[\d.,]+/i);
  const installmentCents = installmentMatch?.[1] ? parseBRLToCents(installmentMatch[1]) : null;

  return { depositCents, installmentCents };
}

function extractDateRange(text: string): { startDate: string | null; endDate: string | null } {
  // "08/06/2026 a 08/06/2027" or "de 08/06/2026 a 08/06/2027"
  const rangeMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (rangeMatch) {
    return {
      startDate: parseBRDate(rangeMatch[1]),
      endDate: parseBRDate(rangeMatch[2]),
    };
  }
  // Fallback: "prazo: 08/06/2026" + "vencimento: 08/06/2027"
  const prazoMatch = text.match(/prazo\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  return {
    startDate: prazoMatch?.[1] ? parseBRDate(prazoMatch[1]) : null,
    endDate: null,
  };
}

function extractAdjustmentIndex(text: string): string | null {
  const m = text.match(/reajuste\s*:\s*([^\n\r,;.]+)/i);
  if (!m?.[1]) return null;
  return m[1].trim();
}

function extractLateFeePercent(text: string): number | null {
  const patterns = [
    /multa(?:\s+por\s+atraso)?\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i,
    /multa\s+de\s+(\d+(?:[.,]\d+)?)\s*%/i,
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?multa/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return parseFloat(m[1].replace(",", "."));
  }
  return null;
}

function extractMonthlyInterest(text: string): number | null {
  const patterns = [
    /juros(?:\s+de\s+mora)?\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i,
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:ao?\s+m[eê]s|a\.m\.)/i,
    /mora\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return parseFloat(m[1].replace(",", "."));
  }
  return null;
}

function extractGracePeriod(text: string): number | null {
  const patterns = [
    /toler[aâ]ncia\s*:\s*(\d+)\s*dia/i,
    /(\d+)\s+dias?\s+[uú]teis?\s+de\s+toler[aâ]ncia/i,
    /prazo\s+de\s+toler[aâ]ncia\s*:\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return null;
}

function extractContractPurpose(text: string): string | null {
  const patterns = [
    /finalidade\s*:\s*([^\n\r,;.]+)/i,
    /uso\s+(?:do\s+im[oó]vel|residencial|comercial)\s*:\s*([^\n\r,;.]+)/i,
    /\b(residencial|comercial|temporada|misto)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim().toLowerCase();
  }
  return null;
}

// ─── Risk flags ───────────────────────────────────────────────────────────────

const LATE_FEE_REVIEW_THRESHOLD = 2;
const GRACE_PERIOD_REVIEW_THRESHOLD = 5;
const ADJUSTMENT_INDEXES_TO_REVIEW = ["igp-m", "igpm", "igp_m"];

function buildRiskFlags(lease: ImobExtractedLease): string[] {
  const flags: string[] = [];

  if (lease.lateFeePercent !== null && lease.lateFeePercent > LATE_FEE_REVIEW_THRESHOLD) {
    flags.push(`Multa por atraso de ${lease.lateFeePercent}% requer revisão`);
  }

  if (lease.gracePeriodBusinessDays !== null && lease.gracePeriodBusinessDays > GRACE_PERIOD_REVIEW_THRESHOLD) {
    flags.push(`Prazo de tolerância de ${lease.gracePeriodBusinessDays} dias úteis acima do padrão operacional`);
  }

  if (
    lease.adjustmentIndex !== null &&
    ADJUSTMENT_INDEXES_TO_REVIEW.some((idx) => lease.adjustmentIndex!.toLowerCase().includes(idx))
  ) {
    flags.push("Reajuste por IGP-M deve ser validado");
  }

  return flags;
}

// ─── Pending items ────────────────────────────────────────────────────────────

function buildPendingItems(lease: ImobExtractedLease, text: string): string[] {
  const items: string[] = [];

  const hasIdentityDoc = /(?:rg|cpf|cnh|identidade|documento\s+pessoal)/i.test(text);
  if (!hasIdentityDoc) {
    items.push("Documento de identidade do locatário ausente");
  }

  const hasInspectionReport = /(?:vistoria|laudo|inspe[çc][aã]o)/i.test(text);
  if (!hasInspectionReport) {
    items.push("Laudo de vistoria não anexado");
  }

  if (lease.depositCents !== null && lease.depositInstallmentCents !== null) {
    const hasDepositProof = /(?:recibo|comprovante|cau[çc][aã]o\s+(?:paga|quitada|recebida))/i.test(text);
    if (!hasDepositProof) {
      items.push("Comprovante de caução pendente");
    }
  }

  const hasWitnesses = /(?:testemunha[s]?|witness)/i.test(text);
  if (!hasWitnesses) {
    items.push("Assinatura de testemunha ausente");
  }

  return items;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function extractLeaseContractFromText(maskedText: string): ImobLeaseExtractionResult {
  const { city, state } = extractCityState(maskedText);
  const { depositCents, installmentCents } = extractDeposit(maskedText);
  const { startDate, endDate } = extractDateRange(maskedText);

  const lease: ImobExtractedLease = {
    propertyLabel: extractPropertyLabel(maskedText),
    city,
    state,
    monthlyRentCents: extractMonthlyRent(maskedText),
    condoFeeCents: extractCondoFee(maskedText),
    depositCents,
    depositInstallmentCents: installmentCents,
    startDate,
    endDate,
    adjustmentIndex: extractAdjustmentIndex(maskedText),
    lateFeePercent: extractLateFeePercent(maskedText),
    monthlyInterestPercent: extractMonthlyInterest(maskedText),
    gracePeriodBusinessDays: extractGracePeriod(maskedText),
    contractPurpose: extractContractPurpose(maskedText),
  };

  const riskFlags = buildRiskFlags(lease);
  const pendingItems = buildPendingItems(lease, maskedText);

  const hasMinimumData =
    lease.monthlyRentCents !== null &&
    (lease.city !== null || lease.propertyLabel !== null);

  return {
    ok: hasMinimumData,
    lease,
    pendingItems,
    riskFlags,
    parserVersion: "1.0",
  };
}
