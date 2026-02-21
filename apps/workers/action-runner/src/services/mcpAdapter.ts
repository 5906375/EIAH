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

  const payloadWithContext = withDbExecutionContext(params.payload, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    toolVersion: tool.version,
  });

  const executor = new MCPExecutor(tool, {
    onDbPolicyViolation: async (event) => {
      await recordGuardrailAudit({
        prisma: params.prisma as any,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId ?? null,
        eventType: event.eventType,
        severity: "warn",
        message: event.message,
        metadata: {
          reasonCode: event.reasonCode,
          missingActor: event.missingActor ?? false,
          actorId: event.actorId ?? null,
          requestId: event.requestId ?? null,
          operation: event.operation ?? null,
          table: event.table ?? null,
        },
      });
    },
  });
  const result = await executor.run(payloadWithContext);

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

function withDbExecutionContext(
  payload: unknown,
  context: { tenantId: string; workspaceId: string; runId?: string; toolVersion: string }
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const input = payload as Record<string, unknown>;
  const executor = typeof input.executor === "string" ? input.executor : null;
  const table = typeof input.table === "string" ? input.table : null;
  const contextValue = input.context;
  if (executor !== "db" && !table) return payload;
  if (contextValue && typeof contextValue === "object" && !Array.isArray(contextValue)) {
    return payload;
  }

  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};

  const actorId =
    (typeof metadata.actorId === "string" && metadata.actorId) ||
    (typeof metadata.userId === "string" && metadata.userId) ||
    undefined;
  const requestId =
    (typeof metadata.requestId === "string" && metadata.requestId) ||
    (typeof metadata.correlationId === "string" && metadata.correlationId) ||
    undefined;
  const reason =
    (typeof metadata.reason === "string" && metadata.reason) || "mcp_db_execution";

  return {
    ...input,
    context: {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId,
      runId: context.runId,
      requestId,
      reason,
      toolContractVersion: context.toolVersion,
    },
  };
}
