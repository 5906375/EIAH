import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGENT_ASSIGNMENT_REQUIRED,
  WorkspaceAgentAssignmentError,
  assertWorkspaceAgentEnabled,
  getActiveWorkspaceAgentAssignment,
} from "../services/workspaceAgentAssignments";

type AssignmentFixture = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion: string;
  enabled: boolean;
  signedByUserId: string | null;
  signedAt: Date | null;
  signatureRef: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const scope = {
  tenantId: "tenant-a",
  workspaceId: "workspace-a",
  agentKey: "EIAH",
  agentVersion: "1.0.0",
};

function assignment(overrides: Partial<AssignmentFixture> = {}): AssignmentFixture {
  return {
    id: "assignment-a",
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentKey: scope.agentKey,
    agentVersion: scope.agentVersion,
    enabled: true,
    signedByUserId: null,
    signedAt: null,
    signatureRef: null,
    createdAt: new Date("2026-08-12T11:00:00.000Z"),
    updatedAt: new Date("2026-08-12T12:00:00.000Z"),
    ...overrides,
  };
}

function compareDescending(left: unknown, right: unknown) {
  const leftValue = left instanceof Date ? left.getTime() : String(left);
  const rightValue = right instanceof Date ? right.getTime() : String(right);
  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? -1 : 1;
}

function createPrisma(
  assignments: AssignmentFixture[],
  options: { auditFails?: boolean } = {},
) {
  const audits: Array<Record<string, unknown>> = [];
  const mutationCalls = { create: 0, update: 0, upsert: 0 };
  const findManyCalls: Array<Record<string, any>> = [];
  const prisma = {
    agentMetadata: {
      findUnique: async ({ where }: { where: { agent: string } }) =>
        where.agent === scope.agentKey
          ? { agent: scope.agentKey, version: scope.agentVersion }
          : null,
      findMany: async () => [{ agent: scope.agentKey }],
    },
    agentProfile: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    workspaceAgentAssignment: {
      findMany: async (args: Record<string, any>) => {
        findManyCalls.push(args);
        const where = args.where ?? {};
        const orderBy = Array.isArray(args.orderBy) ? args.orderBy : [];
        return assignments
          .filter(item =>
            (where.tenantId === undefined || item.tenantId === where.tenantId)
            && (where.workspaceId === undefined || item.workspaceId === where.workspaceId)
          )
          .toSorted((left, right) => {
            for (const entry of orderBy) {
              const [field, direction] = Object.entries(entry)[0] ?? [];
              if (!field || direction !== "desc") continue;
              const result = compareDescending(
                left[field as keyof AssignmentFixture],
                right[field as keyof AssignmentFixture],
              );
              if (result !== 0) return result;
            }
            return 0;
          });
      },
      create: async () => {
        mutationCalls.create += 1;
        throw new Error("workspaceAgentAssignment.create must not be reachable");
      },
      update: async () => {
        mutationCalls.update += 1;
        throw new Error("workspaceAgentAssignment.update must not be reachable");
      },
      upsert: async () => {
        mutationCalls.upsert += 1;
        throw new Error("workspaceAgentAssignment.upsert must not be reachable");
      },
    },
    guardrailAuditLedger: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFails) throw new Error("audit unavailable");
        audits.push(data);
        return data;
      },
    },
  };
  return { prisma: prisma as any, audits, mutationCalls, findManyCalls };
}

async function expectAssignmentRequired(
  fixture: ReturnType<typeof createPrisma>,
  expectedFailure: string,
  overrides: Partial<typeof scope> = {},
) {
  await assert.rejects(
    () => assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, ...overrides }),
    (error: unknown) => {
      if (!(error instanceof WorkspaceAgentAssignmentError)) return false;
      assert.equal(error.reasonCode, AGENT_ASSIGNMENT_REQUIRED);
      assert.deepEqual(error.context, {});
      assert.equal(error.message, "Agent execution requires an exact enabled workspace assignment.");
      assert.doesNotMatch(JSON.stringify(error.context), /tenant|workspace|version|assignment|failure/i);
      return true;
    },
  );

  if (fixture.audits.length > 0) {
    assert.equal(fixture.audits.length, 1);
    assert.equal(fixture.audits[0]?.eventType, "agent.assignment.required");
    const metadata = fixture.audits[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.reasonCode, AGENT_ASSIGNMENT_REQUIRED);
    assert.equal(metadata.failure, expectedFailure);
  }
  assert.deepEqual(fixture.mutationCalls, { create: 0, update: 0, upsert: 0 });
}

test("1. missing assignment blocks, records refusal and creates nothing", async () => {
  await expectAssignmentRequired(createPrisma([]), "missing");
});

test("2. disabled assignment blocks without reprovisioning", async () => {
  await expectAssignmentRequired(createPrisma([assignment({ enabled: false })]), "disabled");
});

test(
  "3. expired assignment blocks",
  { skip: "PENDING_PR1B: WorkspaceAgentAssignment has no expiration field" },
  () => undefined,
);

test("4. assignment from another tenant is invisible and blocks", async () => {
  await expectAssignmentRequired(
    createPrisma([assignment({ tenantId: "tenant-b" })]),
    "missing",
  );
});

test("5. assignment from another workspace is invisible and blocks", async () => {
  await expectAssignmentRequired(
    createPrisma([assignment({ workspaceId: "workspace-b" })]),
    "missing",
  );
});

test("6. different agent in the requested scope blocks", async () => {
  await expectAssignmentRequired(
    createPrisma([assignment({ agentKey: "Guardian" })]),
    "agent_mismatch",
  );
});

test("7. requested agent version mismatch blocks", async () => {
  await expectAssignmentRequired(
    createPrisma([assignment({ agentVersion: "1.0.0" })]),
    "version_mismatch",
    { agentVersion: "2.0.0" },
  );
});

test("8. realizable normalized collision blocks as ambiguous without recency selection", async () => {
  const fixture = createPrisma([
    assignment({
      id: "assignment-new-disabled",
      agentKey: "eiah",
      enabled: false,
      updatedAt: new Date("2026-08-12T13:00:00.000Z"),
    }),
    assignment({
      id: "assignment-old-enabled",
      agentKey: "EIAH",
      enabled: true,
      updatedAt: new Date("2026-08-12T12:00:00.000Z"),
    }),
  ]);
  await expectAssignmentRequired(fixture, "ambiguous");
  assert.deepEqual(fixture.findManyCalls[0]?.orderBy, [
    { updatedAt: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  const metadata = fixture.audits[0]?.metadata as Record<string, unknown>;
  assert.equal(metadata.candidateCount, 2);
  assert.deepEqual(metadata.candidateIds, [
    "assignment-new-disabled",
    "assignment-old-enabled",
  ]);
});

test("9. exact enabled assignment allows execution without signature fields", async () => {
  const expected = assignment();
  const fixture = createPrisma([
    assignment({
      id: "assignment-other-version",
      agentVersion: "2.0.0",
      enabled: false,
      updatedAt: new Date("2026-08-12T13:00:00.000Z"),
    }),
    expected,
  ]);
  const resolved = await assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope });
  assert.equal(resolved.id, expected.id);
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.signedByUserId, null);
  assert.equal(resolved.signedAt, null);
  assert.equal(resolved.signatureRef, null);
  assert.equal(fixture.audits.length, 0);
  assert.deepEqual(fixture.mutationCalls, { create: 0, update: 0, upsert: 0 });
});

test("10. runtime has no incidental assignment writes and audit failure still denies", async () => {
  const serviceSource = readFileSync(
    new URL("../services/workspaceAgentAssignments.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(serviceSource, /workspaceAgentAssignment\s*\.\s*(?:create|update|upsert)\s*\(/);

  const imobRouteSource = readFileSync(new URL("../routes/imob.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    imobRouteSource,
    /workspaceAgentAssignment\s*\.\s*(?:create|update|upsert)\s*\(/,
  );

  const readFixture = createPrisma([]);
  const active = await getActiveWorkspaceAgentAssignment({ prisma: readFixture.prisma, ...scope });
  assert.equal(active, null);

  const failedAuditFixture = createPrisma([], { auditFails: true });
  await expectAssignmentRequired(failedAuditFixture, "missing");
  assert.equal(failedAuditFixture.audits.length, 0);
});
