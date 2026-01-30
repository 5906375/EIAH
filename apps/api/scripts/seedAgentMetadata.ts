/* eslint-disable no-console */
import { PrismaClient } from "@repo/db/client";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

// Diretório onde estão os perfis dos agentes
const AGENTS_DIR = resolve(process.cwd(), "packages/core/src/actions/agents");
const IGNORED_FILES = new Set(["index.ts", "types.ts", "README.md"]);

type AgentMetadataSeed = {
    agent: string;
    displayName: string;
    description?: string;
    category?: string;
    version?: string;
    trustBaseline?: number;
    sclCritical?: boolean;
    pricingId?: string | null;
};

/**
 * Carrega todos os perfis de agentes do diretório de origem.
 */
async function loadAgentProfiles(): Promise<AgentMetadataSeed[]> {
    const files = (await readdir(AGENTS_DIR)).filter(
        (file) => file.endsWith(".ts") && !IGNORED_FILES.has(file)
    );

    const profiles: AgentMetadataSeed[] = [];
    for (const file of files) {
        const modulePath = pathToFileURL(join(AGENTS_DIR, file)).href;
        const mod = (await import(modulePath)) as Record<string, any>;

        for (const value of Object.values(mod)) {
            if (value && typeof value === "object" && "agent" in value) {
                profiles.push({
                    agent: value.agent,
                    displayName: value.name ?? value.agent,
                    description: value.description ?? null,
                    category: value.category ?? null,
                    version: value.version ?? "1.0.0",
                    trustBaseline: value.trustBaseline ?? 0.85,
                    sclCritical: value.sclCritical ?? false,
                    pricingId: value.pricingId ?? null,
                });
            }
        }
    }

    return profiles;
}

/**
 * Insere ou atualiza os metadados de cada agente.
 */
async function syncAgentMetadata(profiles: AgentMetadataSeed[]) {
    for (const p of profiles) {
        await prisma.agentMetadata.upsert({
            where: { agent: p.agent },
            update: {
                displayName: p.displayName,
                description: p.description,
                category: p.category,
                version: p.version,
                trustBaseline: p.trustBaseline,
                sclCritical: p.sclCritical,
                pricingId: p.pricingId,
            },
            create: {
                agent: p.agent,
                displayName: p.displayName,
                description: p.description,
                category: p.category,
                version: p.version,
                trustBaseline: p.trustBaseline,
                sclCritical: p.sclCritical,
                pricingId: p.pricingId,
            },
        });
        console.log(`✅ Metadado sincronizado: ${p.agent}`);
    }
}

async function main() {
    console.log("🧩 [seed] Iniciando sincronização de AgentMetadata...");

    const profiles = await loadAgentProfiles();
    if (profiles.length === 0) {
        console.warn("⚠️ Nenhum agente encontrado em", AGENTS_DIR);
        return;
    }

    console.log(`🔍 ${profiles.length} agentes encontrados.`);
    await syncAgentMetadata(profiles);

    console.log("✅ [seed] Sincronização de AgentMetadata concluída.");
}

main()
    .catch((err) => {
        console.error("❌ Erro ao executar seedAgentMetadata:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
