import type { Run } from "@/lib/api";

function extractRunError(run?: Run | null) {
  if (!run || run.status !== "error") return null;
  const response = run.response;
  if (response && typeof response === "object" && "error" in response) {
    const value = (response as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function formatRunErrorSummary(run?: Run | null) {
  const message = extractRunError(run);
  if (!message) return null;

  if (/knowledge_policy\.blocked:\s*knowledge_required_source_missing/i.test(message)) {
    return "O Guardian bloqueou a execução porque faltam fontes obrigatórias de evidência para validar a recipe com segurança. Preencha ou vincule comprovantes, trilha de integridade ou contexto verificável antes de promover.";
  }

  return message;
}
