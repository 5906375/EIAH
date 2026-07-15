export type ReplayRecord = {
  payloadDigest: string;
  firstSeenAtMs: number;
};

export type ReplayGuardStore = {
  replayGuard: Map<string, ReplayRecord>;
  eventGuard: Map<string, ReplayRecord>;
};

export type ReplayGuardDecision = {
  accepted: boolean;
  duplicate: boolean;
  replay: boolean;
  reasonCode: "WHATSAPP_REPLAY_DETECTED" | "WHATSAPP_EVENT_DUPLICATE" | null;
};

export function createReplayGuardStore(): ReplayGuardStore {
  return {
    replayGuard: new Map<string, ReplayRecord>(),
    eventGuard: new Map<string, ReplayRecord>(),
  };
}

function pruneGuard(store: Map<string, ReplayRecord>, cutoffMs: number) {
  for (const [key, record] of store.entries()) {
    if (record.firstSeenAtMs < cutoffMs) {
      store.delete(key);
    }
  }
}

export function resetReplayGuardStore(store: ReplayGuardStore) {
  store.replayGuard.clear();
  store.eventGuard.clear();
}

export function evaluateReplayGuard(params: {
  store: ReplayGuardStore;
  eventKey: string;
  replayKey: string;
  payloadDigest: string;
  nowMs?: number;
  maxAgeMs: number;
}): ReplayGuardDecision {
  const nowMs = params.nowMs ?? Date.now();
  const cutoffMs = nowMs - params.maxAgeMs;
  pruneGuard(params.store.replayGuard, cutoffMs);
  pruneGuard(params.store.eventGuard, cutoffMs);

  if (params.store.replayGuard.has(params.replayKey)) {
    return {
      accepted: false,
      duplicate: false,
      replay: true,
      reasonCode: "WHATSAPP_REPLAY_DETECTED",
    };
  }
  if (params.store.eventGuard.has(params.eventKey)) {
    return {
      accepted: false,
      duplicate: true,
      replay: false,
      reasonCode: "WHATSAPP_EVENT_DUPLICATE",
    };
  }

  const record = { payloadDigest: params.payloadDigest, firstSeenAtMs: nowMs };
  params.store.replayGuard.set(params.replayKey, record);
  params.store.eventGuard.set(params.eventKey, record);

  return {
    accepted: true,
    duplicate: false,
    replay: false,
    reasonCode: null,
  };
}
