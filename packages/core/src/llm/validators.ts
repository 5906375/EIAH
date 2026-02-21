import { z } from "zod";

export type JsonValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("LLM_JSON_OBJECT_NOT_FOUND");
  }
  const raw = text.slice(start, end + 1);
  return JSON.parse(raw);
}

export function validateJsonWithZod<T>(schema: z.ZodSchema<T>, payload: unknown): JsonValidationResult<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    };
  }
  return { ok: true, data: parsed.data };
}

export function validateModelOutputJson<T>(
  schema: z.ZodSchema<T>,
  modelOutput: string
): JsonValidationResult<T> {
  try {
    const payload = extractJsonObject(modelOutput);
    return validateJsonWithZod(schema, payload);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

