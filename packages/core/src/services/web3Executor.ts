import { retry } from "../utils/retry";
import { TxStore, type TxStoreEntry, type TxStorePrismaLike } from "./txStore";

export type Web3ExecutionStatus = "submitted" | "confirmed" | "failed";

export type Web3ExecutionResult = {
  txId: string;
  nonce: string;
  status: Web3ExecutionStatus;
  chainId: number | null;
  receipt: Record<string, unknown> | null;
};

type JsonRpcSuccess = { jsonrpc: "2.0"; id: number; result: unknown };
type JsonRpcFailure = { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };
type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

type ReceiptCheck = {
  status: "pending" | "confirmed" | "failed";
  receipt: Record<string, unknown> | null;
};

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function toHexWithoutPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function hexToNumber(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  const parsed = Number.parseInt(value.slice(2), 16);
  return Number.isFinite(parsed) ? parsed : null;
}

export class Web3Executor {
  private readonly rpcUrl: string;
  private readonly chainId: number | null;
  private readonly confirmations: number;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly failClosed: boolean;
  private readonly fromAddress: string | null;
  private readonly toAddress: string | null;

  constructor(private readonly txStore: TxStore, config?: {
    rpcUrl?: string;
    chainId?: number | null;
    confirmations?: number;
    pollIntervalMs?: number;
    timeoutMs?: number;
    failClosed?: boolean;
    fromAddress?: string | null;
    toAddress?: string | null;
  }) {
    this.rpcUrl = config?.rpcUrl ?? process.env.WEB3_RPC_URL ?? "";
    this.chainId = config?.chainId ?? envNumber("WEB3_CHAIN_ID", NaN);
    this.confirmations = Math.max(1, config?.confirmations ?? envNumber("WEB3_CONFIRMATIONS", 1));
    this.pollIntervalMs = Math.max(200, config?.pollIntervalMs ?? envNumber("WEB3_POLL_INTERVAL_MS", 1200));
    this.timeoutMs = Math.max(1000, config?.timeoutMs ?? envNumber("WEB3_TIMEOUT_MS", 90_000));
    this.failClosed = config?.failClosed ?? envBool("WEB3_EXECUTOR_FAIL_CLOSED", true);
    this.fromAddress = config?.fromAddress ?? process.env.WEB3_FROM_ADDRESS ?? null;
    this.toAddress = config?.toAddress ?? process.env.WEB3_TO_ADDRESS ?? this.fromAddress;

    if (!this.rpcUrl) {
      throw new Error("WEB3_RPC_URL is required");
    }
  }

  static fromEnv(prisma: TxStorePrismaLike) {
    return new Web3Executor(new TxStore(prisma));
  }

  async submitAndWait(params: {
    tenantId: string;
    workspaceId?: string | null;
    runId: string;
    criticalHash: string;
    idempotencyKey: string;
    nonce: string;
  }): Promise<Web3ExecutionResult> {
    const existing = await this.txStore.latestByIdempotency({
      tenantId: params.tenantId,
      runId: params.runId,
      idempotencyKey: params.idempotencyKey,
    });

    if (existing) {
      if (existing.status === "confirmed") {
        return {
          txId: existing.txId,
          nonce: existing.nonce,
          status: "confirmed",
          chainId: existing.chainId,
          receipt: existing.receipt,
        };
      }
      if (existing.status === "failed" && this.failClosed) {
        throw new Error(`Web3TxFailed:${existing.error ?? "unknown"}`);
      }
      return this.waitForCompletion(existing);
    }

    const txId = await this.submitTransaction(params.criticalHash);
    const submitted = await this.txStore.append({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      idempotencyKey: params.idempotencyKey,
      txId,
      nonce: params.nonce,
      status: "submitted",
      criticalHash: params.criticalHash,
      chainId: Number.isFinite(this.chainId) ? this.chainId : null,
    });

    return this.waitForCompletion(submitted);
  }

  async checkReceipt(txId: string): Promise<ReceiptCheck> {
    const receipt = await this.rpcCall("eth_getTransactionReceipt", [txId]);
    if (!receipt) {
      return { status: "pending", receipt: null };
    }
    const typedReceipt =
      receipt && typeof receipt === "object" && !Array.isArray(receipt)
        ? (receipt as Record<string, unknown>)
        : null;
    if (!typedReceipt) {
      return { status: "pending", receipt: null };
    }

    const statusHex = typedReceipt.status;
    const blockNumberHex = typedReceipt.blockNumber;
    const txBlock = hexToNumber(blockNumberHex);
    const currentBlockHex = await this.rpcCall("eth_blockNumber", []);
    const currentBlock = hexToNumber(currentBlockHex);

    if (txBlock === null || currentBlock === null) {
      return { status: "pending", receipt: typedReceipt };
    }

    const confirmations = currentBlock - txBlock + 1;
    if (confirmations < this.confirmations) {
      return { status: "pending", receipt: typedReceipt };
    }

    if (statusHex === "0x1") {
      return { status: "confirmed", receipt: typedReceipt };
    }

    return { status: "failed", receipt: typedReceipt };
  }

  private async waitForCompletion(entry: TxStoreEntry): Promise<Web3ExecutionResult> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const checked = await this.checkReceipt(entry.txId);
      if (checked.status === "pending") {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        continue;
      }

      const status = checked.status;
      const updated = await this.txStore.append({
        tenantId: entry.tenantId,
        workspaceId: entry.workspaceId,
        runId: entry.runId,
        idempotencyKey: entry.idempotencyKey,
        txId: entry.txId,
        nonce: entry.nonce,
        status,
        criticalHash: entry.criticalHash,
        chainId: entry.chainId,
        receipt: checked.receipt,
        error: status === "failed" ? "receipt_status_failed" : null,
      });

      if (updated.status === "failed" && this.failClosed) {
        throw new Error("Web3TxFailed:receipt_status_failed");
      }

      return {
        txId: updated.txId,
        nonce: updated.nonce,
        status: updated.status,
        chainId: updated.chainId,
        receipt: updated.receipt,
      };
    }

    if (this.failClosed) {
      throw new Error("Web3TxTimeout");
    }

    return {
      txId: entry.txId,
      nonce: entry.nonce,
      status: "submitted",
      chainId: entry.chainId,
      receipt: null,
    };
  }

  private async submitTransaction(criticalHash: string): Promise<string> {
    const data = `0x${toHexWithoutPrefix(criticalHash)}`;
    if (!this.fromAddress || !this.toAddress) {
      throw new Error("WEB3_FROM_ADDRESS and WEB3_TO_ADDRESS are required");
    }

    const gas = process.env.WEB3_GAS_LIMIT;
    const txRequest: Record<string, string> = {
      from: this.fromAddress,
      to: this.toAddress,
      data,
    };
    if (gas) txRequest.gas = gas;

    const response = await retry(
      () => this.rpcCall("eth_sendTransaction", [txRequest]),
      { retries: 3, delayMs: 250, maxDelayMs: 1500 }
    );

    if (typeof response !== "string" || !response.startsWith("0x") || response.length < 10) {
      throw new Error("Invalid transaction hash from RPC");
    }

    return response;
  }

  private async rpcCall(method: string, params: unknown[]): Promise<unknown> {
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };

    const res = await globalThis.fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Web3RpcHttpError:${res.status}`);
    }

    const payload = (await res.json()) as JsonRpcResponse;
    if ("error" in payload) {
      throw new Error(`Web3RpcError:${payload.error.code}:${payload.error.message}`);
    }

    return payload.result;
  }
}
