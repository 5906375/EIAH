import type { ImobValidationEngine } from "./imobValidationContract";
import type {
  ImobNormalizedAddress,
  ImobNormalizedDocument,
  ImobValidationBlocker,
  ImobValidationPendingField,
  ImobValidationReasonCode,
  ImobValidationResult,
  ImobValidationScope,
  ImobValidationWarning,
} from "./imobValidationTypes";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseLoose(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["da", "de", "do", "dos", "das", "e"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function maskCpf(digits: string) {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function maskCnpj(digits: string) {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function normalizePhone(digits: string) {
  const local = digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6, 10)}`;
  return digits;
}

function isRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(digits: string) {
  if (digits.length !== 11 || isRepeatedDigits(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(digits[index]) * (10 - index);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(digits[index]) * (11 - index);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(digits[10]);
}

function isValidCnpj(digits: string) {
  if (digits.length !== 14 || isRepeatedDigits(digits)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calc(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[12])) return false;
  const second = calc(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(digits[13]);
}

function detectDocument(rawInput: string): ImobNormalizedDocument | null {
  const explicitMatch = rawInput.match(/(?:cpf|cnpj|documento|doc)\D*([\d./-]{8,18})/i);
  const standaloneMatch = normalizeWhitespace(rawInput).match(/^[\d./-]{11,18}$/);
  const match = explicitMatch ?? standaloneMatch;
  if (!match?.[1]) return null;
  const rawValue = normalizeWhitespace(match[1]);
  const digits = digitsOnly(rawValue);
  if (digits.length === 11) {
    return {
      type: "cpf",
      rawValue,
      digits,
      maskedValue: maskCpf(digits),
      isFormatValid: isValidCpf(digits),
    };
  }
  if (digits.length === 14) {
    return {
      type: "cnpj",
      rawValue,
      digits,
      maskedValue: maskCnpj(digits),
      isFormatValid: isValidCnpj(digits),
    };
  }
  return {
    type: "unknown",
    rawValue,
    digits,
    maskedValue: digits.length >= 4 ? `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : rawValue,
    isFormatValid: false,
  };
}

function detectEmail(rawInput: string) {
  const email = rawInput.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? null;
  const suspicious = rawInput.match(/\b\S+@\S+\b/)?.[0] ?? null;
  return { email, suspicious };
}

function detectPhone(rawInput: string) {
  const preferred = rawInput.match(/(?:telefone|fone|tel|whatsapp|celular)\D*([\d\s()+-]{10,})/i)?.[1] ?? null;
  const fallback = rawInput.match(/\b(?:\+?55[\s-]*)?(?:\(?\d{2}\)?[\s-]*)?\d{4,5}[\s-]?\d{4}\b/)?.[0] ?? null;
  const source = preferred ?? fallback;
  if (!source) return null;
  const digits = digitsOnly(source);
  if (digits.length < 10 || digits.length > 13) return null;
  return { digits, normalized: normalizePhone(digits) };
}

function isGenericPartyPlaceholder(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return [
    "proprietario",
    "proprietaria",
    "dono",
    "lead",
    "cliente",
    "comprador",
    "compradora",
    "locatario",
    "locataria",
    "um proprietario",
    "uma proprietaria",
    "um dono",
    "um lead",
    "um cliente",
    "um comprador",
    "uma compradora",
    "um locatario",
    "uma locataria",
  ].includes(normalized);
}

function detectName(rawInput: string, scope: ImobValidationScope) {
  const labelCleaned = normalizeWhitespace(
    rawInput
      .replace(/^(?:quero\s+)?(?:cadastrar|captar|registrar|incluir)\s+(?:um\s+|uma\s+)?(?:proprietári[oa]|proprietari[oa]|dono|lead|cliente|comprador|locatári[oa]|locatari[oa])?\s*/i, "")
      .replace(/^(?:nome do proprietário|nome do proprietario|documento do proprietário|documento do proprietario|proprietário|proprietario|lead|nome)\s*/i, "")
      .replace(/\b(?:telefone|fone|tel|email|e-mail|cpf|cnpj|documento)\b.*$/i, ""),
  );
  if (labelCleaned && !isGenericPartyPlaceholder(labelCleaned) && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s']{2,}$/.test(labelCleaned)) {
    return titleCaseLoose(labelCleaned);
  }
  const explicit = rawInput.match(/(?:proprietári[oa]|proprietari[oa]|lead|nome)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s']{2,})/i)?.[1] ?? null;
  if (explicit && !isGenericPartyPlaceholder(explicit)) return titleCaseLoose(normalizeWhitespace(explicit));
  if (scope === "owner.create" || scope === "lead.qualify") {
    const cleaned = normalizeWhitespace(
      rawInput
        .replace(/^(?:quero\s+)?(?:cadastrar|captar|registrar|incluir)\s+(?:um\s+|uma\s+)?(?:proprietári[oa]|proprietari[oa]|dono|lead|cliente|comprador|locatári[oa]|locatari[oa])?\s*/i, "")
        .replace(/^(nome|proprietari[oa]|lead)\s*/i, ""),
    );
    if (cleaned && !isGenericPartyPlaceholder(cleaned) && /[A-Za-zÀ-ÿ]{3,}/.test(cleaned) && cleaned.split(" ").length <= 6) {
      return titleCaseLoose(cleaned);
    }
  }
  return null;
}

function detectAddress(rawInput: string): ImobNormalizedAddress | null {
  const base = normalizeWhitespace(rawInput);
  const streetMatch = base.match(/\b(rua|r\.|avenida|av\.|travessa|alameda|rodovia)\s+([^,]+)(?:,|$)/i);
  if (!streetMatch) return null;

  const streetType = streetMatch[1].replace(/\.$/, "");
  const streetName = titleCaseLoose(normalizeWhitespace(streetMatch[2]));
  const rest = base.slice(streetMatch.index! + streetMatch[0].length).split(",").map((item) => titleCaseLoose(normalizeWhitespace(item))).filter(Boolean);
  const firstRest = rest[0] ?? "";
  const number = /^\d+[A-Za-z0-9/-]*$/.test(firstRest) ? firstRest : "";
  const complement = number ? "" : firstRest;
  const neighborhood = number ? (rest[1] ?? "") : (rest[1] ?? "");
  const city = number ? (rest[2] ?? "") : (rest[2] ?? "");

  const address: ImobNormalizedAddress = {
    street: `${streetType.toLowerCase() === "r" ? "Rua" : titleCaseLoose(streetType)} ${streetName}`.trim(),
    country: "BR",
    confidence: number && city ? "high" : number || city ? "medium" : "low",
  };
  if (number) address.number = number;
  if (complement) address.complement = complement;
  if (neighborhood) address.neighborhood = neighborhood;
  if (city) address.city = city;
  return address;
}

function pushWarning(
  warnings: ImobValidationWarning[],
  reasonCode: ImobValidationReasonCode,
  message: string,
) {
  warnings.push({ reasonCode, message });
}

function pushBlocker(
  blockers: ImobValidationBlocker[],
  reasonCode: ImobValidationReasonCode,
  field: string,
  message: string,
) {
  blockers.push({ reasonCode, field, message });
}

function pushPending(
  pendingFields: ImobValidationPendingField[],
  field: string,
  prompt: string,
) {
  pendingFields.push({ field, prompt });
}

function dedupeByReason<T extends { reasonCode?: string; field?: string; prompt?: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.reasonCode ?? ""}:${item.field ?? ""}:${item.prompt ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const validateImobInput: ImobValidationEngine = (input) => {
  const rawInput = input.rawInput ?? "";
  const scope = input.scope ?? "generic";
  const normalizedText = normalizeWhitespace(rawInput);
  const warnings: ImobValidationWarning[] = [];
  const blockers: ImobValidationBlocker[] = [];
  const pendingFields: ImobValidationPendingField[] = [];
  const normalized: ImobValidationResult["normalized"] = {};

  if (normalizedText !== rawInput) {
    normalized.text = normalizedText;
    pushWarning(warnings, "TEXT_NORMALIZED", "O texto de entrada foi normalizado para reduzir ruído de espaços.");
  } else {
    normalized.text = rawInput;
  }

  const name = detectName(normalizedText, scope);
  if (name) {
    normalized.name = name;
    if (name !== normalizeWhitespace(name)) {
      pushWarning(warnings, "NAME_NORMALIZED", "O nome informado foi normalizado.");
    }
  }

  const { email, suspicious } = detectEmail(normalizedText);
  if (email) {
    normalized.email = email.toLowerCase();
  } else if (suspicious) {
    pushWarning(warnings, "EMAIL_FORMAT_SUSPECT", "O e-mail informado parece incompleto ou suspeito.");
    pushBlocker(blockers, "INVALID_EMAIL_FORMAT", "email", "O e-mail informado não tem formato válido.");
    pushPending(pendingFields, "email", "Informe um e-mail válido.");
  }

  const phone = detectPhone(normalizedText);
  if (phone) {
    normalized.phone = phone.normalized;
    if (phone.normalized !== phone.digits) {
      pushWarning(warnings, "PHONE_FORMAT_NORMALIZED", "O telefone informado foi normalizado para o padrão brasileiro.");
    }
  }

  const document = detectDocument(normalizedText);
  if (document) {
    normalized.document = document;
    if (!document.isFormatValid) {
      pushWarning(warnings, "DOCUMENT_FORMAT_SUSPECT", "O documento informado parece incompleto ou inválido.");
      pushBlocker(blockers, "INVALID_DOCUMENT_FORMAT", "document", "O documento informado não passou na validação de formato.");
      pushPending(pendingFields, "document", "Informe um CPF ou CNPJ válido.");
    }
  }

  const address = detectAddress(normalizedText);
  if (address) {
    normalized.address = address;
    pushWarning(warnings, "ADDRESS_NORMALIZED", "O endereço foi estruturado a partir do texto livre.");
    if (!address.number || !address.city) {
      pushBlocker(blockers, "ADDRESS_INCOMPLETE", "address", "O endereço ainda está incompleto para seguir com segurança.");
      pushPending(
        pendingFields,
        "address",
        !address.number && !address.city
          ? "Informe número e cidade do endereço."
          : !address.number
            ? "Informe o número do endereço."
            : "Informe a cidade do endereço.",
      );
    }
  } else if (scope === "property.create" && /(rua|avenida|travessa|alameda|rodovia|endereco|endereço)/i.test(normalizedText)) {
    pushBlocker(blockers, "ADDRESS_REQUIRES_CONFIRMATION", "address", "Não consegui estruturar o endereço com confiança suficiente.");
    pushPending(pendingFields, "address", "Reescreva o endereço com logradouro, número e cidade.");
  }

  return {
    ok: blockers.length === 0,
    rawInput,
    normalized,
    warnings: dedupeByReason(warnings),
    blockers: dedupeByReason(blockers),
    pendingFields: dedupeByReason(pendingFields),
  };
};
