import type { LogisticaContextAccess } from "@eiah/contracts";
import { buildVerticalExperienceContract } from "../types/verticalExperienceContract";

export function resolveVerticalExperienceRegistry(params: {
  logisticaAccess?: LogisticaContextAccess;
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
      frontDoorSurface: hasImob ? "chat" : null,
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
    buildVerticalExperienceContract({
      verticalId: "LOGISTICA", label: "Logística & Comex", activeDomain: "logistica",
      installedProduct: "LOGISTICA", rolloutStage: "context_only",
      enabled: params.logisticaAccess?.allowed === true,
      frontDoorSurface: params.logisticaAccess?.allowed ? "chat" : null,
      operationalHubSurface: null, governanceHubSurface: null, investigationSurfaces: [],
      contextSpecRef: "docs/ops/oraculo-jornada-acesso-core-2026-10-16.md",
    }),
  ];
}
