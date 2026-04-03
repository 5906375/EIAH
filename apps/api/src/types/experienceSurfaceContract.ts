import { z } from "zod";

// Source of truth operacional da taxonomia de superfícies da experiência.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const experienceSurfaceIdSchema = z.enum([
  "runs",
  "billing",
  "economy",
  "self_service",
  "agents",
  "marketplace",
  "profile",
  "imob_chat",
  "imob_dashboard",
]);

export const experienceSurfaceClassSchema = z.enum([
  "front_door",
  "operational_hub",
  "governance_hub",
  "investigation_surface",
]);

export const resolvedNavigationItemSchema = z.object({
  surfaceId: experienceSurfaceIdSchema,
  path: z.string().min(1),
  label: z.string().min(1),
});

export type ExperienceSurfaceId = z.infer<typeof experienceSurfaceIdSchema>;
export type ExperienceSurfaceClass = z.infer<typeof experienceSurfaceClassSchema>;
export type ResolvedNavigationItem = z.infer<typeof resolvedNavigationItemSchema>;

const landingSurfaceMap: Record<ExperienceSurfaceId, ExperienceSurfaceId> = {
  runs: "runs",
  billing: "billing",
  economy: "economy",
  self_service: "self_service",
  agents: "agents",
  marketplace: "marketplace",
  profile: "profile",
  imob_chat: "imob_chat",
  imob_dashboard: "imob_dashboard",
};

export function mapLandingSurfaceToExperienceSurface(landingSurface: ExperienceSurfaceId): ExperienceSurfaceId {
  return landingSurfaceMap[landingSurface];
}

export function buildResolvedNavigationItem(input: ResolvedNavigationItem): ResolvedNavigationItem {
  return resolvedNavigationItemSchema.parse(input);
}
