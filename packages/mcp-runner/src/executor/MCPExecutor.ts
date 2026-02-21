import { ToolContract } from "../types/ToolContract";
import { validateInput } from "../validator/SchemaValidator";
import { MCPCircuitBreaker } from "./MCPCircuitBreaker";

type DbPolicyViolationEvent = {
  eventType: "mcp.db_executor.denied";
  reasonCode:
    | "DB_EXECUTOR_DISABLED"
    | "DB_CONTEXT_MISSING"
    | "DB_MISSING_ACTOR"
    | "DB_MODE_INVALID"
    | "DB_TABLE_DENIED"
    | "DB_OPERATION_DENIED";
  message: string;
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  runId?: string;
  requestId?: string;
  table?: string;
  operation?: string;
  missingActor?: boolean;
};

type MCPExecutorOptions = {
  onDbPolicyViolation?: (event: DbPolicyViolationEvent) => Promise<void> | void;
  incrementMetric?: (name: string, labels?: Record<string, string>) => Promise<void> | void;
};

type DbExecutionContext = {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  runId?: string;
  requestId?: string;
  reason: string;
  toolContractVersion: string;
};

export class MCPExecutor {
  constructor(
    private contract: ToolContract,
    private options: MCPExecutorOptions = {}
  ) {}

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

  async run(input: any): Promise<any> {
    validateInput(this.contract, input);

    return this.breaker.execute(async () => {
      const execution = (async () => {
        switch (this.contract.executor) {
          case "http":
            return this.execHttp(input);
          case "db":
            return this.execDb(input);
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

  private async execDb(input: any) {
    const enabledRaw = (process.env.MCP_DB_EXECUTOR_ENABLED ?? "false").trim().toLowerCase();
    const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "on";
    const modeRaw = (process.env.MCP_DB_EXECUTOR_MODE ?? "").trim().toLowerCase();
    const mode = modeRaw || (enabled ? "scoped" : "disabled");

    if (mode !== "disabled" && mode !== "scoped" && mode !== "legacy") {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_MODE_INVALID",
        message: `Unsupported MCP_DB_EXECUTOR_MODE: ${mode}`,
        tenantId: this.contract.tenantId,
      });
      throw new Error("MCP db executor denied by policy");
    }

    if (!enabled || mode === "disabled") {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_EXECUTOR_DISABLED",
        message: "MCP db executor is disabled by feature flag",
        tenantId: this.contract.tenantId,
      });
      throw new Error("MCP db executor denied by policy");
    }

    const { table, where, operation } = input ?? {};
    const op = typeof operation === "string" && operation.trim() ? operation.trim() : "findMany";
    const context = this.readDbContext(input);

    if (!context) {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_CONTEXT_MISSING",
        message: "MCP db executor requires tenant/workspace/actor/run context",
        tenantId: this.contract.tenantId,
      });
      throw new Error("MCP db executor denied by policy");
    }

    if (!context.actorId) {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_MISSING_ACTOR",
        message: "MCP db executor requires actorId; adapter must provide actorId",
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        runId: context.runId,
        requestId: context.requestId,
        table: typeof table === "string" ? table : undefined,
        operation: op,
        missingActor: true,
      });
      throw new Error("MCP_DB_EXECUTOR_DENIED_MISSING_ACTOR");
    }

    if (mode !== "legacy" && context.tenantId !== this.contract.tenantId) {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_CONTEXT_MISSING",
        message: "Tenant context mismatch between tool contract and request",
        tenantId: this.contract.tenantId,
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        runId: context.runId,
        requestId: context.requestId,
        table: typeof table === "string" ? table : undefined,
      });
      throw new Error("MCP db executor denied by policy");
    }

    if (op !== "findMany" && op !== "findFirst") {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_OPERATION_DENIED",
        message: `Operation '${op}' is not allowed for MCP db executor`,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        runId: context.runId,
        requestId: context.requestId,
        table: typeof table === "string" ? table : undefined,
        operation: op,
      });
      throw new Error("MCP db executor denied by policy");
    }

    const allowlist = (process.env.MCP_DB_EXECUTOR_MODEL_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const allowlistSet = new Set(allowlist);

    if (mode !== "legacy" && (typeof table !== "string" || !allowlistSet.has(table))) {
      await this.emitDbPolicyViolation({
        eventType: "mcp.db_executor.denied",
        reasonCode: "DB_TABLE_DENIED",
        message: `Model '${String(table)}' is not in MCP db allowlist`,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        runId: context.runId,
        requestId: context.requestId,
        table: typeof table === "string" ? table : undefined,
        operation: op,
      });
      throw new Error("MCP db executor denied by policy");
    }

    const { prismaGlobal } = await import("@repo/db");
    const db = prismaGlobal as any;

    const model = db?.[table];
    if (!model || typeof model.findMany !== "function") {
      throw new Error(`Invalid db table/model: ${String(table)}`);
    }

    if (mode === "legacy") {
      return op === "findFirst"
        ? model.findFirst({ where })
        : model.findMany({ where });
    }

    const scopedWhere = {
      AND: [
        where ?? {},
        { tenantId: context.tenantId },
        { workspaceId: context.workspaceId },
      ],
    };

    return op === "findFirst"
      ? model.findFirst({ where: scopedWhere })
      : model.findMany({ where: scopedWhere });
  }

  private async execWeb3(_input: any) {
    throw new Error("web3 executor not implemented in @repo/mcp-runner yet");
  }

  private async execFs(input: any) {
    const fs = await import("fs/promises");
    return await fs.readFile(input.path, "utf-8");
  }

  private readDbContext(input: any): DbExecutionContext | null {
    const ctx = input?.context;
    if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return null;
    const context = ctx as Partial<DbExecutionContext>;
    if (
      typeof context.tenantId !== "string" ||
      typeof context.workspaceId !== "string" ||
      typeof context.reason !== "string" ||
      typeof context.toolContractVersion !== "string"
    ) {
      return null;
    }
    const actorId = typeof context.actorId === "string" ? context.actorId : undefined;
    const runId = typeof context.runId === "string" ? context.runId : undefined;
    const requestId = typeof context.requestId === "string" ? context.requestId : undefined;
    return {
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorId,
      runId,
      requestId,
      reason: context.reason,
      toolContractVersion: context.toolContractVersion,
    };
  }

  private async emitDbPolicyViolation(event: DbPolicyViolationEvent) {
    try {
      await this.options.onDbPolicyViolation?.(event);
    } catch {
      // Fallback is intentionally non-throwing to keep policy path deterministic.
    }
    try {
      await this.options.incrementMetric?.("mcp_db_executor_denied_total", {
        reason_code: event.reasonCode,
      });
    } catch {
      // Best-effort metrics.
    }
    console.warn(
      JSON.stringify({
        level: "warn",
        event: event.eventType,
        reasonCode: event.reasonCode,
        tenantId: event.tenantId,
        workspaceId: event.workspaceId ?? null,
        actorId: event.actorId ?? null,
        runId: event.runId ?? null,
        requestId: event.requestId ?? null,
        table: event.table ?? null,
        operation: event.operation ?? null,
        missingActor: event.missingActor ?? false,
        message: event.message,
      })
    );
  }
}
