import { z } from "zod";
import {
  experienceSurfaceClassSchema,
  experienceSurfaceIdSchema,
  resolvedNavigationItemSchema,
} from "./experienceSurfaceContract";

export const experienceRoleSchema = z.enum([
  "workspace_member",
  "workspace_admin",
  "tenant_admin",
  "founder_global",
  "service_operator",
]);

export const fallbackModeSchema = z.enum(["fail_closed", "core_safe_default", "context_incomplete"]);

export const recommendedActionSchema = z.object({
  actionId: z.string().min(1),
  surfaceId: experienceSurfaceIdSchema,
  path: z.string().min(1),
  label: z.string().min(1),
  priority: z.enum(["primary", "secondary"]),
});

export const cachePolicySchema = z.object({
  strategy: z.literal("session_context_only"),
  sourceOfTruth: z.literal("runtime"),
  mode: z.literal("fail_safe_accelerator"),
});

export const resolvedExperienceSchema = z.object({
  resolverVersion: z.string().min(1),
  roleProfile: experienceRoleSchema,
  landingSurface: experienceSurfaceIdSchema,
  landingPath: z.string().min(1),
  primaryNavigation: z.array(resolvedNavigationItemSchema),
  recommendedActions: z.array(recommendedActionSchema),
  allowedSurfaceClasses: z.array(experienceSurfaceClassSchema),
  fallbackMode: fallbackModeSchema,
  cachePolicy: cachePolicySchema,
});

export type ExperienceRole = z.infer<typeof experienceRoleSchema>;
export type FallbackMode = z.infer<typeof fallbackModeSchema>;
export type RecommendedAction = z.infer<typeof recommendedActionSchema>;
export type CachePolicy = z.infer<typeof cachePolicySchema>;
export type ResolvedExperience = z.infer<typeof resolvedExperienceSchema>;

export function buildRecommendedAction(input: RecommendedAction): RecommendedAction {
  return recommendedActionSchema.parse(input);
}

