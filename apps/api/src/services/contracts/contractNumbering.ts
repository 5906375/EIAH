import type { Clause } from "./types";

export function numberClauses(clauses: Clause[]) {
  return clauses.map((clause, index) => ({
    ...clause,
    number: index + 1,
  }));
}
