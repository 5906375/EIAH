import type { LongTermMemoryStore, MemoryRecord, MemoryScope } from "../index";

type ScopeKey = string;

function scopeKey(scope: MemoryScope): ScopeKey {
  return [scope.tenantId, scope.workspaceId, scope.agentId].join(":");
}

export class InMemoryLongTermMemoryStore implements LongTermMemoryStore {
  private readonly records = new Map<ScopeKey, MemoryRecord[]>();

  async append(scope: MemoryScope, records: MemoryRecord[]): Promise<void> {
    if (records.length === 0) return;
    const key = scopeKey(scope);
    const existing = this.records.get(key) ?? [];
    this.records.set(key, existing.concat(records));
  }

  async query(scope: MemoryScope, params: { limit?: number; since?: Date }): Promise<MemoryRecord[]> {
    const list = this.records.get(scopeKey(scope)) ?? [];
    let filtered = list;
    if (params.since) {
      filtered = filtered.filter((record) => record.createdAt > params.since!);
    }
    return filtered
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, params.limit ?? 50);
  }
}
