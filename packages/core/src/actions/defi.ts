import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  rateLimit,
  requireIdempotency,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";

export type RegisterDefiActionsOptions = {
  idempotencyStore: IdempotencyStore;
  rateLimiter: RateLimiter;
};

const broadcastInputSchema = z.object({
  chainId: z.number().int().positive(),
  transactionHex: z.string().min(10),
  retryToken: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const broadcastOutputSchema = z.object({
  txId: z.string(),
  submittedAt: z.date(),
  relay: z.string(),
});

const rebalanceInputSchema = z.object({
  strategyId: z.string().min(1),
  walletAddress: z.string().min(1),
  targetAllocation: z
    .record(z.number())
    .refine(
      (value) => Object.keys(value ?? {}).length > 0,
      "targetAllocation must include at least one asset"
    ),
  dryRun: z.boolean().default(false),
});

const rebalanceOutputSchema = z.object({
  status: z.enum(["scheduled", "executed"]),
  summary: z.string(),
  changes: z.array(
    z.object({
      asset: z.string(),
      delta: z.number(),
    })
  ),
});

export function registerDefiActions(options: RegisterDefiActionsOptions) {
  registerAction({
    name: "defi.broadcastTransaction",
    description: "Broadcast a pre-signed transaction to the network.",
    version: "1.1.0",
    contract: {
      input: broadcastInputSchema,
      output: broadcastOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) =>
          [
            "defi",
            "broadcast",
            context.workspaceId,
            (context.input as z.infer<typeof broadcastInputSchema>)?.retryToken ??
              context.runId,
          ]
            .filter(Boolean)
            .join(":"),
        ttlMs: 10 * 60 * 1000,
        onDuplicateMessage: "Transaction already submitted recently.",
      }),
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["defi", "broadcast", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Transaction broadcast rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = broadcastInputSchema.parse(input);
      logger?.("defi.broadcast.start", { chainId: payload.chainId });
      // TODO: integrate with DeFi gateway
      return {
        status: "success",
        output: broadcastOutputSchema.parse({
          txId: `mock-${Math.random().toString(16).slice(2, 10)}`,
          submittedAt: new Date(),
          relay: "mock-relay",
        }),
      };
    },
  });

  registerAction({
    name: "defi.rebalance",
    description: "Execute a portfolio rebalance strategy.",
    version: "1.0.0",
    contract: {
      input: rebalanceInputSchema,
      output: rebalanceOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["defi", "rebalance", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Rebalance requests rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = rebalanceInputSchema.parse(input);
      logger?.("defi.rebalance.start", {
        strategyId: payload.strategyId,
        dryRun: payload.dryRun,
      });
          const entries = Object.entries(payload.targetAllocation) as Array<[string, number]>;
          return {
            status: "success",
            output: rebalanceOutputSchema.parse({
              status: payload.dryRun ? "scheduled" : "executed",
              summary: payload.dryRun
                ? "Dry run completed; allocation plan available."
                : "Rebalance executed successfully.",
              changes: entries.map(([asset, delta]) => ({
                asset,
                delta,
              })),
            }),
          };
        },
      });
}
