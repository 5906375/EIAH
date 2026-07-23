import crypto from "node:crypto";
import { ToolRegistry, MCPExecutor } from "@repo/mcp-runner";
import { recordGuardrailAudit } from "@eiah/core";
type TenantPrismaClient = any;

export type ExecuteWithMcpParams = {
  prisma: TenantPrismaClient;
  tenantId: string;
  workspaceId: string;
  runId?: string;
  actionName: string;
  version: string;
  payload: unknown;
};

export async function executeWithMCP(params: ExecuteWithMcpParams) {
  const tool = await ToolRegistry.get(params.actionName, params.version, params.tenantId);
  if (!tool) {
    throw new Error(`ToolContract missing: ${params.actionName}@${params.version}`);
  }

  const executor = new MCPExecutor(tool);
  const result = await executor.run(params.payload, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });

  const hash = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");

  await recordGuardrailAudit({
    prisma: params.prisma as any,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId ?? null,
    eventType: "mcp.tool.executed",
    severity: "info",
    message: `Executed tool ${params.actionName}@${params.version}`,
    metadata: {
      tool: params.actionName,
      version: params.version,
      trustLevel: tool.trustLevel,
      hash,
    },
  });

  return { result, tool, hash };
}
