import test from "node:test";
import assert from "node:assert/strict";

import { createNextImobOperationalState } from "../services/imob/imobConversationState";
import type { ImobSearchSlots } from "../services/imob/imobConversationContract";

const emptySlots: ImobSearchSlots = {
  goal: null,
  city: null,
  region: null,
  neighborhood: null,
  budgetMax: null,
  bedrooms: null,
  bathrooms: null,
  propertyType: null,
};

test("IMOB mission context starts and persists seasonal capture across owner to property turns", () => {
  const ownerState = createNextImobOperationalState(
    null,
    "capture",
    "quero cadastrar um proprietário para imóvel de temporada",
    emptySlots,
  );
  const propertyState = createNextImobOperationalState(
    ownerState,
    "capture",
    "vincular o proprietário ao próximo imóvel",
    emptySlots,
  );

  assert.equal(ownerState?.flow, "owner.create");
  assert.equal(ownerState?.missionContext?.mission, "capture_seasonal_property");
  assert.equal(ownerState?.missionContext?.defaultGoal, "aluguel_por_temporada");
  assert.equal(ownerState?.missionContext?.lockedUntilExplicitChange, true);

  assert.equal(propertyState?.flow, "property.create");
  assert.equal(propertyState?.missionContext?.mission, "capture_seasonal_property");
  assert.equal(propertyState?.propertyDraft?.goal, "aluguel_por_temporada");
});

test("IMOB mission context can be explicitly changed from seasonal to sale", () => {
  const seasonalState = createNextImobOperationalState(
    null,
    "capture",
    "quero cadastrar um imóvel de temporada",
    emptySlots,
  );
  const saleState = createNextImobOperationalState(
    seasonalState,
    "capture",
    "corrigir a finalidade para venda",
    { ...emptySlots, goal: "venda" },
  );

  assert.equal(seasonalState?.missionContext?.mission, "capture_seasonal_property");
  assert.equal(saleState?.missionContext?.mission, "capture_sale_property");
  assert.equal(saleState?.missionContext?.defaultGoal, "venda");
  assert.equal(saleState?.propertyDraft?.goal, "venda");
});
