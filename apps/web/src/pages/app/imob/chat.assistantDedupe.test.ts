import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobFrontdoorStatePresentation,
  buildAssistantMessageDedupeKey,
  dedupeRunMessages,
  normalizeImobAccessGateErrorPresentation,
} from "./chat";
import { ApiError } from "@/lib/api";

test("dedupeRunMessages colapsa duplicata assistente legado sem runId inicial", () => {
  const dedupeKey = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:collecting",
    text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
    threadId: "thread-captacao-1",
  });

  const items = dedupeRunMessages([
    {
      id: "assistant-plan",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: dedupeKey,
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
      card: { type: "queue", title: "Preparando", lines: [] },
    } as any,
    {
      id: "assistant-terminal",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: dedupeKey,
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-123" },
    } as any,
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "assistant-terminal");
  assert.equal(items[0]?.card?.runId, "run-123");
});

test("dedupeRunMessages preserva mensagens assistente semanticamente distintas", () => {
  const first = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:collecting",
    text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
    threadId: "thread-captacao-1",
  });
  const second = buildAssistantMessageDedupeKey({
    action: "realestate.register_property",
    presentationDedupeKey: "property.create:ready_for_review",
    text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
    threadId: "thread-captacao-1",
  });

  const items = dedupeRunMessages([
    {
      id: "assistant-1",
      role: "assistant",
      text: "Preencha os campos abaixo para continuar o cadastro do imóvel.",
      assistantDedupeKey: first,
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
    } as any,
    {
      id: "assistant-2",
      role: "assistant",
      text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
      assistantDedupeKey: second,
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-456" },
    } as any,
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, "assistant-1");
  assert.equal(items[1]?.id, "assistant-2");
});

test("dedupeRunMessages mantém fallback por runId para started e terminal do mesmo run", () => {
  const items = dedupeRunMessages([
    {
      id: "assistant-started",
      role: "assistant",
      text: "Atualizando progresso em tempo real.",
      thread: { id: "thread-captacao-1", label: "Captação", status: "active" },
      card: { type: "queue", title: "Em andamento", lines: [], runId: "run-789" },
    } as any,
    {
      id: "assistant-terminal",
      role: "assistant",
      text: "Atualizei o cadastro do imóvel. Continue pelos campos pendentes abaixo.",
      thread: { id: "thread-captacao-1", label: "Captação", status: "done" },
      card: { type: "queue", title: "Concluído", lines: [], runId: "run-789" },
    } as any,
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "assistant-terminal");
});

test("normalizeImobAccessGateErrorPresentation preserves backend message, reasonCode and CTA", () => {
  const error = new ApiError(403, "Forbidden", {
    ok: false,
    error: {
      message: "IMOB não está habilitado neste workspace.",
      reasonCode: "IMOB_ENTITLEMENT_MISSING",
      cta: {
        type: "INSTALL",
        label: "Instalar IMOB",
        target: "/app/marketplace/imob",
      },
      details: {
        entitlementRequired: "IMOB_ACTIVE_INSTALLATION",
        installationStatus: "missing",
      },
    },
  });

  const presentation = normalizeImobAccessGateErrorPresentation(error);

  assert.equal(presentation.text, "IMOB não está habilitado neste workspace.");
  assert.ok(presentation.card.lines.includes("Código: IMOB_ENTITLEMENT_MISSING"));
  assert.deepEqual(presentation.card.ctas, [
    {
      id: "imob-access-gate-IMOB_ENTITLEMENT_MISSING",
      label: "Instalar IMOB",
      href: "/app/marketplace/imob",
      kind: "primary",
    },
  ]);
});

test("normalizeImobAccessGateErrorPresentation does not invent CTA when backend omits it", () => {
  const error = new ApiError(403, "Forbidden", {
    ok: false,
    error: {
      message: "Você não possui permissão para usar este recurso do IMOB neste workspace.",
      reasonCode: "IMOB_PERMISSION_DENIED",
    },
  });

  const presentation = normalizeImobAccessGateErrorPresentation(error);

  assert.equal(presentation.text, "Você não possui permissão para usar este recurso do IMOB neste workspace.");
  assert.ok(presentation.card.lines.includes("Código: IMOB_PERMISSION_DENIED"));
  assert.equal(presentation.card.ctas, undefined);
});

test("normalizeImobAccessGateErrorPresentation uses safe fallback without backend message", () => {
  const error = new ApiError(403, "Forbidden", {
    ok: false,
    error: {
      reasonCode: "IMOB_INSTALLATION_INACTIVE",
      cta: {
        label: "",
        target: "/app/marketplace/imob",
      },
    },
  });

  const presentation = normalizeImobAccessGateErrorPresentation(error);

  assert.equal(presentation.text, "Não foi possível concluir esta ação neste workspace.");
  assert.ok(presentation.card.lines.includes("Código: IMOB_INSTALLATION_INACTIVE"));
  assert.equal(presentation.card.ctas, undefined);
});

test("buildImobFrontdoorStatePresentation renders loading without CTA", () => {
  const presentation = buildImobFrontdoorStatePresentation({ kind: "loading" });

  assert.equal(presentation.text, "Carregando o contexto IMOB...");
  assert.equal(presentation.card.type, "queue");
  assert.equal(presentation.card.queue?.status, "loading");
  assert.equal(presentation.card.ctas, undefined);
});

test("buildImobFrontdoorStatePresentation renders empty front door without invented next step", () => {
  const presentation = buildImobFrontdoorStatePresentation({ kind: "empty" });

  assert.equal(presentation.text, "Ainda não há uma conversa IMOB iniciada neste workspace.");
  assert.equal(presentation.card.type, "action");
  assert.match(presentation.card.lines.join("\n"), /O próximo passo será decidido pelo agente/);
  assert.equal(presentation.card.ctas, undefined);
});

test("buildImobFrontdoorStatePresentation renders generic structured error without CTA", () => {
  const error = new ApiError(500, "Internal Server Error", {
    ok: false,
    error: {
      message: "Falha temporária ao consultar o contexto IMOB.",
      reasonCode: "IMOB_CONTEXT_QUERY_FAILED",
      cta: {
        label: "Não deve aparecer",
        target: "/app/imob",
      },
    },
  });

  const presentation = buildImobFrontdoorStatePresentation({ kind: "error", error });

  assert.equal(presentation.text, "Falha temporária ao consultar o contexto IMOB.");
  assert.equal(presentation.card.type, "risk");
  assert.ok(presentation.card.lines.includes("Código: IMOB_CONTEXT_QUERY_FAILED"));
  assert.equal(presentation.card.ctas, undefined);
});

test("buildImobFrontdoorStatePresentation preserves F0.1 entitlement CTA when backend sends it", () => {
  const error = new ApiError(403, "Forbidden", {
    ok: false,
    error: {
      message: "IMOB não está habilitado neste workspace.",
      reasonCode: "IMOB_ENTITLEMENT_MISSING",
      cta: {
        label: "Instalar IMOB",
        target: "/app/marketplace/imob",
      },
    },
  });

  const presentation = buildImobFrontdoorStatePresentation({ kind: "entitlement", error });

  assert.equal(presentation.text, "IMOB não está habilitado neste workspace.");
  assert.deepEqual(presentation.card.ctas, [
    {
      id: "imob-access-gate-IMOB_ENTITLEMENT_MISSING",
      label: "Instalar IMOB",
      href: "/app/marketplace/imob",
      kind: "primary",
    },
  ]);
});

test("buildImobFrontdoorStatePresentation preserves entitlement without invented CTA", () => {
  const error = new ApiError(403, "Forbidden", {
    ok: false,
    error: {
      message: "Você não possui permissão para usar este recurso do IMOB neste workspace.",
      reasonCode: "IMOB_PERMISSION_DENIED",
    },
  });

  const presentation = buildImobFrontdoorStatePresentation({ kind: "entitlement", error });

  assert.equal(presentation.text, "Você não possui permissão para usar este recurso do IMOB neste workspace.");
  assert.equal(presentation.card.ctas, undefined);
});

test("buildImobFrontdoorStatePresentation fails closed for unknown state", () => {
  const presentation = buildImobFrontdoorStatePresentation({ kind: "unexpected_state" });

  assert.equal(presentation.text, "Não foi possível determinar o próximo estado do atendimento IMOB.");
  assert.equal(presentation.card.type, "risk");
  assert.equal(presentation.card.risk?.reason, "IMOB_FRONTDOOR_UNKNOWN_STATE");
  assert.equal(presentation.card.ctas, undefined);
});
