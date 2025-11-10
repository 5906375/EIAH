import type { AgentProfileSeed } from "./types";

export const onchainMonitorProfile: AgentProfileSeed = {
  agent: "onchain-monitor",
  name: "On-chain Monitor",
  description: "Monitora eventos on-chain e notifica stakeholders.",
  model: "gpt-4o-mini",
  systemPrompt:
    "Você é o On-chain Monitor. Monitore eventos on-chain e envie alertas resumidos e claros.",
  tools: [
    {
      name: "onchain.registerAlertRule",
      description: "Configura regras de monitoramento on-chain e canais de alerta.",
      url_by_env: {
        dev: "/api/runs",
        prod: "https://api.eiah.local/api/runs",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["onchain:alerts:write"],
          prod: ["onchain:alerts:write"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "EIAH_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "EIAH_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["agent", "prompt"],
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "onchain-monitor" },
          prompt: { type: "string", minLength: 1 },
          projectId: { type: ["string", "null"] },
          metadata: {
            type: "object",
            required: ["eventTypes", "addresses"],
            additionalProperties: true,
            properties: {
              eventTypes: {
                type: "array",
                minItems: 1,
                items: { type: "string" },
              },
              addresses: {
                type: "array",
                minItems: 1,
                items: { type: "string" },
              },
              threshold: {
                type: "object",
                additionalProperties: false,
                required: ["value", "unit"],
                properties: {
                  value: { type: "string" },
                  unit: { type: "string" },
                },
              },
              channels: {
                type: "array",
                items: { type: "string" },
                default: ["email"],
              },
              notes: { type: "string" },
            },
          },
        },
      },
      outputSchema: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { type: "string" },
                createdAt: { type: "string", format: "date-time" },
                response: { type: "object" },
              },
            },
          },
          total: { type: "integer" },
        },
      },
      timeoutMs: 15000,
      retryPolicy: {
        retries: 2,
        backoffMs: 500,
      },
      simulateFirst: true,
      requires_confirmation: "true",
      costEstimator: {
        baseCents: 6,
        perKBcents: 1,
      },
      audit: {
        logRequest: true,
        pii: [],
      },
      version: "1.0.0",
    },
    {
      name: "onchain.listAlerts",
      description: "Lista alertas gerados pelo monitoramento on-chain.",
      url_by_env: {
        dev: "/api/runs",
        prod: "https://api.eiah.local/api/runs",
      },
      method: "GET",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["onchain:alerts:read"],
          prod: ["onchain:alerts:read"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "EIAH_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "EIAH_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "onchain-monitor" },
          projectId: { type: "string" },
          status: {
            type: "string",
            enum: ["success", "error", "blocked"],
          },
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          page: { type: "integer", minimum: 1 },
          size: { type: "integer", minimum: 1, maximum: 200 },
        },
      },
      outputSchema: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { type: "string" },
                createdAt: { type: "string", format: "date-time" },
                response: { type: "object" },
              },
            },
          },
          total: { type: "integer" },
        },
      },
      timeoutMs: 6000,
      retryPolicy: {
        retries: 1,
        backoffMs: 200,
      },
      simulateFirst: false,
      requires_confirmation: "false",
      costEstimator: {
        baseCents: 2,
      },
      audit: {
        logRequest: false,
        pii: [],
      },
      version: "1.0.0",
    },
    {
      name: "onchain.getAlertDetail",
      description: "Recupera detalhes completos de um alerta específico.",
      url_by_env: {
        dev: "/api/runs/{id}",
        prod: "https://api.eiah.local/api/runs/{id}",
      },
      method: "GET",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["onchain:alerts:read"],
          prod: ["onchain:alerts:read"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "EIAH_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "EIAH_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          projectId: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        required: ["id", "status", "response"],
        properties: {
          id: { type: "string" },
          status: { type: "string" },
          response: { type: "object" },
          request: { type: "object" },
          costCents: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      timeoutMs: 4000,
      retryPolicy: {
        retries: 1,
        backoffMs: 250,
      },
      simulateFirst: false,
      requires_confirmation: "false",
      costEstimator: { baseCents: 1 },
      audit: {
        logRequest: false,
        pii: [],
      },
      version: "1.0.0",
    },
  ],
};

