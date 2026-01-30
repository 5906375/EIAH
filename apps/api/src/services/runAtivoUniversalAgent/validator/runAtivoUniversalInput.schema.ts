import { z } from "zod";
import {
  RunAtivoRecommendationSchema,
  RunAtivoTimelineSchema,
} from "@eiah/core";

export const RunAtivoUniversalInputSchema = z.object({
  agent: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  runId: z.string().optional(),
  traceId: z.string().optional(),
  status: z.string().optional(),
  costCents: z.number().optional(),
  user: z
    .object({
      nome: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
      telefone: z.string().optional(),
      phone: z.string().optional(),
      cpfCnpj: z.string().optional(),
      empresa: z.string().optional(),
      company: z.string().optional(),
      cargo: z.string().optional(),
      role: z.string().optional(),
    })
    .optional(),
  form: z.record(z.any()).optional(),
  resumo: z.string().optional(),
  contexto: z.string().optional(),
  recommendations: z.array(RunAtivoRecommendationSchema).optional(),
  insights: z.array(z.string()).optional(),
  cta: z
    .union([
      z.string(),
      z.object({
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
      }),
    ])
    .optional(),
  links: z
    .array(
      z.object({
        label: z.string(),
        url: z.string().optional(),
      })
    )
    .optional(),
  auditTrail: z
    .array(
      z.object({
        titulo: z.string(),
        detalhe: z.string().optional(),
        timestamp: z.string().optional(),
      })
    )
    .optional(),
  timeline: z.array(RunAtivoTimelineSchema).optional(),
  metadata: z.record(z.any()).optional(),
});

export type RunAtivoUniversalInput = z.infer<typeof RunAtivoUniversalInputSchema>;
