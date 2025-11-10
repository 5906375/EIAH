import type { AgentProfileSeed } from "./types";

export const defiOneProfile: AgentProfileSeed = {
  agent: "DeFi_1",
  name: "DeFi One",
  description: "Suporte a operações e simulações DeFi.",
  model: "gpt-4.1",
  systemPrompt:
    "Você é o DeFi One. Auxilie em operações DeFi (lend/borrow, swaps, yield) com atenção à segurança.",
  tools: [
    {
      name: "defi.simulateTx",
      description: "Simula a execução de uma transação DeFi antes do envio on-chain.",
      url_by_env: {
        dev: "/api/defi1/simulate-mint",
        prod: "https://api.eiah.local/api/defi1/simulate-mint",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["defi:simulate"],
          prod: ["defi:simulate"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "DEFIDEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "DEFIPROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["chainId", "abiFragment", "args", "to"],
        additionalProperties: false,
        properties: {
          chainId: { type: "integer" },
          to: { type: "string", minLength: 1 },
          abiFragment: { type: "string", minLength: 1 },
          args: { type: "array", items: {} },
          valueWei: { type: ["string", "null"] },
          projectId: { type: ["string", "null"] },
        },
      },
      outputSchema: {
        type: "object",
        required: ["ok", "data"],
        properties: {
          ok: { type: "boolean" },
          data: {
            type: "object",
            required: ["gasEstimate", "calldata"],
            properties: {
              gasEstimate: { type: "string" },
              calldata: { type: "string" },
            },
          },
          meta: {
            type: "object",
            properties: {
              traceId: { type: "string" },
              tookMs: { type: "number" },
            },
          },
        },
      },
      timeoutMs: 8000,
      retryPolicy: {
        retries: 1,
        backoffMs: 300,
      },
      simulateFirst: true,
      requires_confirmation: 'valueWei != null && valueWei != "0"',
      costEstimator: {
        baseCents: 5,
        perKBcents: 1,
      },
      audit: {
        logRequest: true,
        pii: [],
      },
      version: "1.0.0",
    },
    {
      name: "defi.broadcastTx",
      description: "Assina e envia transação simulada para a rede selecionada.",
      url_by_env: {
        dev: "/api/defi1/mint",
        prod: "https://api.eiah.local/api/defi1/mint",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["defi:tx:send"],
          prod: ["defi:tx:send"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "DEFIDEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "DEFIPROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["chainId", "to", "abiFragment", "args", "confirmationId"],
        additionalProperties: false,
        properties: {
          chainId: { type: "integer" },
          to: { type: "string", minLength: 1 },
          abiFragment: { type: "string", minLength: 1 },
          args: { type: "array", items: {} },
          valueWei: { type: ["string", "null"] },
          confirmationId: { type: "string", minLength: 1 },
          projectId: { type: ["string", "null"] },
        },
      },
      outputSchema: {
        type: "object",
        required: ["ok", "data"],
        properties: {
          ok: { type: "boolean" },
          data: {
            type: "object",
            required: ["txHash"],
            properties: {
              txHash: { type: "string" },
              explorerUrl: { type: "string" },
            },
          },
          meta: {
            type: "object",
            properties: {
              traceId: { type: "string" },
              tookMs: { type: "number" },
            },
          },
        },
      },
      timeoutMs: 12000,
      retryPolicy: {
        retries: 0,
        backoffMs: 0,
      },
      simulateFirst: true,
      requires_confirmation: "true",
      costEstimator: {
        baseCents: 12,
      },
      audit: {
        logRequest: true,
        pii: [],
      },
      version: "1.0.0",
    },
    {
      name: "defi.estimateCost",
      description: "Consulta estimativa de custo para um fluxo DeFi identificado.",
      url_by_env: {
        dev: "/api/billing/estimate",
        prod: "https://api.eiah.local/api/billing/estimate",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["billing:estimate"],
          prod: ["billing:estimate"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "EIAH_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "EIAH_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["agent", "inputBytes", "projectId"],
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "DeFi_1" },
          inputBytes: { type: "integer", minimum: 0 },
          projectId: { type: "string", minLength: 1 },
          tools: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      outputSchema: {
        type: "object",
        required: ["ok", "data"],
        properties: {
          ok: { type: "boolean" },
          data: {
            type: "object",
            required: ["estimateCents", "currency"],
            properties: {
              estimateCents: { type: "integer" },
              currency: { type: "string" },
            },
          },
        },
      },
      timeoutMs: 4000,
      retryPolicy: {
        retries: 1,
        backoffMs: 150,
      },
      simulateFirst: false,
      requires_confirmation: "false",
      costEstimator: {
        baseCents: 1,
      },
      audit: {
        logRequest: false,
        pii: [],
      },
      version: "1.0.0",
    },
  ],
};

