import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ImobWorkbenchContextPanel } from "./ImobWorkbenchContextPanel";
import { ImobWorkbenchShell } from "./ImobWorkbenchShell";
import type { ImobWorkbenchIntakeContext } from "./imobWorkbenchContext";

const READY_CONTEXT: ImobWorkbenchIntakeContext = {
  kind: "result",
  threadId: "thread-intake-1234567890",
  threadLabel: "Intake contrato",
  caseId: "case-1234567890",
  runId: "run-1234567890",
  status: "ready_for_review",
  stage: "documents_collecting",
  nextStep: "Revisar cláusulas mascaradas",
  pendingItems: ["Garantia não definida"],
  riskFlags: ["Multa abaixo do mínimo"],
  documentHash: "aabbccddeeff00112233445566778899",
  documentKind: null,
  contractType: null,
  draftId: null,
  draftExpiresAt: null,
  extractedFields: [],
};

const RUN_ONLY_CONTEXT: ImobWorkbenchIntakeContext = {
  kind: "result",
  threadId: null,
  threadLabel: null,
  caseId: null,
  runId: "run-archive-999999",
  status: "ready_for_review",
  stage: "documents_collecting",
  nextStep: null,
  pendingItems: [],
  riskFlags: [],
  documentHash: "ffeeddccbbaa00998877665544332211",
  documentKind: null,
  contractType: null,
  draftId: null,
  draftExpiresAt: null,
  extractedFields: [],
};

function renderPanel(
  state: "loading" | "empty" | "error" | "ready",
  intakeContext: ImobWorkbenchIntakeContext | null = READY_CONTEXT,
  hrefs?: {
    commandCenterHref?: string | null;
    funnelHref?: string | null;
    runArchiveHref?: string | null;
  },
) {
  return renderToStaticMarkup(
    <ImobWorkbenchContextPanel
      state={state}
      intakeContext={intakeContext}
      commandCenterHref={hrefs?.commandCenterHref ?? "/app/imob/dashboard?conversationId=conv-1&threadId=thread-intake-1234567890&caseId=case-1234567890"}
      funnelHref={hrefs?.funnelHref ?? "/app/imob/dashboard?tab=funil&conversationId=conv-1&threadId=thread-intake-1234567890&caseId=case-1234567890"}
      runArchiveHref={hrefs?.runArchiveHref ?? "/app/runs?domain=imob&runId=run-1234567890&conversationId=conv-1&threadId=thread-intake-1234567890&caseId=case-1234567890"}
      errorMessage="Falha"
    />,
  );
}

describe("ImobWorkbenchContextPanel", () => {
  it("renders loading state", () => {
    const html = renderPanel("loading", null);
    assert.match(html, /Carregando contexto do intake/);
    assert.match(html, /payload real estiver disponível/);
  });

  it("renders error state", () => {
    const html = renderPanel("error", null);
    assert.match(html, /Falha ao carregar o contexto do intake/);
    assert.match(html, /Falha/);
  });

  it("renders empty state without synthetic data", () => {
    const html = renderPanel("empty", null);
    assert.match(html, /Sem intake ativo/);
    assert.match(html, /Inicie uma conversa no chat/);
    assert.doesNotMatch(html, /Garantia não definida/);
  });

  it("renders intake payload with export actions", () => {
    const html = renderPanel("ready");
    assert.match(html, /Exportar HTML/);
    assert.match(html, /Orientação PDF/);
    assert.match(html, /client já existente para HTML, DOCX e orientação de PDF/);
    assert.match(html, /Garantia não definida/);
  });

  it("renders visual CTAs only when safe destinations are provided", () => {
    const html = renderPanel("ready");
    assert.match(html, /Abrir contexto no Command Center/);
    assert.match(html, /Abrir Funil deste caso/);
    assert.match(html, /Abrir execução no RunArchive/);
    assert.match(html, /\/app\/imob\/dashboard\?tab=funil&amp;conversationId=conv-1&amp;threadId=thread-intake-1234567890&amp;caseId=case-1234567890/);
    assert.match(html, /\/app\/runs\?domain=imob&amp;runId=run-1234567890&amp;conversationId=conv-1&amp;threadId=thread-intake-1234567890&amp;caseId=case-1234567890/);
  });

  it("uses general command center label when only the surface route is safe", () => {
    const html = renderPanel("ready", RUN_ONLY_CONTEXT, {
      commandCenterHref: "/app/imob/dashboard",
      funnelHref: null,
      runArchiveHref: "/app/runs?domain=imob&runId=run-archive-999999",
    });
    assert.match(html, /Abrir visão geral do Command Center/);
    assert.doesNotMatch(html, /Abrir Funil deste caso/);
    assert.match(html, /Abrir execução no RunArchive/);
  });

  it("keeps safe fallback when payload does not provide destinations", () => {
    const html = renderToStaticMarkup(
      <ImobWorkbenchContextPanel
        state="ready"
        intakeContext={READY_CONTEXT}
        commandCenterHref={null}
        funnelHref={null}
        runArchiveHref={null}
      />,
    );
    assert.doesNotMatch(html, /Ver no Command Center/);
    assert.doesNotMatch(html, /Ver no Funil/);
    assert.doesNotMatch(html, /Abrir RunArchive/);
    assert.match(html, /Dossiê indisponível neste piloto/);
    assert.match(html, /Ainda não há rota frontend segura dedicada/);
    assert.match(html, /O painel permanece informativo até que um contexto navegável seja emitido/);
  });

  it("does not invent chat or dossier destinations", () => {
    const html = renderPanel("ready");
    assert.doesNotMatch(html, /Abrir no chat/);
    assert.doesNotMatch(html, /\/app\/imob\/chat\?/);
  });

  it("renders only masked context references from the payload", () => {
    const html = renderPanel("ready");
    assert.match(html, /thread thread-intak…7890/);
    assert.match(html, /case case-1234567890/);
    assert.match(html, /run run-1234567890/);
    assert.doesNotMatch(html, /aabbccddeeff00112233445566778899/);
  });

  it("does not render CPF or email patterns", () => {
    const html = renderPanel("ready");
    assert.doesNotMatch(html, /\d{3}\.\d{3}\.\d{3}-\d{2}/);
    assert.doesNotMatch(html, /[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  it("shows pilot badge and panel header", () => {
    const html = renderPanel("ready");
    assert.match(html, /Piloto controlado/);
    assert.match(html, /Resumo do intake/);
  });
});

describe("ImobWorkbenchShell", () => {
  it("renders the current shell grid, mobile toggle and back action when provided", () => {
    const html = renderToStaticMarkup(
      <ImobWorkbenchShell
        sidebar={<div>sidebar</div>}
        main={<div>main</div>}
        contextPanel={<div>context</div>}
        isContextPanelOpen={false}
        onToggleContextPanel={() => {}}
        onBackClick={() => {}}
      />,
    );
    assert.match(html, /xl:grid-cols-\[216px,minmax\(760px,920px\),272px\]/);
    assert.match(html, /lg:grid-cols-\[208px,minmax\(0,1fr\)\]/);
    assert.match(html, /Resumo do intake/);
    assert.match(html, />Voltar</);
    assert.match(html, /Ocultar|Mostrar/);
  });
});
