import { ToolContract } from "../types/ToolContract.js";
import { validateInput } from "../validator/SchemaValidator.js";
import { MCPCircuitBreaker } from "./MCPCircuitBreaker.js";
import {
  MCP_DB_REASON_CODES,
  McpDbPolicyError,
  resolveDbModelAllowlistEntry,
} from "./dbAllowlist.js";

type ExecutorDbModule = { prismaGlobal: Record<string, unknown> };

const defaultDbModuleLoader = new Function(
  "return import('@repo/db')"
) as () => Promise<ExecutorDbModule>;
let loadDbModule = defaultDbModuleLoader;

export function setMcpExecutorDbLoaderForTests(
  loader?: () => Promise<ExecutorDbModule>
) {
  loadDbModule = loader ?? defaultDbModuleLoader;
}

export type MCPExecutionScope = {
  tenantId?: string;
  workspaceId?: string;
  logGlobalDbAccess?: (event: {
    eventType: "mcp.db.global_access";
    model: string;
    tool: string;
    version: string;
  }) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNoDivergentScope(
  value: unknown,
  field: string,
  expected: string
) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoDivergentScope(item, field, expected);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === field && nestedValue !== expected) {
      throw new McpDbPolicyError(
        MCP_DB_REASON_CODES.scopeViolation,
        `DB scope diverges from authenticated context for field ${field}`
      );
    }
    assertNoDivergentScope(nestedValue, field, expected);
  }
}

export class MCPExecutor {
  constructor(private contract: ToolContract) {}

  private static readonly breakers = new Map<string, MCPCircuitBreaker>();

  private get breaker() {
    const key = `${this.contract.tenantId}:${this.contract.name}:${this.contract.version}:${this.contract.executor}`;
    const existing = MCPExecutor.breakers.get(key);
    if (existing) return existing;

    const breaker = new MCPCircuitBreaker({
      failureThreshold: Number(process.env.MCP_CB_FAILURE_THRESHOLD ?? "5"),
      resetTimeoutMs: Number(process.env.MCP_CB_RESET_TIMEOUT_MS ?? "30000"),
    });
    MCPExecutor.breakers.set(key, breaker);
    return breaker;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const ms = timeoutMs ?? this.contract.limits?.timeoutMs;
    if (!ms || !Number.isFinite(ms) || ms <= 0) return promise;

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`MCP executor timeout after ${ms}ms`)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  async run(input: any, scope: MCPExecutionScope = {}): Promise<any> {
    validateInput(this.contract, input);

    return this.breaker.execute(async () => {
      const execution = (async () => {
        switch (this.contract.executor) {
          case "http":
            return this.execHttp(input);
          case "db":
            return this.execDb(input, scope);
          case "web3":
            return this.execWeb3(input);
          case "fs":
            return this.execFs(input);
          default:
            throw new Error(`Unsupported executor: ${this.contract.executor}`);
        }
      })();

      return this.withTimeout(execution);
    });
  }

  private async execHttp(input: any) {
    const res = await fetch(input.url, input.options);

    if (!res.ok) {
      let bodyPreview = "";
      try {
        bodyPreview = (await res.text()).slice(0, 500);
      } catch {
        bodyPreview = "";
      }

      const details = bodyPreview ? ` body="${bodyPreview}"` : "";
      throw new Error(`HTTP executor failed: ${res.status} ${res.statusText}${details}`);
    }

    return await res.json();
  }

  private async execDb(input: any, scope: MCPExecutionScope) {
    const { table, where } = input;
    const modelName = typeof table === "string" ? table : String(table);
    const allowlistEntry = resolveDbModelAllowlistEntry(modelName);
    if (!allowlistEntry || allowlistEntry.readOnly !== true) {
      throw new McpDbPolicyError(
        MCP_DB_REASON_CODES.modelNotAllowlisted,
        `DB model is not allowlisted: ${modelName}`
      );
    }

    if (!isRecord(where ?? {})) {
      throw new McpDbPolicyError(
        MCP_DB_REASON_CODES.scopeViolation,
        "DB where must be an object"
      );
    }

    const governedWhere: Record<string, unknown> = { ...(where ?? {}) };
    if (allowlistEntry.tenantField) {
      if (!scope.tenantId) {
        throw new McpDbPolicyError(
          MCP_DB_REASON_CODES.scopeMissing,
          "Authenticated tenant scope is required for this DB model"
        );
      }
      assertNoDivergentScope(
        governedWhere,
        allowlistEntry.tenantField,
        scope.tenantId
      );
      governedWhere[allowlistEntry.tenantField] = scope.tenantId;
    }

    if (allowlistEntry.workspaceField) {
      if (!scope.workspaceId) {
        throw new McpDbPolicyError(
          MCP_DB_REASON_CODES.scopeMissing,
          "Authenticated workspace scope is required for this DB model"
        );
      }
      assertNoDivergentScope(
        governedWhere,
        allowlistEntry.workspaceField,
        scope.workspaceId
      );
      governedWhere[allowlistEntry.workspaceField] = scope.workspaceId;
    }

    const { prismaGlobal } = await loadDbModule();
    const db = prismaGlobal as any;

    const model = db?.[modelName];
    if (!model || typeof model.findMany !== "function") {
      throw new Error(`Invalid db table/model: ${String(table)}`);
    }

    if (!allowlistEntry.tenantField) {
      const event = {
        eventType: "mcp.db.global_access" as const,
        model: modelName,
        tool: this.contract.name,
        version: this.contract.version,
      };
      if (scope.logGlobalDbAccess) {
        scope.logGlobalDbAccess(event);
      } else {
        console.info(JSON.stringify(event));
      }
    }

    return await model.findMany({ where: governedWhere });
  }

  private async execWeb3(_input: any) {
    throw new Error("web3 executor not implemented in @repo/mcp-runner yet");
  }

  private async execFs(input: any) {
    const fs = await import("fs/promises");
    return await fs.readFile(input.path, "utf-8");
  }
}
