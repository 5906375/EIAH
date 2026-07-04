import test from "node:test";
import assert from "node:assert/strict";

import {
  imobArtifactCapabilitiesDeps,
  resolveImobArtifactCapabilities,
  resolveRunBundleCapability,
} from "../services/imob/imobArtifactCapabilities";

const AUTH_CONTEXT = {
  tenantId: "tenant-artifacts",
  workspaceId: "workspace-artifacts",
  userId: "user-artifacts",
  tokenId: "token-artifacts",
};

test("resolveImobArtifactCapabilities allows case dossier/receipt and openChat with workspace+stage permission", async () => {
  const original = imobArtifactCapabilitiesDeps.checkScopePermission;
  Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
    configurable: true,
    value: async () => ({ allowed: true, reasonCode: "SCOPE_ALLOWED" }),
  });

  try {
    const result = await resolveImobArtifactCapabilities({
      authContext: AUTH_CONTEXT,
      permissions: ["imob.chat.use", "imob.stage.*"],
      stage: "guardrails_review",
      caseId: "case-1",
      threadId: null,
      runId: "run-1",
    });

    assert.equal(result.canOpenChat.allowed, true);
    assert.equal(result.canViewCaseDossier.allowed, true);
    assert.equal(result.canViewCaseReceipt.allowed, true);
    assert.equal(result.canViewRunBundle.allowed, true);
  } finally {
    Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
      configurable: true,
      value: original,
    });
  }
});

test("resolveImobArtifactCapabilities fails closed for case artifacts without stage permission", async () => {
  const original = imobArtifactCapabilitiesDeps.checkScopePermission;
  Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
    configurable: true,
    value: async () => ({ allowed: false, reasonCode: "TENANT_POLICY_DISABLED" }),
  });

  try {
    const result = await resolveImobArtifactCapabilities({
      authContext: AUTH_CONTEXT,
      permissions: ["imob.chat.use"],
      stage: "guardrails_review",
      caseId: "case-1",
      threadId: "thread-1",
      runId: "run-1",
    });

    assert.equal(result.canOpenChat.allowed, false);
    assert.equal(result.canOpenChat.reasonCode, "IMOB_STAGE_FORBIDDEN");
    assert.equal(result.canViewCaseDossier.allowed, false);
    assert.equal(result.canViewCaseDossier.reasonCode, "IMOB_STAGE_FORBIDDEN");
    assert.equal(result.canViewCaseReceipt.allowed, false);
    assert.equal(result.canViewCaseReceipt.reasonCode, "IMOB_STAGE_FORBIDDEN");
    assert.equal(result.canViewRunBundle.allowed, false);
    assert.equal(result.canViewRunBundle.reasonCode, "TENANT_POLICY_DISABLED");
  } finally {
    Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
      configurable: true,
      value: original,
    });
  }
});

test("resolveImobArtifactCapabilities returns explicit reasonCode when chat context is absent", async () => {
  const original = imobArtifactCapabilitiesDeps.checkScopePermission;
  Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
    configurable: true,
    value: async () => ({ allowed: false, reasonCode: "SCOPE_NOT_ALLOWED" }),
  });

  try {
    const result = await resolveImobArtifactCapabilities({
      authContext: AUTH_CONTEXT,
      permissions: ["imob.chat.use", "imob.stage.*"],
      stage: "guardrails_review",
      caseId: null,
      threadId: null,
      runId: null,
    });

    assert.equal(result.canOpenChat.allowed, false);
    assert.equal(result.canOpenChat.reasonCode, "IMOB_CHAT_CONTEXT_MISSING");
    assert.equal(result.canViewCaseDossier.allowed, false);
    assert.equal(result.canViewCaseDossier.reasonCode, "IMOB_CASE_CONTEXT_MISSING");
    assert.equal(result.canViewCaseReceipt.allowed, false);
    assert.equal(result.canViewCaseReceipt.reasonCode, "IMOB_CASE_CONTEXT_MISSING");
    assert.equal(result.canViewRunBundle.allowed, false);
    assert.equal(result.canViewRunBundle.reasonCode, "RUN_BUNDLE_UNAVAILABLE");
  } finally {
    Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
      configurable: true,
      value: original,
    });
  }
});

test("resolveRunBundleCapability propagates scope reasonCode", async () => {
  const original = imobArtifactCapabilitiesDeps.checkScopePermission;
  Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
    configurable: true,
    value: async () => ({ allowed: false, reasonCode: "WORKSPACE_SCOPE_MISMATCH" }),
  });

  try {
    const result = await resolveRunBundleCapability({
      authContext: AUTH_CONTEXT,
      runId: "run-1",
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, "WORKSPACE_SCOPE_MISMATCH");
  } finally {
    Object.defineProperty(imobArtifactCapabilitiesDeps, "checkScopePermission", {
      configurable: true,
      value: original,
    });
  }
});
