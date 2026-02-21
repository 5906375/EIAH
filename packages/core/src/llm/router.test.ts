import test from "node:test";
import assert from "node:assert/strict";
import { runTaskWithFallback } from "./router";

test("task router fallback switches provider when primary fails", async () => {
  const previousFlag = process.env.LLM_TASK_ROUTER_ENABLED;
  process.env.LLM_TASK_ROUTER_ENABLED = "true";
  const calls: string[] = [];

  try {
    const result = await runTaskWithFallback(
      "intent_classify",
      {
        model: "openai:gpt-4o-mini",
        messages: [{ role: "user", content: "classifique isso" }],
      },
      {
        routes: {
          intent_classify: {
            model: "openai:gpt-4o-mini",
            primaryProvider: "openai",
            fallbackProviders: ["gemini"],
            outputMode: "json",
          },
        },
      },
      {
        executor: async (request) => {
          const provider = String(request.metadata?.provider ?? "unknown");
          calls.push(provider);
          if (provider === "openai") {
            throw new Error("timeout");
          }
          return {
            id: "ok",
            output: "{\"intent\":\"consulta\"}",
            raw: null,
            finishReason: "stop",
            provider,
            model: request.model,
          };
        },
      }
    );

    assert.equal(result.provider, "gemini");
    assert.deepEqual(calls, ["openai", "gemini"]);
  } finally {
    if (previousFlag === undefined) {
      delete process.env.LLM_TASK_ROUTER_ENABLED;
    } else {
      process.env.LLM_TASK_ROUTER_ENABLED = previousFlag;
    }
  }
});

