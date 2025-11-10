/* eslint-disable no-console */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { agentProfiles } from "../src/agents/registry";

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = process.env.SEED_TENANT_ID ?? "tenant-demo";
const DEFAULT_WORKSPACE_ID = process.env.SEED_WORKSPACE_ID ?? "workspace-demo";
const DEFAULT_USER_EMAIL = process.env.SEED_USER_EMAIL ?? "demo@eiah.ai";
const DEFAULT_USER_NAME = process.env.SEED_USER_NAME ?? "Demo User";
const DEFAULT_TOKEN_DESCRIPTION = "Seed API token";

type SeedContext = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  apiToken: string;
};

async function seedCoreTenant(prisma: PrismaClient): Promise<SeedContext> {
  const tenant = await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: { name: "Demo Tenant" },
    create: { id: DEFAULT_TENANT_ID, name: "Demo Tenant" },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: DEFAULT_WORKSPACE_ID },
    update: { name: "Demo Workspace", tenantId: tenant.id },
    create: {
      id: DEFAULT_WORKSPACE_ID,
      tenantId: tenant.id,
      name: "Demo Workspace",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: { tenantId: tenant.id, displayName: DEFAULT_USER_NAME },
    create: {
      tenantId: tenant.id,
      email: DEFAULT_USER_EMAIL,
      displayName: DEFAULT_USER_NAME,
    },
  });

  const seededToken =
    process.env.SEED_API_TOKEN ?? `seed_${randomBytes(16).toString("hex")}`;

  const apiToken = await prisma.apiToken.upsert({
    where: { token: seededToken },
    update: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: user.id,
      description: DEFAULT_TOKEN_DESCRIPTION,
      revoked: false,
    },
    create: {
      token: seededToken,
      tenantId: tenant.id,
      workspaceId: workspace.id,
      userId: user.id,
      description: DEFAULT_TOKEN_DESCRIPTION,
    },
  });

  console.log(
    `  • Tenant: ${tenant.name} (${tenant.id})\n` +
      `    Workspace: ${workspace.name} (${workspace.id})\n` +
      `    User: ${user.email} (${user.id})\n` +
      `    API Token: ${apiToken.token}`
  );

  return {
    tenantId: tenant.id,
    workspaceId: workspace.id,
    userId: user.id,
    apiToken: apiToken.token,
  };
}

async function seedPricing(prisma: PrismaClient) {
  const pricingPlans = [
    {
      id: "pricing-fin-nexus",
      agent: "fin-nexus",
      perRunCents: 320,
      perMBcents: 18,
      active: true,
    },
    {
      id: "pricing-flow-orchestrator",
      agent: "flow-orchestrator",
      perRunCents: 250,
      perMBcents: 15,
    },
    {
      id: "pricing-risk-analyzer",
      agent: "risk-analyzer",
      perRunCents: 180,
      perMBcents: 8,
    },
    {
      id: "pricing-onchain-monitor",
      agent: "onchain-monitor",
      perRunCents: 120,
      perMBcents: 5,
    },
    {
      id: "pricing-i-bc",
      agent: "I_BC",
      perRunCents: 150,
      perMBcents: 5,
    },
    {
      id: "pricing-diarias",
      agent: "Diarias",
      perRunCents: 200,
      perMBcents: 10,
    },
    {
      id: "pricing-nft-py",
      agent: "NFT_PY",
      perRunCents: 220,
      perMBcents: 12,
    },
    {
      id: "pricing-image-nft-diarias",
      agent: "ImageNFTDiarias",
      perRunCents: 260,
      perMBcents: 15,
    },
    {
      id: "pricing-defi-1",
      agent: "DeFi_1",
      perRunCents: 280,
      perMBcents: 18,
    },
    {
      id: "pricing-pitch",
      agent: "Pitch",
      perRunCents: 190,
      perMBcents: 7,
    },
    {
      id: "pricing-mkt",
      agent: "MKT",
      perRunCents: 210,
      perMBcents: 9,
    },
    {
      id: "pricing-j360",
      agent: "J_360",
      perRunCents: 230,
      perMBcents: 11,
    },
    {
      id: "pricing-eiah",
      agent: "EIAH",
      perRunCents: 170,
      perMBcents: 6,
    },
    {
      id: "pricing-guardian",
      agent: "guardian",
      perRunCents: 240,
      perMBcents: 12,
    },
  ];

  for (const plan of pricingPlans) {
    await prisma.pricing.upsert({
      where: { id: plan.id },
      update: {
        agent: plan.agent,
        perRunCents: plan.perRunCents,
        perMBcents: plan.perMBcents,
        active: true,
      },
      create: {
        id: plan.id,
        agent: plan.agent,
        perRunCents: plan.perRunCents,
        perMBcents: plan.perMBcents,
        active: true,
      },
    });
  }
}

async function seedAgentProfiles(prisma: PrismaClient) {
  for (const profile of agentProfiles) {
    await prisma.agentProfile.upsert({
      where: { agent: profile.agent },
      update: {
        name: profile.name,
        description: profile.description,
        model: profile.model,
        systemPrompt: profile.systemPrompt,
        tools: profile.tools,
      },
      create: profile,
    });
  }
}

async function seedPlanQuota(workspaceId: string) {
  await prisma.planQuota.upsert({
    where: { projectId: workspaceId },
    update: {},
    create: {
      projectId: workspaceId,
      softLimitCents: 500_00,
      hardLimitCents: 1_000_00,
    },
  });
}

async function resetMemoryArtifacts(context: SeedContext) {
  console.log("[seed] Resetting memory artifacts...");
  await prisma.memoryEvent.deleteMany({
    where: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
    },
  });
  await prisma.embeddingChunk.deleteMany({
    where: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
    },
  });
  await prisma.memorySnapshot.deleteMany({
    where: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
    },
  });

  const agents = await prisma.agentProfile.findMany({
    select: { agent: true },
  });

  for (const agentProfile of agents) {
    await prisma.memorySnapshot.upsert({
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId,
          agentId: agentProfile.agent,
        },
      },
      update: {
        shortTerm: [],
        longTerm: [],
        vectorState: { matches: [] },
        cursor: null,
      },
      create: {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        agentId: agentProfile.agent,
        shortTerm: [],
        longTerm: [],
        vectorState: { matches: [] },
      },
    });
  }
}

async function main() {
  console.log("[seed] Seeding database...");
  const coreContext = await seedCoreTenant(prisma);
  await seedPricing(prisma);
  await seedAgentProfiles(prisma);
  await resetMemoryArtifacts(coreContext);
  await seedPlanQuota(coreContext.workspaceId);
  console.log("[seed] Seed completed.");
}
main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



