import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogisticaJourneyBlockedView, LogisticaJourneyStepsView } from "./LogisticaConversationJourney";
import { resolveLogisticaJourney } from "@/components/agents/logisticaConversationEngine";

test("etapas na conversa: estado de cada etapa, pendências e próximo passo vêm do engine", () => {
  const html = renderToStaticMarkup(<LogisticaJourneyStepsView view={resolveLogisticaJourney(null)} />);
  for (const title of ["Contexto da operação", "Referência declarada da operação", "Documentos e evidências", "Conferência documental (humana)", "Decisão humana"]) assert.match(html, new RegExp(title.replace(/[()]/g, "\\$&")));
  assert.match(html, /data-step="context" data-state="pending"/);
  assert.match(html, /Próximo passo:/); assert.doesNotMatch(html, /Copiar resumo/);
});

test("decisão humana: mostra o resumo para o responsável, avisa que não há fila e só oferece copiar quando há manipulador", () => {
  const view = resolveLogisticaJourney({
    schemaVersion: "oraculo.empty-return-preparation.v1", tenantId: "t", workspaceId: "w", caseId: "cm0synthetic0case01", caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", revision: 3, lifecycle: "DISCOVERY",
    context: { port: { status: "informed", value: "P" }, depot: { status: "informed", value: "D" }, flow: { status: "not_applicable", justification: "j" } },
    createdAt: "2026-10-19T10:00:00.000Z", updatedAt: "2026-10-19T11:00:00.000Z", executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false,
  } as never);
  const without = renderToStaticMarkup(<LogisticaJourneyStepsView view={view} />);
  assert.match(without, /Decisão humana necessária/); assert.match(without, /Não existe fila nem aviso automático/); assert.match(without, /Fluxo pretendido: dispensado com justificativa/);
  assert.doesNotMatch(without, /Copiar resumo/);
  const withCopy = renderToStaticMarkup(<LogisticaJourneyStepsView view={view} onCopySummary={() => undefined} />);
  assert.match(withCopy, /Copiar resumo para o responsável/);
});

test("bloqueio explícito: cada motivo mostra a mensagem do servidor, nenhum formulário e a declaração de que nada foi executado", () => {
  for (const reason of ["policy_denied", "installation_missing", "approval_required", "membership_required", "unavailable"] as const) {
    const html = renderToStaticMarkup(<LogisticaJourneyBlockedView reason={reason} />);
    assert.match(html, /Preparação indisponível nesta conversa/); assert.match(html, /Nenhuma operação foi executada e nenhum dado foi consultado/);
    assert.doesNotMatch(html, /Salvar preparação|<form|<input/);
  }
  assert.match(renderToStaticMarkup(<LogisticaJourneyBlockedView reason="policy_denied" />), /permissão de consulta de Logística ainda não foi concedida/);
});

test("campo 'a confirmar' sem texto é válido para o contrato (antes enviava value vazio e o servidor recusava)", async () => {
  const { emptyFieldForStatus } = await import("./OraculoPreparationPanel");
  const { oraculoPreparationFieldV1Schema } = await import("@eiah/contracts");
  assert.deepEqual(emptyFieldForStatus("to_confirm"), { status: "to_confirm" });
  assert.equal(oraculoPreparationFieldV1Schema.safeParse(emptyFieldForStatus("to_confirm")).success, true);
  assert.equal(oraculoPreparationFieldV1Schema.safeParse(emptyFieldForStatus("not_informed")).success, true);
  // informado e não se aplica continuam exigindo texto (o formulário marca como obrigatório)
  assert.deepEqual(emptyFieldForStatus("informed"), { status: "informed", value: "" });
  assert.deepEqual(emptyFieldForStatus("not_applicable"), { status: "not_applicable", justification: "" });
  assert.equal(oraculoPreparationFieldV1Schema.safeParse(emptyFieldForStatus("informed")).success, false);
});
