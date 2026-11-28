import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MetaLabStore, MetaLabStoreItem } from "../../services/whatsappMetaAdapter";

// TEST SUPPORT ONLY. Single writer, disposable synthetic records, never a production backend.
export function openMetaLabFileStore(directory: string, faults: {
  beforeWrite?: () => void;
  afterSync?: () => void;
} = {}): MetaLabStore & { close: () => Promise<void> } {
  const root = fs.realpathSync(directory);
  const tempRoot = fs.realpathSync(os.tmpdir());
  if (path.dirname(root) !== tempRoot || !path.basename(root).startsWith("eiah-meta-lab-")) {
    throw new Error("Dedicated lab temporary directory required");
  }
  const journal = path.join(root, "events.json");
  const lock = path.join(root, "writer.lock");
  let lockFd: number;
  try { lockFd = fs.openSync(lock, "wx", 0o600); }
  catch { throw new Error("LAB_STORE_LOCKED"); }
  let records = new Map<string, MetaLabStoreItem>();
  try {
    if (fs.existsSync(journal)) {
      if (fs.lstatSync(journal).isSymbolicLink() || fs.statSync(journal).size > 1024 * 1024) throw new Error();
      const parsed: unknown = JSON.parse(fs.readFileSync(journal, "utf8"));
      if (!Array.isArray(parsed)) throw new Error();
      for (const r of parsed) {
        if (!r || typeof r !== "object" || Object.keys(r).sort().join(",") !== "atMs,digest,key"
          || typeof r.key !== "string" || !/^[a-f0-9]{64}$/.test(r.key)
          || typeof r.digest !== "string" || !/^[a-f0-9]{64}$/.test(r.digest)
          || !Number.isFinite(r.atMs) || records.has(r.key)) throw new Error();
        records.set(r.key, r);
      }
    }
  } catch {
    fs.closeSync(lockFd); fs.unlinkSync(lock);
    throw new Error("LAB_STORE_CORRUPT");
  }
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;
  let closing = false;
  let failed = false;
  return {
    transact(items, processFresh) {
      if (closing) return Promise.reject(new Error("LAB_STORE_UNAVAILABLE"));
      const run = () => {
        if (closed || failed) throw new Error("LAB_STORE_UNAVAILABLE");
        const next = new Map(records);
        const fresh: number[] = [];
        const duplicates: number[] = [];
        items.forEach((item, index) => {
          if (!/^[a-f0-9]{64}$/.test(item.key) || !/^[a-f0-9]{64}$/.test(item.digest) || !Number.isFinite(item.atMs)) {
            throw new Error("LAB_STORE_INVALID_RECORD");
          }
          const prior = next.get(item.key);
          if (prior) {
            if (prior.digest !== item.digest) throw new Error("LAB_EVENT_COLLISION");
            duplicates.push(index);
          } else {
            fresh.push(index); next.set(item.key, { key: item.key, digest: item.digest, atMs: item.atMs });
          }
        });
        processFresh(fresh);
        if (fresh.length) {
          const temporary = path.join(root, "events.pending");
          let fd: number | undefined;
          try {
            faults.beforeWrite?.();
            fd = fs.openSync(temporary, "wx", 0o600);
            fs.writeFileSync(fd, JSON.stringify([...next.values()]));
            fs.fsyncSync(fd);
            fs.closeSync(fd); fd = undefined;
            fs.renameSync(temporary, journal);
            const dirFd = fs.openSync(root, "r");
            try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
            faults.afterSync?.();
            records = next;
          } catch {
            failed = true;
            if (fd !== undefined) fs.closeSync(fd);
            // Only the fixed test-owned temporary file is eligible for cleanup.
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            throw new Error("LAB_STORE_UNAVAILABLE");
          }
        }
        return { fresh, duplicates };
      };
      const transaction = queue.then(run);
      queue = transaction.catch(() => undefined);
      return transaction;
    },
    async close() {
      if (closed) return;
      // Do not admit new work while waiting for queued transactions.
      closing = true;
      await queue;
      if (closed) return;
      closed = true;
      fs.closeSync(lockFd); fs.unlinkSync(lock);
    },
  };
}
