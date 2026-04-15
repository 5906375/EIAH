export function formatReconciliationIssue(issue: string): string {
  if (issue === "missing_breakdown") return "Sem breakdown";
  if (issue === "missing_ledger") return "Sem ledger";
  if (issue === "run_vs_breakdown_mismatch") return "Run divergente";
  if (issue === "breakdown_vs_ledger_mismatch") return "Ledger divergente";
  return issue || "—";
}
