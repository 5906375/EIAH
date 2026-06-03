import assert from "node:assert/strict";
import test from "node:test";
import { buildGuardianPlan } from "../workers/guardianPlanManager";

test("guardian plan manager creates real verification steps for go-live controlled route", () => {
  const plan = buildGuardianPlan({
    objective: "Validar go-live controlado",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-A",
    metadata: {
      form: {
        requestType: "go_live_controlado.domain_dns_api_evidencias",
        objective: "Validar cada etapa do go-live",
      },
    },
  });

  assert.ok(plan);
  assert.deepEqual(
    plan?.map((step) => step.action ?? null),
    [
      "guardian.checkRuntimeHealth",
      "guardian.checkGoLiveArtifacts",
      "guardian.checkRollbackReadiness",
      "guardian.checkGoLivePolicy",
      null,
    ]
  );
});

test("guardian plan manager falls back when the route is not recognized", () => {
  const plan = buildGuardianPlan({
    objective: "Outro tipo de revisão",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-B",
    metadata: {
      form: {
        requestType: "guardian.evidence_audit",
      },
    },
  });

  assert.equal(plan, null);
});
