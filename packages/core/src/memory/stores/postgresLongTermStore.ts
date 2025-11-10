import { MemoryRecordSchema } from "../../types";
import type { LongTermMemoryStore, MemoryRecord, MemoryScope } from "../index";

type MemoryEventRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  key: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type MemoryEventDelegate = {
  createMany(args: { data: Array<Omit<MemoryEventRow, "id">> }): Promise<unknown>;
  findMany(args: {
    where: {
      tenantId: string;
      workspaceId: string;
      agentId: string;
      createdAt?: { gte?: Date };
    };
    orderBy?: { createdAt: "asc" | "desc" };
    take?: number;
  }): Promise<MemoryEventRow[]>;
};

type PrismaClientLike = {
  memoryEvent: MemoryEventDelegate;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class PostgresLongTermMemoryStore implements LongTermMemoryStore {
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaClientLike,
    options: { batchSize?: number } = {}
  ) {
    this.batchSize = options.batchSize ?? 100;
  }

  async append(scope: MemoryScope, records: MemoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    const rows = records.map((record) => ({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      agentId: scope.agentId,
      key: record.key,
      content: record.content,
      metadata: record.metadata ?? null,
      createdAt: record.createdAt,
    }));

    const chunks = chunkArray(rows, this.batchSize);
    for (const chunk of chunks) {
      await this.prisma.memoryEvent.createMany({ data: chunk });
    }
  }

  async query(scope: MemoryScope, params: { limit?: number; since?: Date }): Promise<MemoryRecord[]> {
    const rows = await this.prisma.memoryEvent.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        agentId: scope.agentId,
        ...(params.since
          ? {
              createdAt: {
                gte: params.since,
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit ?? 50,
    });

    return rows.map((row) =>
      MemoryRecordSchema.parse({
        key: row.key,
        content: row.content,
        metadata: row.metadata ?? undefined,
        createdAt: row.createdAt,
      })
    );
  }
}
