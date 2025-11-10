import { AgentProfile } from "@prisma/client";

export type SimpleExecutorParams = {
  profile: AgentProfile;
  userPrompt: string;
  metadata?: Record<string, unknown>;
};

export type SimpleExecutorResult = {
  outputText: string;
  rawResponse: unknown;
  traceId?: string;
  tookMs?: number;
};

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function simpleExecuteAgentRun({
  profile,
  userPrompt,
}: SimpleExecutorParams): Promise<SimpleExecutorResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (typeof fetch === "undefined") {
    throw new Error("Global fetch is not available in this runtime");
  }

  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model: profile.model,
    messages: [
      { role: "system", content: profile.systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (Array.isArray(profile.tools)) {
    const openAiTools = (profile.tools as Array<unknown>).filter(
      (tool): tool is { type: string } =>
        Boolean(
          tool &&
            typeof tool === "object" &&
            "type" in tool &&
            typeof (tool as { type?: unknown }).type === "string"
        )
    );

    if (openAiTools.length > 0) {
      body.tools = openAiTools;
    }
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const json = await response.json();
  const tookMs = Date.now() - startedAt;

  const outputText =
    json?.choices?.[0]?.message?.content ??
    (Array.isArray(json?.output) ? json.output.map((part: any) => part.content ?? "").join("\n") : "");

  return {
    outputText,
    rawResponse: json,
    traceId: json?.id,
    tookMs,
  };
}
