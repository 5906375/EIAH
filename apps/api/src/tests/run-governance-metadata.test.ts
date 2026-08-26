import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_GOVERNANCE_UNVERIFIED_BANNER,
  RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
  RUN_GOVERNANCE_PROJECTION_VERSION,
  VERTICAL_GOVERNANCE_NOT_EVALUATED,
  evaluateRunActionPolicy,
  mapActionPolicyReasonCode,
  projectRunGovernanceForRead,
  sanitizeRunGovernanceMetadata,
  sanitizeRunGovernanceMetadataForWorker,
} from "../services/runGovernanceMetadata";

test("Action Policy reason codes are projected through the ratified public mapper", () => {
  assert.equal(mapActionPolicyReasonCode({ allowed: true, reasonCode: "SCOPE_ALLOWED" }), null);
  assert.equal(
    mapActionPolicyReasonCode({ allowed: false, reasonCode: "POLICY_NOT_FOUND" }),
    "POLICY_NOT_FOUND",
  );
  assert.equal(
    mapActionPolicyReasonCode({ allowed: false, reasonCode: "SCOPE_NOT_ALLOWED" }),
    "ACTION_POLICY_SCOPE_DENIED",
  );
  assert.equal(
    mapActionPolicyReasonCode({ allowed: false, reasonCode: "WORKSPACE_SCOPE_MISMATCH" }),
    "ACTION_POLICY_SCOPE_DENIED",
  );
  assert.equal(
    mapActionPolicyReasonCode({ allowed: false, reasonCode: "TENANT_POLICY_DISABLED" }),
    "ACTION_POLICY_DISABLED",
  );
  assert.equal(
    mapActionPolicyReasonCode({ allowed: false, reasonCode: "POLICY_STORE_UNAVAILABLE" }),
    "ACTION_POLICY_STORE_UNAVAILABLE",
  );
});

test("sanitizeRunGovernanceMetadata strips client governance and does not mutate input", () => {
  const input = {
    domain: "core",
    rbacEvaluated: true,
    entitlementEvaluated: true,
    actionPolicyDecision: {
      evaluated: true,
      decision: "allowed",
      source: "tenant_action_policy",
      action: "malicious.action",
      reasonCode: null,
    },
    governanceContext: {
      evaluationState: "enforced_allow",
      rbacEvaluated: true,
      entitlementEvaluated: true,
      policyDecision: "allowed",
    },
  };

  const result = sanitizeRunGovernanceMetadata(input, {
    tenantIdPresent: true,
    workspaceIdPresent: true,
  });

  assert.equal(result.domain, "core");
  assert.equal(result.rbacEvaluated, undefined);
  assert.equal(result.entitlementEvaluated, undefined);
  assert.equal(result.actionPolicyDecision, undefined);
  assert.deepEqual(result.governanceContext, {
    projectionVersion: RUN_GOVERNANCE_PROJECTION_VERSION,
    evaluationState: "not_evaluated",
    tenantIdPresent: true,
    workspaceIdPresent: true,
    rbacEvaluated: false,
    entitlementEvaluated: false,
    trustScoreEvaluated: false,
    trustScore: null,
    trustLevel: null,
    costGuardEvaluated: false,
    policyDecision: "not_evaluated",
    reasonCode: VERTICAL_GOVERNANCE_NOT_EVALUATED,
  });
  assert.equal(input.governanceContext.rbacEvaluated, true);
});

test("sanitizeRunGovernanceMetadata preserves a real server-side Action Policy separately", () => {
  const result = sanitizeRunGovernanceMetadata(
    { governanceContext: { policyDecision: "denied" } },
    {
      tenantIdPresent: true,
      workspaceIdPresent: true,
      actionPolicyDecision: {
        evaluated: true,
        decision: "allowed",
        source: "tenant_action_policy",
        action: "realestate.apply_adjustment",
        reasonCode: null,
      },
    }
  );

  assert.deepEqual(result.actionPolicyDecision, {
    evaluated: true,
    decision: "allowed",
    source: "tenant_action_policy",
    action: "realestate.apply_adjustment",
    reasonCode: null,
  });
  assert.equal((result.governanceContext as Record<string, unknown>).policyDecision, "not_evaluated");
});

test("sanitizeRunGovernanceMetadata handles absent metadata and ignores client trust and cost claims", () => {
  for (const input of [undefined, null, {}]) {
    const result = sanitizeRunGovernanceMetadata(input, {
      tenantIdPresent: true,
      workspaceIdPresent: false,
    });
    assert.deepEqual(result.governanceContext, {
      projectionVersion: RUN_GOVERNANCE_PROJECTION_VERSION,
      evaluationState: "not_evaluated",
      tenantIdPresent: true,
      workspaceIdPresent: false,
      rbacEvaluated: false,
      entitlementEvaluated: false,
      trustScoreEvaluated: false,
      trustScore: null,
      trustLevel: null,
      costGuardEvaluated: false,
      policyDecision: "not_evaluated",
      reasonCode: VERTICAL_GOVERNANCE_NOT_EVALUATED,
    });
  }

  const malicious = sanitizeRunGovernanceMetadata(
    {
      governanceContext: {
        trustScoreEvaluated: true,
        trustScore: 100,
        trustLevel: "high",
        costGuardEvaluated: true,
      },
    },
    { tenantIdPresent: true, workspaceIdPresent: true }
  );
  assert.equal((malicious.governanceContext as any).trustScoreEvaluated, false);
  assert.equal((malicious.governanceContext as any).trustScore, null);
  assert.equal((malicious.governanceContext as any).costGuardEvaluated, false);
});

test("sanitizeRunGovernanceMetadata is idempotent and wins after a malicious spread", () => {
  const facts = { tenantIdPresent: true, workspaceIdPresent: true };
  const malicious = {
    benign: "kept",
    governanceState: "allowed",
    governanceContext: { rbacEvaluated: true, policyDecision: "allowed" },
  };
  const once = sanitizeRunGovernanceMetadata(malicious, facts);
  const twice = sanitizeRunGovernanceMetadata(once, facts);
  const afterSpread = sanitizeRunGovernanceMetadata({ ...once, ...malicious }, facts);

  assert.deepEqual(twice, once);
  assert.deepEqual(afterSpread, once);
  assert.equal((afterSpread.governanceContext as any).policyDecision, "not_evaluated");
  assert.equal((afterSpread.governanceContext as any).rbacEvaluated, false);
});

test("worker ignores self-attested A0 marker and Action Policy from queue metadata", () => {
  const result = sanitizeRunGovernanceMetadataForWorker(
    {
      benign: "kept",
      governanceContext: {
        projectionVersion: RUN_GOVERNANCE_PROJECTION_VERSION,
        evaluationState: "enforced_allow",
        rbacEvaluated: true,
        entitlementEvaluated: true,
      },
      actionPolicyDecision: {
        evaluated: true,
        decision: "allowed",
        source: "tenant_action_policy",
        action: "malicious.action",
        reasonCode: null,
      },
    },
    { tenantIdPresent: true, workspaceIdPresent: true }
  );

  assert.equal(result.benign, "kept");
  assert.equal(result.actionPolicyDecision, undefined);
  assert.equal((result.governanceContext as any).evaluationState, "not_evaluated");
  assert.equal((result.governanceContext as any).rbacEvaluated, false);
  assert.equal((result.governanceContext as any).entitlementEvaluated, false);
});

test("Action Policy without a declared direct action is explicitly not_applicable", async () => {
  let policyQueries = 0;
  const result = await evaluateRunActionPolicy({
    metadata: { domain: "core" },
    registeredActionNames: ["realestate.apply_adjustment"],
    resolveScopeDecision: async () => {
      policyQueries += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" };
    },
  });

  assert.equal(result.applicability, "not_applicable");
  assert.equal(result.actionPolicyDecision, null);
  assert.equal(result.eventPayload, null);
  assert.equal(policyQueries, 0);
});

test("worker attaches only an explicit server-evaluated Action Policy", () => {
  const result = sanitizeRunGovernanceMetadataForWorker(
    {
      governanceContext: { projectionVersion: RUN_GOVERNANCE_PROJECTION_VERSION },
      actionPolicyDecision: {
        evaluated: true,
        decision: "allowed",
        source: "tenant_action_policy",
        action: "malicious.action",
        reasonCode: null,
      },
    },
    {
      tenantIdPresent: true,
      workspaceIdPresent: true,
      actionPolicyDecision: {
        evaluated: true,
        decision: "allowed",
        source: "tenant_action_policy",
        action: "realestate.apply_adjustment",
        reasonCode: null,
      },
    }
  );

  assert.deepEqual(result.actionPolicyDecision, {
    evaluated: true,
    decision: "allowed",
    source: "tenant_action_policy",
    action: "realestate.apply_adjustment",
    reasonCode: null,
  });
  assert.equal((result.governanceContext as any).policyDecision, "not_evaluated");
});

test("worker derives Action Policy from the canonical registry and fresh policy decision", async () => {
  const evaluatedActions: string[] = [];
  const result = await evaluateRunActionPolicy({
    metadata: {
      action: "REALESTATE.APPLY_ADJUSTMENT",
      actionPolicyDecision: {
        evaluated: true,
        decision: "allowed",
        source: "tenant_action_policy",
        action: "malicious.action",
        reasonCode: null,
      },
    },
    registeredActionNames: ["realestate.apply_adjustment"],
    resolveScopeDecision: async (action) => {
      evaluatedActions.push(action);
      return { allowed: true, reasonCode: "SCOPE_ALLOWED", policyVersion: "v7" };
    },
  });

  assert.deepEqual(evaluatedActions, ["realestate.apply_adjustment"]);
  assert.deepEqual(result?.actionPolicyDecision, {
    evaluated: true,
    decision: "allowed",
    source: "tenant_action_policy",
    action: "realestate.apply_adjustment",
    reasonCode: null,
  });
  assert.deepEqual(result?.eventPayload, {
    specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
    evaluated: true,
    decision: "allowed",
    source: "tenant_action_policy",
    action: "realestate.apply_adjustment",
    policyVersion: "v7",
    reasonCode: null,
    enforcementApplied: false,
  });
});

test("worker does not query policy for an action absent from the canonical registry", async () => {
  let policyQueries = 0;
  const result = await evaluateRunActionPolicy({
    metadata: { action: "malicious.action" },
    registeredActionNames: ["realestate.apply_adjustment"],
    resolveScopeDecision: async () => {
      policyQueries += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" };
    },
  });

  assert.equal(policyQueries, 0);
  assert.equal(result?.actionPolicyDecision, null);
  assert.deepEqual(result?.eventPayload, {
    specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
    evaluated: false,
    decision: "not_evaluated",
    source: "action_registry",
    action: "malicious.action",
    policyVersion: null,
    reasonCode: "INVALID_ACTION_TYPE",
    enforcementApplied: false,
  });
});

test("Core persisted action outside the registry remains observational through processRunPayload", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  const order: string[] = [];
  const events: any[] = [];
  const statuses: any[] = [];
  let cancellationChecks = 0;
  let policyCalls = 0;
  let finalizedCalls = 0;

  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-core-unregistered-action",
      request: {
        metadata: {
          domain: "core",
          kind: "operation",
          action: "malicious.action",
        },
      },
    }) as any,
    isRunUserCancelled: async () => {
      cancellationChecks += 1;
      return cancellationChecks === 2;
    },
    finalizeCancelledRunPartial: async () => {
      order.push("cancelled");
      finalizedCalls += 1;
      return {} as any;
    },
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async () => {
      policyCalls += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" } as any;
    },
    emitRunEvent: async (params) => {
      order.push("event");
      events.push(params);
      return { id: "event-core-unregistered-action", ...params } as any;
    },
    updateRunStatus: async (params) => {
      order.push("running");
      statuses.push(params);
      return params as any;
    },
  };

  await processRunPayload({
    runId: "run-core-unregistered-action",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    agent: "EIAH",
    prompt: "Core action outside the registry remains observational",
    metadata: { domain: "imob", kind: "operation" },
  }, deps);

  assert.equal(policyCalls, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE);
  assert.deepEqual(events[0].payload, {
    specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
    evaluated: false,
    decision: "not_evaluated",
    source: "action_registry",
    action: "malicious.action",
    policyVersion: null,
    reasonCode: "INVALID_ACTION_TYPE",
    enforcementApplied: false,
  });
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, "running");
  assert.equal(finalizedCalls, 1);
  assert.deepEqual(order, ["event", "running", "cancelled"]);
});

test("worker records a fresh denied Action Policy without promoting overall governance", async () => {
  const evaluation = await evaluateRunActionPolicy({
    metadata: { action: "realestate.apply_adjustment" },
    registeredActionNames: ["realestate.apply_adjustment"],
    resolveScopeDecision: async () => ({
      allowed: false,
      reasonCode: "TENANT_POLICY_DISABLED",
      policyVersion: "v2",
    }),
  });
  const metadata = sanitizeRunGovernanceMetadataForWorker({}, {
    tenantIdPresent: true,
    workspaceIdPresent: true,
    actionPolicyDecision: evaluation?.actionPolicyDecision ?? null,
  });

  assert.equal((metadata.actionPolicyDecision as any).decision, "denied");
  assert.equal((metadata.actionPolicyDecision as any).reasonCode, "ACTION_POLICY_DISABLED");
  assert.equal((metadata.governanceContext as any).policyDecision, "not_evaluated");
});

test("processRunPayload replaces a forged Action Policy through the worker path", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");

  const order: string[] = [];
  const policyQueries: Array<{ tenantId: string; workspaceId: string; action: string }> = [];
  const events: any[] = [];
  const statuses: any[] = [];
  const cancelledFinalizations: any[] = [];
  let cancellationChecks = 0;

  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => {
      order.push("scope");
      return {
        id: "run-policy-worker-1",
        request: {
          action: "adjustment.apply",
          metadata: {
            domain: "imob",
            kind: "operation",
            action: "realestate.apply_adjustment",
          },
        },
      } as any;
    },
    isRunUserCancelled: async () => {
      cancellationChecks += 1;
      return cancellationChecks === 2;
    },
    finalizeCancelledRunPartial: async (params) => {
      order.push("cancelled");
      cancelledFinalizations.push(params);
    },
    getAgentProfile: async () => ({ id: "EIAH" } as any),
    getRegisteredActionDefinitions: () =>
      ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async (tenantId, workspaceId, action) => {
      order.push("policy");
      policyQueries.push({ tenantId, workspaceId, action });
      return {
        allowed: false,
        reasonCode: "TENANT_POLICY_DISABLED",
        tenantId,
        workspaceId,
        scope: action,
        policyVersion: "v9",
      };
    },
    emitRunEvent: async (params) => {
      order.push("event");
      events.push(params);
      return { id: "event-policy-1", ...params } as any;
    },
    updateRunStatus: async (params) => {
      order.push("running");
      statuses.push(params);
      return params as any;
    },
  };

  await processRunPayload(
    {
      runId: "run-policy-worker-1",
      tenantId: "tenant-policy-worker-1",
      workspaceId: "workspace-policy-worker-1",
      userId: "user-policy-worker-1",
      agent: "EIAH",
      prompt: "avaliar action policy no worker",
      metadata: {
        domain: "core",
        kind: "conversation_audit",
        actionPolicyDecision: {
          evaluated: true,
          decision: "allowed",
          source: "tenant_action_policy",
          action: "malicious.action",
          reasonCode: null,
        },
      },
    },
    deps,
  );

  assert.deepEqual(policyQueries, [
    {
      tenantId: "tenant-policy-worker-1",
      workspaceId: "workspace-policy-worker-1",
      action: "realestate.apply_adjustment",
    },
  ]);
  assert.deepEqual(order, ["scope", "policy", "event", "running", "cancelled"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE);
  assert.deepEqual(events[0].payload, {
    specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
    evaluated: true,
    decision: "denied",
    source: "tenant_action_policy",
    action: "realestate.apply_adjustment",
    policyVersion: "v9",
    reasonCode: "ACTION_POLICY_DISABLED",
    enforcementApplied: false,
  });
  assert.equal(statuses[0].status, "running");
  assert.equal(cancelledFinalizations.length, 1);
  assert.equal(cancelledFinalizations[0].metadata.actionPolicyDecision.decision, "denied");
  assert.equal(cancelledFinalizations[0].metadata.governanceContext.policyDecision, "not_evaluated");
  assert.equal(JSON.stringify(cancelledFinalizations[0].metadata).includes("malicious.action"), false);
});

test("processRunPayload rejects an unresolved Run scope before policy, events or status", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  const calls = { cancelled: 0, policy: 0, events: 0, statuses: 0 };
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => null,
    isRunUserCancelled: async () => {
      calls.cancelled += 1;
      return false;
    },
    finalizeCancelledRunPartial: async () => undefined as any,
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async () => {
      calls.policy += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" } as any;
    },
    emitRunEvent: async () => {
      calls.events += 1;
      return {} as any;
    },
    updateRunStatus: async () => {
      calls.statuses += 1;
      return {} as any;
    },
  };

  await assert.rejects(
    processRunPayload({
      runId: "run-scope-missing",
      tenantId: "tenant-a",
      workspaceId: "workspace-mismatch",
      agent: "EIAH",
      prompt: "must fail before policy",
      metadata: { action: "realestate.apply_adjustment" },
    }, deps),
    (error: any) => error?.reasonCode === "RUN_SCOPE_NOT_RESOLVED" && error?.stage === "preflight",
  );
  assert.deepEqual(calls, { cancelled: 0, policy: 0, events: 0, statuses: 0 });
});

test("processRunPayload stops before running when Action Policy event persistence fails", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  let statusCalls = 0;
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-event-failure",
      request: { metadata: { domain: "core", action: "realestate.apply_adjustment" } },
    }) as any,
    isRunUserCancelled: async () => false,
    finalizeCancelledRunPartial: async () => undefined as any,
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async (tenantId, workspaceId, action) => ({
      allowed: true,
      reasonCode: "SCOPE_ALLOWED",
      tenantId,
      workspaceId,
      scope: action,
    }),
    emitRunEvent: async () => {
      throw new Error("run event unavailable");
    },
    updateRunStatus: async () => {
      statusCalls += 1;
      return {} as any;
    },
  };

  await assert.rejects(
    processRunPayload({
      runId: "run-event-failure",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "event must precede running",
      metadata: { action: "realestate.apply_adjustment" },
    }, deps),
    /run event unavailable/,
  );
  assert.equal(statusCalls, 0);
});

test("processRunPayload rejects a null running transition result", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  let policyCalls = 0;
  let eventCalls = 0;
  let cancellationChecks = 0;
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-status-null",
      request: { metadata: { domain: "core" } },
    }) as any,
    isRunUserCancelled: async () => {
      cancellationChecks += 1;
      return false;
    },
    finalizeCancelledRunPartial: async () => undefined as any,
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({}),
    resolveScopeDecision: async () => {
      policyCalls += 1;
      return {} as any;
    },
    emitRunEvent: async () => {
      eventCalls += 1;
      return {} as any;
    },
    updateRunStatus: async () => null,
  };

  await assert.rejects(
    processRunPayload({
      runId: "run-status-null",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "generic run",
      metadata: { domain: "core" },
    }, deps),
    (error: any) => error?.reasonCode === "RUN_SCOPE_NOT_RESOLVED"
      && error?.stage === "running_transition",
  );
  assert.equal(policyCalls, 0);
  assert.equal(eventCalls, 0);
  assert.equal(cancellationChecks, 1);
});

test("generic and IMOB conversation_audit runs without action are not applicable", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");

  for (const [index, metadata] of [
    { domain: "core" },
    { domain: "imob", kind: "conversation_audit" },
  ].entries()) {
    let cancellationChecks = 0;
    let policyCalls = 0;
    let eventCalls = 0;
    let runningCalls = 0;
    let finalizedCalls = 0;
    const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
      getRun: async () => ({
        id: `run-not-applicable-${index}`,
        request: { metadata },
      }) as any,
      isRunUserCancelled: async () => {
        cancellationChecks += 1;
        return cancellationChecks === 2;
      },
      finalizeCancelledRunPartial: async () => {
        finalizedCalls += 1;
        return {} as any;
      },
      getAgentProfile: async () => ({ id: "EIAH" }) as any,
      getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
      resolveScopeDecision: async () => {
        policyCalls += 1;
        return {} as any;
      },
      emitRunEvent: async () => {
        eventCalls += 1;
        return {} as any;
      },
      updateRunStatus: async (params) => {
        runningCalls += 1;
        return params as any;
      },
    };

    await processRunPayload({
      runId: `run-not-applicable-${index}`,
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "no direct action",
      metadata,
    }, deps);

    assert.equal(policyCalls, 0);
    assert.equal(eventCalls, 0);
    assert.equal(runningCalls, 1);
    assert.equal(finalizedCalls, 1);
  }
});

test("IMOB operational Run without a persisted action fails before policy, event or running", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  const calls = { cancelled: 0, policy: 0, events: 0, statuses: 0 };
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-imob-missing-action",
      request: { metadata: { domain: "imob", kind: "conversation" } },
    }) as any,
    isRunUserCancelled: async () => {
      calls.cancelled += 1;
      return false;
    },
    finalizeCancelledRunPartial: async () => undefined as any,
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async () => {
      calls.policy += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" } as any;
    },
    emitRunEvent: async () => {
      calls.events += 1;
      return {} as any;
    },
    updateRunStatus: async () => {
      calls.statuses += 1;
      return {} as any;
    },
  };

  await assert.rejects(
    processRunPayload({
      runId: "run-imob-missing-action",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "operational IMOB without action",
      metadata: { domain: "core" },
    }, deps),
    (error: any) => error?.reasonCode === "INVALID_ACTION_TYPE",
  );
  assert.deepEqual(calls, { cancelled: 0, policy: 0, events: 0, statuses: 0 });
});

test("IMOB operational Run with an invalid persisted action fails before every worker side effect", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const [
    { processRunPayload },
    { RunActionValidationError },
    { getRegisteredActionDefinitions },
  ] = await Promise.all([
    import("../workers/runWorker"),
    import("../services/imob/control/imobRunActionCatalog"),
    import("@eiah/core"),
  ]);
  const calls = {
    cancelled: 0,
    finalized: 0,
    profiles: 0,
    registry: 0,
    policy: 0,
    events: 0,
    statuses: 0,
  };
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-imob-invalid-action",
      request: {
        metadata: {
          domain: "imob",
          kind: "operation",
          action: "owner.create",
        },
      },
    }) as any,
    isRunUserCancelled: async () => {
      calls.cancelled += 1;
      return false;
    },
    finalizeCancelledRunPartial: async () => {
      calls.finalized += 1;
      return {} as any;
    },
    getAgentProfile: async () => {
      calls.profiles += 1;
      return { id: "EIAH" } as any;
    },
    getRegisteredActionDefinitions: () => {
      calls.registry += 1;
      return getRegisteredActionDefinitions();
    },
    resolveScopeDecision: async () => {
      calls.policy += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" } as any;
    },
    emitRunEvent: async () => {
      calls.events += 1;
      return {} as any;
    },
    updateRunStatus: async () => {
      calls.statuses += 1;
      return {} as any;
    },
  };

  const registeredActionDefinitions = getRegisteredActionDefinitions();
  assert.ok(registeredActionDefinitions["realestate.register_property"]);
  assert.equal(registeredActionDefinitions["owner.create"], undefined);

  await assert.rejects(
    processRunPayload({
      runId: "run-imob-invalid-action",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "persisted IMOB action is invalid",
      metadata: { domain: "core", kind: "conversation_audit" },
    }, deps),
    (error: unknown) =>
      error instanceof RunActionValidationError
      && error.reasonCode === "INVALID_ACTION_TYPE",
  );
  assert.deepEqual(calls, {
    cancelled: 1,
    finalized: 0,
    profiles: 1,
    registry: 1,
    policy: 0,
    events: 0,
    statuses: 0,
  });
});

test("worker rejects a transported action that diverges from the persisted Run", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { processRunPayload } = await import("../workers/runWorker");
  const calls = { policy: 0, events: 0, statuses: 0 };
  const deps: NonNullable<Parameters<typeof processRunPayload>[1]> = {
    getRun: async () => ({
      id: "run-action-mismatch",
      request: {
        action: "adjustment.apply",
        metadata: {
          domain: "imob",
          kind: "operation",
          action: "realestate.apply_adjustment",
        },
      },
    }) as any,
    isRunUserCancelled: async () => false,
    finalizeCancelledRunPartial: async () => undefined as any,
    getAgentProfile: async () => ({ id: "EIAH" }) as any,
    getRegisteredActionDefinitions: () => ({ "realestate.apply_adjustment": {} }) as any,
    resolveScopeDecision: async () => {
      calls.policy += 1;
      return { allowed: true, reasonCode: "SCOPE_ALLOWED" } as any;
    },
    emitRunEvent: async () => {
      calls.events += 1;
      return {} as any;
    },
    updateRunStatus: async () => {
      calls.statuses += 1;
      return {} as any;
    },
  };

  await assert.rejects(
    processRunPayload({
      runId: "run-action-mismatch",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agent: "EIAH",
      prompt: "mismatched action",
      metadata: { action: "realestate.register_property" },
    }, deps),
    (error: any) => error?.reasonCode === "INVALID_ACTION_TYPE",
  );
  assert.deepEqual(calls, { policy: 0, events: 0, statuses: 0 });
});

test("replay rejects historical operational IMOB without action before every side effect", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { executePersistedRunReplay } = await import("../routes/runs");
  const calls = { requested: 0, publish: 0, pending: 0, enqueued: 0 };

  await assert.rejects(
    executePersistedRunReplay({
      run: {
        id: "run-replay-missing-action",
        request: { prompt: "legacy", metadata: { domain: "imob", kind: "conversation" } },
      },
      requestedAt: new Date("2026-08-25T12:00:00.000Z"),
      emitRequested: async () => { calls.requested += 1; },
      publish: async () => { calls.publish += 1; },
      markPending: async () => { calls.pending += 1; },
      emitEnqueued: async () => { calls.enqueued += 1; },
    }),
    (error: any) => error?.reasonCode === "INVALID_ACTION_TYPE",
  );
  assert.deepEqual(calls, { requested: 0, publish: 0, pending: 0, enqueued: 0 });
});

test("replay allows conversation_audit without action and derives transport from the persisted Run", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { executePersistedRunReplay } = await import("../routes/runs");
  const order: string[] = [];
  const published: Array<{ prompt: string; metadata: Record<string, unknown> }> = [];

  await executePersistedRunReplay({
    run: {
      id: "run-replay-audit",
      request: {
        prompt: "audit persisted conversation",
        metadata: { domain: "imob", kind: "conversation_audit" },
      },
    },
    requestedAt: new Date("2026-08-25T12:00:00.000Z"),
    emitRequested: async () => { order.push("requested"); },
    publish: async (input) => { order.push("publish"); published.push(input); },
    markPending: async () => { order.push("pending"); },
    emitEnqueued: async () => { order.push("enqueued"); },
  });

  assert.deepEqual(order, ["requested", "publish", "pending", "enqueued"]);
  assert.equal(published[0]?.prompt, "audit persisted conversation");
  assert.equal(published[0]?.metadata.domain, "imob");
  assert.equal(published[0]?.metadata.kind, "conversation_audit");
  assert.equal(published[0]?.metadata.action, undefined);
  assert.deepEqual(published[0]?.metadata.replay, {
    sourceRunId: "run-replay-audit",
    requestedAt: "2026-08-25T12:00:00.000Z",
  });
});

test("replay publishes the persisted canonical registry action and strips self-attested governance", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:1/test";
  const { executePersistedRunReplay } = await import("../routes/runs");
  let published: { prompt: string; metadata: Record<string, unknown> } | null = null;

  await executePersistedRunReplay({
    run: {
      id: "run-replay-action",
      request: {
        prompt: "execute persisted action",
        action: "adjustment.apply",
        metadata: {
          domain: "imob",
          kind: "operation",
          action: "realestate.apply_adjustment",
          actionPolicyDecision: {
            evaluated: true,
            decision: "allowed",
            source: "tenant_action_policy",
            action: "malicious.action",
          },
        },
      },
    },
    requestedAt: new Date("2026-08-25T12:00:00.000Z"),
    emitRequested: async () => undefined,
    publish: async (input) => { published = input; },
    markPending: async () => undefined,
    emitEnqueued: async () => undefined,
  });

  assert.equal(published?.metadata.action, "realestate.apply_adjustment");
  assert.equal(published?.metadata.actionPolicyDecision, undefined);
  assert.equal(JSON.stringify(published).includes("malicious.action"), false);
});

test("historic Guardian and Recipe projections are conservative and marked as legacy", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const projected = projectRunGovernanceForRead({
    createdAt,
    response: {
      guardianReport: {
        governance: {
          rbacEvaluated: true,
          entitlementEvaluated: true,
          policyDecision: "allowed",
          reasonCode: null,
        },
      },
      recipeOrchestration: {
        governance: {
          rbacEvaluated: true,
          entitlementEvaluated: true,
          policyDecision: "allowed",
          reasonCode: null,
        },
      },
    },
  }) as any;

  assert.equal(projected.createdAt, createdAt);
  assert.equal(projected.response.guardianReport.legacyGovernanceUnverified, true);
  assert.equal(projected.response.guardianReport.governance.policyDecision, "needs_review");
  assert.equal(projected.response.recipeOrchestration.legacyGovernanceUnverified, true);
  assert.equal(projected.response.recipeOrchestration.governance.policyDecision, "not_evaluated");
  assert.equal(projected.response.guardianReport.governance.rbacEvaluated, false);
  assert.equal(projected.response.recipeOrchestration.governance.entitlementEvaluated, false);
  assert.equal(LEGACY_GOVERNANCE_UNVERIFIED_BANNER, "LEGADO — ESTADO DE GOVERNANÇA NÃO VERIFICADO");
});
