import crypto from "node:crypto";
import { maskPII } from "../../../utils/src/masking";

export type CanonicalizeOptions = {
  sortObjectKeys?: boolean;
  normalizeNumbers?: "none" | "strict";
  normalizeBooleans?: boolean;
  normalizeNulls?: boolean;
  stripUndefined?: boolean;
  stableStringify?: boolean;
  maxDepth?: number;
  maxArrayLength?: number;
  truncationStrategy?: "hash_tail" | "truncate";
};

const DEFAULTS: Required<CanonicalizeOptions> = {
  sortObjectKeys: true,
  normalizeNumbers: "strict",
  normalizeBooleans: true,
  normalizeNulls: true,
  stripUndefined: true,
  stableStringify: true,
  maxDepth: 50,
  maxArrayLength: 10000,
  truncationStrategy: "hash_tail",
};

function sha256Hex(input: string | Uint8Array) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function bytesToString(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function normalizeNumber(value: number): number | string | null {
  if (!Number.isFinite(value)) return "__NaN__";
  if (Object.is(value, -0)) return 0;
  return value;
}

function normalizeSpecial(value: unknown): unknown {
  if (value instanceof Date) {
    return `__date__:${value.toISOString()}`;
  }
  if (typeof value === "bigint") {
    return `__bigint__:${value.toString()}`;
  }
  if (value instanceof Uint8Array) {
    return `__bytes_b64__:${Buffer.from(value).toString("base64")}`;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return `__bytes_b64__:${value.toString("base64")}`;
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([k, v]) => [String(k), v] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return { __map__: entries };
  }
  if (value instanceof Set) {
    const entries = Array.from(value.values())
      .map((v) => String(v))
      .sort((a, b) => a.localeCompare(b));
    return { __set__: entries };
  }
  return value;
}

function maskDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskPII(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => maskDeep(item));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      out[key] = maskDeep(val);
    }
    return out;
  }
  return value;
}

function canonicalizeValue(
  value: unknown,
  options: Required<CanonicalizeOptions>,
  depth: number
): unknown {
  if (depth > options.maxDepth) {
    if (options.truncationStrategy === "truncate") {
      return { __truncated__: true };
    }
    const serialized = stableStringify(value);
    return { __truncated__: true, __tailHash__: sha256Hex(serialized) };
  }

  const normalizedSpecial = normalizeSpecial(value);
  if (normalizedSpecial !== value) {
    return canonicalizeValue(normalizedSpecial, options, depth + 1);
  }

  if (value === undefined) return options.stripUndefined ? undefined : null;
  if (value === null) return options.normalizeNulls ? null : value;

  if (typeof value === "number") {
    return options.normalizeNumbers === "strict" ? normalizeNumber(value) : value;
  }

  if (typeof value === "boolean") {
    return options.normalizeBooleans ? Boolean(value) : value;
  }

  if (typeof value === "string") {
    return value.normalize("NFC");
  }

  if (Array.isArray(value)) {
    const maxLen = options.maxArrayLength;
    const normalized = value.map((item) => canonicalizeValue(item, options, depth + 1));
    const filtered = normalized.filter((item) => item !== undefined);
    if (filtered.length > maxLen) {
      const head = filtered.slice(0, maxLen);
      if (options.truncationStrategy === "truncate") {
        return [...head, { __truncated__: true }];
      }
      const tailBytes = stringToBytes(JSON.stringify(filtered.slice(maxLen)));
      return [...head, { __truncated__: true, __tailHash__: sha256Hex(tailBytes) }];
    }
    return filtered;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const sorted = options.sortObjectKeys ? keys.sort((a, b) => a.localeCompare(b)) : keys;
    const result: Record<string, unknown> = {};
    for (const key of sorted) {
      const canonical = canonicalizeValue(obj[key], options, depth + 1);
      if (canonical === undefined) continue;
      result[key] = canonical;
    }
    return result;
  }

  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

export function canonicalizeResult(value: unknown, opts: CanonicalizeOptions = {}): Uint8Array {
  const options = { ...DEFAULTS, ...opts };
  const masked = maskDeep(value);
  const canonical = canonicalizeValue(masked, options, 0);
  const serialized = options.stableStringify ? stableStringify(canonical) : String(canonical);
  return stringToBytes(serialized);
}

export function computeResultHash(canonicalBytes: Uint8Array) {
  return crypto.createHash("sha256").update(canonicalBytes).digest("hex");
}

export function canonicalizeResultString(value: unknown, opts: CanonicalizeOptions = {}) {
  return bytesToString(canonicalizeResult(value, opts));
}
