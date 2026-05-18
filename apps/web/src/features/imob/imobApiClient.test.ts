import test from "node:test";
import assert from "node:assert/strict";

import { searchImobInventory, resolveImobTurn } from "./imobApiClient.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("IMOB API client posts resolve-turn to backend contract", async () => {
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = (async (input, init) => {
    calledUrl = String(input);
    calledBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          mode: "consult",
          action: "realestate.search_inventory",
          threadLabel: "Busca de imóveis",
          conversationState: {
            mode: "consult",
            pendingSlot: "none",
            resultOffset: 0,
            slots: {
              goal: "locacao",
              city: null,
              region: null,
              neighborhood: null,
              budgetMax: null,
              bedrooms: null,
              bathrooms: null,
              propertyType: null,
            },
          },
          presentation: { text: "ok" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const response = await resolveImobTurn({ message: "quero alugar apto", recipeId: "recipe-imob-1" });

  assert.equal(response.mode, "consult");
  assert.match(calledUrl, /\/imob\/chat\/resolve-turn$/);
  assert.match(calledBody, /quero alugar apto/);
  assert.match(calledBody, /recipe-imob-1/);
});

test("IMOB API client posts inventory search to backend contract", async () => {
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = (async (input, init) => {
    calledUrl = String(input);
    calledBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          query: "buscar venda em Rio de Janeiro",
          region: "Rio de Janeiro",
          segment: "venda",
          items: [],
          total: 0,
          offset: 0,
          limit: 2,
          presentation: { text: "ok" },
          tenantId: "tenant-A",
          workspaceId: "workspace-A",
          entitlements: { REAL_ESTATE_CORE: true },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const response = await searchImobInventory({
    query: "buscar venda em Rio de Janeiro",
    region: "Rio de Janeiro",
    segment: "venda",
  });

  assert.equal(response.segment, "venda");
  assert.match(calledUrl, /\/imob\/search\/inventory$/);
  assert.match(calledBody, /Rio de Janeiro/);
});
