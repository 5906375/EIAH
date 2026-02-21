import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDelegationProvider } from "../providers/delegationProvider";
import { evaluatePolicy } from "../policyEngine";

describe("policy engine (delegation provider)", () => {
  it("denies when policy is expired", async () => {
    const evaluation = await evaluatePolicy({
      context: { tenantId: "t1", trustScore: 80, now: new Date("2025-01-02T00:00:00Z") },
      request: {
        action: "runs.execute",
        scope: "execute",
        policies: {
          delegations: [
            {
              id: "p1",
              delegateeId: "t1",
              delegatorId: "t2",
              scope: "execute",
              trustMin: 10,
              validUntil: "2025-01-01T00:00:00Z",
              status: "active",
            },
          ],
        },
      },
      providers: [createDelegationProvider()],
    });

    assert.equal(evaluation.decision, "deny");
    assert.equal(evaluation.reason, "policy_expired");
  });

  it("denies when trustMin is not met", async () => {
    const evaluation = await evaluatePolicy({
      context: { tenantId: "t1", trustScore: 20, now: new Date("2025-01-02T00:00:00Z") },
      request: {
        action: "runs.execute",
        scope: "execute",
        policies: {
          delegations: [
            {
              id: "p2",
              delegateeId: "t1",
              delegatorId: "t2",
              scope: "execute",
              trustMin: 80,
              validUntil: "2025-02-01T00:00:00Z",
              status: "active",
            },
          ],
        },
      },
      providers: [createDelegationProvider()],
    });

    assert.equal(evaluation.decision, "deny");
    assert.equal(evaluation.reason, "trust_insufficient");
  });
});
