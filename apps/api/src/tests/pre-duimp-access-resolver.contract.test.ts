import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ScopeDecision } from "@eiah/core/policy/TenantPolicyStore";
import {
  createPreDuimpAccessResolver,
  type PreDuimpAccessResolverDeps,
} from "../services/logistica/control/preDuimpAccessResolver";
import {
  PRE_DUIMP_CREATE_SCOPE,
  PRE_DUIMP_PILOT_ACCESS_SCOPE,
} from "../types/preDuimpAccessContract";

const IDENTITY = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const INSTALLATION = {
  ...IDENTITY,
  product: "LOGISTICA",
  status: "active",
};

function decision(input: {
  allowed: boolean;
  scope: string;
  reasonCode?: ScopeDecision["reasonCode"];
  tenantId?: string;
  workspaceId?: string;
}): ScopeDecision {
  return input.allowed
    ? {
        allowed: true,
        reasonCode: "SCOPE_ALLOWED",
        tenantId: input.tenantId ?? IDENTITY.tenantId,
        workspaceId: input.workspaceId ?? IDENTITY.workspaceId,
        scope: input.scope,
        policyVersion: "v1",
      }
    : {
        allowed: false,
        reasonCode: input.reasonCode ?? "POLICY_NOT_FOUND",
        tenantId: input.tenantId ?? IDENTITY.tenantId,
        workspaceId: input.workspaceId ?? IDENTITY.workspaceId,
        scope: input.scope,
      };
}

function createDeps(overrides: Partial<PreDuimpAccessResolverDeps> = {}) {
  return {
    isRuntimeEnabled: () => true,
    resolvePilotDecision: async () =>
      decision({ allowed: true, scope: PRE_DUIMP_PILOT_ACCESS_SCOPE }),
    resolveActionDecision: async () => decision({ allowed: true, scope: PRE_DUIMP_CREATE_SCOPE }),
    findInstallation: async () => INSTALLATION,
    ...overrides,
  } satisfies PreDuimpAccessResolverDeps;
}

test("access resolver allows only the complete workspace-exact shadow capability", async () => {
  const result = await createPreDuimpAccessResolver(createDeps())({ identity: IDENTITY });

  assert.deepEqual(result.capability, {
    version: "v1",
    allowed: true,
    mode: "shadow",
    externalTransmissionAllowed: false,
    reasonCode: null,
    pilotPolicyVersion: "v1",
    actionPolicyVersion: "v1",
  });
});

test("access resolver denies runtime-off and missing, inactive or invalid installations", async () => {
  const cases: Array<[
    Partial<PreDuimpAccessResolverDeps>,
    string,
  ]> = [
    [{ isRuntimeEnabled: () => false }, "PRE_DUIMP_RUNTIME_DISABLED"],
    [{ findInstallation: async () => null }, "PRE_DUIMP_INSTALLATION_MISSING"],
    [
      { findInstallation: async () => ({ ...INSTALLATION, status: "inactive" }) },
      "PRE_DUIMP_INSTALLATION_INACTIVE",
    ],
    [
      { findInstallation: async () => ({ ...INSTALLATION, product: "IMOB" }) },
      "PRE_DUIMP_INSTALLATION_INVALID",
    ],
  ];

  for (const [overrides, reasonCode] of cases) {
    const result = await createPreDuimpAccessResolver(createDeps(overrides))({ identity: IDENTITY });
    assert.equal(result.capability.allowed, false);
    assert.equal(result.capability.reasonCode, reasonCode);
  }
});

test("access resolver denies missing, false and unavailable pilot authority", async () => {
  const cases: Array<[ScopeDecision["reasonCode"], string]> = [
    ["POLICY_NOT_FOUND", "PRE_DUIMP_PILOT_GRANT_MISSING"],
    ["TENANT_POLICY_DISABLED", "PRE_DUIMP_PILOT_GRANT_DISABLED"],
    ["POLICY_STORE_UNAVAILABLE", "PRE_DUIMP_ACCESS_UNAVAILABLE"],
  ];

  for (const [policyReasonCode, capabilityReasonCode] of cases) {
    const result = await createPreDuimpAccessResolver(
      createDeps({
        resolvePilotDecision: async () =>
          decision({
            allowed: false,
            scope: PRE_DUIMP_PILOT_ACCESS_SCOPE,
            reasonCode: policyReasonCode,
          }),
      }),
    )({ identity: IDENTITY });
    assert.equal(result.capability.allowed, false);
    assert.equal(result.capability.reasonCode, capabilityReasonCode);
  }
});

test("pilot denial reason remains exact even when another aggregate gate denies first", async () => {
  const result = await createPreDuimpAccessResolver(
    createDeps({
      findInstallation: async () => null,
      resolvePilotDecision: async () =>
        decision({
          allowed: false,
          scope: PRE_DUIMP_PILOT_ACCESS_SCOPE,
          reasonCode: "POLICY_NOT_FOUND",
        }),
    }),
  )({ identity: IDENTITY });

  assert.equal(result.capability.reasonCode, "PRE_DUIMP_INSTALLATION_MISSING");
  assert.equal(result.pilotAccessReasonCode, "PRE_DUIMP_PILOT_GRANT_MISSING");
});

test("access resolver denies action policy even when pilot access is granted", async () => {
  const result = await createPreDuimpAccessResolver(
    createDeps({
      resolveActionDecision: async () =>
        decision({
          allowed: false,
          scope: PRE_DUIMP_CREATE_SCOPE,
          reasonCode: "TENANT_POLICY_DISABLED",
        }),
    }),
  )({ identity: IDENTITY });

  assert.equal(result.capability.allowed, false);
  assert.equal(result.capability.reasonCode, "PRE_DUIMP_ACTION_POLICY_DENIED");
});

test("access resolver is tenant/workspace isolated and never accepts client coordinates", async () => {
  const seen: Array<{ tenantId: string; workspaceId: string; scope: string }> = [];
  const resolvePilotDecision: PreDuimpAccessResolverDeps["resolvePilotDecision"] = async (
    tenantId,
    workspaceId,
    scope,
  ) => {
    seen.push({ tenantId, workspaceId, scope });
    return decision({
      allowed: tenantId === "tenant-a" && workspaceId === "workspace-a",
      tenantId,
      workspaceId,
      scope,
    });
  };
  const resolver = createPreDuimpAccessResolver(createDeps({ resolvePilotDecision }));

  const allowed = await resolver({ identity: IDENTITY });
  const otherTenant = await resolver({ identity: { tenantId: "tenant-b", workspaceId: "workspace-a" } });
  const siblingWorkspace = await resolver({
    identity: { tenantId: "tenant-a", workspaceId: "workspace-b" },
  });

  assert.equal(allowed.capability.allowed, true);
  assert.equal(otherTenant.capability.allowed, false);
  assert.equal(siblingWorkspace.capability.allowed, false);
  assert.deepEqual(seen.map(({ tenantId, workspaceId }) => ({ tenantId, workspaceId })), [
    IDENTITY,
    { tenantId: "tenant-b", workspaceId: "workspace-a" },
    { tenantId: "tenant-a", workspaceId: "workspace-b" },
  ]);
});

test("access resolver observes revocation live between session bootstrap and POST", async () => {
  let granted = true;
  const resolver = createPreDuimpAccessResolver(
    createDeps({
      resolvePilotDecision: async () =>
        decision({
          allowed: granted,
          scope: PRE_DUIMP_PILOT_ACCESS_SCOPE,
          reasonCode: "TENANT_POLICY_DISABLED",
        }),
    }),
  );

  const bootstrap = await resolver({ identity: IDENTITY });
  granted = false;
  const post = await resolver({
    identity: IDENTITY,
    actionDecision: decision({ allowed: true, scope: PRE_DUIMP_CREATE_SCOPE }),
  });

  assert.equal(bootstrap.capability.allowed, true);
  assert.equal(post.capability.allowed, false);
  assert.equal(post.capability.reasonCode, "PRE_DUIMP_PILOT_GRANT_DISABLED");
});

test("read-model resolution is fail-closed on dependency failure and emits no ledger side effect", async () => {
  let actionReads = 0;
  const result = await createPreDuimpAccessResolver(
    createDeps({
      resolveActionDecision: async () => {
        actionReads += 1;
        throw new Error("policy store unavailable");
      },
    }),
  )({ identity: IDENTITY });

  assert.equal(actionReads, 1);
  assert.equal(result.capability.allowed, false);
  assert.equal(result.capability.reasonCode, "PRE_DUIMP_ACCESS_UNAVAILABLE");
});

test("session context projects the canonical capability and the POST adapter resolves access live", () => {
  const sessionSource = readFileSync(new URL("../routes/session.ts", import.meta.url), "utf8");
  const adapterSource = readFileSync(
    new URL("../services/logistica/control/preDuimpServerAuthorityAdapter.ts", import.meta.url),
    "utf8",
  );

  assert.match(sessionSource, /resolvePreDuimpAccessFromCanonicalSources\(\{/);
  assert.match(sessionSource, /capabilities:\s*\{\s*preDuimpShadow: preDuimpAccess\.capability/);
  assert.doesNotMatch(sessionSource, /checkScopePermission/);
  assert.match(adapterSource, /checkScopePermission\(\{/);
  assert.match(adapterSource, /deps\.resolveAccess\(\{/);
  assert.match(adapterSource, /actionDecision: scopeDecision/);
});
