import assert from "node:assert/strict";
import test from "node:test";
import { LOGISTICA_CONTEXT_SCOPE } from "@eiah/contracts";
import { evaluateLogisticaContextAccess, type LogisticaContextFacts } from "../services/logistica/control/logisticaContextAccess";
import { getProductProvisionedAgents } from "@eiah/core/catalog/workspaceAgentProvisioning";
import { getProductDefaultActionPolicies } from "@eiah/core/catalog/workspaceActionPolicyProvisioning";

const identity = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };
const facts = (): LogisticaContextFacts => ({
  identity,
  activeMember: true,
  installation: { ...identity, product: "LOGISTICA", status: "active" },
  approval: { ...identity, vertical: "LOGISTICA", status: "aprovado", revocationMode: null },
  policy: { ...identity, scope: LOGISTICA_CONTEXT_SCOPE, allowed: true, reasonCode: "SCOPE_ALLOWED" },
});

test("LOGISTICA uses the existing EIAH agent and never provisions action or context grants", () => {
  assert.deepEqual(getProductProvisionedAgents("LOGISTICA").map((a) => a.agentKey), ["EIAH"]);
  assert.deepEqual(getProductDefaultActionPolicies("LOGISTICA"), []);
});

test("approved installation, membership and exact policy permit context only", () => {
  assert.deepEqual(evaluateLogisticaContextAccess(facts()), {
    allowed: true, mode: "context_only", usage: "full", reason: "available",
    executionAllowed: false, externalTransmissionAllowed: false,
  });
});

test("installation alone, null/pending/refused approval and missing policy never permit context", () => {
  for (const status of [null, "pendente", "em_analise", "aguardando_humano", "recusado"]) {
    const f = facts(); f.approval = status === null ? null : { ...f.approval!, status };
    assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
  }
  const f = facts(); f.policy = { ...f.policy, allowed: false, reasonCode: "SCOPE_NOT_ALLOWED" };
  assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
});

test("revocation modes preserve read-only/continued context but full block and unknown modes deny", () => {
  for (const [mode, allowed, usage] of [[null, true, "read_only"], ["somente_leitura", true, "read_only"],
    ["sem_nova_ativacao", true, "full"], ["bloqueio_total", false, "blocked"], ["unknown", false, "blocked"]] as const) {
    const f = facts(); f.approval = { ...f.approval!, status: "revogado", revocationMode: mode };
    const result = evaluateLogisticaContextAccess(f);
    assert.equal(result.allowed, allowed); assert.equal(result.usage, usage);
    assert.equal(result.executionAllowed, false);
  }
});

test("workspace/tenant mismatch in any fact is denied; tenant-wide policy cannot substitute exact scope", () => {
  for (const key of ["installation", "approval", "policy"] as const) {
    for (const mismatch of [{ tenantId: "other" }, { workspaceId: "other" }, { workspaceId: null }]) {
      const f = facts(); (f as any)[key] = { ...f[key], ...mismatch };
      assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
    }
  }
  const f = facts(); f.policy.scope = "log.duimp_context.create";
  assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
});

test("inactive installation, non-literal active status, inactive membership and service token deny", () => {
  for (const status of ["inactive", "suspended", "ACTIVE", " active "]) {
    const f = facts(); f.installation!.status = status;
    assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
  }
  const f = facts(); f.activeMember = false;
  assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
  f.activeMember = true; f.identity = { ...identity, userId: null };
  assert.equal(evaluateLogisticaContextAccess(f).allowed, false);
});
