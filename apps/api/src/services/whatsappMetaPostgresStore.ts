import type { MetaLabStore } from "./whatsappMetaAdapter";
import { WHATSAPP_READ_ONLY_SCOPE } from "./whatsappReadOnlyIngress";
import { z } from "zod";

export interface MetaSqlTransaction {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}
export interface MetaSqlDatabase {
  $transaction<T>(work: (tx: MetaSqlTransaction) => Promise<T>, options: {
    isolationLevel: "ReadCommitted"; maxWait: number; timeout: number;
  }): Promise<T>;
}

// Technical ledger only. No domain model/client is exposed to the pure adapter.
// The connection supplier is lazy: constructing or disabling the route performs no I/O.
export function createMetaPostgresStore(database: () => MetaSqlDatabase, retentionMs: number): MetaLabStore {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) throw new Error("META_CONFIGURATION_INVALID");
  return {
    async transact(items, processFresh) {
      const checked = items.map((item, index) => {
        if (!/^[a-f0-9]{64}$/.test(item.key) || !/^[a-f0-9]{64}$/.test(item.digest)
          || !item.tenantId || !item.workspaceId || item.scope !== WHATSAPP_READ_ONLY_SCOPE
          || !Number.isSafeInteger(item.atMs) || !Number.isSafeInteger(item.atMs + retentionMs)) {
          throw new Error("META_STORE_INPUT_INVALID");
        }
        return { ...item, index, tenantId: item.tenantId, workspaceId: item.workspaceId, scope: item.scope };
      });
      // Stable lock order across overlapping batches avoids an avoidable class of deadlocks.
      const ordered = [...checked].sort((a, b) =>
        JSON.stringify([a.tenantId, a.workspaceId, a.key]).localeCompare(JSON.stringify([b.tenantId, b.workspaceId, b.key]))
        || a.index - b.index);
      return database().$transaction(async tx => {
        const fresh: number[] = [], duplicates: number[] = [];
        for (const item of ordered) {
          const inserted = await tx.$executeRaw`
            INSERT INTO "WhatsappMetaIngressReceipt"
              ("tenantId", "workspaceId", "scope", "eventKey", "digest", "receivedAt", "expiresAt")
            VALUES (${item.tenantId}, ${item.workspaceId}, ${item.scope}, ${item.key}, ${item.digest},
              ${new Date(item.atMs)}, ${new Date(item.atMs + retentionMs)})
            ON CONFLICT ("tenantId", "workspaceId", "eventKey") DO NOTHING`;
          // At READ COMMITTED this statement sees a concurrent winner after ON CONFLICT waits.
          const result = await tx.$queryRaw`
            SELECT "digest", "scope" FROM "WhatsappMetaIngressReceipt"
            WHERE "tenantId" = ${item.tenantId} AND "workspaceId" = ${item.workspaceId}
              AND "eventKey" = ${item.key} FOR UPDATE`;
          const rows = z.array(z.object({ digest: z.string(), scope: z.string() })).parse(result);
          if (rows.length !== 1 || rows[0].digest !== item.digest || rows[0].scope !== item.scope) {
            throw new Error("META_EVENT_COLLISION");
          }
          if (inserted === 1) fresh.push(item.index);
          else if (inserted === 0) duplicates.push(item.index);
          else throw new Error("META_STORE_RESULT_INVALID");
        }
        fresh.sort((a, b) => a - b); duplicates.sort((a, b) => a - b);
        processFresh(fresh);
        return { fresh, duplicates };
      }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
      // Prisma resolves only after COMMIT. A failed/uncertain commit yields no successful ACK.
    },
  };
}

// Explicit maintenance port. Scheduling/authorization and proof of retention remain prerequisites
// to activation; request traffic alone is not a guarantee of timely deletion.
export function purgeExpiredMetaReceipts(database: MetaSqlDatabase): Promise<number> {
  return database.$transaction(tx => tx.$executeRaw`
    DELETE FROM "WhatsappMetaIngressReceipt" WHERE "expiresAt" <= CURRENT_TIMESTAMP`,
  { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
}
