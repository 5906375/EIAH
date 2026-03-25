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


test("IMOB turn resolver maps visit scheduling to backend-owned operation metadata", () => {
  const result = resolveImobTurn({
    message: "Agendar visita para o imóvel 82912",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "visit");
  assert.equal(result.executionRequest?.operation, "visit.schedule");
  assert.equal(result.executionRequest?.action, "realestate.apply_adjustment");
  assert.equal(result.threadLabel, "Visita");
});

test("IMOB turn resolver maps listing activation to backend-owned operation metadata", () => {
  const result = resolveImobTurn({
    message: "Publicar anúncio do imóvel 4455",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "listing");
  assert.equal(result.executionRequest?.operation, "listing.activate");
  assert.equal(result.threadLabel, "Listing");
});


test("IMOB turn resolver builds explicit owner.create operational state", () => {
  const result = resolveImobTurn({
    message: "Captar proprietario Joao Silva email joao@imob.com telefone 11999998888",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "owner.create");
  assert.equal(result.conversationState.operational?.flow, "owner.create");
  assert.equal(result.conversationState.operational?.ownerDraft?.ownerName, "Joao Silva");
  assert.ok(result.conversationState.operational?.pendingFields.includes("ownerDocument"));
});

test("IMOB turn resolver builds explicit lead.qualify operational state", () => {
  const result = resolveImobTurn({
    message: "Qualificar lead Maria para alugar em Itapema ate 3500 telefone 47999998888",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.conversationState.operational?.flow, "lead.qualify");
  assert.equal(result.conversationState.operational?.leadDraft?.desiredCity, "Itapema");
  assert.equal(result.conversationState.operational?.leadDraft?.budgetMax, 3500);
  assert.match(result.presentation.text, /Ainda preciso de|qualificação do lead/i);
});


test("IMOB turn resolver builds explicit proposal.create operational state", () => {
  const result = resolveImobTurn({
    message: "Gerar proposta para lead Maria no imóvel 4455 com oferta de 750000",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "proposal.create");
  assert.equal(result.conversationState.operational?.flow, "proposal.create");
  assert.equal(result.conversationState.operational?.proposalDraft?.propertyId, "property-4455");
  assert.equal(result.conversationState.operational?.proposalDraft?.offerAmount, 750000);
  assert.ok(result.conversationState.operational?.pendingFields.includes("buyerPhone"));
  assert.match(result.presentation.text, /proposta agora/i);
});
