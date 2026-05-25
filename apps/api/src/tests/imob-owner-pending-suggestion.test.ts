import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnerPendingSuggestion } from "../services/imob/crm/imobOwnerPendingSuggestion";

test("IMOB owner pending suggestion uses a neutral document placeholder", () => {
  const suggestion = buildOwnerPendingSuggestion({
    name: "Julio Damaceno",
    pendingItems: ["ownerDocument"],
  });

  assert.ok(suggestion);
  assert.match(suggestion ?? "", /Julio Damaceno/);
  assert.match(suggestion ?? "", /<cpf ou cnpj>/i);
  assert.doesNotMatch(suggestion ?? "", /12345678901/);
});
