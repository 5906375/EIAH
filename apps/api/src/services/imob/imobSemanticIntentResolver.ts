import { z } from "zod";
import { IMOB_ACTION_CATALOG, type ImobActionKey, type ImobEntityKey } from "./imobActionCatalog";
import {
  detectEntityPlurality,
  getCanonicalLabel,
  parseImobIntent,
  type ParsedImobIntent,
} from "./imobIntentCatalog";

type SemanticIntentPayload = {
  entity: string | null;
  action: string | null;
  confidence: number | null;
  needsClarification: boolean;
  composedIntents: Array<{
    entity: string | null;
    action: string | null;
  }>;
};

export type ImobSemanticIntentResolution = {
  parsedIntent: ParsedImobIntent;
  source: "openai" | "parser_fallback";
  confidence: number | null;
  composedIntents: ParsedImobIntent[];
};

const INTENT_RESOLUTION_TIMEOUT_MS = Number(process.env.IMOB_INTENT_RESOLUTION_TIMEOUT_MS ?? 6000);
const DEFAULT_INTENT_MODEL =
  process.env.IMOB_INTENT_RESOLUTION_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-4.1-mini";
const SEMANTIC_CONFIDENCE_THRESHOLD = 0.72;

function normalizeSemanticText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveKnownColloquialIntent(message: string): ParsedImobIntent | null {
  const normalized = normalizeSemanticText(message);
  const mentionsProperty = normalized.includes("imovel") || normalized.includes("imoveis") || normalized.includes("propriedade");
  const mentionsListingMotion =
    normalized.includes("botar") ||
    normalized.includes("colocar") ||
    normalized.includes("por") ||
    normalized.includes("subir") ||
    normalized.includes("rodar") ||
    normalized.includes("anunciar") ||
    normalized.includes("publicar");
  const publishContext =
    normalized.includes("pra rodar") ||
    normalized.includes("para rodar") ||
    normalized.includes("no portal") ||
    normalized.includes("nos portais") ||
    normalized.includes("publicacao") ||
    normalized.includes("anuncio");

  if (mentionsProperty && mentionsListingMotion && publishContext) {
    return toParsedIntent(message, { entity: "anuncio", action: "publish" });
  }

  return null;
}
const KNOWN_ACTIONS: ImobActionKey[] = [
  "create",
  "edit",
  "delete",
  "list",
  "get",
  "update",
  "configure",
  "status",
  "sendDocuments",
  "history",
  "publish",
  "unpublish",
  "convert",
  "assign",
  "approve",
  "reject",
  "send",
  "sendForSignature",
  "confirm",
  "reschedule",
  "validate",
  "pause",
  "sendReceipt",
  "view",
  "indicators",
  "reports",
  "export",
];

const SemanticIntentResponseSchema = z.object({
  entity: z.string().trim().min(1).nullable().optional(),
  action: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  needsClarification: z.boolean().optional(),
  composedIntents: z.array(z.object({
    entity: z.string().trim().min(1).nullable().optional(),
    action: z.string().trim().min(1).nullable().optional(),
  })).optional(),
});

const SemanticIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    entity: { type: ["string", "null"] },
    action: { type: ["string", "null"] },
    confidence: { type: ["number", "null"] },
    needsClarification: { type: "boolean" },
    composedIntents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          entity: { type: ["string", "null"] },
          action: { type: ["string", "null"] },
        },
        required: ["entity", "action"],
      },
    },
  },
  required: ["entity", "action", "confidence", "needsClarification", "composedIntents"],
} as const;

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
      if (typeof content?.output_text === "string" && content.output_text.trim()) {
        parts.push(content.output_text);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return {};
  }
  try {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  } catch {
    return {};
  }
}

function listAllowedPairs() {
  const lines: string[] = [];
  for (const [entity, config] of Object.entries(IMOB_ACTION_CATALOG) as Array<
    [ImobEntityKey, (typeof IMOB_ACTION_CATALOG)[ImobEntityKey]]
  >) {
    const actions = Object.keys(config.actions) as ImobActionKey[];
    lines.push(`- ${entity}: ${actions.join(", ")}`);
  }
  return lines.join("\n");
}

function isValidEntity(entity: string | null | undefined): entity is ImobEntityKey {
  return Boolean(entity) && Object.prototype.hasOwnProperty.call(IMOB_ACTION_CATALOG, entity);
}

function isValidAction(action: string | null | undefined): action is ImobActionKey {
  return Boolean(action) && KNOWN_ACTIONS.includes(action as ImobActionKey);
}

function supportsEntityAction(entity: ImobEntityKey, action: ImobActionKey) {
  return Boolean(IMOB_ACTION_CATALOG[entity].actions[action]);
}

function toParsedIntent(
  message: string,
  semantic: { entity: ImobEntityKey | null; action: ImobActionKey | null },
): ParsedImobIntent {
  const pluralityHint = semantic.entity ? detectEntityPlurality(message, semantic.entity) : null;
  const canonicalLabel =
    semantic.entity && semantic.action ? getCanonicalLabel(semantic.entity, semantic.action) : null;
  return {
    entity: semantic.entity,
    action: semantic.action,
    matchedEntityAlias: null,
    matchedActionAlias: null,
    entityScore: semantic.entity ? 120 : 0,
    actionScore: semantic.action ? 120 : 0,
    pluralityHint,
    canonicalLabel,
  };
}

async function resolveWithOpenAi(message: string, apiKey: string): Promise<SemanticIntentPayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTENT_RESOLUTION_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_INTENT_MODEL,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "Você classifica intenções do chat IMOB em um catálogo canônico. " +
                  "Não invente entidades ou ações fora do catálogo. " +
                  "Se a frase estiver ambígua, retorne action=null ou entity=null e needsClarification=true. " +
                  "Quando a frase pedir mais de uma ação na mesma sentença, preencha composedIntents na ordem em que as ações aparecem.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Mensagem do usuário: ${message}\n\n` +
                  "Catálogo permitido (entity: actions):\n" +
                  `${listAllowedPairs()}\n\n` +
                  "Retorne o JSON solicitado com a melhor entity/action canônica para essa mensagem.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "imob_semantic_intent",
            strict: true,
            schema: SemanticIntentJsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const json = await response.json();
    const content = extractResponseText(json);
    const parsed = extractJsonObject(content || JSON.stringify({}));
    const validated = SemanticIntentResponseSchema.safeParse(parsed);
    if (!validated.success) return null;
    return {
      entity: validated.data.entity ?? null,
      action: validated.data.action ?? null,
      confidence: validated.data.confidence ?? null,
      needsClarification: validated.data.needsClarification ?? false,
      composedIntents: Array.isArray(validated.data.composedIntents)
        ? validated.data.composedIntents.map((item) => ({
          entity: item.entity ?? null,
          action: item.action ?? null,
        }))
        : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveImobSemanticIntent(message: string): Promise<ImobSemanticIntentResolution> {
  const colloquial = resolveKnownColloquialIntent(message);
  if (colloquial) {
    return { parsedIntent: colloquial, source: "parser_fallback", confidence: null, composedIntents: [] };
  }

  const fallback = parseImobIntent(message);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { parsedIntent: fallback, source: "parser_fallback", confidence: null, composedIntents: [] };
  }

  const semantic = await resolveWithOpenAi(message, apiKey);
  if (!semantic) {
    return { parsedIntent: fallback, source: "parser_fallback", confidence: null, composedIntents: [] };
  }

  const confidence = semantic.confidence ?? null;
  if (semantic.needsClarification || (typeof confidence === "number" && confidence < SEMANTIC_CONFIDENCE_THRESHOLD)) {
    return { parsedIntent: fallback, source: "parser_fallback", confidence, composedIntents: [] };
  }

  const entity = isValidEntity(semantic.entity) ? semantic.entity : null;
  const action = isValidAction(semantic.action) ? semantic.action : null;
  const composedIntents = semantic.composedIntents
    .map((item) => {
      const itemEntity = isValidEntity(item.entity) ? item.entity : null;
      const itemAction = isValidAction(item.action) ? item.action : null;
      if (!itemEntity || !itemAction) return null;
      if (!supportsEntityAction(itemEntity, itemAction)) return null;
      return toParsedIntent(message, { entity: itemEntity, action: itemAction });
    })
    .filter((item): item is ParsedImobIntent => item !== null);

  if (entity && action && !supportsEntityAction(entity, action)) {
    return { parsedIntent: fallback, source: "parser_fallback", confidence, composedIntents };
  }

  if (!entity && !action) {
    return { parsedIntent: fallback, source: "parser_fallback", confidence, composedIntents };
  }

  return {
    parsedIntent: toParsedIntent(message, { entity, action }),
    source: "openai",
    confidence,
    composedIntents,
  };
}
