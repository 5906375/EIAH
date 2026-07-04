import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobSlotCollectionCard } from "./ImobSlotCollectionCard";
import {
  shouldRenderMessageSlotCollectionCard,
  shouldRenderPendingExecutionSlotCollectionCard,
} from "./imobChatPresentationGuards";

test("ImobSlotCollectionCard renders human labels for property intake fields", () => {
  const html = renderToStaticMarkup(
    <ImobSlotCollectionCard
      pendingFields={["propertyType", "goal", "cep", "city", "address"]}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );

  assert.match(html, /Tipo/);
  assert.match(html, /Finalidade/);
  assert.match(html, /CEP/);
  assert.match(html, /Cidade/);
  assert.match(html, /Endereço/);
  assert.doesNotMatch(html, /propertyType/);
  assert.doesNotMatch(html, /goal/);
  assert.doesNotMatch(html, /address/);
});

test("pending execution slot collection is suppressed when the assistant turn already has a form", () => {
  assert.equal(
    shouldRenderPendingExecutionSlotCollectionCard({
      hasForm: true,
      isLastMessage: true,
      isPendingTarget: true,
      slotFieldsCount: 5,
    }),
    false,
  );

  assert.equal(
    shouldRenderPendingExecutionSlotCollectionCard({
      hasForm: false,
      isLastMessage: true,
      isPendingTarget: true,
      slotFieldsCount: 5,
    }),
    true,
  );
});

test("message slot collection is suppressed when the assistant turn already has a form", () => {
  assert.equal(
    shouldRenderMessageSlotCollectionCard({
      hasForm: true,
      hasSlotCollection: true,
      isAssistantMessage: true,
      isLastMessage: true,
      isBusy: false,
    }),
    false,
  );

  assert.equal(
    shouldRenderMessageSlotCollectionCard({
      hasForm: false,
      hasSlotCollection: true,
      isAssistantMessage: true,
      isLastMessage: true,
      isBusy: false,
    }),
    true,
  );
});
