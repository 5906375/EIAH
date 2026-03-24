import test from "node:test";
import assert from "node:assert/strict";

import { searchImobInventory } from "../services/imob/imobInventoryProvider";

test("IMOB inventory provider applies deterministic city and segment filters", () => {
  const result = searchImobInventory({
    query: "buscar apartamentos para locação em São Paulo",
    region: "São Paulo",
    segment: "locacao",
    slots: { city: "São Paulo" },
    limit: 5,
  });

  assert.ok(result.total >= 1);
  assert.ok(result.items.every((item) => item.city === "São Paulo"));
  assert.ok(result.items.every((item) => item.segment === "locacao"));
});

test("IMOB inventory provider applies budgetMax filter", () => {
  const result = searchImobInventory({
    query: "buscar locação em São Paulo até 3500",
    region: "São Paulo",
    segment: "locacao",
    slots: { city: "São Paulo", budgetMax: 3500 },
    limit: 5,
  });

  assert.equal(result.total, 0);
  assert.match(result.presentation.text, /refinar essa busca/i);
});

test("IMOB inventory provider builds continuation CTA from backend presentation", () => {
  const result = searchImobInventory({
    query: "buscar venda em Rio de Janeiro",
    region: "Rio de Janeiro",
    segment: "venda",
    limit: 2,
  });

  assert.equal(result.presentation.card?.ctas?.[0]?.action, "continue_inventory_search");
  assert.match(result.presentation.card?.ctas?.[0]?.nextMessage ?? "", /buscar mais opções/i);
});
