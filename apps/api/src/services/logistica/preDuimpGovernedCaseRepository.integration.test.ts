import assert from "node:assert/strict";
import process from "node:process";
import { after, test } from "node:test";

import type { PreDuimpCaseV1 } from "@eiah/contracts";

import {
  PRE_DUIMP_CASE_REVISION_CONFLICT,
  createPreDuimpGovernedCaseRepositoryForTests,
} from "./preDuimpGovernedCaseRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const HASH = "sha256:" + "a".repeat(64);
const NOW = "2026-09-10T12:00:00.000Z";
const ROLLBACK_SENTINEL = new Error("PRE_DUIMP_TEST_ROLLBACK");
let dbModulePromise: Promise<typeof import("@repo/db")> | undefined;

function loadDb() {
  dbModulePromise ??= import("@repo/db");
  return dbModulePromise;
}

function stamp(label: string) {
  return (
    label +
    "-" +
    Date.now() +
    "-" +
    process.pid +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

function scope(suffix: string) {
  return {
    tenantId: "pre-duimp-repository-tenant-" + suffix,
    workspaceId: "pre-duimp-repository-workspace-" + suffix,
  };
}

async function createScope(client: any, ids: ReturnType<typeof scope>) {
  await client.tenant.create({
    data: { id: ids.tenantId, name: "PRE-DUIMP repository tenant" },
  });
  await client.workspace.create({
    data: {
      id: ids.workspaceId,
      tenantId: ids.tenantId,
      name: "PRE-DUIMP repository workspace",
    },
  });
}

function snapshot(input: {
  lifecycle?: PreDuimpCaseV1["lifecycle"];
  caseId?: string;
  tenantId?: string;
  workspaceId?: string;
  revision?: number;
} = {}): PreDuimpCaseV1 {
  const lifecycle = input.lifecycle ?? "DISCOVERY";
  const outcome =
    lifecycle === "READY"
      ? "READY"
      : lifecycle === "AWAITING_REVIEW"
        ? "REVIEW"
        : "BLOCK";
  return {
    schemaVersion: "governed-case.v1",
    caseId: input.caseId ?? "transported-case-id",
    caseType: "log.pre_duimp",
    tenantId: input.tenantId ?? "transported-tenant",
    workspaceId: input.workspaceId ?? "transported-workspace",
    revision: input.revision ?? 99,
    lifecycle,
    subject: {
      referenceType: "INTERNAL_CASE_REFERENCE",
      referenceId: "synthetic-reference",
    },
    facts: [],
    inconsistencies: [],
    regulatoryEvaluations: [],
    corporatePolicyEvaluations: [],
    riskAssessment: {
      schemaVersion: "risk-assessment.v1",
      assessmentId: "risk-1",
      methodVersion: "risk.v1",
      inputHash: HASH,
      level: "UNKNOWN",
      factors: [],
      evaluatedAt: NOW,
    },
    humanAuthorityDecisions: [],
    domainState: {
      operationMode: "READ_ONLY_DISCOVERY",
      preparationStage:
        lifecycle === "READY" ? "READINESS_DECIDED" : "SOURCE_COLLECTION",
      sourceSnapshotIds: [],
      externalTransmissionAllowed: false,
    },
    gateDecision: {
      schemaVersion: "log.pre_duimp.gate-decision.v1",
      gateDecisionId: "gate-1",
      caseId: input.caseId ?? "transported-case-id",
      tenantId: input.tenantId ?? "transported-tenant",
      workspaceId: input.workspaceId ?? "transported-workspace",
      outcome,
      reasonCodes:
        outcome === "READY" ? [] : ["PRE_DUIMP_SOURCE_UNAVAILABLE"],
      inputHash: HASH,
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

if (!databaseUrl) {
  test(
    "PRE-DUIMP governed repository requires the dedicated local PostgreSQL URL",
    { skip: "DATABASE_URL is required for the real DB tests" },
    () => {},
  );
} else {
  after(async () => {
    if (dbModulePromise) {
      const { closePrismaResources } = await dbModulePromise;
      await closePrismaResources();
    }
  });

  test("repository creates, transitions and isolates snapshots without implicit artifacts", async () => {
    const { prismaGlobal } = await loadDb();
    const suffix = stamp("lifecycle");
    const ownScope = scope(suffix);
    const otherScope = scope(suffix + "-other");
    let caseId = "";
    let networkAttempts = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      networkAttempts += 1;
      throw new Error("network is forbidden in PRE-DUIMP repository tests");
    }) as typeof fetch;

    try {
      await assert.rejects(
        prismaGlobal.$transaction(async (transaction) => {
          await createScope(transaction, ownScope);
          await createScope(transaction, otherScope);

          let idSequence = 0;
          const repository = createPreDuimpGovernedCaseRepositoryForTests(
            ownScope,
            {
              client: transaction,
              runInTransaction: async (operation) => operation(transaction),
              now: () => new Date(NOW),
              createId: (kind) =>
                "pre-duimp-" + kind + "-" + suffix + "-" + ++idSequence,
            },
          );
          const otherRepository =
            createPreDuimpGovernedCaseRepositoryForTests(otherScope, {
              client: transaction,
              runInTransaction: async (operation) => operation(transaction),
              now: () => new Date(NOW),
              createId: (kind) =>
                "pre-duimp-" + kind + "-other-" + suffix,
            });

          const beforeArtifacts = {
            runs: await transaction.run.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
            runEvents: await transaction.runEvent.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
            approvals: await transaction.approvalRecord.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
          };

          const created = await repository.create({
            snapshot: snapshot(),
            actorType: "system",
          });
          assert.equal(created.status, "created");
          if (created.status !== "created") return;
          caseId = created.case.caseId;
          assert.equal(created.case.tenantId, ownScope.tenantId);
          assert.equal(created.case.workspaceId, ownScope.workspaceId);
          assert.equal(created.case.revision, 1);
          assert.equal(created.case.lifecycle, "DISCOVERY");
          assert.equal(created.case.gateDecision.authorizationState, "NOT_REQUESTED");
          assert.equal(created.case.gateDecision.externalTransmissionAllowed, false);
          assert.equal(await otherRepository.get(caseId), null);
          assert.deepEqual(await otherRepository.list(), []);

          const assessing = await repository.transition({
            caseId,
            expectedRevision: 1,
            toLifecycle: "ASSESSING",
            snapshot: snapshot({ lifecycle: "ASSESSING" }),
            actorType: "system",
            transitionCode: "case.assessment_started",
          });
          assert.equal(assessing.status, "updated");
          if (assessing.status !== "updated") return;
          assert.equal(assessing.case.revision, 2);

          const stale = await repository.transition({
            caseId,
            expectedRevision: 1,
            toLifecycle: "BLOCKED",
            snapshot: snapshot({ lifecycle: "BLOCKED" }),
            actorType: "system",
            transitionCode: "case.blocked",
          });
          assert.deepEqual(stale, {
            status: "revision_conflict",
            reasonCode: PRE_DUIMP_CASE_REVISION_CONFLICT,
            currentRevision: 2,
          });

          const invalidSelfTransition = await repository.transition({
            caseId,
            expectedRevision: 2,
            toLifecycle: "ASSESSING",
            snapshot: snapshot({ lifecycle: "ASSESSING" }),
            actorType: "system",
            transitionCode: "case.assessment_started",
          });
          assert.equal(invalidSelfTransition.status, "transition_denied");

          const ready = await repository.transition({
            caseId,
            expectedRevision: 2,
            toLifecycle: "READY",
            snapshot: snapshot({ lifecycle: "READY" }),
            actorType: "system",
            transitionCode: "case.readiness_decided",
          });
          assert.equal(ready.status, "updated");
          if (ready.status !== "updated") return;
          assert.equal(ready.case.revision, 3);
          assert.equal(ready.case.gateDecision.readinessOnly, true);
          assert.equal(ready.case.gateDecision.authorizationState, "NOT_REQUESTED");

          const revisions = await repository.listRevisions(caseId);
          assert.deepEqual(
            revisions.map((revision) => revision.revision),
            [1, 2, 3],
          );
          const projections = await repository.list({ lifecycle: "READY" });
          assert.equal(projections.length, 1);
          assert.equal(projections[0]?.caseId, caseId);

          const projectionRow = await transaction.governedCase.findFirst({
            where: {
              id: caseId,
              tenantId: ownScope.tenantId,
              workspaceId: ownScope.workspaceId,
            },
          });
          const revisionRows = await transaction.governedCaseRevision.findMany({
            where: {
              caseId,
              tenantId: ownScope.tenantId,
              workspaceId: ownScope.workspaceId,
            },
            orderBy: { revision: "asc" },
          });
          assert.equal(projectionRow?.snapshotHash, revisionRows[2]?.snapshotHash);
          assert.equal(revisionRows.length, 3);

          const afterArtifacts = {
            runs: await transaction.run.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
            runEvents: await transaction.runEvent.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
            approvals: await transaction.approvalRecord.count({
              where: {
                tenantId: ownScope.tenantId,
                workspaceId: ownScope.workspaceId,
              },
            }),
          };
          assert.deepEqual(afterArtifacts, beforeArtifacts);
          throw ROLLBACK_SENTINEL;
        }),
        (error) => error === ROLLBACK_SENTINEL,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(networkAttempts, 0);
    assert.equal(
      await prismaGlobal.governedCase.count({
        where: { tenantId: ownScope.tenantId },
      }),
      0,
    );
    assert.equal(
      await prismaGlobal.governedCaseRevision.count({
        where: { tenantId: ownScope.tenantId },
      }),
      0,
    );
    assert.equal(
      await prismaGlobal.tenant.count({ where: { id: ownScope.tenantId } }),
      0,
    );
  });

  test("revision insertion failure rolls back the projection atomically", async () => {
    const { getPrismaForTenant, prismaGlobal } = await loadDb();
    const suffix = stamp("atomic");
    const ownScope = scope(suffix);
    await createScope(prismaGlobal, ownScope);
    const tenantClient = getPrismaForTenant(
      ownScope.tenantId,
      ownScope.workspaceId,
    );

    try {
      const repository = createPreDuimpGovernedCaseRepositoryForTests(
        ownScope,
        {
          client: tenantClient,
          runInTransaction: async (operation) =>
            tenantClient.$transaction(async (transaction) => {
              const failingRevisionDelegate = new Proxy(
                transaction.governedCaseRevision,
                {
                  get(target, property, receiver) {
                    if (property === "create") {
                      return async () => {
                        throw new Error("synthetic revision insertion failure");
                      };
                    }
                    return Reflect.get(target, property, receiver);
                  },
                },
              );
              return operation({
                governedCase: transaction.governedCase,
                governedCaseRevision: failingRevisionDelegate,
              });
            }),
          now: () => new Date(NOW),
          createId: (kind) => "pre-duimp-" + kind + "-" + suffix,
        },
      );

      await assert.rejects(
        repository.create({
          snapshot: snapshot(),
          actorType: "system",
        }),
        /synthetic revision insertion failure/,
      );
      assert.equal(await tenantClient.governedCase.count(), 0);
      assert.equal(await tenantClient.governedCaseRevision.count(), 0);
    } finally {
      await prismaGlobal.workspace.deleteMany({
        where: { id: ownScope.workspaceId },
      });
      await prismaGlobal.tenant.deleteMany({ where: { id: ownScope.tenantId } });
    }
  });

  test("invalid governed snapshot is rejected before persistence", async () => {
    const { prismaGlobal } = await loadDb();
    const suffix = stamp("invalid");
    const ownScope = scope(suffix);

    await assert.rejects(
      prismaGlobal.$transaction(async (transaction) => {
        await createScope(transaction, ownScope);
        const repository = createPreDuimpGovernedCaseRepositoryForTests(
          ownScope,
          {
            client: transaction,
            runInTransaction: async (operation) => operation(transaction),
            now: () => new Date(NOW),
            createId: (kind) => "pre-duimp-" + kind + "-" + suffix,
          },
        );
        const result = await repository.create({
          snapshot: { ...snapshot(), submit: true },
          actorType: "system",
        });
        assert.equal(result.status, "invalid_snapshot");
        assert.equal(await transaction.governedCase.count(), 0);
        assert.equal(await transaction.governedCaseRevision.count(), 0);
        throw ROLLBACK_SENTINEL;
      }),
      (error) => error === ROLLBACK_SENTINEL,
    );
  });
}
