import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.TENANT_ID ?? "tenant-A";
  const workspaceId = process.env.WORKSPACE_ID ?? "workspace-A";

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: `Tenant ${tenantId}` },
  });

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: { id: workspaceId, tenantId, name: `Workspace ${workspaceId}`, status: "ACTIVE" },
  });

  const users = await Promise.all(
    ["admin", "operator", "viewer"].map((suffix) =>
      prisma.user.upsert({
        where: { email: `${suffix}@example.com` },
        update: {},
        create: {
          tenantId,
          email: `${suffix}@example.com`,
          displayName: `${suffix.toUpperCase()} User`,
        },
      })
    )
  );

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: users[0].id, role: "TENANT_ADMIN", status: "ACTIVE" },
      { tenantId, userId: users[1].id, role: "TENANT_OPERATOR", status: "ACTIVE" },
      { tenantId, userId: users[2].id, role: "TENANT_VIEWER", status: "DISABLED" },
    ],
    skipDuplicates: true,
  });

  const connectorPayload = {
    tenantId,
    workspaceId,
    provider: "demo",
    allowedResources: ["read"],
    limits: { rpm: 60, burst: 20, maxRows: 1000, maxBytes: 1048576 },
    vaultSecretRef: `vault://tenants/${tenantId}/connectors/demo`,
    createdByUserId: users[0].id,
  };

  await prisma.connectorInstance.createMany({
    data: [
      { ...connectorPayload, status: "DRAFT" },
      { ...connectorPayload, status: "ACTIVE" },
      { ...connectorPayload, status: "DISABLED" },
    ],
    skipDuplicates: true,
  });

  const installPayload = {
    tenantId,
    workspaceId,
    agentId: "MKT",
    version: "1.0.0",
    config: { mode: "demo" },
    installedByUserId: users[0].id,
  };

  await prisma.agentInstall.createMany({
    data: [{ ...installPayload, status: "ACTIVE" }],
    skipDuplicates: true,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
