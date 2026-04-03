import { z } from "zod";
import { experienceSurfaceIdSchema } from "./experienceSurfaceContract";

// Source of truth operacional do diagnóstico do resolver.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const experienceDiagnosticsWindowSchema = z.enum(["7d", "30d"]);

export const experienceDiagnosticAlignmentStatusSchema = z.enum(["healthy", "watch", "poor", "unknown"]);

export const experienceDiagnosticRecentEventSchema = z.object({
  eventType: z.enum(["experience.recommended_action.aligned", "experience.recommended_action.diverged"]),
  message: z.string().min(1),
  createdAt: z.coerce.date(),
  surfaceId: experienceSurfaceIdSchema.nullable(),
  landingPath: z.string().min(1).nullable(),
  primaryActionId: z.string().min(1).nullable(),
  primaryActionPath: z.string().min(1).nullable(),
  source: z.string().min(1).nullable(),
});

export const experienceDiagnosticAlignmentSchema = z.object({
  rate: z.number().int().min(0).max(100).nullable(),
  status: experienceDiagnosticAlignmentStatusSchema,
  summary: z.string().min(1),
  dominantSource: z.string().min(1),
  dominantAlignedSource: z.string().min(1),
  dominantDivergedSource: z.string().min(1),
  dominantAlignedSurface: z.string().min(1),
  dominantDivergedSurface: z.string().min(1),
  convergenceSummary: z.string().min(1),
  divergenceSummary: z.string().min(1),
});

export const experienceDiagnosticSnapshotSchema = z.object({
  window: experienceDiagnosticsWindowSchema,
  totals: z.object({
    aligned: z.number().int().min(0),
    diverged: z.number().int().min(0),
  }),
  alignment: experienceDiagnosticAlignmentSchema,
  latestEventAt: z.coerce.date().nullable(),
  recentEvents: z.array(experienceDiagnosticRecentEventSchema),
});

export type ExperienceDiagnosticsWindow = z.infer<typeof experienceDiagnosticsWindowSchema>;
export type ExperienceDiagnosticRecentEvent = z.infer<typeof experienceDiagnosticRecentEventSchema>;
export type ExperienceDiagnosticAlignment = z.infer<typeof experienceDiagnosticAlignmentSchema>;
export type ExperienceDiagnosticSnapshot = z.infer<typeof experienceDiagnosticSnapshotSchema>;

export function buildExperienceDiagnosticSnapshot(
  input: ExperienceDiagnosticSnapshot
): ExperienceDiagnosticSnapshot {
  return experienceDiagnosticSnapshotSchema.parse(input);
}
