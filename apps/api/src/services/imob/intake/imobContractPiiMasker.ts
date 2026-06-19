// PII masking for IMOB lease contract text.
// Must run before any log, evidence payload, or draft storage.
// Never commit real CPF, RG, CNH, phone, email, or signatures.

type PiiPattern = {
  pattern: RegExp;
  replacement: string;
  label: string;
};

const PII_PATTERNS: PiiPattern[] = [
  // Email — run first to avoid domain digits being consumed by phone/CPF patterns
  {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: "***@***.***",
    label: "email",
  },
  // RG labeled — run before generic digit patterns to avoid CPF consuming RG number
  {
    pattern: /\b(?:RG|R\.G\.)\s*(?:n[º°.]?\s*)?:?\s*[\d.\-xXX]{5,20}/gi,
    replacement: "RG: ***MASKED***",
    label: "rg_labeled",
  },
  // CNH labeled — run before CPF pattern; CPF regex matches 11-digit CNH numbers
  {
    pattern: /\b(?:CNH|C\.N\.H\.)\s*(?:n[º°.]?\s*)?:?\s*[\d.\-]{5,20}/gi,
    replacement: "CNH: ***MASKED***",
    label: "cnh_labeled",
  },
  // CNPJ: 00.000.000/0000-00 — run before CPF (CNPJ has 14 digits, CPF 11)
  {
    pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    replacement: "**.***.***\/****-**",
    label: "cnpj",
  },
  // CPF: 000.000.000-00 (formatted) or 00000000000 (11 raw digits)
  {
    pattern: /\b\d{3}\.?\d{3}\.?\d{3}[-]?\d{2}\b/g,
    replacement: "***.***.***-**",
    label: "cpf",
  },
  // Phone BR with country code: +55 (XX) XXXXX-XXXX — run before generic phone
  {
    pattern: /\+55\s*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/g,
    replacement: "***MASKED***",
    label: "phone_br_intl",
  },
  // Phone BR: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  {
    pattern: /\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g,
    replacement: "***MASKED***",
    label: "phone_br",
  },
];

export type PiiMaskingResult = {
  maskedText: string;
  detectedTypes: string[];
};

export function maskContractPii(rawText: string): PiiMaskingResult {
  let text = rawText;
  const detectedTypes: string[] = [];

  for (const { pattern, replacement, label } of PII_PATTERNS) {
    const patternWithFlags = new RegExp(pattern.source, pattern.flags);
    const before = text;
    text = text.replace(patternWithFlags, replacement);
    if (text !== before) {
      detectedTypes.push(label);
    }
  }

  return { maskedText: text, detectedTypes };
}

export function hasPiiResidue(text: string): boolean {
  return PII_PATTERNS.some(({ pattern }) => {
    const p = new RegExp(pattern.source, pattern.flags);
    return p.test(text);
  });
}
