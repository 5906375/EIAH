import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EXCLUDED_DEFAULT_ACTION_POLICIES,
  WORKSPACE_ACTION_POLICY_PROVISIONING_VERSION,
  getProductDefaultActionPolicies,
} from "@eiah/core/catalog/workspaceActionPolicyProvisioning";
import { resolveAllowedActionNames } from "../routes/agentsPolicy";
import { provisionWorkspaceActionPolicies } from "../services/workspaceActionPolicyProvisioning";

type Policy = { id: string; tenantId: string; workspaceId: string | null; actionName: string; allowed: boolean };

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const IMOB_DEFAULTS = [
  "realestate.register_property",
  "realestate.qualify_lead",
  "realestate.collect_documents",
];

function protocolCatalogActions(): string[] {
  const source = readFileSync(new URL("../routes/agents.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("const ACTION_CONTRACTS"));
  return [...new Set([...block.matchAll(/^\s{2}"(realestate\.[a-z_]+)":\s*\{/gm)].map((match) => match[1]!))];
}

function createPrisma(seed: Policy[] = []) {
  const policies = [...seed];
  const calls = { create: 0 };
  const prisma = {
    tenantActionPolicy: {
      findMany: async ({ where }: { where: { tenantId: string; workspaceId: string } }) =>
        policies.filter((item) => item.tenantId === where.tenantId && item.workspaceId === where.workspaceId),
      create: async ({ data }: { data: Omit<Policy, "id"> }) => {
        calls.create += 1;
        const row = { id: `policy-${policies.length + 1}`, ...data };
        policies.push(row);
        return row;
      },
    },
  };
  return { prisma: prisma as any, policies, calls };
}

async function provisionImob(prisma: unknown, workspaceId = scope.workspaceId) {
  return provisionWorkspaceActionPolicies({
    prisma: prisma as any,
    tenantId: scope.tenantId,
    workspaceId,
    actionNames: getProductDefaultActionPolicies("IMOB"),
  });
}

test("catalog: IMOB default set is exactly the approved registration actions (decision 2026-10-01)", () => {
  assert.equal(WORKSPACE_ACTION_POLICY_PROVISIONING_VERSION, 1);
  assert.deepEqual([...getProductDefaultActionPolicies("imob")], IMOB_DEFAULTS);
});

test("catalog: excluded actions are never part of the default set", () => {
  const defaults = new Set(getProductDefaultActionPolicies("IMOB"));
  for (const action of EXCLUDED_DEFAULT_ACTION_POLICIES) {
    assert.equal(defaults.has(action), false, `${action} must not be granted by activation`);
  }
  assert.ok(EXCLUDED_DEFAULT_ACTION_POLICIES.includes("realestate.release_commission"));
  assert.ok(EXCLUDED_DEFAULT_ACTION_POLICIES.includes("realestate.create_contract"));
});

test("catalog: every default and excluded action exists in the Agent Protocol contracts; together they cover all of them", () => {
  const protocol = protocolCatalogActions();
  assert.ok(protocol.length > 0);
  for (const action of [...IMOB_DEFAULTS, ...EXCLUDED_DEFAULT_ACTION_POLICIES]) {
    assert.ok(protocol.includes(action), `${action} must exist in ACTION_CONTRACTS`);
  }
  assert.deepEqual([...IMOB_DEFAULTS, ...EXCLUDED_DEFAULT_ACTION_POLICIES].sort(), [...protocol].sort());
});

test("catalog: products without an approved set are rejected (fail-closed)", () => {
  for (const product of ["LEGAL", "custom:x", "", "constructor"]) {
    assert.throws(() => getProductDefaultActionPolicies(product), /without approved action policy set/);
  }
});

test("provisioning grants exactly the default set and the protocol allows only those actions", async () => {
  const fixture = createPrisma();
  const result = await provisionImob(fixture.prisma);

  assert.equal(fixture.calls.create, 3);
  assert.deepEqual(result.map((item) => item.actionName), IMOB_DEFAULTS);
  assert.ok(fixture.policies.every((item) => item.allowed && item.workspaceId === scope.workspaceId));

  const allowed = resolveAllowedActionNames({
    ...scope,
    dbPolicies: fixture.policies.filter((item) => item.allowed),
    catalogActions: protocolCatalogActions(),
  });
  assert.deepEqual([...allowed].sort(), [...IMOB_DEFAULTS].sort());
  for (const action of EXCLUDED_DEFAULT_ACTION_POLICIES) {
    assert.equal(allowed.has(action), false, `${action} must stay blocked`);
  }
});

test("provisioning is idempotent", async () => {
  const fixture = createPrisma();
  await provisionImob(fixture.prisma);
  await provisionImob(fixture.prisma);
  assert.equal(fixture.policies.length, 3);
  assert.equal(fixture.calls.create, 3);
});

test("an explicit deny is never overridden", async () => {
  const fixture = createPrisma([
    { id: "deny", ...scope, actionName: "realestate.register_property", allowed: false },
  ]);
  const result = await provisionImob(fixture.prisma);

  assert.equal(fixture.policies.find((item) => item.id === "deny")?.allowed, false);
  assert.equal(result.find((item) => item.actionName === "realestate.register_property")?.created, false);
  assert.equal(fixture.calls.create, 2);
});

test("provisioning is isolated per workspace and never writes tenant-wide policies", async () => {
  const fixture = createPrisma();
  await provisionImob(fixture.prisma, "workspace-a");
  await provisionImob(fixture.prisma, "workspace-b");

  assert.equal(fixture.policies.filter((item) => item.workspaceId === "workspace-a").length, 3);
  assert.equal(fixture.policies.filter((item) => item.workspaceId === "workspace-b").length, 3);
  assert.equal(fixture.policies.filter((item) => item.workspaceId === null).length, 0);
});

test("activation wires action policy provisioning from the catalog", () => {
  // A rota do Marketplace (e a ativação pelo chat, ADR-010 etapa F) delegam ao serviço único de ativação.
  const route = readFileSync(new URL("../routes/marketplace.ts", import.meta.url), "utf8");
  const start = route.indexOf('"/marketplace/installations/activate"');
  assert.ok(start >= 0);
  const routeActivation = route.slice(start, route.indexOf("marketplaceRouter.", start + 10));
  assert.match(routeActivation, /activateProductInstallation\(/);
  assert.doesNotMatch(routeActivation, /tenantActionPolicy\s*\.\s*(?:create|update|upsert)\s*\(/);

  const service = readFileSync(new URL("../services/products/productActivation.ts", import.meta.url), "utf8");
  const activation = service.slice(service.indexOf("export async function activateProductInstallation"));
  assert.match(activation, /getProductDefaultActionPolicies\(product\)/);
  assert.match(activation, /provisionWorkspaceActionPolicies\(/);
  assert.doesNotMatch(activation, /tenantActionPolicy\s*\.\s*(?:create|update|upsert)\s*\(/);
});
