import type { MemoryRecord, MemoryScope, ShortTermMemoryStore } from "../index";

type ScopeKey = string;

function scopeKey(scope: MemoryScope): ScopeKey {
  return [scope.tenantId, scope.workspaceId, scope.agentId].join(":");
}

export class InMemoryShortTermMemoryStore implements ShortTermMemoryStore {
  private readonly records = new Map<ScopeKey, MemoryRecord[]>();

  async retrieve(scope: MemoryScope, limit = 10): Promise<MemoryRecord[]> {
    const list = this.records.get(scopeKey(scope)) ?? [];
    return list
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async store(scope: MemoryScope, records: MemoryRecord[]) {
    if (records.length === 0) return;
    const key = scopeKey(scope);
    const existing = this.records.get(key) ?? [];
    this.records.set(key, existing.concat(records));
  }

  async truncate(scope: MemoryScope, keepLatest: number) {
    const key = scopeKey(scope);
    const list = this.records.get(key);
    if (!list) return;
    if (keepLatest <= 0) {
      this.records.set(key, []);
      return;
    }
    const sorted = list
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, keepLatest);
    this.records.set(key, sorted);
  }
}
