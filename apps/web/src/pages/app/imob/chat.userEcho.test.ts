import test from "node:test";
import assert from "node:assert/strict";
import type { ImobPresentationForm } from "@/lib/api";

import {
  buildPresentationFormDisplayText,
  resolveStructuredImobAutopromptOptions,
  shouldEchoImobUserMessage,
} from "./chat";

test("shouldEchoImobUserMessage suprime eco de CTA e submit estruturado", () => {
  assert.equal(shouldEchoImobUserMessage({ suppressUserEcho: true }), false);
  assert.equal(shouldEchoImobUserMessage({ suppressUserEcho: false }), true);
  assert.equal(shouldEchoImobUserMessage(undefined), true);
});

test("resolveStructuredImobAutopromptOptions normaliza autoprompt de captação sem eco cru", () => {
  assert.deepEqual(
    resolveStructuredImobAutopromptOptions(
      "Quero iniciar uma captação no IMOB. Me mostre opções de próximos passos no chat.",
    ),
    {
      displayText: "Captar imóvel",
      suppressUserEcho: true,
    },
  );
});

test("resolveStructuredImobAutopromptOptions normaliza quick action IMOB conhecida", () => {
  assert.deepEqual(
    resolveStructuredImobAutopromptOptions("qualificar lead comprador e sugerir próximos passos deste caso"),
    {
      displayText: "Qualificar lead comprador",
      suppressUserEcho: true,
    },
  );
});

test("resolveStructuredImobAutopromptOptions preserva prompt livre fora do catálogo estruturado", () => {
  assert.deepEqual(resolveStructuredImobAutopromptOptions("quero revisar este caso agora"), {});
});

test("buildPresentationFormDisplayText mantém rótulo estruturado separado do payload", () => {
  const form: ImobPresentationForm = {
    entity: "imovel",
    action: "create",
    label: "Cadastrar imóvel",
    description: "Abrir captação de imóvel.",
    fields: [
      { name: "propertyType", label: "Tipo", type: "text", required: true },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar cadastro", kind: "primary" },
    ],
  };

  assert.equal(buildPresentationFormDisplayText(form, "submit"), "Salvar cadastro");
});
