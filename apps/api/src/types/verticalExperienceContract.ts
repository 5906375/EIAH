import { z } from "zod";
import { experienceSurfaceIdSchema } from "./experienceSurfaceContract";

// Source of truth operacional da padronizacao de verticais futuras.
// Referencia: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const verticalExperienceIdSchema = z.enum(["IMOB", "LEGAL", "HEALTH"]);

export const verticalRolloutStageSchema = z.enum([
  "context_only",
  "installed_surface",
  "operationalized",
]);

export const verticalExperienceContractSchema = z.object({
  verticalId: verticalExperienceIdSchema,
  label: z.string().min(1),
  activeDomain: z.enum(["core", "imob"]),
  installedProduct: z.string().min(1).nullable(),
  rolloutStage: verticalRolloutStageSchema,
  enabled: z.boolean(),
  frontDoorSurface: experienceSurfaceIdSchema.nullable(),
  operationalHubSurface: experienceSurfaceIdSchema.nullable(),
  governanceHubSurface: experienceSurfaceIdSchema.nullable(),
  investigationSurfaces: z.array(experienceSurfaceIdSchema),
  contextSpecRef: z.string().min(1),
});

export type VerticalExperienceContract = z.infer<typeof verticalExperienceContractSchema>;
export type VerticalExperienceId = z.infer<typeof verticalExperienceIdSchema>;
export type VerticalRolloutStage = z.infer<typeof verticalRolloutStageSchema>;

export function buildVerticalExperienceContract(
  input: VerticalExperienceContract
): VerticalExperienceContract {
  return verticalExperienceContractSchema.parse(input);
}
