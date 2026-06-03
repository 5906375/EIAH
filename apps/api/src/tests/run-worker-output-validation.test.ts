import assert from "node:assert/strict";
import { test } from "node:test";
import { detectRunWorkerOutputFailure } from "../workers/runWorkerOutputValidation";

test("detectRunWorkerOutputFailure blocks OpenAI outputs truncated by length", () => {
  const failure = detectRunWorkerOutputFailure({
    id: "chatcmpl-1",
    choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "{}" } }],
  });

  assert.match(failure ?? "", /llm_output_truncated/);
});

test("detectRunWorkerOutputFailure ignores completed outputs", () => {
  const failure = detectRunWorkerOutputFailure({
    id: "chatcmpl-2",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{}" } }],
  });

  assert.equal(failure, null);
});
