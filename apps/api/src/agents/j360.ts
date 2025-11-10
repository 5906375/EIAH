import type { AgentProfileSeed } from "./types";

export const j360Profile: AgentProfileSeed = {
  agent: "J_360",
  name: "Jurídico",
  description:
    "Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação.",
  model: "gpt-4o-mini",
  systemPrompt:
    "Você é o J_360. Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação." +
    "Analisa cláusulas, detecta riscos, insere jurisprudência e gera parecer técnico em linguagem acessível.",
  tools: [
    {
      name: "contract.parse",
      description:
        "Analisa uploads ou URLs de contratos e extrai cláusulas relevantes com avaliação de risco.",
      url_by_env: {
        dev: "/api/runs",
        prod: "https://api.eiah.local/api/runs",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["law:contract:read"],
          prod: ["law:contract:read"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "LAW_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "LAW_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["agent", "prompt", "metadata"],
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "J_360" },
          prompt: { type: "string", minLength: 1 },
          projectId: { type: ["string", "null"] },
          metadata: {
            type: "object",
            required: ["documentSource"],
            additionalProperties: false,
            properties: {
              documentSource: {
                type: "object",
                required: ["type", "reference"],
                additionalProperties: false,
                properties: {
                  type: {
                    type: "string",
                    enum: ["upload", "url"],
                  },
                  reference: { type: "string", minLength: 1 },
                },
              },
              focusAreas: {
                type: "array",
                items: { type: "string" },
              },
              riskThreshold: {
                type: "string",
                enum: ["baixo", "medio", "alto"],
                default: "medio",
              },
            },
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
            required: ["id", "status", "response"],
            properties: {
              id: { type: "string" },
              status: { type: "string" },
              response: {
                type: "object",
                properties: {
                  clauses: { type: "array", items: { type: "object" } },
                  risks: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
      },
      timeoutMs: 16000,
      retryPolicy: {
        retries: 1,
        backoffMs: 350,
      },
      simulateFirst: true,
      requires_confirmation: "false",
      costEstimator: {
        baseCents: 7,
        perKBcents: 2,
      },
      audit: {
        logRequest: true,
        pii: [],
      },
      version: "1.1.0",
    },
    {
      name: "rag.searchLaw",
      description:
        "Pesquisa jurisprudência e normas em coleções LGPD, CVM e tributário para embasar pareceres.",
      url_by_env: {
        dev: "/api/runs",
        prod: "https://api.eiah.local/api/runs",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["law:knowledge:read"],
          prod: ["law:knowledge:read"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "LAW_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "LAW_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["agent", "prompt", "metadata"],
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "J_360" },
          prompt: { type: "string", minLength: 1 },
          projectId: { type: ["string", "null"] },
          metadata: {
            type: "object",
            required: ["collections"],
            additionalProperties: false,
            properties: {
              collections: {
                type: "array",
                minItems: 1,
                items: {
                  type: "string",
                  enum: ["lgpd", "cvm", "tributario"],
                },
              },
              filters: {
                type: "object",
                properties: {
                  jurisdiction: { type: "string" },
                  yearFrom: { type: "integer", minimum: 1900 },
                  yearTo: { type: "integer", minimum: 1900 },
                },
              },
              maxResults: { type: "integer", minimum: 1, maximum: 20, default: 10 },
            },
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
            required: ["id", "status", "response"],
            properties: {
              id: { type: "string" },
              status: { type: "string" },
              response: {
                type: "object",
                properties: {
                  matches: { type: "array", items: { type: "object" } },
                  summary: { type: "string" },
                },
              },
            },
          },
        },
      },
      timeoutMs: 8000,
      retryPolicy: {
        retries: 1,
        backoffMs: 250,
      },
      simulateFirst: false,
      requires_confirmation: "false",
      costEstimator: {
        baseCents: 4,
      },
      audit: {
        logRequest: false,
        pii: [],
      },
      version: "1.0.0",
    },
    {
      name: "doc.generateOpinion",
      description:
        "Produz parecer ou minuta definitiva com base em insumos prévios e riscos identificados.",
      url_by_env: {
        dev: "/api/runs",
        prod: "https://api.eiah.local/api/runs",
      },
      method: "POST",
      auth: {
        type: "bearer",
        scopes: {
          dev: ["law:opinion:write"],
          prod: ["law:opinion:write"],
        },
        tokens: {
          dev: { header: "Authorization", prefix: "Bearer", variable: "LAW_DEV_TOKEN" },
          prod: { header: "Authorization", prefix: "Bearer", variable: "LAW_PROD_TOKEN" },
        },
      },
      inputSchema: {
        type: "object",
        required: ["agent", "prompt", "metadata"],
        additionalProperties: false,
        properties: {
          agent: { type: "string", const: "J_360" },
          prompt: { type: "string", minLength: 1 },
          projectId: { type: ["string", "null"] },
          metadata: {
            type: "object",
            required: ["deliverableType"],
            properties: {
              deliverableType: {
                type: "string",
                enum: ["parecer", "minuta", "memorando"],
              },
              recipients: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "email"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { type: "string" },
                  },
                },
              },
              references: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    summary: { type: "string" },
                  },
                },
              },
              approvalWindowHours: { type: "integer", minimum: 1, maximum: 168 },
            },
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
            required: ["id", "status", "response"],
            properties: {
              id: { type: "string" },
              status: { type: "string" },
              response: {
                type: "object",
                properties: {
                  documentUrl: { type: "string" },
                  approvalStatus: { type: "string" },
                },
              },
            },
          },
        },
      },
      timeoutMs: 20000,
      retryPolicy: {
        retries: 1,
        backoffMs: 400,
      },
      simulateFirst: true,
      requires_confirmation: "true",
      costEstimator: {
        baseCents: 11,
        perKBcents: 3,
      },
      audit: {
        logRequest: true,
        pii: ["recipients"],
      },
      version: "1.0.0",
    },
  ],
};

