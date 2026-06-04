import {
  RunAtivoReportingInputSchema,
  type RunAtivoReportingInput,
  type RunAtivoRecommendation,
} from "@eiah/core";
import type { RunAtivoUniversalInput } from "../validator/runAtivoUniversalInput.schema";

const formatKeyValue = (form: Record<string, unknown>) => {
  return Object.entries(form)
    .map(([key, value]) => {
      const formattedValue = Array.isArray(value) ? value.join(", ") : String(value ?? "—");
      return `${key.replace(/_/g, " ")}: ${formattedValue}`;
    })
    .join(" | ");
};

const fallbackRecommendation = (form: Record<string, unknown>): RunAtivoRecommendation[] => {
  if (!form || Object.keys(form).length === 0) {
    return [];
  }
  return [
    {
      prioridade: 3,
      titulo: "Revisar dados submetidos",
      descricao:
        "Nenhuma recomendação explícita foi enviada. Revise os dados do formulário e gere sugestões personalizadas.",
      detalhe: formatKeyValue(form),
      tags: ["auto"],
    },
  ];
};

export function buildBasePayload(
  input: RunAtivoUniversalInput,
  overrides: Partial<RunAtivoReportingInput> = {}
): RunAtivoReportingInput {
  const usuario = {
    nome: input.user?.nome ?? input.user?.name ?? input.metadata?.userName,
    email: input.user?.email ?? input.metadata?.userEmail,
    telefone: input.user?.telefone ?? input.metadata?.userPhone,
    cpfCnpj: input.user?.cpfCnpj,
    empresa: input.user?.empresa ?? input.metadata?.company,
    cargo: input.user?.cargo,
  };

  const recomendacoes =
    overrides.recomendacoes ??
    input.recommendations ??
    fallbackRecommendation((input.form as Record<string, unknown>) ?? {});

  const resumo =
    overrides.resumo ??
    input.resumo ??
    formatKeyValue((input.form as Record<string, unknown>) ?? {});

  const contexto =
    overrides.contexto ??
    input.contexto ??
    "Contexto não informado. Utilize o formulário para capturar objetivos e restrições.";

  const insights = overrides.insights ?? input.insights ?? [];
  const timeline = overrides.timeline ?? input.timeline ?? [];
  const auditTrail = overrides.auditTrail ?? input.auditTrail ?? [];
  const linksUteis = overrides.linksUteis ?? input.links ?? [];

  const cta =
    typeof overrides.cta !== "undefined"
      ? overrides.cta
      : typeof input.cta === "string"
      ? {
          titulo: "Próximo passo sugerido",
          descricao: input.cta,
        }
      : input.cta;

  return RunAtivoReportingInputSchema.parse({
    metadata: {
      agente: input.agent,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
        runId: input.runId,
        traceId: input.traceId,
        status: input.status,
        custoCents: input.costCents,
        recipeOrchestration: input.metadata?.recipeOrchestration,
        ...(overrides.metadata ?? {}),
      },
    usuario,
    resumo,
    contexto,
    recomendacoes,
    insights,
    cta,
    linksUteis,
    auditTrail,
    timeline,
  });
}
