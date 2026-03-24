import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobTurn } from "../services/imob/imobTurnResolver";

test("IMOB turn resolver returns consult mode for broad rental discovery", () => {
  const result = resolveImobTurn({
    message: "quero alugar apto",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "realestate.search_inventory");
  assert.equal(result.threadLabel, "Busca de imóveis");
  assert.match(result.presentation.text, /faixa de valor|cidade|quartos/i);
  assert.equal(result.conversationState.pendingSlot, "none");
});

test("IMOB turn resolver returns knowledge search mode with backend-owned filters", () => {
  const result = resolveImobTurn({
    message: "Buscar contratos e propostas em São Paulo",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.action, "realestate.search_knowledge_base");
  assert.equal(result.knowledgeRequest?.filters.region, "São Paulo");
  assert.ok((result.presentation.card?.ctas ?? []).length >= 1);
});

test("IMOB turn resolver fail-closes knowledge search without entitlement", () => {
  const result = resolveImobTurn({
    message: "Buscar no acervo IMOB",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: false },
    },
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.action, "realestate.search_knowledge_base");
  assert.match(result.presentation.text, /não está habilitado/i);
});
