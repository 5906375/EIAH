import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareRunRequestAction,
  RunActionValidationError,
} from "../services/imob/control/imobRunActionCatalog";

test("prepareRunRequestAction normalizes metadata.action into canonical request.action", () => {
  const result = prepareRunRequestAction({
    request: {
      prompt: "registrar imovel",
      metadata: {
        domain: "imob",
        action: "realestate.register_property",
      },
    },
    requireCanonicalImobAction: true,
  });

  assert.equal(result.action, "property.create");
  assert.deepEqual(result.request, {
    prompt: "registrar imovel",
    metadata: {
      domain: "imob",
      action: "realestate.register_property",
    },
    action: "property.create",
  });
});

test("prepareRunRequestAction rejects invalid IMOB action when strict validation is enabled", () => {
  assert.throws(
    () =>
      prepareRunRequestAction({
        request: {
          prompt: "acao invalida",
          metadata: {
            domain: "imob",
            action: "realestate.unknown_action",
          },
        },
        requireCanonicalImobAction: true,
      }),
    (error: unknown) =>
      error instanceof RunActionValidationError
      && error.reasonCode === "INVALID_ACTION_TYPE"
      && error.context.attemptedAction === "realestate.unknown_action",
  );
});

test("prepareRunRequestAction allows IMOB audit runs without action", () => {
  const result = prepareRunRequestAction({
    request: {
      prompt: "audit transcript",
      metadata: {
        domain: "imob",
        kind: "conversation_audit",
      },
    },
    requireCanonicalImobAction: true,
  });

  assert.equal(result.action, null);
  assert.deepEqual(result.request, {
    prompt: "audit transcript",
    metadata: {
      domain: "imob",
      kind: "conversation_audit",
    },
  });
});
