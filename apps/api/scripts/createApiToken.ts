import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { bindLogger, createLogger, ensureTraceId } from "@eiah/core";

const prisma = new PrismaClient();

type CliOptions = {
  tenantId?: string;
  workspaceId?: string;
  userEmail?: string;
  traceId?: string;
};

function parseArgs(): CliOptions {
  const options: CliOptions = {};
  const positional: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const [key, valueFromEq] = arg.split("=", 2);
      const normalizedKey = key.replace(/^--/, "");
      const nextValue = valueFromEq ?? args[i + 1];
      if (valueFromEq === undefined && nextValue && !nextValue.startsWith("--")) {
        i += 1;
      }
      const finalValue = valueFromEq ?? nextValue;
      switch (normalizedKey) {
        case "tenant-id":
        case "tenantId":
          options.tenantId = finalValue;
          break;
        case "workspace-id":
        case "workspaceId":
          options.workspaceId = finalValue;
          break;
        case "user-email":
        case "userEmail":
          options.userEmail = finalValue;
          break;
        case "trace-id":
        case "traceId":
          options.traceId = finalValue;
          break;
        default:
          positional.push(arg);
      }
    } else {
      positional.push(arg);
    }
  }

  if (!options.tenantId && positional[0]) {
    options.tenantId = positional[0];
  }
  if (!options.workspaceId && positional[1]) {
    options.workspaceId = positional[1];
  }
  if (!options.userEmail && positional[2]) {
    options.userEmail = positional[2];
  }

  return options;
}

async function main() {
  const { tenantId, workspaceId, userEmail, traceId } = parseArgs();
  const logger = bindLogger(
    createLogger({ component: "script.createApiToken" }),
    {
      traceId: ensureTraceId(traceId),
      tenantId,
      workspaceId,
    }
  );

  if (!tenantId || !workspaceId) {
    logger.error(
      {
        usage:
          "Usage: pnpm tsx scripts/createApiToken.ts --tenant-id <tenantId> --workspace-id <workspaceId> [--user-email <email>] [--trace-id <trace>]",
      },
      "script.invalid_arguments"
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    logger.error({ tenantId }, "script.tenant_not_found");
    process.exit(1);
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.tenantId !== tenantId) {
    logger.error({ workspaceId }, "script.workspace_not_found");
    process.exit(1);
  }

  let userId: string | undefined;
  if (userEmail) {
    const user = await prisma.user.findFirst({
      where: { tenantId, email: userEmail },
    });

    if (!user) {
      logger.error({ userEmail }, "script.user_not_found");
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

  const output = {
    token: created.token,
    tokenId: created.id,
    tenantId: created.tenantId,
    workspaceId: created.workspaceId,
    userId: created.userId,
    expiresAt: created.expiresAt,
  };
  logger.info({ tokenId: created.id }, "script.token_created");
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main()
  .catch((err) => {
    const logger = createLogger({ component: "script.createApiToken" });
    logger.error({ err }, "script.failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
