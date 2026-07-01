import type Redis from "ioredis";

export type WorkerQueue = "runs" | "run-ativo-universal";

export type LeaseOptions = {
  environmentId: string;
  queue: WorkerQueue;
  ownerId: string;
  redis: Redis;
  ttlMs?: number;
  renewIntervalMs?: number;
  onLeaseLost: () => void;
};

export type WorkerOwnershipLease = {
  acquired: boolean;
  release: () => Promise<void>;
  stop: () => void;
};

export type LeaseState = {
  owned: boolean;
  ownerId: string | null;
  acquiredAt: string | null;
};

// Module-level health state — populated by acquireWorkerOwnershipLease
const _stateMap = new Map<string, LeaseState>();

function _sk(environmentId: string, queue: WorkerQueue): string {
  return `${environmentId}:${queue}`;
}

export function getLeaseState(environmentId: string, queue: WorkerQueue): LeaseState {
  return _stateMap.get(_sk(environmentId, queue)) ?? { owned: false, ownerId: null, acquiredAt: null };
}

export function resolveLeaseKey(environmentId: string, queue: WorkerQueue): string {
  return `eiah:worker-ownership:${environmentId}:${queue}`;
}

export function resolveMetaKey(environmentId: string, queue: WorkerQueue): string {
  return `eiah:worker-ownership:${environmentId}:${queue}:meta`;
}

// Lua CAS — renew only if we still own the lease
const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('pexpire', KEYS[1], ARGV[2])
  redis.call('pexpire', KEYS[2], ARGV[2])
  return 1
else
  return 0
end`;

// Lua CAS — release only if we still own the lease
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('del', KEYS[1])
  redis.call('del', KEYS[2])
  return 1
else
  return 0
end`;

export async function acquireWorkerOwnershipLease(opts: LeaseOptions): Promise<WorkerOwnershipLease> {
  const {
    environmentId,
    queue,
    ownerId,
    redis,
    ttlMs = 30_000,
    renewIntervalMs = 10_000,
    onLeaseLost,
  } = opts;

  const key = resolveLeaseKey(environmentId, queue);
  const meta = resolveMetaKey(environmentId, queue);
  const sk = _sk(environmentId, queue);

  // Atomic acquire — SET NX PX
  const result = await redis.set(key, ownerId, "PX", ttlMs, "NX");

  if (result !== "OK") {
    return { acquired: false, release: async () => {}, stop: () => {} };
  }

  // Metadata key — same TTL so it cannot outlive the lease
  const acquiredAt = new Date().toISOString();
  await redis.set(
    meta,
    JSON.stringify({ ownerId, acquiredAt, queue, environmentId }),
    "PX",
    ttlMs,
  );

  _stateMap.set(sk, { owned: true, ownerId, acquiredAt });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function scheduleRenewal(): void {
    timer = setTimeout(async () => {
      if (stopped) return;
      let renewed = 0;
      try {
        renewed = (await redis.eval(RENEW_SCRIPT, 2, key, meta, ownerId, String(ttlMs))) as number;
      } catch {
        _stateMap.set(sk, { owned: false, ownerId: null, acquiredAt: null });
        onLeaseLost();
        return;
      }
      if (renewed !== 1) {
        _stateMap.set(sk, { owned: false, ownerId: null, acquiredAt: null });
        onLeaseLost();
        return;
      }
      if (!stopped) scheduleRenewal();
    }, renewIntervalMs);
  }

  scheduleRenewal();

  async function release(): Promise<void> {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      await redis.eval(RELEASE_SCRIPT, 2, key, meta, ownerId);
    } catch {
      // best-effort; TTL ensures eventual cleanup of the lease key
    }
    _stateMap.set(sk, { owned: false, ownerId: null, acquiredAt: null });
  }

  function stop(): void {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { acquired: true, release, stop };
}
