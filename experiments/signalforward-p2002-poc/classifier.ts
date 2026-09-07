// Classificador experimental — construído a partir do erro REAL capturado em
// capture-error.ts contra @prisma/client@7.2.0 + @prisma/adapter-pg@7.2.0 +
// PostgreSQL 16.11 descartável. Não presume formato: a leitura de `meta` abaixo
// segue exatamente a estrutura observada empiricamente (ver ERROR_SHAPE.md).
import { Prisma } from "./prisma/generated/client/client.ts";

export type UniqueViolationClassification =
  | { kind: "idempotency_key_violation" }
  | { kind: "other_unique_violation" }
  | { kind: "unclassified" };

// Nomes de COLUNA reais no banco (snake_case, via @map), não o seletor composto
// Prisma (camelCase, usado só em `where:` de findUnique/update).
const IDEMPOTENCY_KEY_CONSTRAINT_COLUMNS = [
  "destination_agent",
  "idempotency_key",
  "tenant_id",
  "workspace_id",
].sort();

const EXPECTED_MODEL_NAME = "SignalForwardRequest";

function sameColumnSet(observed: unknown, expected: string[]): boolean {
  if (!Array.isArray(observed)) return false;
  if (observed.some((v) => typeof v !== "string")) return false;
  const sorted = [...(observed as string[])].sort();
  return sorted.length === expected.length && sorted.every((v, i) => v === expected[i]);
}

/**
 * Classifica um erro capturado no catch externo ao `$transaction(...)`.
 * NUNCA lança um novo erro — retorna sempre uma classificação, mesmo quando
 * a estrutura de `meta` é desconhecida ou malformada ("unclassified").
 */
export function classifySignalForwardUniqueViolation(
  error: unknown
): UniqueViolationClassification {
  const typed = error as Prisma.PrismaClientKnownRequestError | undefined | null;

  if (!typed || typeof typed !== "object" || typed.code !== "P2002") {
    return { kind: "unclassified" };
  }

  const meta = typed.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") {
    return { kind: "unclassified" };
  }

  // Contexto necessário nº1: o modelo em que a violação ocorreu — evita confundir
  // uma constraint de outro modelo que porventura tenha nomes de coluna parecidos.
  const modelName = meta.modelName;
  if (typeof modelName !== "string") {
    return { kind: "unclassified" };
  }

  const driverAdapterError = meta.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (!cause || cause.kind !== "UniqueConstraintViolation") {
    return { kind: "unclassified" };
  }

  const constraint = cause.constraint as Record<string, unknown> | undefined;
  const fields = constraint?.fields;
  if (!Array.isArray(fields)) {
    // P2002 comprovado, mas sem lista de colunas utilizável — não arriscamos
    // classificar como a chave idempotente sem essa evidência.
    return { kind: "unclassified" };
  }

  if (modelName === EXPECTED_MODEL_NAME && sameColumnSet(fields, IDEMPOTENCY_KEY_CONSTRAINT_COLUMNS)) {
    return { kind: "idempotency_key_violation" };
  }

  // P2002 comprovado, campos/modelo identificados, mas não correspondem à
  // constraint da chave idempotente — é outra violação de unicidade real.
  return { kind: "other_unique_violation" };
}
