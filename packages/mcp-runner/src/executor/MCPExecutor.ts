import { ToolContract } from "../types/ToolContract.js";
import { validateInput } from "../validator/SchemaValidator.js";
import { MCPCircuitBreaker } from "./MCPCircuitBreaker.js";

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
    const { table, where } = input;

    const { prismaGlobal } = await import("@repo/db");
    const db = prismaGlobal as any;

    const model = db?.[table];
    if (!model || typeof model.findMany !== "function") {
      throw new Error(`Invalid db table/model: ${String(table)}`);
    }

    return await model.findMany({ where });
  }

  private async execWeb3(_input: any) {
    throw new Error("web3 executor not implemented in @repo/mcp-runner yet");
  }

  private async execFs(input: any) {
    const fs = await import("fs/promises");
    return await fs.readFile(input.path, "utf-8");
  }
}
