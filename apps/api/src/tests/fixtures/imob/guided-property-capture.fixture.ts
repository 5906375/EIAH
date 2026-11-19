import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@repo/db";
import { resolveImobPropertyCaptureTurn } from "../../../services/imob/crm/imobCrmTurnEngine";
import type { ImobPropertyCaptureRequest } from "@eiah/contracts";

/** Transaction-shaped test double. It proves sequencing only, never PostgreSQL/multiprocess atomicity. */
export function guidedPropertyFixture() {
  const events = new Map<string, any>();
  const transactionContext = new AsyncLocalStorage<boolean>();
  let queue = Promise.resolve();
  const control = { available: true, insideTransaction: false, commits: 0, transports: 0 };
  const scope = { tenantId: "test-tenant", workspaceId: "test-workspace", userId: "test-user" };
  const client = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      assert.match(strings.join("?"), /pg_advisory_xact_lock/);
      assert.match(String(values[0]), /property-capture:test-tenant:test-workspace:test-user|property-capture:/);
      return [{ locked: 1 }];
    },
    memoryEvent: {
      async findMany({ where }: any) {
        return [...events.values()].filter((event) => event.key === where.key && event.tenantId === where.tenantId
          && event.workspaceId === where.workspaceId && event.metadata.actorUserId === where.metadata.equals).map((event) => structuredClone(event));
      },
      async create({ data }: any) { assert.ok(!events.has(data.id)); events.set(data.id, structuredClone(data)); return data; },
      async update({ where, data }: any) {
        const old = events.get(where.id); assert.ok(old); events.set(where.id, structuredClone({ ...old, ...data })); return events.get(where.id);
      },
    },
    imobOwner: { async findFirst({ where }: any) { return where.id === "owner-valid" ? { id: where.id } : null; } },
    async $transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      if (!control.available) throw new Error("synthetic persistence unavailable");
      const before = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await before;
      const backup = structuredClone(events);
      control.insideTransaction = true;
      try { const result = await transactionContext.run(true, () => work(client)); control.commits++; return result; }
      catch (error) { events.clear(); for (const [key, value] of backup) events.set(key, value); throw error; }
      finally { control.insideTransaction = false; release(); }
    },
  };
  const prisma = client as unknown as PrismaClient;
  async function run(request: ImobPropertyCaptureRequest, interpret: () => Promise<string> = async () => { throw new Error("unexpected LLM"); }) {
    return resolveImobPropertyCaptureTurn(request, { prisma, scope, timeoutMs: 5, interpret: async () => {
      assert.notEqual(transactionContext.getStore(), true, "admission transaction must be committed before provider dispatch");
      control.transports++; return interpret();
    } });
  }
  return { prisma, scope, run, events, control };
}
