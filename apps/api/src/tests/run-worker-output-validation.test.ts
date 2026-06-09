import assert from "node:assert/strict";
import { test } from "node:test";
import { detectRunWorkerOutputFailure } from "../workers/runWorkerOutputValidation";

test("detectRunWorkerOutputFailure blocks OpenAI outputs truncated by length", () => {
  const failure = detectRunWorkerOutputFailure({
    rawResponse: {
      id: "chatcmpl-1",
      choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "{}" } }],
    },
  });

  assert.match(failure ?? "", /llm_output_truncated/);
});

test("detectRunWorkerOutputFailure ignores completed outputs", () => {
  const failure = detectRunWorkerOutputFailure({
    rawResponse: {
      id: "chatcmpl-2",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{}" } }],
    },
  });

  assert.equal(failure, null);
});

test("detectRunWorkerOutputFailure allows truncated MKT output when the partial response is already usable", () => {
  const failure = detectRunWorkerOutputFailure({
    agentId: "MKT",
    outputText: `## Resumo executivo
- Objetivo: gerar leads qualificados para a Vertical Legal.
- KPI: 20 MQLs e 10 reuniões.

## ICP e posicionamento
- Escritórios boutique trabalhistas, contratuais e LGPD.
- Posicionamento consultivo com piloto guiado.

## Canais prioritários
- LinkedIn, email e parcerias com cadência curta.

## Cronograma
- Semana 1: narrativa e lista alvo.
- Semana 2: outreach e landing.

## Próximos passos
- Fechar oferta, revisar copy e ativar follow-up.

## Compliance
- Revisar publicidade OAB antes da publicação.`,
    rawResponse: {
      id: "chatcmpl-3",
      choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "{}" } }],
    },
  });

  assert.equal(failure, null);
});
