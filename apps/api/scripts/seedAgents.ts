import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import type { AgentProfileSeed } from "../src/agents/types";

const prisma = new PrismaClient();
const AGENTS_DIR = resolve(process.cwd(), "apps/api/src/agents");
const IGNORED_FILES = new Set(["types.ts", "registry.ts", "README.md"]);

async function loadAgentProfiles(): Promise<AgentProfileSeed[]> {
  const files = (await readdir(AGENTS_DIR)).filter(
    (file) => file.endsWith(".ts") && !IGNORED_FILES.has(file)
  );

  const profiles: AgentProfileSeed[] = [];
  for (const file of files) {
    const modulePath = pathToFileURL(join(AGENTS_DIR, file)).href;
    const mod = (await import(modulePath)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (
        value &&
        typeof value === "object" &&
        "agent" in value &&
        "model" in value &&
        "systemPrompt" in value
      ) {
        profiles.push(value as AgentProfileSeed);
      }
    }
  }

  return profiles;
}

async function main() {
  const profiles = await loadAgentProfiles();
  if (profiles.length === 0) {
    console.warn("Nenhum agente encontrado em apps/api/src/agents");
    return;
  }

  for (const profile of profiles) {
    await prisma.agentProfile.upsert({
      where: { agent: profile.agent },
      update: {
        name: profile.name,
        description: profile.description ?? null,
        model: profile.model,
        systemPrompt: profile.systemPrompt,
        tools: (profile.tools as Prisma.JsonValue | undefined) ?? Prisma.JsonNull,
      },
      create: {
        agent: profile.agent,
        name: profile.name,
        description: profile.description ?? null,
        model: profile.model,
        systemPrompt: profile.systemPrompt,
        tools: (profile.tools as Prisma.JsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
    console.info(`Agente sincronizado: ${profile.agent}`);
  }
}

main()
  .catch((error) => {
    console.error("Falha ao sincronizar agentes:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
