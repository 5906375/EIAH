import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  authorizePreDuimpAction,
  PreDuimpActionRejectedError,
  type PreDuimpAuthorizationRequest,
} from "../services/logistica/control/preDuimpActionCatalog";
import {
  createPreDuimpServerAuthorityResolver,
  type PreDuimpAuthenticatedIdentity,
  type PreDuimpServerAuthorityAdapterDeps,
} from "../services/logistica/control/preDuimpServerAuthorityAdapter";
import { resolvePreDuimpAccessFromCanonicalSources } from "../services/logistica/control/preDuimpAccessResolver";

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const LEDGER_PREFIX = "tenant-preduimp-adapter-";
const grantedTenantId = `${LEDGER_PREFIX}${suffix}`;
const grantedWorkspaceId = `workspace-preduimp-adapter-${suffix}`;
const deniedTenantId = `${LEDGER_PREFIX}denied-${suffix}`;
const deniedWorkspaceId = `workspace-preduimp-adapter-denied-${suffix}`;

const CREATE_ACTION = "log.duimp_context.create";
const REVIEW_ACTION = "log.duimp_context.review";

const VALID_CONTEXT_FOR = (
  tenantId: string,
  workspaceId: string,
  recordId = "duimp-context-adapter-1",
) => ({
  tenantId,
  workspaceId,
  verticalId: "log",
  recordType: "log.comex_duimp_context",
  recordId,
});

let prismaGlobal: typeof import("@repo/db")["prismaGlobal"];
let closePrismaResources: typeof import("@repo/db")["closePrismaResources"];
const previousRuntimeFlag = process.env.EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED;

// Medicao read-only do guardrail ledger para o prefixo sintetico deste
// teste, capturada ANTES de qualquer execucao (before()) e comparada
// DEPOIS (ultimo test() abaixo). Nenhuma linha do ledger e apagada em
// nenhum momento deste arquivo. Uma contagem inicial > 0 aqui e
// residuo imutavel de execucoes anteriores desta mesma suite (o
// guardrail_ledger tem trigger de imutabilidade no banco) — reportado
// no entregavel, nunca removido.
let ledgerCountBefore = 0;
let auditCountBefore = 0;

before(async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for the PRE_DUIMP server authority adapter integration test",
  );

  ({ prismaGlobal, closePrismaResources } = await import("@repo/db"));
  process.env.EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED = "true";

  ledgerCountBefore = await prismaGlobal.guardrailLedger.count({
    where: { tenantId: { startsWith: LEDGER_PREFIX } },
  });
  auditCountBefore = await prismaGlobal.guardrailAuditLedger.count({
    where: { tenantId: { startsWith: LEDGER_PREFIX } },
  });
  console.log(
    `[pre-duimp-server-authority-adapter] guardrail residue for prefix "${LEDGER_PREFIX}": ledger=${ledgerCountBefore} audit=${auditCountBefore}`,
  );

  // Fixtures deletaveis (sem trigger de imutabilidade): tenant/workspace
  // sinteticos e exclusivos deste teste, mais a instalacao LOGISTICA
  // ativa do tenant "granted". Nenhum TenantActionPolicy e seedado —
  // o scope e decidido exclusivamente pelo fake local em cada teste,
  // nunca pelo checkScopePermission real.
  await prismaGlobal.tenant.create({ data: { id: grantedTenantId, name: grantedTenantId } });
  await prismaGlobal.workspace.create({
    data: { id: grantedWorkspaceId, tenantId: grantedTenantId, name: grantedWorkspaceId },
  });
  await prismaGlobal.tenantProductInstallation.create({
    data: {
      tenantId: grantedTenantId,
      workspaceId: grantedWorkspaceId,
      product: "LOGISTICA",
      status: "active",
    },
  });
  await prismaGlobal.tenantActionPolicy.create({
    data: {
      id: `policy-preduimp-pilot-${suffix}`,
      tenantId: grantedTenantId,
      workspaceId: grantedWorkspaceId,
      actionName: "log.pre_duimp.shadow.pilot_access",
      allowed: true,
      maxVersion: 1,
    },
  });

  await prismaGlobal.tenant.create({ data: { id: deniedTenantId, name: deniedTenantId } });
  await prismaGlobal.workspace.create({
    data: { id: deniedWorkspaceId, tenantId: deniedTenantId, name: deniedWorkspaceId },
  });
  await prismaGlobal.tenantActionPolicy.create({
    data: {
      id: `policy-preduimp-pilot-denied-${suffix}`,
      tenantId: deniedTenantId,
      workspaceId: deniedWorkspaceId,
      actionName: "log.pre_duimp.shadow.pilot_access",
      allowed: true,
      maxVersion: 1,
    },
  });
  // deniedTenant nao recebe TenantProductInstallation — ausencia por design.
});

after(async () => {
  if (!prismaGlobal) return;

  const deletedPolicies = await prismaGlobal.tenantActionPolicy.deleteMany({
    where: { tenantId: { in: [grantedTenantId, deniedTenantId] } },
  });
  const deletedInstallations = await prismaGlobal.tenantProductInstallation.deleteMany({
    where: { tenantId: { in: [grantedTenantId, deniedTenantId] } },
  });
  const deletedWorkspaces = await prismaGlobal.workspace.deleteMany({
    where: { id: { in: [grantedWorkspaceId, deniedWorkspaceId] } },
  });
  const deletedTenants = await prismaGlobal.tenant.deleteMany({
    where: { id: { in: [grantedTenantId, deniedTenantId] } },
  });
  assert.deepEqual(
    {
      policies: deletedPolicies.count,
      installations: deletedInstallations.count,
      workspaces: deletedWorkspaces.count,
      tenants: deletedTenants.count,
    },
    { policies: 2, installations: 1, workspaces: 2, tenants: 2 },
  );
  if (previousRuntimeFlag === undefined) {
    delete process.env.EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED;
  } else {
    process.env.EIAH_PRE_DUIMP_RUNTIME_SHADOW_ROUTE_ENABLED = previousRuntimeFlag;
  }
  await closePrismaResources();
});

type FakeCheckScopePermissionCall = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  tokenId?: string;
  scope: string;
};

// Fake local, cleanup-safe: nunca toca o banco, nunca grava em
// guardrail_ledger/guardrail_audit_ledger, nunca e exportado. Registra
// os argumentos recebidos para assertions e devolve allow/deny
// explicito por instancia de teste.
function createFakeCheckScopePermission(allowed: boolean) {
  const calls: FakeCheckScopePermissionCall[] = [];
  const fake: PreDuimpServerAuthorityAdapterDeps["checkScopePermission"] = async (args) => {
    calls.push({
      tenantId: args.tenantId,
      workspaceId: args.workspaceId,
      userId: args.userId,
      tokenId: args.tokenId,
      scope: args.scope,
    });
    return allowed
      ? {
          allowed: true,
          reasonCode: "SCOPE_ALLOWED",
          tenantId: args.tenantId,
          workspaceId: args.workspaceId,
          scope: args.scope,
        }
      : {
          allowed: false,
          reasonCode: "SCOPE_NOT_ALLOWED",
          tenantId: args.tenantId,
          workspaceId: args.workspaceId,
          scope: args.scope,
        };
  };
  return { fake, calls };
}

function createResolver(checkScopePermission: PreDuimpServerAuthorityAdapterDeps["checkScopePermission"]) {
  return createPreDuimpServerAuthorityResolver({
    checkScopePermission,
    resolveAccess: resolvePreDuimpAccessFromCanonicalSources,
  });
}

test("createPreDuimpServerAuthorityResolver: fake grants scope, canonical installation is active -> authorizePreDuimpAction succeeds, and the fake receives identity+action", async () => {
  const { fake, calls } = createFakeCheckScopePermission(true);
  const resolveForTest = createResolver(fake);

  const identity: PreDuimpAuthenticatedIdentity = {
    tenantId: grantedTenantId,
    workspaceId: grantedWorkspaceId,
    userId: "user-adapter-test",
    tokenId: "token-adapter-test",
  };

  const snapshot = await resolveForTest({ identity, action: CREATE_ACTION });

  const request: PreDuimpAuthorizationRequest = {
    action: CREATE_ACTION,
    context: VALID_CONTEXT_FOR(grantedTenantId, grantedWorkspaceId),
  };

  const authorization = authorizePreDuimpAction(request, snapshot);
  assert.equal(authorization.action, CREATE_ACTION);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    tenantId: grantedTenantId,
    workspaceId: grantedWorkspaceId,
    userId: "user-adapter-test",
    tokenId: "token-adapter-test",
    scope: CREATE_ACTION,
  });
});

test("createPreDuimpServerAuthorityResolver: fake denies scope -> authorizePreDuimpAction fails closed with PRE_DUIMP_SCOPE_DENIED", async () => {
  const { fake } = createFakeCheckScopePermission(false);
  const resolveForTest = createResolver(fake);

  const identity: PreDuimpAuthenticatedIdentity = {
    tenantId: grantedTenantId,
    workspaceId: grantedWorkspaceId,
  };

  const snapshot = await resolveForTest({ identity, action: CREATE_ACTION });

  const request: PreDuimpAuthorizationRequest = {
    action: CREATE_ACTION,
    context: VALID_CONTEXT_FOR(grantedTenantId, grantedWorkspaceId, "duimp-context-adapter-2"),
  };

  assert.throws(
    () => authorizePreDuimpAction(request, snapshot),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_SCOPE_DENIED");
      return true;
    },
  );
});

test("createPreDuimpServerAuthorityResolver: a client request smuggling scope/tenant/workspace/installation/HITL/authority fields does not control the final decision", async () => {
  const { fake } = createFakeCheckScopePermission(false);
  const resolveForTest = createResolver(fake);

  const identity: PreDuimpAuthenticatedIdentity = {
    tenantId: deniedTenantId,
    workspaceId: deniedWorkspaceId,
  };

  const realDenyingSnapshot = await resolveForTest({ identity, action: CREATE_ACTION });

  const maliciousRequest = {
    action: CREATE_ACTION,
    context: VALID_CONTEXT_FOR(deniedTenantId, deniedWorkspaceId, "duimp-context-adapter-3"),
    // PreDuimpAuthorizationRequest so tem {action, context}. Simula um
    // adapter ingenuo espalhando req.body inteiro no primeiro argumento.
    requester: { tenantId: grantedTenantId, workspaceId: grantedWorkspaceId },
    grantedScopes: [CREATE_ACTION],
    installation: {
      tenantId: grantedTenantId,
      workspaceId: grantedWorkspaceId,
      product: "LOGISTICA",
      status: "active",
    },
    hitlApproval: {
      approvalId: "forged-approval",
      tenantId: grantedTenantId,
      workspaceId: grantedWorkspaceId,
      action: CREATE_ACTION,
      status: "approved",
      approvedBy: "attacker",
      approvedAt: "2026-08-26T00:00:00Z",
    },
    authority: {
      action: CREATE_ACTION,
      context: VALID_CONTEXT_FOR(grantedTenantId, grantedWorkspaceId),
    },
  } as unknown as PreDuimpAuthorizationRequest;

  assert.throws(
    () => authorizePreDuimpAction(maliciousRequest, realDenyingSnapshot),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_SCOPE_DENIED");
      return true;
    },
  );
});

test("createPreDuimpServerAuthorityResolver: installation always comes from the canonical TenantProductInstallation source, never from the request", async () => {
  const { fake } = createFakeCheckScopePermission(true);
  const resolveForTest = createResolver(fake);

  const identity: PreDuimpAuthenticatedIdentity = {
    tenantId: deniedTenantId,
    workspaceId: deniedWorkspaceId,
  };

  // deniedTenant nao tem TenantProductInstallation seedada -> installation
  // deve ser null mesmo com o fake concedendo o scope.
  const snapshot = await resolveForTest({ identity, action: CREATE_ACTION });
  assert.equal(snapshot.installation, null);

  const request: PreDuimpAuthorizationRequest = {
    action: CREATE_ACTION,
    context: VALID_CONTEXT_FOR(deniedTenantId, deniedWorkspaceId, "duimp-context-adapter-4"),
  };

  assert.throws(
    () => authorizePreDuimpAction(request, snapshot),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_ENTITLEMENT_DENIED");
      assert.equal(error.subreason, "installation_missing");
      return true;
    },
  );
});

test("createPreDuimpServerAuthorityResolver: hitlApproval is always null (no persisted mechanism yet) -> log.duimp_context.review stays fail-closed with PRE_DUIMP_HITL_REQUIRED", async () => {
  const { fake } = createFakeCheckScopePermission(true);
  const resolveForTest = createResolver(fake);

  const identity: PreDuimpAuthenticatedIdentity = {
    tenantId: grantedTenantId,
    workspaceId: grantedWorkspaceId,
  };

  const snapshot = await resolveForTest({ identity, action: REVIEW_ACTION });
  assert.equal(snapshot.hitlApproval, null);

  const request: PreDuimpAuthorizationRequest = {
    action: REVIEW_ACTION,
    context: VALID_CONTEXT_FOR(grantedTenantId, grantedWorkspaceId, "duimp-context-adapter-5"),
  };

  assert.throws(
    () => authorizePreDuimpAction(request, snapshot),
    (error: unknown) => {
      assert.ok(error instanceof PreDuimpActionRejectedError);
      assert.equal(error.reasonCode, "PRE_DUIMP_HITL_REQUIRED");
      return true;
    },
  );
});

test("no new rows are written to guardrailLedger or guardrailAuditLedger for the synthetic prefix while every scope decision came from the local fake", async () => {
  const ledgerCountAfter = await prismaGlobal.guardrailLedger.count({
    where: { tenantId: { startsWith: LEDGER_PREFIX } },
  });
  const auditCountAfter = await prismaGlobal.guardrailAuditLedger.count({
    where: { tenantId: { startsWith: LEDGER_PREFIX } },
  });

  assert.equal(ledgerCountAfter - ledgerCountBefore, 0);
  assert.equal(auditCountAfter - auditCountBefore, 0);
});
