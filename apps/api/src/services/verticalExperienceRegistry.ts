import { buildVerticalExperienceContract } from "../types/verticalExperienceContract";

export function resolveVerticalExperienceRegistry(params: {
  installedProducts: Array<{ product: string; status: string }>;
}) {
  const installedProducts = params.installedProducts
    .filter((item) => item.status.trim().toLowerCase() === "active")
    .map((item) => item.product.trim().toUpperCase());

  const hasImob = installedProducts.includes("IMOB");

  return [
    buildVerticalExperienceContract({
      verticalId: "IMOB",
      label: "IMOB",
      activeDomain: "imob",
      installedProduct: "IMOB",
      rolloutStage: hasImob ? "operationalized" : "context_only",
      enabled: hasImob,
      frontDoorSurface: hasImob ? "imob_chat" : null,
      operationalHubSurface: hasImob ? "imob_dashboard" : null,
      governanceHubSurface: hasImob ? "marketplace" : null,
      investigationSurfaces: hasImob ? ["imob_dashboard", "billing"] : [],
      contextSpecRef: "docs/architecture/vertical-context-imob.md",
    }),
    buildVerticalExperienceContract({
      verticalId: "LEGAL",
      label: "LEGAL",
      activeDomain: "core",
      installedProduct: null,
      rolloutStage: "context_only",
      enabled: true,
      frontDoorSurface: null,
      operationalHubSurface: null,
      governanceHubSurface: null,
      investigationSurfaces: [],
      contextSpecRef: "docs/architecture/vertical-context-legal.md",
    }),
    buildVerticalExperienceContract({
      verticalId: "HEALTH",
      label: "HEALTH",
      activeDomain: "core",
      installedProduct: null,
      rolloutStage: "context_only",
      enabled: false,
      frontDoorSurface: null,
      operationalHubSurface: null,
      governanceHubSurface: null,
      investigationSurfaces: [],
      contextSpecRef: "docs/architecture/vertical-mvp-data-model-and-screens-template.md",
    }),
  ];
}
