import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , tenantId, workspaceId, userEmail] = process.argv;

  if (!tenantId || !workspaceId) {
    console.error("Usage: pnpm tsx scripts/createApiToken.ts <tenantId> <workspaceId> [userEmail]");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`Tenant ${tenantId} not found.`);
    process.exit(1);
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.tenantId !== tenantId) {
    console.error(`Workspace ${workspaceId} not found for tenant ${tenantId}.`);
    process.exit(1);
  }

  let userId: string | undefined;
  if (userEmail) {
    const user = await prisma.user.findFirst({
      where: { tenantId, email: userEmail },
    });

    if (!user) {
      console.error(`User ${userEmail} not found in tenant ${tenantId}.`);
      process.exit(1);
    }

    userId = user.id;
  }

  const token = `tok_${randomBytes(24).toString("hex")}`;

  const created = await prisma.apiToken.create({
    data: {
      token,
      tenantId,
      workspaceId,
      userId,
      description: userEmail ? `CLI token for ${userEmail}` : "CLI token",
    },
  });

  console.log(
    JSON.stringify(
      {
        token: created.token,
        tokenId: created.id,
        tenantId: created.tenantId,
        workspaceId: created.workspaceId,
        userId: created.userId,
        expiresAt: created.expiresAt,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("Failed to create token:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
