# Memory module

This package centralizes memory contracts used by the orchestrator as well as reusable adapters for
short-term, long-term and vectorized persistence.

## Contracts

- `MemoryService` orchestrates reads/writes against the configured stores and exposes helpers for
  ingest/promote/truncate operations.
- `MemorySyncJob` promotes short-term rows into durable storage and can optionally persist the
  latest snapshot through `MemorySnapshotStore` implementations.
- `MemoryRetentionJob` trims short-term buffers based on age/quantity thresholds.

All shapes are validated through the Zod schemas exported from `packages/core/types`.

## Available stores

| Scope       | In-memory mock                  | Durable adapter                                                 |
|-------------|----------------------------------|-----------------------------------------------------------------|
| Short-term  | `InMemoryShortTermMemoryStore`   | `RedisShortTermMemoryStore` (sorted set per tenant/workspace)   |
| Long-term   | `InMemoryLongTermMemoryStore`    | `PostgresLongTermMemoryStore` (persists to Prisma `MemoryEvent`)|
| Vector      | `InMemoryVectorStore`            | `PostgresVectorMemoryStore` (backed by `EmbeddingChunk`)        |
| Snapshots   | _n/a_                            | `PrismaMemorySnapshotStore` (`MemorySnapshot` JSON payload)     |

The Postgres/Prisma stores expect a client/delegate that matches Prisma's generated API. They only
require a very small surface (`createMany`, `findMany`, `upsert`, `findUnique`), which makes it easy
to mock in tests.

## Example wiring

```ts
import { MemoryService, RedisShortTermMemoryStore, PostgresLongTermMemoryStore, PostgresVectorMemoryStore } from "@eiah/core/memory";
import { prisma } from "../prisma/client";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

const memory = new MemoryService({
  shortTermStore: new RedisShortTermMemoryStore(redis),
  longTermStore: new PostgresLongTermMemoryStore(prisma),
  vectorStore: new PostgresVectorMemoryStore(prisma),
});
```
