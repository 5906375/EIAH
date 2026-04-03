import {
  buildResolvedNavigationItem,
} from "../types/experienceSurfaceContract";
import {
  buildRecommendedAction,
  type ExperienceRole,
  type FallbackMode,
  type ResolvedExperience,
} from "../types/experienceResolverContract";

type SessionDomain = "core" | "imob";

type SessionEntitlements = {
  REAL_ESTATE_CORE: boolean;
  EXPORTS_ADDON: boolean;
  BILLING_INSIGHTS_ADDON: boolean;
  IMOB_INSTALLED?: boolean;
};

type ProductInstallation = {
  product: string;
  status: string;
};

type ResolverInput = {
  roles: string[];
  tenantId: string;
  workspaceId: string;
  activeDomain: SessionDomain;
  availableDomains: SessionDomain[];
  entitlements: SessionEntitlements;
  productInstallations: ProductInstallation[];
};

function hasInstalledProduct(productInstallations: ProductInstallation[], product: string) {
  return productInstallations.some((entry) => {
    const normalizedProduct = entry.product.trim().toUpperCase();
    const normalizedStatus = entry.status.trim().toLowerCase();
    return normalizedProduct === product && normalizedStatus === "active";
  });
}

function resolveRoleProfile(roles: string[]): ExperienceRole {
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase()).filter(Boolean);

  if (normalizedRoles.includes("founder") || normalizedRoles.includes("global_admin")) {
    return "founder_global";
  }
  if (normalizedRoles.includes("tenant_admin")) {
    return "tenant_admin";
  }
  if (normalizedRoles.includes("admin")) {
    return "workspace_admin";
  }
  if (normalizedRoles.includes("service")) {
    return "service_operator";
  }
  return "workspace_member";
}

function resolveImobLanding(input: ResolverInput) {
  const imobInstalled =
    input.entitlements.IMOB_INSTALLED === true || hasInstalledProduct(input.productInstallations, "IMOB");
  if (!imobInstalled) return null;

  return {
    landingSurface: "imob_chat",
    landingPath: "/app/imob/chat",
    primaryNavigation: [
      buildResolvedNavigationItem({ surfaceId: "imob_chat", path: "/app/imob/chat", label: "IMOB" }),
      buildResolvedNavigationItem({ surfaceId: "imob_dashboard", path: "/app/imob/dashboard", label: "Dashboard IMOB" }),
      buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
    ],
    recommendedActions: [
      buildRecommendedAction({
        actionId: "continue_imob_chat",
        surfaceId: "imob_chat",
        path: "/app/imob/chat",
        label: "Abrir atendimento IMOB",
        priority: "primary",
      }),
      buildRecommendedAction({
        actionId: "review_imob_operations",
        surfaceId: "imob_dashboard",
        path: "/app/imob/dashboard",
        label: "Ver dashboard IMOB",
        priority: "secondary",
      }),
    ],
  };
}

export function resolvePlatformExperience(input: ResolverInput): ResolvedExperience {
  const roleProfile = resolveRoleProfile(input.roles);
  const imobDomain = input.activeDomain === "imob";
  const imobResolution = imobDomain ? resolveImobLanding(input) : null;

  if (imobDomain && !imobResolution) {
    return {
      resolverVersion: "v0",
      roleProfile,
      landingSurface: "runs",
      landingPath: "/app/runs",
      primaryNavigation: [
        buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
        buildResolvedNavigationItem({ surfaceId: "self_service", path: "/self-service", label: "Self-service" }),
      ],
      recommendedActions: [
        buildRecommendedAction({
          actionId: "open_runs_overview",
          surfaceId: "runs",
          path: "/app/runs",
          label: "Abrir runs",
          priority: "primary",
        }),
        buildRecommendedAction({
          actionId: "fallback_to_self_service",
          surfaceId: "self_service",
          path: "/self-service",
          label: "Ir para self-service",
          priority: "secondary",
        }),
      ],
      allowedSurfaceClasses: ["front_door", "operational_hub"],
      fallbackMode: "core_safe_default",
      cachePolicy: {
        strategy: "session_context_only",
        sourceOfTruth: "runtime",
        mode: "fail_safe_accelerator",
      },
    };
  }

  if (imobResolution) {
    return {
      resolverVersion: "v0",
      roleProfile,
      landingSurface: imobResolution.landingSurface,
      landingPath: imobResolution.landingPath,
      primaryNavigation: imobResolution.primaryNavigation,
      recommendedActions: imobResolution.recommendedActions,
      allowedSurfaceClasses: ["front_door", "operational_hub"],
      fallbackMode: "context_incomplete",
      cachePolicy: {
        strategy: "session_context_only",
        sourceOfTruth: "runtime",
        mode: "fail_safe_accelerator",
      },
    };
  }

  switch (roleProfile) {
    case "founder_global":
      return {
        resolverVersion: "v0",
        roleProfile,
        landingSurface: "economy",
        landingPath: "/app/economy",
        primaryNavigation: [
          buildResolvedNavigationItem({ surfaceId: "economy", path: "/app/economy", label: "Economy" }),
          buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
          buildResolvedNavigationItem({ surfaceId: "billing", path: "/app/billing", label: "Billing" }),
          buildResolvedNavigationItem({ surfaceId: "marketplace", path: "/app/marketplace", label: "Marketplace" }),
          buildResolvedNavigationItem({ surfaceId: "profile", path: "/profile", label: "Perfil" }),
        ],
        recommendedActions: [
          buildRecommendedAction({
            actionId: "open_platform_economy",
            surfaceId: "economy",
            path: "/app/economy",
            label: "Abrir economy",
            priority: "primary",
          }),
          buildRecommendedAction({
            actionId: "review_runs_overview",
            surfaceId: "runs",
            path: "/app/runs",
            label: "Revisar runs",
            priority: "secondary",
          }),
        ],
        allowedSurfaceClasses: ["front_door", "operational_hub", "governance_hub", "investigation_surface"],
        fallbackMode: "context_incomplete",
        cachePolicy: {
          strategy: "session_context_only",
          sourceOfTruth: "runtime",
          mode: "fail_safe_accelerator",
        },
      };
    case "service_operator":
      return {
        resolverVersion: "v0",
        roleProfile,
        landingSurface: "runs",
        landingPath: "/app/runs",
        primaryNavigation: [
          buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
          buildResolvedNavigationItem({ surfaceId: "economy", path: "/app/economy", label: "Economy" }),
          buildResolvedNavigationItem({ surfaceId: "billing", path: "/app/billing", label: "Billing" }),
          buildResolvedNavigationItem({ surfaceId: "marketplace", path: "/app/marketplace", label: "Marketplace" }),
          buildResolvedNavigationItem({ surfaceId: "profile", path: "/profile", label: "Perfil" }),
        ],
        recommendedActions: [
          buildRecommendedAction({
            actionId: "review_runs_overview",
            surfaceId: "runs",
            path: "/app/runs",
            label: "Revisar runs",
            priority: "primary",
          }),
          buildRecommendedAction({
            actionId: "review_billing_status",
            surfaceId: "billing",
            path: "/app/billing",
            label: "Checar billing",
            priority: "secondary",
          }),
        ],
        allowedSurfaceClasses: ["front_door", "operational_hub", "governance_hub", "investigation_surface"],
        fallbackMode: "context_incomplete",
        cachePolicy: {
          strategy: "session_context_only",
          sourceOfTruth: "runtime",
          mode: "fail_safe_accelerator",
        },
      };
    case "tenant_admin":
      return {
        resolverVersion: "v0",
        roleProfile,
        landingSurface: "economy",
        landingPath: "/app/economy",
        primaryNavigation: [
          buildResolvedNavigationItem({ surfaceId: "economy", path: "/app/economy", label: "Economy" }),
          buildResolvedNavigationItem({ surfaceId: "billing", path: "/app/billing", label: "Billing" }),
          buildResolvedNavigationItem({ surfaceId: "marketplace", path: "/app/marketplace", label: "Marketplace" }),
          buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
          buildResolvedNavigationItem({ surfaceId: "profile", path: "/profile", label: "Perfil" }),
        ],
        recommendedActions: [
          buildRecommendedAction({
            actionId: "open_tenant_economy",
            surfaceId: "economy",
            path: "/app/economy",
            label: "Abrir economy",
            priority: "primary",
          }),
          buildRecommendedAction({
            actionId: "open_billing_summary",
            surfaceId: "billing",
            path: "/app/billing",
            label: "Checar billing",
            priority: "secondary",
          }),
        ],
        allowedSurfaceClasses: ["operational_hub", "governance_hub", "investigation_surface"],
        fallbackMode: "context_incomplete",
        cachePolicy: {
          strategy: "session_context_only",
          sourceOfTruth: "runtime",
          mode: "fail_safe_accelerator",
        },
      };
    case "workspace_member":
      return {
        resolverVersion: "v0",
        roleProfile,
        landingSurface: "self_service",
        landingPath: "/self-service",
        primaryNavigation: [
          buildResolvedNavigationItem({ surfaceId: "self_service", path: "/self-service", label: "Self-service" }),
          buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
        ],
        recommendedActions: [
          buildRecommendedAction({
            actionId: "start_in_self_service",
            surfaceId: "self_service",
            path: "/self-service",
            label: "Comecar no self-service",
            priority: "primary",
          }),
          buildRecommendedAction({
            actionId: "check_recent_runs",
            surfaceId: "runs",
            path: "/app/runs",
            label: "Ver runs recentes",
            priority: "secondary",
          }),
        ],
        allowedSurfaceClasses: ["front_door", "operational_hub"],
        fallbackMode: "context_incomplete",
        cachePolicy: {
          strategy: "session_context_only",
          sourceOfTruth: "runtime",
          mode: "fail_safe_accelerator",
        },
      };
    case "workspace_admin":
    default:
      return {
        resolverVersion: "v0",
        roleProfile,
        landingSurface: "runs",
        landingPath: "/app/runs",
        primaryNavigation: [
          buildResolvedNavigationItem({ surfaceId: "runs", path: "/app/runs", label: "Runs" }),
          buildResolvedNavigationItem({ surfaceId: "agents", path: "/app/agents", label: "Agentes" }),
          buildResolvedNavigationItem({ surfaceId: "marketplace", path: "/app/marketplace", label: "Marketplace" }),
          buildResolvedNavigationItem({ surfaceId: "profile", path: "/profile", label: "Perfil" }),
        ],
        recommendedActions: [
          buildRecommendedAction({
            actionId: "open_runs_hub",
            surfaceId: "runs",
            path: "/app/runs",
            label: "Abrir runs",
            priority: "primary",
          }),
          buildRecommendedAction({
            actionId: "review_agents_catalog",
            surfaceId: "agents",
            path: "/app/agents",
            label: "Revisar agentes",
            priority: "secondary",
          }),
        ],
        allowedSurfaceClasses: ["front_door", "operational_hub", "governance_hub"],
        fallbackMode: "context_incomplete",
        cachePolicy: {
          strategy: "session_context_only",
          sourceOfTruth: "runtime",
          mode: "fail_safe_accelerator",
        },
      };
  }
}
