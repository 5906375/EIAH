import { z } from "zod";
import { GuardianReportSchema } from "./guardianReportSchema";
import { J360LegalReportSchema } from "./j360LegalReportSchema";
import { MktCampaignReportSchema } from "./mktCampaignReportSchema";
import { RecipeOrchestrationSchema } from "./recipeOrchestrationSchema";

export const RunAtivoRecommendationSchema = z.object({
  id: z.string().optional(),
  prioridade: z.number().int().min(1).max(5).default(3),
  titulo: z.string(),
  descricao: z.string().optional(),
  detalhe: z.string().optional(),
  score: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).default([]),
  adotado: z.boolean().optional(),
  proximosPassos: z.string().optional(),
  modeloSugerido: z.string().optional(),
  tokensEstimados: z.number().optional(),
});

export const RunAtivoTimelineSchema = z.object({
  timestamp: z
    .union([z.string(), z.date()])
    .transform((value) => (value instanceof Date ? value.toISOString() : value)),
  status: z.string(),
  detalhe: z.string().optional(),
});

export const RunAtivoReportingInputSchema = z.object({
  metadata: z.object({
    agente: z.string(),
    tenantId: z.string(),
    workspaceId: z.string(),
    runId: z.string().optional(),
    traceId: z.string().optional(),
    status: z.string().optional(),
    custoCents: z.number().optional(),
    score: z.number().optional(),
    downloadPdfUrl: z.string().optional(),
    guardianReport: GuardianReportSchema.optional(),
    j360LegalReport: J360LegalReportSchema.optional(),
    mktCampaignReport: MktCampaignReportSchema.optional(),
    recipeOrchestration: RecipeOrchestrationSchema.optional(),
  }),
  usuario: z
    .object({
      nome: z.string().optional(),
      email: z.string().optional(),
      telefone: z.string().optional(),
      cpfCnpj: z.string().optional(),
      empresa: z.string().optional(),
      cargo: z.string().optional(),
    })
    .default({}),
  resumo: z.string().optional().default("Nenhum resumo informado."),
  contexto: z.string().optional().default("Nenhum contexto informado."),
  recomendacoes: z.array(RunAtivoRecommendationSchema).default([]),
  insights: z.array(z.string()).default([]),
  cta: z
    .object({
      titulo: z.string().optional(),
      descricao: z.string().optional(),
      botoes: z
        .array(
          z.object({
            label: z.string(),
            url: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  linksUteis: z
    .array(
      z.object({
        label: z.string(),
        url: z.string().optional(),
      })
    )
    .default([]),
  auditTrail: z
    .array(
      z.object({
        titulo: z.string(),
        detalhe: z.string().optional(),
        timestamp: z.string().optional(),
      })
    )
    .default([]),
  timeline: z.array(RunAtivoTimelineSchema).default([]),
  tabela: z
    .array(
      z.object({
        prioridade: z.string(),
        titulo: z.string(),
        descricao: z.string().optional(),
        score: z.string().optional(),
      })
    )
    .optional(),
});

export type RunAtivoReportingInput = z.infer<typeof RunAtivoReportingInputSchema>;
export type RunAtivoTimelineItem = z.infer<typeof RunAtivoTimelineSchema>;
export type RunAtivoRecommendation = z.infer<typeof RunAtivoRecommendationSchema>;
