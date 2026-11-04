import { z } from "zod";

/**
 * Primitivos internos dos contratos de fonte v2 (NÃO exportados pelo barrel `index.ts`, para não poluir o namespace
 * do pacote). `dataSources.ts` (v1) mantém as suas próprias cópias de propósito: o v1 permanece inalterado.
 */
export const text = z.string().trim().min(1).max(500);
export const stableId = z.string().min(3).max(80).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
export const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
export const instant = z.string().datetime();
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export type PrimitiveJsonValue = string | number | boolean | null | PrimitiveJsonValue[] | { [key: string]: PrimitiveJsonValue };
export const jsonValue: z.ZodType<PrimitiveJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

export const uniqueArray = <T extends z.ZodTypeAny>(item: T, min: number, max: number, label = "itens") =>
  z.array(item).min(min).max(max).refine((items) => new Set(items.map((i) => JSON.stringify(i))).size === items.length, `${label} duplicados`);

export const knownOrUnknown = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("known"), value }).strict(),
  ]);

/** Evidência de uma verificação: o que foi consultado/revisado para afirmar o fato. */
export const verificationEvidenceSchema = z.object({
  kind: z.enum(["official_document", "external_record", "human_review_record"]),
  ref: text,
  sha256: sha256Hex.optional(),
}).strict();

/**
 * Incerteza por campo (v2). Quatro estados, nenhum implica outro:
 *  - `unknown`        — ninguém afirmou nada. NÃO é aceitação, permissão nem ausência de restrição.
 *  - `declared`       — alguém afirmou (com a base registrada); sem confirmação na fonte. É o "a confirmar".
 *  - `verified`       — confirmado por pessoa identificada, em data, com evidência da verificação.
 *  - `not_applicable` — o campo não se aplica; exige justificativa (não é um `unknown` disfarçado).
 */
export const factV2 = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("declared"), value, basis: text }).strict(),
    z.object({ status: z.literal("verified"), value, basis: text, verifiedAt: instant, verifiedBy: text, evidence: verificationEvidenceSchema }).strict(),
    z.object({ status: z.literal("not_applicable"), justification: text }).strict(),
  ]);

/** Como `factV2`, mas sem `declared`: só vale como CONFIRMAÇÃO o que foi verificado. */
export const confirmedFactV2 = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("unknown") }).strict(),
    z.object({ status: z.literal("verified"), value, basis: text, verifiedAt: instant, verifiedBy: text, evidence: verificationEvidenceSchema }).strict(),
    z.object({ status: z.literal("not_applicable"), justification: text }).strict(),
  ]);

export type FactStatus = "unknown" | "declared" | "verified" | "not_applicable";

/** Valor de um fato quando existe (declared/verified); `undefined` caso contrário. Nunca inventa valor. */
export function factValue<V>(fact: { status: FactStatus; value?: V }): V | undefined {
  return fact.status === "declared" || fact.status === "verified" ? fact.value : undefined;
}

/** Serialização estável (chaves ordenadas) para comparar valores JSON sem depender da ordem. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
