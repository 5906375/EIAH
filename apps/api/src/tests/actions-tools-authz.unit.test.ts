import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response, Router } from "express";

type AuthenticatedRequest = Request & {
  authContext?: {
    tokenId: string;
    tenantId: string;
    workspaceId: string;
    userId: string;
  };
  prisma?: typeof toolPrisma;
  testScopes?: Set<string>;
};

type InvocationResult = {
  status: number;
  body: any;
};

const ACTIONS_SCOPE = "actions.admin";
const TOOLS_SCOPE = "tools.admin";
const TENANT_ID = "tenant-a";
const WORKSPACE_ID = "workspace-a";
const FOREIGN_TENANT_ID = "tenant-b";
const FOREIGN_WORKSPACE_ID = "workspace-b";

const policies: Array<Record<string, any>> = [];
const versions: Array<Record<string, any>> = [];
const tools: Array<Record<string, any>> = [];
const configuredScopes: string[] = [];
const marketplaceAgents: Array<Record<string, any>> = [];
const audits: Array<Record<string, any>> = [];
let auditFails = false;
// Autoridade individual simulada (membership ativa + designação `holder`), injetada pelo seam de teste do serviço.
let commercialHolders = new Set<string>();
let marketplaceReadFails = false;

const actionPrisma = {
  actionRegistry: {
    findMany: async () => versions,
    upsert: async ({ create, update, where }: any) => {
      const key = where.name_version;
      const existing = versions.find(
        (entry) => entry.name === key.name && entry.version === key.version,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const entry = { id: `version-${versions.length + 1}`, ...create };
      versions.push(entry);
      return entry;
    },
    deleteMany: async ({ where }: any) => {
      const retained = versions.filter(
        (entry) => entry.version !== where.version,
      );
      const count = versions.length - retained.length;
      versions.splice(0, versions.length, ...retained);
      return { count };
    },
  },
  marketplaceItem: {
    findMany: async () => {
      if (marketplaceReadFails) throw new Error("marketplace read failure");
      return marketplaceAgents;
    },
  },
  guardrailAuditLedger: {
    create: async ({ data }: any) => {
      if (auditFails) throw new Error("audit ledger unavailable");
      audits.push(data);
      return data;
    },
  },
  tenantActionPolicy: {
    findFirst: async ({ where }: any) =>
      policies.find(
        (entry) =>
          entry.tenantId === where.tenantId &&
          entry.workspaceId === where.workspaceId &&
          entry.actionName === where.actionName,
      ) ?? null,
    create: async ({ data }: any) => {
      const entry = { id: `policy-${policies.length + 1}`, ...data };
      policies.push(entry);
      return entry;
    },
    update: async ({ where, data }: any) => {
      const existing = policies.find(
        (entry) =>
          entry.id === where.id &&
          entry.tenantId === where.tenantId &&
          entry.workspaceId === where.workspaceId,
      );
      if (!existing) throw new Error("policy not found");
      Object.assign(existing, data);
      return existing;
    },
  },
  $transaction: async (operations: Array<Promise<unknown>>) =>
    Promise.all(operations),
};

const toolPrisma = {
  toolContract: {
    create: async ({ data }: any) => {
      const entry = { id: `tool-${tools.length + 1}`, ...data };
      tools.push(entry);
      return entry;
    },
    findMany: async ({ where }: any) =>
      tools.filter((entry) => entry.tenantId === where.tenantId),
  },
};

function fakeEnforceTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
    });
  }

  const scopeByToken: Record<string, Set<string>> = {
    "actions-token": new Set([ACTIONS_SCOPE]),
    "service-token": new Set([ACTIONS_SCOPE]),
    "tools-token": new Set([TOOLS_SCOPE]),
    "no-scope-token": new Set(),
  };
  const scopes = scopeByToken[token];
  if (!scopes) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  }

  req.authContext = {
    // tokenId é o id do registro do token, nunca o valor do token
    tokenId: `token-record-${token.length}`,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    userId: token === "service-token" ? (undefined as unknown as string) : "user-a",
  };
  req.prisma = toolPrisma;
  req.testScopes = scopes;
  return next();
}

function fakeRequireScope(requiredScope: string) {
  configuredScopes.push(requiredScope);
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.testScopes?.has(requiredScope)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "POLICY_NOT_FOUND",
          reasonCode: "POLICY_NOT_FOUND",
          message: `Scope denied: ${requiredScope}`,
        },
      });
    }
    return next();
  };
}

async function invoke(params: {
  router: Router;
  method: "get" | "post" | "delete";
  routePath: string;
  token?: string;
  body?: unknown;
  routeParams?: Record<string, string>;
}): Promise<InvocationResult> {
  const stack = (params.router as any).stack as Array<any>;
  const routeLayer = stack.find(
    (layer) =>
      layer.route?.path === params.routePath &&
      layer.route?.methods?.[params.method],
  );
  assert.ok(routeLayer, `route not found: ${params.method} ${params.routePath}`);

  const handlers = [
    ...stack.filter((layer) => !layer.route).map((layer) => layer.handle),
    ...routeLayer.route.stack.map((layer: any) => layer.handle),
  ];
  const request = {
    body: params.body,
    params: params.routeParams ?? {},
    header(name: string) {
      if (name.toLowerCase() !== "authorization" || !params.token) {
        return undefined;
      }
      return `Bearer ${params.token}`;
    },
  } as AuthenticatedRequest;

  const result: InvocationResult = { status: 200, body: undefined };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;

  const run = async (index: number): Promise<void> => {
    if (index >= handlers.length) return;
    let nextPromise: Promise<void> | undefined;
    const next = () => {
      nextPromise = run(index + 1);
      return nextPromise;
    };
    await handlers[index](request, response, next);
    await nextPromise;
  };

  await run(0);
  return result;
}

let actionsRouter: Router;
let toolsRouter: Router;

before(async () => {
  const [{ createActionsRouter }, { createToolsRouter }] = await Promise.all([
    import("../routes/actions"),
    import("../routes/tools"),
  ]);

  const authority = await import("../services/marketplaceSubscriptionAuthority");
  authority.subscriptionAuthorityDeps.forClient = () => ({
    readMembership: async (actor) => (actor.userId && commercialHolders.has(actor.userId) ? { status: "active" } : null),
    readDesignation: async (actor) =>
      actor.userId && commercialHolders.has(actor.userId) ? { id: "cad_unit_holder", limits: { allowedScopes: ["read", "execute"], maxValidityDays: 90 } } : null,
  });
  actionsRouter = createActionsRouter({
    prisma: actionPrisma as any,
    enforceTenant: fakeEnforceTenant as any,
    requireScope: fakeRequireScope as any,
  });
  toolsRouter = createToolsRouter({
    enforceTenant: fakeEnforceTenant as any,
    requireScope: fakeRequireScope as any,
  });
});

beforeEach(() => {
  audits.length = 0;
  auditFails = false;
  commercialHolders = new Set<string>();
  marketplaceAgents.length = 0;
  marketplaceReadFails = false;
  policies.length = 0;
  versions.length = 0;
  tools.length = 0;
  tools.push({
    id: "foreign-tool",
    tenantId: FOREIGN_TENANT_ID,
    name: "foreign",
    version: "1.0.0",
  });
});

test("routers are configured with the ratified canonical scopes", () => {
  assert.deepEqual(configuredScopes, [ACTIONS_SCOPE, TOOLS_SCOPE]);
});

test("missing bearer fails closed on sensitive Actions and Tools endpoints", async () => {
  assert.equal(
    (await invoke({ router: actionsRouter, method: "get", routePath: "/" }))
      .status,
    401,
  );
  assert.equal(
    (await invoke({ router: toolsRouter, method: "get", routePath: "/" }))
      .status,
    401,
  );
});

test("valid bearer without actions.admin cannot override, version or delete", async () => {
  const override = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/override",
    token: "no-scope-token",
    body: { actionName: "ping", allowed: true },
  });
  const version = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/version",
    token: "no-scope-token",
    body: { version: 1, actions: { ping: {} } },
  });
  const remove = await invoke({
    router: actionsRouter,
    method: "delete",
    routePath: "/version/:version",
    token: "no-scope-token",
    routeParams: { version: "1" },
  });

  assert.deepEqual(
    [override.status, version.status, remove.status],
    [403, 403, 403],
  );
  assert.equal(policies.length, 0);
  assert.equal(versions.length, 0);
});

test("valid bearer without tools.admin cannot create or list tools", async () => {
  const create = await invoke({
    router: toolsRouter,
    method: "post",
    routePath: "/",
    token: "no-scope-token",
    body: {
      name: "tool-a",
      version: "1.0.0",
      inputSchema: {},
      executor: "http",
      trustLevel: 1,
    },
  });
  const list = await invoke({
    router: toolsRouter,
    method: "get",
    routePath: "/",
    token: "no-scope-token",
  });

  assert.deepEqual([create.status, list.status], [403, 403]);
  assert.equal(tools.length, 1);
});

test("divergent tenant/workspace cannot write an Actions override", async () => {
  const result = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/override",
    token: "actions-token",
    body: {
      tenantId: FOREIGN_TENANT_ID,
      workspaceId: FOREIGN_WORKSPACE_ID,
      actionName: "ping",
      allowed: true,
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.body?.error?.code, "AUTH_CONTEXT_MISMATCH");
  assert.equal(policies.length, 0);
});

test("absent allowed fails and cannot silently create an allow policy", async () => {
  const result = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/override",
    token: "actions-token",
    body: { actionName: "ping" },
  });

  assert.equal(result.status, 400);
  assert.equal(result.body?.error?.code, "INVALID_PAYLOAD");
  assert.equal(policies.length, 0);
});

test("authorized override is bound to the authenticated tenant/workspace", async () => {
  const result = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/override",
    token: "actions-token",
    body: { actionName: "ping", allowed: false, maxVersion: 2 },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(policies, [
    {
      id: "policy-1",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      actionName: "ping",
      allowed: false,
      maxVersion: 2,
    },
  ]);
});

test("authorized Actions admin can create, list and delete a global version", async () => {
  assert.equal(
    (
      await invoke({
        router: actionsRouter,
        method: "post",
        routePath: "/version",
        token: "actions-token",
        body: { version: 1, actions: { ping: { description: "Ping" } } },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await invoke({
        router: actionsRouter,
        method: "get",
        routePath: "/",
        token: "actions-token",
      })
    ).status,
    200,
  );
  assert.equal(versions.length, 1);
  assert.equal(
    (
      await invoke({
        router: actionsRouter,
        method: "delete",
        routePath: "/version/:version",
        token: "actions-token",
        routeParams: { version: "1" },
      })
    ).status,
    200,
  );
  assert.equal(versions.length, 0);
});

test("divergent tenant cannot create a cross-tenant ToolContract", async () => {
  const result = await invoke({
    router: toolsRouter,
    method: "post",
    routePath: "/",
    token: "tools-token",
    body: {
      tenantId: FOREIGN_TENANT_ID,
      name: "tool-a",
      version: "1.0.0",
      inputSchema: {},
      executor: "http",
      trustLevel: 1,
    },
  });

  assert.equal(result.status, 400);
  assert.equal(result.body?.error?.code, "AUTH_CONTEXT_MISMATCH");
  assert.equal(tools.length, 1);
});

test("authorized Tools admin creates and lists only its own tenant contracts", async () => {
  const create = await invoke({
    router: toolsRouter,
    method: "post",
    routePath: "/",
    token: "tools-token",
    body: {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      name: "tool-a",
      version: "1.0.0",
      inputSchema: {},
      executor: "http",
      trustLevel: 1,
    },
  });
  const list = await invoke({
    router: toolsRouter,
    method: "get",
    routePath: "/",
    token: "tools-token",
  });

  assert.equal(create.status, 200);
  assert.equal(create.body?.tenantId, TENANT_ID);
  assert.deepEqual(
    list.body.map((entry: { tenantId: string }) => entry.tenantId),
    [TENANT_ID],
  );
});

test("AUTHZ-SCOPE-1: override nunca concede o escopo comercial; política de agente exige a autoridade individual, não só actions.admin", async () => {
  marketplaceAgents.push({ name: "Partner Bot" });
  const override = (body: unknown, token = "actions-token") =>
    invoke({ router: actionsRouter, method: "post", routePath: "/override", token, body });

  // o escopo comercial como política: nunca por aqui, nem para quem tem autoridade comercial
  commercialHolders.add("user-a");
  for (const actionName of ["marketplace.subscribe", " Marketplace.Subscribe "]) {
    const result = await override({ actionName, allowed: true });
    assert.equal(result.status, 409, actionName);
    assert.equal(result.body.error.code, "COMMERCIAL_AUTHORITY_REQUIRED", actionName);
  }
  assert.equal(policies.length, 0);

  // actions.admin sem autoridade individual: nenhuma política de agente (canônico ou do Marketplace)
  commercialHolders.clear();
  for (const actionName of ["MKT", "mkt", "Fin-Nexus", "partner bot", "PARTNER-BOT"]) {
    const result = await override({ actionName, allowed: true });
    assert.equal(result.status, 403, actionName);
    assert.equal(result.body.error.code, "MARKETPLACE_SUBSCRIBE_FORBIDDEN", actionName);
    assert.equal(result.body.error.reasonCode, "MEMBERSHIP_NOT_FOUND", actionName);
  }
  assert.equal(policies.length, 0, "nenhuma política comercial foi criada");
  assert.ok(audits.every((entry) => entry.eventType === "actions.override.commercial.denied"), "as negações são registradas");
  assert.equal(audits.length, 5);

  // token de serviço (sem pessoa) nunca se apresenta como decisor humano, mesmo com actions.admin
  const service = await override({ actionName: "MKT", allowed: true }, "service-token");
  assert.equal(service.status, 403);
  assert.equal(service.body.error.reasonCode, "IDENTITY_REQUIRED");
  assert.equal(policies.length, 0);

  // combinação: política já negada não é reaberta por quem só tem actions.admin
  policies.push({ id: "policy-x", tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, actionName: "MKT", allowed: false, maxVersion: null });
  assert.equal((await override({ actionName: "MKT", allowed: true })).status, 403);
  assert.equal(policies[0].allowed, false, "o bloqueio explícito segue valendo");

  // com a autoridade individual vigente: a decisão é registrada ANTES e só então a política muda
  commercialHolders.add("user-a");
  audits.length = 0;
  const authorized = await override({ actionName: "MKT", allowed: true });
  assert.equal(authorized.status, 200);
  assert.equal(policies[0].allowed, true);
  assert.deepEqual(audits.map((entry) => entry.eventType), ["actions.override.commercial.authorized"]);
  assert.equal(audits[0].metadata.decidedBy, "user-a");
  assert.equal(audits[0].metadata.target.designationId, "cad_unit_holder");
  assert.equal(audits[0].tenantId, TENANT_ID);
  assert.equal(audits[0].workspaceId, WORKSPACE_ID);
  assert.equal(JSON.stringify(audits).includes("actions-token"), false, "nenhum token no registro");
  // falha do registro: nada muda
  policies[0].allowed = false;
  auditFails = true;
  const blocked = await override({ actionName: "MKT", allowed: true });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error.code, "COMMERCIAL_DECISION_RECORD_UNAVAILABLE");
  assert.equal(policies[0].allowed, false);
  auditFails = false;

  // negar continua permitido (revogar nunca amplia autoridade) e ações comuns não são afetadas
  commercialHolders.clear();
  assert.equal((await override({ actionName: "MKT", allowed: false })).status, 200);
  assert.equal((await override({ actionName: "ping", allowed: true })).status, 200);
  assert.equal(policies.find((entry) => entry.actionName === "ping")?.allowed, true);
});

test("AUTHZ-SCOPE-1: override falha fechado quando não consegue verificar o efeito comercial", async () => {
  marketplaceReadFails = true;
  const result = await invoke({
    router: actionsRouter,
    method: "post",
    routePath: "/override",
    token: "actions-token",
    body: { actionName: "ping", allowed: true },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, "COMMERCIAL_POLICY_CHECK_UNAVAILABLE");
  assert.equal(policies.length, 0);
  // sem a verificação, negar ainda funciona
  const deny = await invoke({ router: actionsRouter, method: "post", routePath: "/override", token: "actions-token", body: { actionName: "ping", allowed: false } });
  assert.equal(deny.status, 200);
});
