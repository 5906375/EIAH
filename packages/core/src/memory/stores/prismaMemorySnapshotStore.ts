import { MemoryRecordSchema, MemoryVectorMatchSchema } from "../../types";
import type { MemorySnapshotStore } from "../index";
import type { MemoryRecord, MemoryScope, MemorySnapshot, MemoryVectorMatch } from "../../types";

type MemorySnapshotRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  shortTerm: unknown;
  longTerm: unknown;
  vectorState: Record<string, unknown> | null;
  cursor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemorySnapshotDelegate = {
  findUnique(args: {
    where: {
      tenantId_workspaceId_agentId: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
      };
    };
  }): Promise<MemorySnapshotRow | null>;
  upsert(args: {
    where: {
      tenantId_workspaceId_agentId: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
      };
    };
    create: Omit<MemorySnapshotRow, "id" | "createdAt" | "updatedAt">;
    update: Omit<MemorySnapshotRow, "id" | "tenantId" | "workspaceId" | "agentId" | "createdAt">;
  }): Promise<MemorySnapshotRow>;
};

type PrismaClientLike = {
  memorySnapshot: MemorySnapshotDelegate;
};

function serializeRecord(record: MemoryRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
  };
}

function deserializeRecords(payload: unknown): MemoryRecord[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const record = {
        ...(item as Record<string, unknown>),
        createdAt: item && typeof (item as Record<string, unknown>).createdAt === "string"
          ? new Date(String((item as Record<string, unknown>).createdAt))
          : new Date(),
      };
      try {
        return MemoryRecordSchema.parse(record);
      } catch {
        return null;
      }
    })
    .filter((record): record is MemoryRecord => Boolean(record));
}

function deserializeVectorMatches(payload: unknown): MemoryVectorMatch[] {
  const matches =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).matches
      : undefined;
  if (!Array.isArray(matches)) return [];
  return matches
    .map((item) => {
      try {
        return MemoryVectorMatchSchema.parse(item);
      } catch {
        return null;
      }
    })
    .filter((match): match is MemoryVectorMatch => Boolean(match));
}

export class PrismaMemorySnapshotStore implements MemorySnapshotStore {
  constructor(private readonly prisma: PrismaClientLike) {}

  async load(scope: MemoryScope): Promise<MemorySnapshot | null> {
    const row = await this.prisma.memorySnapshot.findUnique({
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          agentId: scope.agentId,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      shortTerm: deserializeRecords(row.shortTerm),
      longTerm: deserializeRecords(row.longTerm),
      vectorMatches: deserializeVectorMatches(row.vectorState),
      cursor: row.cursor ?? undefined,
    };
  }

  async save(scope: MemoryScope, snapshot: MemorySnapshot): Promise<void> {
    await this.prisma.memorySnapshot.upsert({
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          agentId: scope.agentId,
        },
      },
      create: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        agentId: scope.agentId,
        shortTerm: snapshot.shortTerm.map(serializeRecord),
        longTerm: snapshot.longTerm.map(serializeRecord),
        vectorState: { matches: snapshot.vectorMatches },
        cursor: snapshot.cursor ?? null,
      },
      update: {
        shortTerm: snapshot.shortTerm.map(serializeRecord),
        longTerm: snapshot.longTerm.map(serializeRecord),
        vectorState: { matches: snapshot.vectorMatches },
        cursor: snapshot.cursor ?? null,
        updatedAt: new Date(),
      },
    });
  }
}
