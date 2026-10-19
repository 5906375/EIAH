import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { LogisticaFrontDoorContext } from "@/components/agents/logisticaCaseContextEngine";
import { LogisticaFrontDoorContextView } from "./LogisticaFrontDoorContextPanel";
import { openCaseFailureMessage } from "./OraculoPreparationPanel";
import { ApiError } from "@/lib/api";

const render = (context: LogisticaFrontDoorContext | null) => renderToStaticMarkup(<MemoryRouter><LogisticaFrontDoorContextView context={context} /></MemoryRouter>);
const summary = { caseId: "cm0synthetic0case01", shortId: "cm0synth", revision: 4, updatedAt: "2026-10-19T11:00:00.000Z", pending: ["Depósito"], needsReview: ["Fluxo pretendido"], evidenceCount: 2, lastReview: { outcome: "com divergência", documentId: "d1" } };

test("estado de verificação não mostra dados de caso", () => {
  const html = render(null);
  assert.match(html, /Verificando o contexto de Logística/);
  assert.doesNotMatch(html, /Resumo do caso/);
});

test("sem acesso: mensagem do motivo e retorno ao Front Door; nenhum dado de caso nem link do cockpit", () => {
  const html = render({ status: "no_access", reason: "policy_denied", title: "Logística & Comex", message: "A permissão de consulta de Logística ainda não foi concedida.", ctas: [{ id: "open_front_door_core", label: "Consultar liberação ou ativar Logística", href: "/app/chat?domain=core" }] });
  assert.match(html, /permissão de consulta/);
  assert.match(html, /domain=core/);
  assert.doesNotMatch(html, /Resumo do caso|\/app\/logistica\?case=/);
});

test("caso recuperado: pendências, revisão humana, evidências, última conferência e CTA explícito para o cockpit com a referência", () => {
  const html = render({ status: "case", usage: "full", title: "Logística & Comex", message: "Preparação e acompanhamento da devolução de contêiner vazio. Salvar ou conferir não autoriza execução nem transmissão externa.", summary, ctas: [{ id: "open_cockpit", label: "Continuar este caso no cockpit", href: "/app/logistica?case=cm0synthetic0case01" }] });
  assert.match(html, /cm0synth · revisão 4/);
  assert.match(html, /Depósito/);
  assert.match(html, /Fluxo pretendido/);
  assert.match(html, /Evidências vinculadas.*2/s);
  assert.match(html, /com divergência \(transcrição humana\)/);
  assert.match(html, /href="\/app\/logistica\?case=cm0synthetic0case01"/);
  assert.match(html, /não autoriza execução/);
});

test("caso indisponível: mensagem compreensível, sem resumo, com caminho para o cockpit", () => {
  const html = render({ status: "case_unavailable", kind: "not_found", title: "Logística & Comex", message: "Esse caso não foi encontrado neste workspace.", ctas: [{ id: "open_cockpit", label: "Abrir cockpit de Logística", href: "/app/logistica" }] });
  assert.match(html, /não foi encontrado/);
  assert.doesNotMatch(html, /Resumo do caso/);
  assert.match(html, /href="\/app\/logistica"/);
});

test("abertura de caso por referência no cockpit: mensagens por status do servidor", () => {
  assert.match(openCaseFailureMessage(new ApiError(404, "x")), /não foi encontrado/);
  assert.match(openCaseFailureMessage(new ApiError(403, "x")), /permissão/);
  assert.match(openCaseFailureMessage(new ApiError(401, "x")), /permissão/);
  assert.match(openCaseFailureMessage(new ApiError(409, "x")), /integridade/);
  assert.match(openCaseFailureMessage(new Error("rede")), /Não foi possível abrir/);
});
