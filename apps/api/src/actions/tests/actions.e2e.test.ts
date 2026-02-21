import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";
import crypto from "node:crypto";
import app from "../../index";
import { prismaGlobal } from "@repo/db";

const request = supertest(app);

describe("actions e2e", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-actions-${suffix}`;
  const workspaceId = `workspace-actions-${suffix}`;
  const userId = `user-actions-${suffix}`;
  const email = `user-actions-${suffix}@example.com`;
  const tokenValue = `tok_${crypto.randomBytes(12).toString("hex")}`;
  const authHeader = `Bearer ${tokenValue}`;

  beforeAll(async () => {
    await prismaGlobal.tenant.create({
      data: { id: tenantId, name: tenantId },
    });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.user.create({
      data: { id: userId, tenantId, email, displayName: "Actions Tester" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId, role: "TENANT_ADMIN", status: "ACTIVE" },
    });
    await prismaGlobal.apiToken.create({
      data: {
        token: tokenValue,
        tenantId,
        workspaceId,
        userId,
        description: "actions test token",
      },
    });
    await prismaGlobal.actionRegistry.deleteMany({});
    await prismaGlobal.tenantActionPolicy.deleteMany({});
  });

  afterAll(async () => {
    await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId } });
    await prismaGlobal.guardrailLedger.deleteMany({ where: { tenantId } });
    await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId } });
    await prismaGlobal.apiToken.deleteMany({ where: { token: tokenValue } });
    await prismaGlobal.tenantMembership.deleteMany({ where: { userId } });
    await prismaGlobal.user.deleteMany({ where: { id: userId } });
    await prismaGlobal.workspace.deleteMany({ where: { id: workspaceId } });
    await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
    await prismaGlobal.$disconnect();
  });

  it("GET /api/actions retorna vazio inicialmente", async () => {
    const res = await request
      .get("/api/actions")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.versions.length).toBe(0);
  });

  it("POST /api/actions/version registra nova versão", async () => {
    const res = await request
      .post("/api/actions/version")
      .set("Authorization", authHeader)
      .send({
      version: 1,
      actions: {
        ping: { description: "Ping test", schema: { type: "object" } },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /api/actions lista versão registrada", async () => {
    const res = await request
      .get("/api/actions")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.versions.length).toBe(1);
    expect(res.body.versions[0].name).toBe("ping");
  });

  it("POST /api/actions/override cria override por tenant", async () => {
    const res = await request
      .post("/api/actions/override")
      .set("Authorization", authHeader)
      .send({
      tenantId,
      actionName: "ping",
      allowed: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE /api/actions/version remove versão", async () => {
    const res = await request
      .delete("/api/actions/version/1")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const list = await request
      .get("/api/actions")
      .set("Authorization", authHeader);
    expect(list.body.versions.length).toBe(0);
  });
});
