import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FRONT_DOOR_AGENTS,
  WORKSPACE_AGENT_PROVISIONING_VERSION,
  getProductProvisionedAgents,
} from "@eiah/core/catalog/workspaceAgentProvisioning";
import {
  AGENT_ASSIGNMENT_REQUIRED,
  WorkspaceAgentAssignmentError,
  assertWorkspaceAgentEnabled,
} from "../services/workspaceAgentAssignments";
import { provisionWorkspaceAgentAssignments } from "../services/workspaceAgentProvisioning";

type Assignment = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion: string;
  enabled: boolean;
  signedByUserId: string | null;
  signedAt: Date | null;
  signatureRef: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type Metadata = { id: string; agent: string; version: string; displayName: string; category: string | null };

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };

function createPrisma(seed: { assignments?: Assignment[]; metadata?: Metadata[] } = {}) {
  const assignments = [...(seed.assignments ?? [])];
  const metadata = [...(seed.metadata ?? [])];
  const calls = { assignmentCreate: 0, metadataCreate: 0 };
  let sequence = 0;
  const prisma = {
    agentMetadata: {
      findUnique: async ({ where }: { where: { agent: string } }) =>
        metadata.find((item) => item.agent === where.agent) ?? null,
      findMany: async () => metadata.map((item) => ({ agent: item.agent })),
      create: async ({ data }: { data: Omit<Metadata, "id"> }) => {
        calls.metadataCreate += 1;
        const row: Metadata = { id: `meta-${metadata.length + 1}`, ...data, category: data.category ?? null };
        metadata.push(row);
        return row;
      },
    },
    agentProfile: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    workspaceAgentAssignment: {
      findMany: async ({ where }: { where: { tenantId?: string; workspaceId?: string } }) =>
        assignments.filter(
          (item) =>
            (where.tenantId === undefined || item.tenantId === where.tenantId) &&
            (where.workspaceId === undefined || item.workspaceId === where.workspaceId),
        ),
      create: async ({ data }: { data: Partial<Assignment> }) => {
        calls.assignmentCreate += 1;
        const duplicate = assignments.find(
          (item) =>
            item.tenantId === data.tenantId &&
            item.workspaceId === data.workspaceId &&
            item.agentKey === data.agentKey &&
            item.agentVersion === data.agentVersion,
        );
        if (duplicate) throw Object.assign(new Error("unique violation"), { code: "P2002" });
        sequence += 1;
        const now = new Date(`2026-09-30T12:00:${String(sequence).padStart(2, "0")}.000Z`);
        const row: Assignment = {
          id: `assignment-${sequence}`,
          tenantId: data.tenantId!,
          workspaceId: data.workspaceId!,
          agentKey: data.agentKey!,
          agentVersion: data.agentVersion!,
          enabled: data.enabled ?? true,
          signedByUserId: null,
          signedAt: null,
          signatureRef: null,
          metadata: (data.metadata as Record<string, unknown>) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        assignments.push(row);
        return row;
      },
    },
    guardrailAuditLedger: {
      create: async ({ data }: { data: Record<string, unknown> }) => data,
    },
  };
  return { prisma: prisma as any, assignments, metadata, calls };
}

function existingAssignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: "assignment-existing",
    ...scope,
    agentKey: "EIAH",
    agentVersion: "1.0.0",
    enabled: true,
    signedByUserId: null,
    signedAt: null,
    signatureRef: null,
    metadata: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function provisionFrontDoor(prisma: unknown, workspaceId = scope.workspaceId) {
  return provisionWorkspaceAgentAssignments({
    prisma: prisma as any,
    tenantId: scope.tenantId,
    workspaceId,
    agents: FRONT_DOOR_AGENTS,
    trigger: "onboarding",
    catalogVersion: WORKSPACE_AGENT_PROVISIONING_VERSION,
  });
}

async function provisionImob(prisma: unknown) {
  return provisionWorkspaceAgentAssignments({
    prisma: prisma as any,
    ...scope,
    agents: getProductProvisionedAgents("IMOB"),
    trigger: "product_activation:IMOB",
    catalogVersion: WORKSPACE_AGENT_PROVISIONING_VERSION,
  });
}

test("front door provisioning creates exactly one enabled EIAH assignment at the version the gate requires", async () => {
  const fixture = createPrisma();
  const result = await provisionFrontDoor(fixture.prisma);

  assert.equal(result.length, 1);
  assert.equal(fixture.assignments.length, 1);
  const [row] = fixture.assignments;
  assert.equal(row?.agentKey, "EIAH");
  assert.equal(row?.agentVersion, "1.0.0");
  assert.equal(row?.enabled, true);
  assert.equal(row?.signedByUserId, null, "provisioning must not fabricate a signature");
  assert.equal(row?.signatureRef, null);
  assert.deepEqual(row?.metadata, {
    source: "workspace_agent_provisioning",
    catalogVersion: 1,
    trigger: "onboarding",
  });

  const resolved = await assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, agentKey: "EIAH" });
  assert.equal(resolved.id, row?.id);
});

test("IMOB provisioning creates EIAH and imob-chat-audit and the gate accepts both", async () => {
  const fixture = createPrisma();
  await provisionImob(fixture.prisma);

  assert.deepEqual(
    fixture.assignments.map((item) => `${item.agentKey}@${item.agentVersion}`).sort(),
    ["EIAH@1.0.0", "imob-chat-audit@1.0.0"],
  );
  assert.equal(fixture.metadata.find((item) => item.agent === "imob-chat-audit")?.version, "1.0.0");

  for (const agentKey of ["EIAH", "imob-chat-audit"]) {
    const resolved = await assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, agentKey });
    assert.equal(resolved.enabled, true);
  }
});

test("provisioning is idempotent: repeated activation neither duplicates nor causes ambiguity", async () => {
  const fixture = createPrisma();
  await provisionFrontDoor(fixture.prisma);
  await provisionImob(fixture.prisma);
  await provisionImob(fixture.prisma);

  assert.equal(fixture.assignments.length, 2);
  assert.equal(fixture.calls.assignmentCreate, 2);
  assert.equal(fixture.calls.metadataCreate, 1);
  const resolved = await assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, agentKey: "EIAH" });
  assert.equal(resolved.enabled, true);
});

test("an explicitly disabled assignment is never re-enabled and the gate keeps refusing", async () => {
  const disabled = existingAssignment({ enabled: false });
  const fixture = createPrisma({ assignments: [disabled] });

  const result = await provisionFrontDoor(fixture.prisma);

  assert.equal(fixture.calls.assignmentCreate, 0);
  assert.equal(result[0]?.id, disabled.id);
  assert.equal(fixture.assignments[0]?.enabled, false);
  await assert.rejects(
    () => assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, agentKey: "EIAH" }),
    (error: unknown) =>
      error instanceof WorkspaceAgentAssignmentError && error.reasonCode === AGENT_ASSIGNMENT_REQUIRED,
  );
});

test("an existing assignment with a differently cased key is reused instead of duplicated", async () => {
  const fixture = createPrisma({ assignments: [existingAssignment({ agentKey: "eiah" })] });
  await provisionFrontDoor(fixture.prisma);

  assert.equal(fixture.calls.assignmentCreate, 0);
  assert.equal(fixture.assignments.length, 1);
});

test("existing catalog metadata is never overwritten and its version governs the assignment", async () => {
  const fixture = createPrisma({
    metadata: [{ id: "meta-x", agent: "imob-chat-audit", version: "2.0.0", displayName: "Custom", category: "audit" }],
  });
  await provisionImob(fixture.prisma);

  assert.equal(fixture.calls.metadataCreate, 0);
  assert.equal(fixture.metadata[0]?.version, "2.0.0");
  assert.equal(fixture.metadata[0]?.displayName, "Custom");
  assert.equal(
    fixture.assignments.find((item) => item.agentKey === "imob-chat-audit")?.agentVersion,
    "2.0.0",
  );
});

test("provisioning is isolated per workspace", async () => {
  const fixture = createPrisma();
  await provisionFrontDoor(fixture.prisma, "workspace-a");

  await assert.rejects(
    () =>
      assertWorkspaceAgentEnabled({
        prisma: fixture.prisma,
        tenantId: scope.tenantId,
        workspaceId: "workspace-b",
        agentKey: "EIAH",
      }),
    (error: unknown) =>
      error instanceof WorkspaceAgentAssignmentError && error.reasonCode === AGENT_ASSIGNMENT_REQUIRED,
  );

  await provisionFrontDoor(fixture.prisma, "workspace-b");
  assert.equal(fixture.assignments.length, 2);
  assert.deepEqual(
    fixture.assignments.map((item) => item.workspaceId).sort(),
    ["workspace-a", "workspace-b"],
  );
});

test("without provisioning the gate still refuses and never writes (fail-closed regression)", async () => {
  const fixture = createPrisma();
  await assert.rejects(
    () => assertWorkspaceAgentEnabled({ prisma: fixture.prisma, ...scope, agentKey: "EIAH" }),
    (error: unknown) =>
      error instanceof WorkspaceAgentAssignmentError && error.reasonCode === AGENT_ASSIGNMENT_REQUIRED,
  );
  assert.equal(fixture.calls.assignmentCreate, 0);
  assert.equal(fixture.calls.metadataCreate, 0);
});

test("writes live only in the provisioning module; the gate module stays write-free", () => {
  const gateSource = readFileSync(new URL("../services/workspaceAgentAssignments.ts", import.meta.url), "utf8");
  assert.doesNotMatch(gateSource, /workspaceAgentAssignment\s*\.\s*(?:create|update|upsert)\s*\(/);

  const provisioningSource = readFileSync(
    new URL("../services/workspaceAgentProvisioning.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(provisioningSource, /workspaceAgentAssignment\s*\.\s*(?:update|upsert)\s*\(/);

  // Ativação de produto (Marketplace e chat, ADR-010 etapa F) passa pelo serviço único de ativação.
  for (const file of ["routes/onboarding.ts", "routes/workspaces.ts", "services/products/productActivation.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /provisionWorkspaceAgentAssignments\(/, `${file} must provision agents`);
    assert.doesNotMatch(source, /workspaceAgentAssignment\s*\.\s*(?:create|update|upsert)\s*\(/);
  }
  const marketplace = readFileSync(new URL("../routes/marketplace.ts", import.meta.url), "utf8");
  assert.match(marketplace, /activateProductInstallation\(/, "marketplace.ts must activate through the provisioning service");
  assert.doesNotMatch(marketplace, /workspaceAgentAssignment\s*\.\s*(?:create|update|upsert)\s*\(/);
});
