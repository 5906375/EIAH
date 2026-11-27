import assert from "node:assert/strict";
import test from "node:test";

import {
  humanAuthorityDecisionV1Schema,
  preDuimpGateDecisionV1Schema,
  preDuimpSourceReadRequestV1Schema,
  provenanceV1Schema,
  validatePreDuimpCaseV1,
  validatePreDuimpGateDecisionV1,
  type PreDuimpCaseV1,
} from "../src/index.js";

const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);
const NOW = "2026-09-09T12:00:00.000Z";

function blockFixture(): PreDuimpCaseV1 {
  return {
    schemaVersion: "governed-case.v1",
    caseId: "case-pre-duimp-1",
    caseType: "log.pre_duimp",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    revision: 1,
    lifecycle: "BLOCKED",
    subject: {
      referenceType: "INTERNAL_CASE_REFERENCE",
      referenceId: "internal-case-1",
    },
    facts: [],
    inconsistencies: [],
    regulatoryEvaluations: [],
    corporatePolicyEvaluations: [],
    riskAssessment: {
      schemaVersion: "risk-assessment.v1",
      assessmentId: "risk-1",
      methodVersion: "risk.v1",
      inputHash: HASH_A,
      level: "UNKNOWN",
      factors: [],
      evaluatedAt: NOW,
    },
    humanAuthorityDecisions: [],
    domainState: {
      operationMode: "READ_ONLY_DISCOVERY",
      preparationStage: "SOURCE_COLLECTION",
      sourceSnapshotIds: [],
      externalTransmissionAllowed: false,
    },
    gateDecision: {
      schemaVersion: "log.pre_duimp.gate-decision.v1",
      gateDecisionId: "gate-1",
      caseId: "case-pre-duimp-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      outcome: "BLOCK",
      reasonCodes: ["PRE_DUIMP_SOURCE_UNAVAILABLE"],
      inputHash: HASH_A,
      evaluatorVersion: "pre-duimp-gate.v1",
      inconsistencyIds: [],
      regulatoryEvaluationIds: [],
      corporatePolicyEvaluationIds: [],
      riskAssessmentId: "risk-1",
      humanAuthorityDecisionIds: [],
      readinessOnly: true,
      authorizationState: "NOT_REQUESTED",
      externalTransmissionAllowed: false,
      evaluatedAt: NOW,
    },
    runRefs: [],
    receiptRefs: [],
    evidenceRefs: [],
    eventRefs: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function readyFixture(): PreDuimpCaseV1 {
  const fixture = blockFixture();
  fixture.lifecycle = "READY";
  fixture.facts = [
    {
      schemaVersion: "fact.v1",
      factId: "fact-1",
      namespace: "log.pre_duimp",
      key: "log.pre_duimp.operation.reference",
      observedAt: NOW,
      sensitivity: "INTERNAL",
      status: "OBSERVED",
      value: "internal-reference-1",
      provenance: {
        schemaVersion: "provenance.v1",
        sourceSnapshots: [
          {
            schemaVersion: "source-snapshot-ref.v1",
            snapshotId: "snapshot-1",
            sourceId: "internal-case-input",
            sourceRole: "CASE_INPUT",
            authorityClass: "PRIMARY",
            capturedAt: NOW,
            sourceVersion: "v1",
            contentHash: HASH_B,
          },
        ],
        derivation: {
          method: "DIRECT",
          methodVersion: "direct.v1",
          inputFactIds: [],
          authorityDecisionIds: [],
        },
      },
    },
  ];
  fixture.regulatoryEvaluations = [
    {
      schemaVersion: "regulatory-rule-evaluation.v1",
      evaluationId: "regulatory-1",
      ruleId: "pre-duimp-required-reference",
      ruleVersion: "v1",
      jurisdiction: "BR",
      legalSourceRefs: [
        {
          schemaVersion: "source-snapshot-ref.v1",
          snapshotId: "snapshot-1",
          sourceId: "internal-case-input",
          sourceRole: "CASE_INPUT",
          authorityClass: "PRIMARY",
          capturedAt: NOW,
          sourceVersion: "v1",
          contentHash: HASH_B,
        },
      ],
      inputFactIds: ["fact-1"],
      outcome: "COMPLIANT",
      reasonCodes: [],
      evaluatedAt: NOW,
    },
  ];
  fixture.corporatePolicyEvaluations = [
    {
      schemaVersion: "corporate-policy-evaluation.v1",
      evaluationId: "policy-1",
      policyId: "pre-duimp-readiness",
      policyVersion: "v1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      inputFactIds: ["fact-1"],
      outcome: "ALLOW",
      reasonCodes: [],
      evaluatedAt: NOW,
    },
  ];
  fixture.riskAssessment = {
    schemaVersion: "risk-assessment.v1",
    assessmentId: "risk-1",
    methodVersion: "risk.v1",
    inputHash: HASH_A,
    level: "LOW",
    score: 5,
    factors: [
      {
        factorId: "factor-1",
        level: "LOW",
        reasonCode: "PRE_DUIMP_LOW_RISK",
        factIds: ["fact-1"],
        evaluationIds: ["regulatory-1", "policy-1"],
      },
    ],
    evaluatedAt: NOW,
  };
  fixture.domainState = {
    operationMode: "READ_ONLY_DISCOVERY",
    preparationStage: "READINESS_DECIDED",
    sourceSnapshotIds: ["snapshot-1"],
    externalTransmissionAllowed: false,
  };
  fixture.gateDecision = {
    ...fixture.gateDecision,
    outcome: "READY",
    reasonCodes: [],
    regulatoryEvaluationIds: ["regulatory-1"],
    corporatePolicyEvaluationIds: ["policy-1"],
  };
  return fixture;
}

function invalidCase(
  source: PreDuimpCaseV1,
  mutate: (fixture: Record<string, any>) => void,
) {
  const fixture = structuredClone(source) as Record<string, any>;
  mutate(fixture);
  return fixture;
}

test("accepts the fail-closed discovery baseline without DB or runtime", () => {
  assert.equal(validatePreDuimpCaseV1(blockFixture()).success, true);
});

test("accepts a coherent READY case while keeping authorization unrequested", () => {
  const result = validatePreDuimpCaseV1(readyFixture());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.gateDecision.readinessOnly, true);
    assert.equal(result.data.gateDecision.authorizationState, "NOT_REQUESTED");
    assert.equal(
      result.data.gateDecision.externalTransmissionAllowed,
      false,
    );
  }
});

test("rejects unknown fields at the case boundary", () => {
  const fixture = invalidCase(blockFixture(), (candidate) => {
    candidate.submit = true;
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects a fact outside the canonical PRE-DUIMP namespace", () => {
  const fixture = invalidCase(readyFixture(), (candidate) => {
    candidate.facts[0].key = "log.duimp.operation.reference";
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects malformed snapshot content hashes", () => {
  const fixture = invalidCase(readyFixture(), (candidate) => {
    candidate.facts[0].provenance.sourceSnapshots[0].contentHash = "abc";
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects duplicate fact identifiers inside the same case", () => {
  const fixture = invalidCase(readyFixture(), (candidate) => {
    candidate.facts.push(structuredClone(candidate.facts[0]));
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects HUMAN_ATTESTED provenance without a human authority reference", () => {
  const result = provenanceV1Schema.safeParse({
    schemaVersion: "provenance.v1",
    sourceSnapshots: [],
    derivation: {
      method: "HUMAN_ATTESTED",
      methodVersion: "attestation.v1",
      inputFactIds: [],
      authorityDecisionIds: [],
    },
  });
  assert.equal(result.success, false);
});

test("rejects DIRECT provenance without a source snapshot", () => {
  const result = provenanceV1Schema.safeParse({
    schemaVersion: "provenance.v1",
    sourceSnapshots: [],
    derivation: {
      method: "DIRECT",
      methodVersion: "direct.v1",
      inputFactIds: [],
      authorityDecisionIds: [],
    },
  });
  assert.equal(result.success, false);
});

test("rejects a gate whose tenant scope diverges from the case", () => {
  const fixture = invalidCase(blockFixture(), (candidate) => {
    candidate.gateDecision.tenantId = "tenant-other";
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects a gate that omits a current evaluation", () => {
  const fixture = invalidCase(readyFixture(), (candidate) => {
    candidate.gateDecision.regulatoryEvaluationIds = [];
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects drift between domain snapshots and fact/legal provenance", () => {
  const fixture = invalidCase(readyFixture(), (candidate) => {
    candidate.domainState.sourceSnapshotIds = [];
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects READY with reason codes and REVIEW without reason codes", () => {
  const ready = structuredClone(readyFixture().gateDecision);
  ready.reasonCodes = ["PRE_DUIMP_UNEXPECTED_REASON"];
  assert.equal(validatePreDuimpGateDecisionV1(ready).success, false);

  const review = structuredClone(blockFixture().gateDecision);
  review.outcome = "REVIEW";
  review.reasonCodes = [];
  assert.equal(preDuimpGateDecisionV1Schema.safeParse(review).success, false);
});

test("rejects any attempt to enable external transmission", () => {
  const fixture = invalidCase(blockFixture(), (candidate) => {
    candidate.domainState.externalTransmissionAllowed = true;
    candidate.gateDecision.externalTransmissionAllowed = true;
  });
  assert.equal(validatePreDuimpCaseV1(fixture).success, false);
});

test("rejects a human decision whose validity does not follow its decision time", () => {
  const result = humanAuthorityDecisionV1Schema.safeParse({
    schemaVersion: "human-authority-decision.v1",
    authorityDecisionId: "authority-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    subject: {
      caseId: "case-pre-duimp-1",
      action: "log.pre_duimp.review",
      resourceType: "log.pre_duimp",
      resourceId: "case-pre-duimp-1",
      inputHash: HASH_A,
    },
    decision: "APPROVED",
    decidedByUserId: "user-1",
    decidedAt: NOW,
    validUntil: "2026-09-09T11:59:59.000Z",
    policyVersion: "policy.v1",
    reasonCodes: [],
    evidenceRefs: [],
  });
  assert.equal(result.success, false);
});

test("source read request is strict and cannot carry mutations or credentials", () => {
  const result = preDuimpSourceReadRequestV1Schema.safeParse({
    schemaVersion: "log.pre_duimp.source-read-request.v1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-pre-duimp-1",
    sourceRole: "CASE_INPUT",
    requestedKeys: ["log.pre_duimp.operation.reference"],
    asOf: NOW,
    submit: true,
    credential: "must-not-cross-the-port",
  });
  assert.equal(result.success, false);
});
