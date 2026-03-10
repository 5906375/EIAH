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

type SettlementProviderAdapter = {
  id: SettlementProviderId;
  mode: "full" | "stub";
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
  mode: "stub",
  async settle(input) {
    const settlementId = createSettlementId("crp");
    return {
      ok: true,
      provider: "crypto",
      providerSettlementId: settlementId,
      status: "succeeded",
      receipt: {
        adapterMode: "stub",
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
  mode: "stub",
  async settle(input) {
    const settlementId = createSettlementId("bnk");
    return {
      ok: true,
      provider: "bank",
      providerSettlementId: settlementId,
      status: "succeeded",
      receipt: {
        adapterMode: "stub",
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

export function listSettlementProviders() {
  return Array.from(adapters.values()).map((item) => ({
    id: item.id,
    mode: item.mode,
  }));
}

export function isSettlementProviderId(value: string): value is SettlementProviderId {
  return adapters.has(value as SettlementProviderId);
}

export async function settleWithProvider(
  provider: SettlementProviderId,
  payload: SettlementRequest
) {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`Unsupported settlement provider: ${provider}`);
  }
  return adapter.settle(payload);
}

