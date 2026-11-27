import { TenantPolicyStore, type ScopeDecision } from "@eiah/core/policy/TenantPolicyStore";

import { isPreDuimpRuntimeShadowRouteEnabled } from "../../../routes/preDuimpRuntimeShadowGate";
import {
  PRE_DUIMP_CREATE_SCOPE,
  PRE_DUIMP_PILOT_ACCESS_SCOPE,
  PRE_DUIMP_SHADOW_CAPABILITY_VERSION,
  type PreDuimpAccessDenialReasonCode,
  type PreDuimpShadowCapability,
} from "../../../types/preDuimpAccessContract";
import type { TenantProductInstallationLike } from "../../../types/verticalEntitlementGateContract";

const PRE_DUIMP_INSTALLATION_PRODUCT = "LOGISTICA";

type PreDuimpAccessIdentity = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId?: string;
};

export type PreDuimpAccessFacts = Readonly<{
  runtimeEnabled: boolean;
  installation: TenantProductInstallationLike | null;
  pilotDecision: ScopeDecision;
  actionDecision: ScopeDecision;
}>;

export type PreDuimpAccessResolution = Readonly<
  PreDuimpAccessFacts & {
    capability: PreDuimpShadowCapability;
    pilotAccessReasonCode: PreDuimpAccessDenialReasonCode | null;
  }
>;

function denied(reasonCode: PreDuimpAccessDenialReasonCode): PreDuimpShadowCapability {
  return {
    version: PRE_DUIMP_SHADOW_CAPABILITY_VERSION,
    allowed: false,
    mode: "shadow",
    externalTransmissionAllowed: false,
    reasonCode,
  };
}

function mapPilotDenial(decision: ScopeDecision): PreDuimpAccessDenialReasonCode {
  switch (decision.reasonCode) {
    case "POLICY_NOT_FOUND":
    case "WORKSPACE_SCOPE_MISMATCH":
      return "PRE_DUIMP_PILOT_GRANT_MISSING";
    case "TENANT_POLICY_DISABLED":
    case "SCOPE_NOT_ALLOWED":
      return "PRE_DUIMP_PILOT_GRANT_DISABLED";
    case "POLICY_STORE_UNAVAILABLE":
      return "PRE_DUIMP_ACCESS_UNAVAILABLE";
    default:
      return "PRE_DUIMP_ACCESS_UNAVAILABLE";
  }
}

export function evaluatePreDuimpAccess(facts: PreDuimpAccessFacts): PreDuimpShadowCapability {
  if (!facts.runtimeEnabled) return denied("PRE_DUIMP_RUNTIME_DISABLED");

  if (!facts.installation) return denied("PRE_DUIMP_INSTALLATION_MISSING");
  if (
    facts.installation.tenantId !== facts.pilotDecision.tenantId ||
    facts.installation.workspaceId !== facts.pilotDecision.workspaceId ||
    facts.installation.product !== PRE_DUIMP_INSTALLATION_PRODUCT
  ) {
    return denied("PRE_DUIMP_INSTALLATION_INVALID");
  }
  if (facts.installation.status !== "active") {
    return denied("PRE_DUIMP_INSTALLATION_INACTIVE");
  }

  if (!facts.pilotDecision.allowed) return denied(mapPilotDenial(facts.pilotDecision));
  if (!facts.actionDecision.allowed) {
    return denied(
      facts.actionDecision.reasonCode === "POLICY_STORE_UNAVAILABLE"
        ? "PRE_DUIMP_ACCESS_UNAVAILABLE"
        : "PRE_DUIMP_ACTION_POLICY_DENIED",
    );
  }

  return {
    version: PRE_DUIMP_SHADOW_CAPABILITY_VERSION,
    allowed: true,
    mode: "shadow",
    externalTransmissionAllowed: false,
    reasonCode: null,
    ...(facts.pilotDecision.policyVersion
      ? { pilotPolicyVersion: facts.pilotDecision.policyVersion }
      : {}),
    ...(facts.actionDecision.policyVersion
      ? { actionPolicyVersion: facts.actionDecision.policyVersion }
      : {}),
  };
}

export type PreDuimpAccessResolverDeps = Readonly<{
  isRuntimeEnabled: () => boolean;
  resolvePilotDecision: (
    tenantId: string,
    workspaceId: string,
    scope: string,
  ) => Promise<ScopeDecision>;
  resolveActionDecision: (
    tenantId: string,
    workspaceId: string,
    scope: string,
  ) => Promise<ScopeDecision>;
  findInstallation: (
    identity: PreDuimpAccessIdentity,
  ) => Promise<TenantProductInstallationLike | null>;
}>;

export function createPreDuimpAccessResolver(deps: PreDuimpAccessResolverDeps) {
  return async function resolvePreDuimpAccessFromCanonicalSources(input: {
    identity: PreDuimpAccessIdentity;
    actionDecision?: ScopeDecision;
  }): Promise<PreDuimpAccessResolution> {
    const runtimeEnabled = deps.isRuntimeEnabled();

    try {
      const [installation, pilotDecision, resolvedActionDecision] = await Promise.all([
        deps.findInstallation(input.identity),
        deps.resolvePilotDecision(
          input.identity.tenantId,
          input.identity.workspaceId,
          PRE_DUIMP_PILOT_ACCESS_SCOPE,
        ),
        input.actionDecision
          ? Promise.resolve(input.actionDecision)
          : deps.resolveActionDecision(
              input.identity.tenantId,
              input.identity.workspaceId,
              PRE_DUIMP_CREATE_SCOPE,
            ),
      ]);

      const facts: PreDuimpAccessFacts = {
        runtimeEnabled,
        installation,
        pilotDecision,
        actionDecision: resolvedActionDecision,
      };
      return {
        ...facts,
        capability: evaluatePreDuimpAccess(facts),
        pilotAccessReasonCode: pilotDecision.allowed ? null : mapPilotDenial(pilotDecision),
      };
    } catch {
      const unavailableDecision: ScopeDecision = {
        allowed: false,
        reasonCode: "POLICY_STORE_UNAVAILABLE",
        tenantId: input.identity.tenantId,
        workspaceId: input.identity.workspaceId,
        scope: PRE_DUIMP_PILOT_ACCESS_SCOPE,
      };
      const facts: PreDuimpAccessFacts = {
        runtimeEnabled,
        installation: null,
        pilotDecision: unavailableDecision,
        actionDecision: input.actionDecision ?? {
          ...unavailableDecision,
          scope: PRE_DUIMP_CREATE_SCOPE,
        },
      };
      return {
        ...facts,
        capability: denied("PRE_DUIMP_ACCESS_UNAVAILABLE"),
        pilotAccessReasonCode: "PRE_DUIMP_ACCESS_UNAVAILABLE",
      };
    }
  };
}

const policyStore = TenantPolicyStore.getInstance();

const PRODUCTION_DEPS: PreDuimpAccessResolverDeps = Object.freeze({
  isRuntimeEnabled: () => isPreDuimpRuntimeShadowRouteEnabled(),
  resolvePilotDecision: (tenantId, workspaceId, scope) =>
    policyStore.resolveExactWorkspaceScopeDecision(tenantId, workspaceId, scope),
  resolveActionDecision: (tenantId, workspaceId, scope) =>
    policyStore.resolveScopeDecision(tenantId, workspaceId, scope),
  findInstallation: async (identity) => {
    const { getPrismaForTenant } = await import("@repo/db");
    const tenantPrisma = getPrismaForTenant(identity.tenantId, identity.workspaceId);
    const row = await tenantPrisma.tenantProductInstallation.findUnique({
      where: {
        tenant_workspace_product_unique: {
          tenantId: identity.tenantId,
          workspaceId: identity.workspaceId,
          product: PRE_DUIMP_INSTALLATION_PRODUCT,
        },
      },
    });
    return row
      ? {
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          product: row.product,
          status: row.status,
        }
      : null;
  },
});

export const resolvePreDuimpAccessFromCanonicalSources =
  createPreDuimpAccessResolver(PRODUCTION_DEPS);
