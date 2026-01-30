export type JsonSchema = Record<string, unknown> | boolean;

export interface ToolContract {
    name: string;
    version: string;
    tenantId: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    executor: "http" | "db" | "web3" | "fs";
    trustLevel: number;
    policyId?: string;
    limits?: { timeoutMs: number; maxCostUsd?: number; maxTokens?: number };
    metadata?: { createdAt: string; createdBy: string; hash?: string; description?: string; tags?: string[] };
    status?: "active" | "deprecated" | "revoked";
}
