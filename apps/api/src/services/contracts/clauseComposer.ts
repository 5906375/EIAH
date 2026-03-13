import { CLAUSE_LIBRARY } from "./clauseLibrary";
import type { Clause, ContractSchema } from "./types";

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return String(value).trim();
}

export function composeClauses(schema: ContractSchema, answers: Record<string, unknown>): Clause[] {
  const clauseIds = schema.clauses ?? [];
  return clauseIds
    .map((id) => CLAUSE_LIBRARY[id])
    .filter((clause): clause is Clause => Boolean(clause))
    .filter((clause) => {
      if (!clause.condition) return true;
      const current = normalizeValue(answers[clause.condition.field]).toLowerCase();
      const expected = normalizeValue(clause.condition.value).toLowerCase();
      return current === expected;
    });
}
