import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  rateLimit,
  requireIdempotency,
  type IdempotencyStore,
  type RateLimiter,
} from "./guardrails";

export type RegisterKnowledgeActionsOptions = {
  idempotencyStore: IdempotencyStore;
  rateLimiter: RateLimiter;
};

const storeInputSchema = z.object({
  memoryType: z.enum(["conversation", "document", "embedding"]),
  key: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  embeddings: z.array(z.number()).optional(),
});

const storeOutputSchema = z.object({
  stored: z.boolean(),
  version: z.string(),
});

const queryInputSchema = z.object({
  memoryType: z.enum(["conversation", "document", "embedding"]).default("embedding"),
  query: z.string().min(1),
  topK: z.number().int().positive().max(50).default(5),
});

const queryOutputSchema = z.object({
  matches: z.array(
    z.object({
      key: z.string(),
      score: z.number(),
      snippet: z.string(),
    })
  ),
});

export function registerKnowledgeActions(options: RegisterKnowledgeActionsOptions) {
  registerAction({
    name: "knowledge.storeMemory",
    description: "Persist memory payload for later retrieval.",
    version: "1.0.0",
    contract: {
      input: storeInputSchema,
      output: storeOutputSchema,
    },
    guardrails: [
      requireIdempotency({
        store: options.idempotencyStore,
        keyResolver: (context) => {
          const payload = context.input as z.infer<typeof storeInputSchema>;
          return ["memory", payload?.memoryType, payload?.key].filter(Boolean).join(":");
        },
        ttlMs: 60 * 60 * 1000,
        onDuplicateMessage: "Memory payload already stored recently.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = storeInputSchema.parse(input);
      logger?.("knowledge.store.start", {
        memoryType: payload.memoryType,
        key: payload.key,
      });
      // TODO: integrate with memory persistence layer
      return {
        status: "success",
        output: storeOutputSchema.parse({
          stored: true,
          version: `v${Date.now()}`,
        }),
      };
    },
  });

  registerAction({
    name: "knowledge.queryMemory",
    description: "Query stored memory and return top matches.",
    version: "1.0.0",
    contract: {
      input: queryInputSchema,
      output: queryOutputSchema,
    },
    guardrails: [
      rateLimit({
        limiter: options.rateLimiter,
        keyResolver: (context) =>
          ["memory", "query", context.workspaceId ?? context.tenantId ?? "global"].join(
            ":"
          ),
        onLimitExceededMessage: "Memory query rate exceeded.",
      }),
    ],
    handler: async ({ input, logger }) => {
      const payload = queryInputSchema.parse(input);
      logger?.("knowledge.query.start", {
        memoryType: payload.memoryType,
        topK: payload.topK,
      });
      // TODO: integrate with vector search provider
      return {
        status: "success",
        output: queryOutputSchema.parse({
          matches: Array.from({ length: payload.topK }).map((_, index) => ({
            key: `memory-${index + 1}`,
            score: Math.max(0, 0.9 - index * 0.1),
            snippet: `Mock snippet ${index + 1} for query "${payload.query}"`,
          })),
        }),
      };
    },
  });
}
