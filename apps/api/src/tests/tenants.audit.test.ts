import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaGlobal } from "@repo/db";
import { clearAuditProbe, getAuditProbe } from "../audit/auditLogger";

let app: ReturnType<typeof express>;
let signSession: typeof import("../auth/session").signSession;

async function createTestApp() {
  const { tenantsRouter } = await import("../routes/tenants");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api", tenantsRouter);
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

describe("tenant membership audit", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-audit-${suffix}`;
  const workspaceId = `workspace-audit-${suffix}`;
  const adminId = `admin-${suffix}`;
  const memberId = `member-${suffix}`;
  const adminEmail = `admin-${suffix}@example.com`;
  const memberEmail = `member-${suffix}@example.com`;

  beforeAll(async () => {
    process.env.AUDIT_PROBE = "1";
    const sessionModule = await import("../auth/session");
    signSession = sessionModule.signSession;
    app = await createTestApp();

    await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.user.create({
      data: { id: adminId, tenantId, email: adminEmail, displayName: "Admin" },
    });
    await prismaGlobal.user.create({
      data: { id: memberId, tenantId, email: memberEmail, displayName: "Member" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId: adminId, role: "TENANT_ADMIN", status: "ACTIVE" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId: memberId, role: "TENANT_VIEWER", status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId } });
    await prismaGlobal.tenantMembership.deleteMany({ where: { tenantId } });
    await prismaGlobal.user.deleteMany({ where: { id: { in: [adminId, memberId] } } });
    await prismaGlobal.workspace.deleteMany({ where: { id: workspaceId } });
    await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  });

  it("records audit on membership status change", async () => {
    clearAuditProbe();
    const membership = await prismaGlobal.tenantMembership.findFirst({
      where: { tenantId, userId: memberId },
    });
    expect(membership).toBeTruthy();

    const cookie = cookieFor({
      userId: adminId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    await request(app)
      .patch(`/api/tenants/${tenantId}/members/${membership!.id}`)
      .set("Cookie", cookie)
      .send({ status: "SUSPENDED" })
      .expect(200);

    const auditEvents = getAuditProbe();
    const statusEvent = auditEvents.find((event) => event.eventType === "membership.status_change");
    expect(statusEvent).toBeTruthy();
  });
});
