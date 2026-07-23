import type { ToolContract } from "../types/ToolContract.js";

type ToolRegistryDbModule = {
    prisma: {
        toolContract: {
            findFirst(args: unknown): Promise<unknown>;
            findMany(args: unknown): Promise<unknown[]>;
        };
    };
};

const defaultDbModuleLoader = new Function(
    "return import('@repo/db')"
) as () => Promise<ToolRegistryDbModule>;
let loadDbModule = defaultDbModuleLoader;

export function setToolRegistryDbLoaderForTests(
    loader?: () => Promise<ToolRegistryDbModule>
) {
    loadDbModule = loader ?? defaultDbModuleLoader;
}

export class ToolRegistry {
    static async get(name: string, version: string, tenantId: string): Promise<ToolContract | null> {
        const { prisma } = await loadDbModule();
        const record = await prisma.toolContract.findFirst({
            where: { name, version, tenantId, status: "active" },
        });
        return record as ToolContract | null;
    }

    static async list(tenantId: string): Promise<ToolContract[]> {
        const { prisma } = await loadDbModule();
        const records = await prisma.toolContract.findMany({ where: { tenantId } });
        return records as unknown as ToolContract[];
    }
}
