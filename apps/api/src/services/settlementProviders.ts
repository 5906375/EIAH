import crypto from "node:crypto";

export const SETTLEMENT_PROVIDER_IDS = ["stripe", "crypto", "bank"] as const;
export type SettlementProviderId = (typeof SETTLEMENT_PROVIDER_IDS)[number];

export type SettlementRequest = {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  requestId: string;
  metadata?: Record<string, unknown> | null;
};

export type SettlementResult = {
  ok: boolean;
  provider: SettlementProviderId;
  providerSettlementId: string;
  status: "succeeded" | "pending";
  receipt: Record<string, unknown>;
};

export type SettlementProviderMode = "full" | "simulated";

type SettlementProviderAdapter = {
  id: SettlementProviderId;
  mode: SettlementProviderMode;
  settle: (input: SettlementRequest) => Promise<SettlementResult>;
};

function createSettlementId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

const stripeAdapter: SettlementProviderAdapter = {
  id: "stripe",
  mode: "full",
  async settle(input) {
    const settlementId = createSettlementId("stl");
    return {
      ok: true,
      provider: "stripe",
      providerSettlementId: settlementId,
      status: "succeeded",
      receipt: {
        adapterMode: "full",
        settledAt: new Date().toISOString(),
        amountCents: input.amountCents,
        currency: input.currency,
        requestId: input.requestId,
      },
    };
  },
};

const cryptoAdapter: SettlementProviderAdapter = {
  id: "crypto",
  mode: "simulated",
  async settle(input) {
    const settlementId = createSettlementId("crp");
    return {
      ok: true,
      provider: "crypto",
      providerSettlementId: settlementId,
      status: "succeeded",
      receipt: {
        adapterMode: "simulated",
        network: "simulated",
        settledAt: new Date().toISOString(),
        amountCents: input.amountCents,
        currency: input.currency,
        requestId: input.requestId,
      },
    };
  },
};

const bankAdapter: SettlementProviderAdapter = {
  id: "bank",
  mode: "simulated",
  async settle(input) {
    const settlementId = createSettlementId("bnk");
    return {
      ok: true,
      provider: "bank",
      providerSettlementId: settlementId,
      status: "succeeded",
      receipt: {
        adapterMode: "simulated",
        rail: "simulated_ted",
        settledAt: new Date().toISOString(),
        amountCents: input.amountCents,
        currency: input.currency,
        requestId: input.requestId,
      },
    };
  },
};

const adapters = new Map<SettlementProviderId, SettlementProviderAdapter>([
  [stripeAdapter.id, stripeAdapter],
  [cryptoAdapter.id, cryptoAdapter],
  [bankAdapter.id, bankAdapter],
]);

const DEFAULT_PROVIDER_MODE: Record<SettlementProviderId, SettlementProviderMode> = {
  stripe: "full",
  crypto: "simulated",
  bank: "simulated",
};

function resolveProviderMode(provider: SettlementProviderId): SettlementProviderMode {
  const envKey = `SETTLEMENT_PROVIDER_MODE_${provider.toUpperCase()}`;
  const raw = String(process.env[envKey] ?? "").trim().toLowerCase();
  if (raw === "full" || raw === "simulated") return raw;
  return DEFAULT_PROVIDER_MODE[provider];
}

function getAdapter(provider: SettlementProviderId): SettlementProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`Unsupported settlement provider: ${provider}`);
  }
  return {
    ...adapter,
    mode: resolveProviderMode(provider),
  };
}

export function listSettlementProviders() {
  return SETTLEMENT_PROVIDER_IDS.map((provider) => {
    const adapter = getAdapter(provider);
    return { id: adapter.id, mode: adapter.mode };
  });
}

export function isSettlementProviderId(value: string): value is SettlementProviderId {
  return adapters.has(value as SettlementProviderId);
}

export async function settleWithProvider(
  provider: SettlementProviderId,
  payload: SettlementRequest
) {
  const adapter = getAdapter(provider);
  return adapter.settle(payload);
}
