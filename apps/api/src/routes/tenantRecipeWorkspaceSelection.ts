import type { Request } from "express";

export function readRequestedWorkspaceId(req: Request) {
  const primary = req.header("x-eiah-workspace");
  if (typeof primary === "string" && primary.trim().length > 0) {
    return primary.trim();
  }

  const fallback = req.header("x-workspace-id");
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }

  return null;
}

export function resolveEffectiveTenantRecipeWorkspaceId(params: {
  authTenantId: string;
  authWorkspaceId: string;
  requestedWorkspaceId: string | null;
  requestedWorkspaceTenantId: string | null;
}) {
  const { authTenantId, authWorkspaceId, requestedWorkspaceId, requestedWorkspaceTenantId } = params;
  if (!requestedWorkspaceId) {
    return authWorkspaceId;
  }

  if (requestedWorkspaceTenantId !== authTenantId) {
    return authWorkspaceId;
  }

  return requestedWorkspaceId;
}
