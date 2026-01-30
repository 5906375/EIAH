import { Prisma } from "@repo/db";
import { EmbeddingChunkSchema } from "../../types";
import type { MemoryScope, VectorMemoryStore } from "../index";

type EmbeddingChunkRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  chunkKey: string;
  embedding: number[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type EmbeddingChunkDelegate = {
  upsert(args: {
    where: {
      tenantId_workspaceId_agentId_chunkKey: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        chunkKey: string;
      };
    };
    create: Omit<EmbeddingChunkRow, "id" | "createdAt" | "updatedAt">;
    update: {
      embedding: number[];
      metadata?: Record<string, unknown> | null;
      updatedAt?: Date;
    };
  }): Promise<EmbeddingChunkRow>;
  findMany(args: {
    where: {
      tenantId: string;
      workspaceId: string;
      agentId: string;
    };
    take?: number;
    orderBy?: { updatedAt: "asc" | "desc" };
  }): Promise<EmbeddingChunkRow[]>;
};

type PrismaClientLike = {
  embeddingChunk: EmbeddingChunkDelegate;
  $queryRaw?: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]) => Promise<T>;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const minLength = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLength; i += 1) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class PostgresVectorMemoryStore implements VectorMemoryStore {
  private readonly candidateMultiplier: number;
  private readonly metrics: (name: string, value: number, labels?: Record<string, string>) => void;
  private readonly indexType: string;
  private readonly vectorColumn: string;
  private pgvectorAvailable: boolean;

  constructor(
    private readonly prisma: PrismaClientLike,
    options: {
      candidateMultiplier?: number;
      metrics?: (name: string, value: number, labels?: Record<string, string>) => void;
      indexType?: "hnsw" | "ivfflat" | "none";
      vectorColumn?: string;
      pgvectorAvailable?: boolean;
    } = {}
  ) {
    this.candidateMultiplier = options.candidateMultiplier ?? 5;
    this.metrics = options.metrics ?? (() => undefined);
    this.indexType = options.indexType ?? "none";
    this.vectorColumn = options.vectorColumn ?? "embedding";
    this.pgvectorAvailable = options.pgvectorAvailable ?? true;
  }

  async upsert(
    scope: MemoryScope,
    vectors: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> | undefined }>
  ): Promise<void> {
    if (vectors.length === 0) return;

    await Promise.all(
      vectors.map((vector) =>
        this.prisma.embeddingChunk.upsert({
          where: {
            tenantId_workspaceId_agentId_chunkKey: {
              tenantId: scope.tenantId,
              workspaceId: scope.workspaceId,
              agentId: scope.agentId,
              chunkKey: vector.key,
            },
          },
          create: {
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            agentId: scope.agentId,
            chunkKey: vector.key,
            embedding: vector.values,
            metadata: vector.metadata ?? null,
          },
          update: {
            embedding: vector.values,
            metadata: vector.metadata ?? null,
            updatedAt: new Date(),
          },
        })
      )
    );
  }

  async search(
    scope: MemoryScope,
    params: { query: number[]; topK: number }
  ): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>> {
    if (params.topK <= 0) {
      return [];
    }

    if (!this.pgvectorAvailable || !this.prisma.$queryRaw) {
      return this.searchInMemory(scope, params, { reason: "pgvector_unavailable" });
    }

    const startedAt = Date.now();
    try {
      const embeddingLiteral = `[${params.query.join(",")}]`;
      const rows = await this.prisma.$queryRaw<
        Array<{ chunk_key: string; metadata: Record<string, unknown> | null; score: number }>
      >(
        Prisma.sql`
          SELECT chunk_key, metadata,
                 1 - (${Prisma.raw(this.vectorColumn)} <=> ${embeddingLiteral}::vector) AS score
          FROM embedding_chunks
          WHERE tenant_id = ${scope.tenantId}
            AND workspace_id = ${scope.workspaceId}
            AND agent_id = ${scope.agentId}
          ORDER BY ${Prisma.raw(this.vectorColumn)} <=> ${embeddingLiteral}::vector
          LIMIT ${params.topK}
        `
      );

      this.metrics("memory_pgvector_latency_ms", Date.now() - startedAt, { source: "pgvector" });
      this.metrics("memory_pgvector_candidates", rows.length, { source: "pgvector" });
      this.metrics("memory_pgvector_index_type", 1, { type: this.indexType });

      return rows.map((row) => ({
        key: row.chunk_key,
        score: row.score,
        metadata: row.metadata ?? undefined,
      }));
    } catch (_error) {
      this.pgvectorAvailable = false;
      this.metrics("memory_pgvector_latency_ms", Date.now() - startedAt, { source: "fallback" });
      this.metrics("memory_pgvector_index_type", 1, { type: "fallback" });
      return this.searchInMemory(scope, params, { reason: "pgvector_error" });
    }
  }

  private async searchInMemory(
    scope: MemoryScope,
    params: { query: number[]; topK: number },
    meta?: { reason?: string }
  ): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>> {
    const maxCandidates = Math.max(params.topK * this.candidateMultiplier, params.topK);
    const candidates = await this.prisma.embeddingChunk.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        agentId: scope.agentId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: maxCandidates,
    });

    const results = candidates
      .map((row) => {
        const parsed = EmbeddingChunkSchema.parse({
          ...row,
          metadata: row.metadata ?? undefined,
        });
        return {
          key: parsed.chunkKey,
          score: cosineSimilarity(parsed.embedding, params.query),
          metadata: parsed.metadata ?? undefined,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);

    this.metrics("memory_pgvector_candidates", candidates.length, {
      source: "fallback",
      reason: meta?.reason ?? "unknown",
    });

    return results;
  }
}
