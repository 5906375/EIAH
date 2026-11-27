import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareRunRequestAction,
  projectPersistedRunActionMetadata,
  resolvePersistedRunActionAuthority,
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

test("prepareRunRequestAction preserves the registered IMOB intake action", () => {
  const result = prepareRunRequestAction({
    request: {
      actionId: "imob.contract.intake",
      metadata: {
        domain: "imob",
        action: "imob.contract.intake",
      },
    },
    requireCanonicalImobAction: true,
  });

  assert.equal(result.action, "imob.contract.intake");
  assert.deepEqual(result.request, {
    actionId: "imob.contract.intake",
    metadata: {
      domain: "imob",
      action: "imob.contract.intake",
    },
    action: "imob.contract.intake",
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

test("prepareRunRequestAction rejects non-audit IMOB runs without action", () => {
  assert.throws(
    () =>
      prepareRunRequestAction({
        request: {
          prompt: "conversa operacional sem action",
          metadata: {
            domain: "imob",
            kind: "conversation",
          },
        },
        requireCanonicalImobAction: true,
      }),
    (error: unknown) =>
      error instanceof RunActionValidationError
      && error.reasonCode === "INVALID_ACTION_TYPE"
      && error.context.attemptedAction === null,
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

test("persisted Run authority rejects conflicting root and metadata actions", () => {
  assert.throws(
    () => resolvePersistedRunActionAuthority({
      request: {
        action: "property.create",
        metadata: {
          domain: "imob",
          kind: "operation",
          action: "realestate.apply_adjustment",
        },
      },
      requireCanonicalImobAction: true,
    }),
    (error: unknown) =>
      error instanceof RunActionValidationError
      && error.reasonCode === "INVALID_ACTION_TYPE",
  );
});

test("persisted Run authority overwrites transport domain, kind and action", () => {
  const authority = resolvePersistedRunActionAuthority({
    request: {
      action: "adjustment.apply",
      metadata: {
        domain: "imob",
        kind: "operation",
        action: "realestate.apply_adjustment",
      },
    },
    requireCanonicalImobAction: true,
  });

  assert.deepEqual(projectPersistedRunActionMetadata({
    domain: "core",
    kind: "conversation_audit",
    action: "malicious.action",
    benign: "kept",
  }, authority), {
    domain: "imob",
    kind: "operation",
    action: "realestate.apply_adjustment",
    benign: "kept",
  });
});
