import { checkScopePermission } from "@eiah/core";
import { canWorkspaceOperateImobStage, hasWorkspacePermission } from "../workspaceResponsibility";

type AuthContext = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  tokenId?: string | null;
};

export type ImobArtifactCapabilityDecision = {
  allowed: boolean;
  reasonCode?: string;
};

export type ImobArtifactCapabilities = {
  canOpenChat: ImobArtifactCapabilityDecision;
  canViewCaseDossier: ImobArtifactCapabilityDecision;
  canViewCaseReceipt: ImobArtifactCapabilityDecision;
  canViewRunBundle: ImobArtifactCapabilityDecision;
};

type ScopeDecision = Awaited<ReturnType<typeof checkScopePermission>>;

export const imobArtifactCapabilitiesDeps = {
  checkScopePermission,
};

function allow(): ImobArtifactCapabilityDecision {
  return { allowed: true };
}

function deny(reasonCode: string): ImobArtifactCapabilityDecision {
  return { allowed: false, reasonCode };
}

function resolveCaseAccessDecision(params: {
  permissions: string[];
  stage: string | null | undefined;
}) {
  if (!hasWorkspacePermission(params.permissions, "imob.chat.use")) {
    return deny("IMOB_WORKSPACE_PERMISSION_FORBIDDEN");
  }
  if (!canWorkspaceOperateImobStage(params.permissions, params.stage)) {
    return deny("IMOB_STAGE_FORBIDDEN");
  }
  return allow();
}

export async function resolveRunBundleCapability(params: {
  authContext: AuthContext;
  runId?: string | null;
}) {
  if (!params.runId) return deny("RUN_BUNDLE_UNAVAILABLE");
  const decision: ScopeDecision = await imobArtifactCapabilitiesDeps.checkScopePermission({
    tenantId: params.authContext.tenantId,
    workspaceId: params.authContext.workspaceId,
    userId: params.authContext.userId ?? null,
    tokenId: params.authContext.tokenId ?? null,
    scope: "reports.view",
  });
  return decision.allowed ? allow() : deny(decision.reasonCode);
}

export async function resolveImobArtifactCapabilities(params: {
  authContext: AuthContext;
  permissions: string[];
  stage: string | null | undefined;
  caseId?: string | null;
  threadId?: string | null;
  runId?: string | null;
}): Promise<ImobArtifactCapabilities> {
  const caseAccess = resolveCaseAccessDecision({
    permissions: params.permissions,
    stage: params.stage,
  });

  return {
    canOpenChat:
      params.caseId || params.threadId
        ? caseAccess
        : deny("IMOB_CHAT_CONTEXT_MISSING"),
    canViewCaseDossier:
      params.caseId
        ? caseAccess
        : deny("IMOB_CASE_CONTEXT_MISSING"),
    canViewCaseReceipt:
      params.caseId
        ? caseAccess
        : deny("IMOB_CASE_CONTEXT_MISSING"),
    canViewRunBundle: await resolveRunBundleCapability({
      authContext: params.authContext,
      runId: params.runId ?? null,
    }),
  };
}
