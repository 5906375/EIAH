import { prismaGlobal } from "@repo/db";
import bcrypt from "bcryptjs";

type CliOptions = {
  email?: string;
  password?: string;
  tenantId?: string;
  workspaceId?: string;
  fullName?: string;
  role?: string;
};

function resolveTenantRole(role?: string) {
  const raw = (role ?? "tenant_admin").trim().toLowerCase();
  if (raw === "tenant_operator" || raw === "operator") return "TENANT_OPERATOR";
  if (raw === "tenant_viewer" || raw === "viewer") return "TENANT_VIEWER";
  return "TENANT_ADMIN";
}

function parseArgs(): CliOptions {
  const options: CliOptions = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const [key, valueFromEq] = arg.split("=", 2);
    const normalized = key.replace(/^--/, "");
    const nextValue = valueFromEq ?? args[i + 1];
    if (valueFromEq === undefined && nextValue && !nextValue.startsWith("--")) {
      i += 1;
    }
    const value = valueFromEq ?? nextValue;
    switch (normalized) {
      case "email":
        options.email = value;
        break;
      case "password":
        options.password = value;
        break;
      case "tenantId":
      case "tenant-id":
        options.tenantId = value;
        break;
      case "workspaceId":
      case "workspace-id":
        options.workspaceId = value;
        break;
      case "fullName":
      case "full-name":
        options.fullName = value;
        break;
      case "role":
        options.role = value;
        break;
      default:
        break;
    }
  }
  return options;
}

async function main() {
  const { email, password, tenantId, workspaceId, fullName, role } = parseArgs();
  if (!email || !password || !tenantId || !workspaceId) {
    throw new Error(
      "Usage: pnpm tsx scripts/createUser.ts --email <email> --password <pass> --tenantId <tenant> --workspaceId <workspace> [--fullName <name>] [--role <role>]"
    );
  }

  const tenant = await prismaGlobal.tenant.upsert({
    where: { id: tenantId },
    update: { name: tenantId },
    create: { id: tenantId, name: tenantId },
  });
  const workspace = await prismaGlobal.workspace.upsert({
    where: { id: workspaceId },
    update: { name: workspaceId, tenantId: tenant.id },
    create: { id: workspaceId, name: workspaceId, tenantId: tenant.id },
  });

  const hashed = await bcrypt.hash(password, 10);
  const user = await prismaGlobal.user.upsert({
    where: { email },
    update: { passwordHash: hashed, tenantId },
    create: {
      email,
      tenantId,
      displayName: fullName ?? null,
      passwordHash: hashed,
    },
  });

  const membershipRole = resolveTenantRole(role);
  await prismaGlobal.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { role: membershipRole },
    create: {
      tenantId,
      userId: user.id,
      role: membershipRole,
      status: "ACTIVE",
    },
  });

  const profile = await prismaGlobal.userProfile.create({
    data: {
      groupId: `user:${user.id}`,
      userId: user.id,
      fullName: fullName ?? null,
      email,
      role: role ?? "tenant_admin",
      tenantId,
      workspaceId,
    },
  });

  console.log(JSON.stringify({ userId: user.id, profileId: profile.id }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prismaGlobal.$disconnect();
  });
