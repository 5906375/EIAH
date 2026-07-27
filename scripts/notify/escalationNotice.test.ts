import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEscalationPlan,
  ESCALATION_REASON_CODE,
  evaluateEmailGate,
} from "./escalationNotice.ts";

const link = "https://github.com/5906375/EIAH/actions/runs/123456";

test("email remains blocked unless every governance condition is present", () => {
  assert.deepEqual(
    evaluateEmailGate({
      googleProvenanceConfirmed: false,
      reasonCodeRatified: true,
      send: true,
    }),
    { eligible: false, blockingCondition: "email-secret-provenance-unconfirmed" },
  );
  assert.deepEqual(
    evaluateEmailGate({
      googleProvenanceConfirmed: true,
      reasonCodeRatified: false,
      send: true,
    }),
    { eligible: false, blockingCondition: "reason-code-missing-escalation" },
  );
  assert.deepEqual(
    evaluateEmailGate({
      googleProvenanceConfirmed: true,
      reasonCodeRatified: true,
      send: false,
    }),
    { eligible: false, blockingCondition: "email-send-not-explicitly-enabled" },
  );
  assert.deepEqual(
    evaluateEmailGate({
      googleProvenanceConfirmed: true,
      reasonCodeRatified: true,
      send: true,
    }),
    { eligible: true, blockingCondition: null },
  );
});

test("GitHub issue surfaces even when escalation reason code is pending", () => {
  const plan = buildEscalationPlan({
    reportDate: "2026-07-27",
    authenticatedLink: link,
    manifest: null,
    reasonCodeRatified: false,
    googleProvenanceConfirmed: false,
    sendEmail: false,
    now: new Date("2026-07-27T13:30:00.000Z"),
  });

  assert.equal(plan.github.surfaceIssue, true);
  assert.equal(plan.reasonCode, null);
  assert.equal(plan.blockingCondition, "escalation-reason-code-pending");
  assert.equal(plan.email.transmit, false);
  assert.match(plan.notice ?? "", /NÃO será entregue/);
  assert.match(plan.notice ?? "", /código canônico de escalonamento pendente/);
});

test("email never claims transmission while no provider adapter exists", () => {
  const plan = buildEscalationPlan({
    reportDate: "2026-07-27",
    authenticatedLink: link,
    manifest: null,
    reasonCodeRatified: true,
    googleProvenanceConfirmed: true,
    sendEmail: true,
  });

  assert.equal(plan.reasonCode, ESCALATION_REASON_CODE);
  assert.equal(plan.email.eligible, true);
  assert.equal(plan.email.transmit, false);
  assert.equal(plan.email.blockingCondition, "email-provider-unavailable");
});

test("successful current-date manifest suppresses the non-delivery notice", () => {
  const plan = buildEscalationPlan({
    reportDate: "2026-07-27",
    authenticatedLink: link,
    manifest: {
      generatedAt: "2026-07-27T09:10:00.000Z",
      scenarioResults: [{ status: "passed" }, { status: "passed" }],
    },
    reasonCodeRatified: false,
    googleProvenanceConfirmed: false,
    sendEmail: false,
  });

  assert.equal(plan.status, "delivery-confirmed");
  assert.equal(plan.github.surfaceIssue, false);
  assert.equal(plan.notice, null);
});
