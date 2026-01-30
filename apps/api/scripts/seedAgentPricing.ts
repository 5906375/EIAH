import { PrismaClient } from "@prisma/client";
import type { AgentProfileSeed } from "../src/agents/types";
import { agentProfiles } from "../src/agents/registry";

const prisma = new PrismaClient();

const DEFAULT_PRICING = {
  perRunCents: 240,
  perMBcents: 0,
};

const PRICING_OVERRIDES: Partial<Record<string, { perRunCents: number; perMBcents: number }>> = {
  guardian: { perRunCents: 240, perMBcents: 0 },
};

async function upsertPricing(profile: AgentProfileSeed) {
  const desired = PRICING_OVERRIDES[profile.agent] ?? DEFAULT_PRICING;
  const existing = await prisma.pricing.findFirst({
    where: { agent: profile.agent, active: true },
  });

  if (existing) {
    await prisma.pricing.update({
      where: { id: existing.id },
      data: {
        perRunCents: desired.perRunCents,
        perMBcents: desired.perMBcents,
      },
    });
    console.info(`Pricing atualizado: ${profile.agent}`);
  } else {
    await prisma.pricing.create({
      data: {
        agent: profile.agent,
        perRunCents: desired.perRunCents,
        perMBcents: desired.perMBcents,
      },
    });
    console.info(`Pricing criado: ${profile.agent}`);
  }
}

async function main() {
  for (const profile of agentProfiles) {
    await upsertPricing(profile);
  }
}

main()
  .catch((error) => {
    console.error("Falha ao sincronizar pricing:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
