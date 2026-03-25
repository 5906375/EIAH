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
    message: "Agendar visita para lead Maria no imóvel 82912 em 2026-03-30 telefone 47999998888 à tarde",
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
  assert.equal(result.conversationState.operational?.flow, "visit.schedule");
  assert.equal(result.conversationState.operational?.visitDraft?.propertyId, "property-82912");
  assert.equal(result.conversationState.operational?.visitDraft?.visitorName, "Maria");
  assert.equal(result.conversationState.operational?.visitDraft?.visitorPhone, "47999998888");
  assert.equal(result.conversationState.operational?.visitDraft?.preferredDate, "2026-03-30");
  assert.equal(result.conversationState.operational?.visitDraft?.preferredWindow, "tarde");
});

test("IMOB turn resolver maps listing activation to backend-owned operation metadata", () => {
  const result = resolveImobTurn({
    message: "Publicar anúncio do imóvel 4455 título Vista Mar no portal e whatsapp valor 950000 para venda",
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
  assert.equal(result.conversationState.operational?.flow, "listing.activate");
  assert.equal(result.conversationState.operational?.listingDraft?.propertyId, "property-4455");
  assert.equal(result.conversationState.operational?.listingDraft?.listingTitle, "Vista Mar");
  assert.deepEqual(result.conversationState.operational?.listingDraft?.publicationChannels, ["portal", "whatsapp"]);
  assert.equal(result.conversationState.operational?.listingDraft?.askingPrice, 950000);
  assert.equal(result.conversationState.operational?.listingDraft?.publicationGoal, "venda");
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

test("IMOB turn resolver builds explicit property.create operational state", () => {
  const result = resolveImobTurn({
    message: "Cadastrar imóvel apartamento para venda em Itapema com 3 quartos endereco Rua 1000",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "property.create");
  assert.equal(result.conversationState.operational?.flow, "property.create");
  assert.equal(result.conversationState.operational?.propertyDraft?.propertyType, "apartamento");
  assert.equal(result.conversationState.operational?.propertyDraft?.city, "Itapema");
  assert.equal(result.conversationState.operational?.propertyDraft?.goal, "venda");
  assert.equal(result.conversationState.operational?.propertyDraft?.address, "Rua 1000");
  assert.match(result.presentation.text, /cadastro do imovel|cadastro do imóvel/i);
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


test("IMOB turn resolver builds explicit documents.collect operational state", () => {
  const result = resolveImobTurn({
    message: "Coletar documentos do proprietário do imóvel 4455 via upload com matrícula e cpf",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "documents");
  assert.equal(result.executionRequest?.operation, "documents.collect");
  assert.equal(result.executionRequest?.action, "realestate.collect_documents");
  assert.equal(result.threadLabel, "Documentos");
  assert.equal(result.conversationState.operational?.flow, "documents.collect");
  assert.equal(result.conversationState.operational?.documentDraft?.referenceId, "property-4455");
  assert.equal(result.conversationState.operational?.documentDraft?.subjectType, "owner");
  assert.deepEqual(result.conversationState.operational?.documentDraft?.documentTypes, ["matricula", "cpf"]);
  assert.equal(result.conversationState.operational?.documentDraft?.deliveryChannel, "upload");
  assert.match(result.presentation.text, /coleta documental/i);
});
