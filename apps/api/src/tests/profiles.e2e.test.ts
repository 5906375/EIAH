import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaGlobal } from "@repo/db";
import { clearAuditProbe, getAuditProbe } from "../audit/auditLogger";

let app: ReturnType<typeof express>;
let signSession: typeof import("../auth/session").signSession;

async function createTestApp() {
  const { profilesRouter } = await import("../routes/profiles");
  const { authRouter } = await import("../routes/auth");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api", authRouter);
  expressApp.use("/api", profilesRouter);
  return expressApp;
}

function cookieFor(claims: {
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  activeProfileId: string | null;
  identityType: "password" | "wallet";
}) {
  const token = signSession(claims);
  return `token=${token}`;
}

describe("profiles activate/delete invariants", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-${suffix}`;
  const tenantOther = `tenant-x-${suffix}`;
  const workspaceId = `workspace-${suffix}`;
  const workspaceOther = `workspace-x-${suffix}`;
  const userId = `user-${suffix}`;
  const email = `user-${suffix}@example.com`;

  beforeAll(async () => {
    process.env.APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";
    process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.APP_ORIGIN;
    process.env.AUDIT_PROBE = "1";
    const sessionModule = await import("../auth/session");
    signSession = sessionModule.signSession;
    app = await createTestApp();

    await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prismaGlobal.tenant.create({ data: { id: tenantOther, name: tenantOther } });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.workspace.create({
      data: { id: workspaceOther, tenantId: tenantOther, name: workspaceOther },
    });
    await prismaGlobal.user.create({
      data: { id: userId, tenantId, email, displayName: "Tester" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId, role: "TENANT_ADMIN", status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await prismaGlobal.guardrailAuditLedger.deleteMany({
      where: { tenantId: { in: [tenantId, tenantOther] } },
    });
    await prismaGlobal.guardrailLedger.deleteMany({
      where: { tenantId: { in: [tenantId, tenantOther] } },
    });
    await prismaGlobal.userProfile.deleteMany({ where: { userId } });
    await prismaGlobal.tenantMembership.deleteMany({ where: { userId } });
    await prismaGlobal.user.deleteMany({ where: { id: userId } });
    await prismaGlobal.workspace.deleteMany({ where: { id: { in: [workspaceId, workspaceOther] } } });
    await prismaGlobal.tenant.deleteMany({ where: { id: { in: [tenantId, tenantOther] } } });
  });

  it("activate ok reflects in /auth/me", async () => {
    clearAuditProbe();
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    await request(app)
      .post(`/api/profiles/${profile.id}/activate`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .expect(200);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(200);

    expect(me.body?.data?.tenantId).toBe(tenantId);
    expect(me.body?.data?.workspaceId).toBe(workspaceId);
    expect(me.body?.data?.activeProfileId).toBe(profile.id);

    const auditEvents = getAuditProbe();
    const activateEvent = auditEvents.find((event) => event.eventType === "profile.activate");
    expect(activateEvent).toBeTruthy();
  });

  it("create profile syncs tenant membership role", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post("/api/profiles")
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .send({
        fullName: "Role Sync Create",
        tenantId,
        workspaceId,
        role: "tenant_viewer",
      })
      .expect(201);

    expect(response.body?.ok).toBe(true);

    const membership = await prismaGlobal.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true, status: true },
    });
    expect(membership?.role).toBe("TENANT_VIEWER");
    expect(membership?.status).toBe("ACTIVE");

    await prismaGlobal.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role: "TENANT_ADMIN", status: "ACTIVE" },
    });
  });

  it("update profile syncs tenant membership role", async () => {
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .put(`/api/profiles/${profile.id}`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .send({
        role: "tenant_operator",
      })
      .expect(200);

    expect(response.body?.ok).toBe(true);

    const membership = await prismaGlobal.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true, status: true },
    });
    expect(membership?.role).toBe("TENANT_OPERATOR");
    expect(membership?.status).toBe("ACTIVE");

    await prismaGlobal.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role: "TENANT_ADMIN", status: "ACTIVE" },
    });
  });

  it("activate denies membership_inactive", async () => {
    await prismaGlobal.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { status: "DISABLED" },
    });
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post(`/api/profiles/${profile.id}/activate`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body?.error?.code).toBe("MEMBERSHIP_INACTIVE");
    await prismaGlobal.tenantMembership.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { status: "ACTIVE" },
    });
  });

  it("activate denies workspace_out_of_tenant", async () => {
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId: workspaceOther,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post(`/api/profiles/${profile.id}/activate`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body?.error?.code).toBe("WORKSPACE_TENANT_MISMATCH");
  });

  it("delete denies active profile", async () => {
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: profile.id,
      identityType: "password",
    });

    const response = await request(app)
      .delete(`/api/profiles/${profile.id}`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .expect(409);

    expect(response.body?.error?.code).toBe("CANNOT_DELETE_ACTIVE");
  });

  it("delete denies last profile", async () => {
    await prismaGlobal.userProfile.deleteMany({ where: { userId } });
    const profile = await prismaGlobal.userProfile.create({
      data: {
        groupId: userId,
        userId,
        tenantId,
        workspaceId,
        role: "tenant_admin",
      },
    });

    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId: null,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .delete(`/api/profiles/${profile.id}`)
      .set("Origin", process.env.APP_ORIGIN!)
      .set("Cookie", cookie)
      .expect(409);

    expect(response.body?.error?.code).toBe("CANNOT_DELETE_LAST");
  });
});
