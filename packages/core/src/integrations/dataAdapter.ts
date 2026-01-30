type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type DataAdapterOptions = {
  maskFields?: string[];
};

const DEFAULT_MASK_FIELDS = [
  "cpf",
  "cnpj",
  "rg",
  "email",
  "phone",
  "telefone",
  "token",
  "authorization",
  "password",
  "secret",
  "apiKey",
  "apikey",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskString(value: string): string {
  let next = value;

  // Email
  next = next.replace(
    /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]{1,253})\.[A-Z]{2,}\b/gi,
    (_m, user, domain) => `${String(user).slice(0, 2)}***@***.${String(domain).split(".").pop() ?? "***"}`
  );

  // CPF (11 digits with optional punctuation)
  next = next.replace(/\b(\d{3})\.?\d{3}\.?\d{3}-?\d{2}\b/g, "$1.***.***-**");

  // Phone (basic BR/international)
  next = next.replace(/\+?\d{1,3}\s?\(?\d{2,3}\)?\s?\d{4,5}-?\d{4}\b/g, "***PHONE***");

  // Bearer tokens
  next = next.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/g, "Bearer ***");

  // Generic long secrets
  next = next.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "***SECRET***");

  return next;
}

function normalizePrimitive(value: unknown): JsonPrimitive {
  if (value === null) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeValue(
  value: unknown,
  options: Required<DataAdapterOptions>,
  path: string[] = [],
  seen = new WeakSet<object>()
): JsonValue {
  const primitive = normalizePrimitive(value);
  if (primitive !== null || value === null) {
    return typeof primitive === "string" ? maskString(primitive) : primitive;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, options, path, seen));
  }

  if (!isPlainObject(value)) {
    return maskString(String(value));
  }

  if (seen.has(value)) {
    return "[circular]" as unknown as JsonValue;
  }
  seen.add(value);

  const out: Record<string, JsonValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    const keyLower = key.toLowerCase();
    const nextPath = [...path, key];
    if (options.maskFields.includes(keyLower)) {
      out[key] = "***MASKED***";
      continue;
    }
    out[key] = normalizeValue(raw, options, nextPath, seen);
  }
  return out;
}

export function normalizeAndMaskResponse(
  input: unknown,
  options: DataAdapterOptions = {}
): JsonValue {
  const resolved: Required<DataAdapterOptions> = {
    maskFields: (options.maskFields ?? DEFAULT_MASK_FIELDS).map((f) => f.toLowerCase()),
  };

  return normalizeValue(input, resolved);
}

