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


test("IMOB turn resolver builds generic action choices from the registry for delete", () => {
  const result = resolveImobTurn({
    message: "como excluir",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.clarify_entity");
  assert.equal(result.presentation.card?.title, "Escolha uma opção");
  assert.match(result.presentation.text, /Selecione o alvo para excluir agora/i);
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => cta.label === "Excluir proprietário"));
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => cta.label === "Excluir imóvel"));
});

test("IMOB turn resolver builds generic action choices from the registry for list variations", () => {
  const result = resolveImobTurn({
    message: "mostrar",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.clarify_entity");
  assert.equal(result.presentation.card?.title, "Escolha uma opção");
  assert.ok((result.presentation.card?.ctas ?? []).length >= 2);
});

test("IMOB turn resolver asks for clarification on low-confidence singular generic viewing intent", () => {
  const result = resolveImobTurn({
    message: "mostrar proprietário",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.clarify_action");
  assert.match(result.presentation.text, /confirmar sua intenção/i);
  assert.equal(result.presentation.metadata?.confidence?.lowConfidence, true);
  assert.equal(result.presentation.metadata?.confidence?.entity, "proprietario");
  assert.match(result.presentation.card?.title ?? "", /o que você quer fazer com proprietário/i);
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => /consultar proprietário/i.test(cta.label)));
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => /listar proprietários/i.test(cta.label)));
});

test("IMOB turn resolver answers directly on higher-confidence plural list intent", () => {
  const result = resolveImobTurn({
    message: "mostrar proprietários",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.list");
  assert.equal(result.presentation.card?.title, "Listar proprietários");
  assert.equal(result.presentation.metadata?.confidence?.lowConfidence, false);
  assert.equal(result.presentation.metadata?.confidence?.pluralityHint, "plural");
});

test("IMOB turn resolver recognizes consulta noun variants", () => {
  const result = resolveImobTurn({
    message: "consulta de proprietário",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.get");
  assert.equal(result.presentation.card?.title, "Consultar proprietário");
});

test("IMOB turn resolver recognizes listagem noun variants", () => {
  const result = resolveImobTurn({
    message: "listagem de imóveis",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.list");
  assert.equal(result.presentation.card?.title, "Listar imóveis");
});

test("IMOB turn resolver builds canonical consult response for delete with entity", () => {
  const result = resolveImobTurn({
    message: "excluir proprietário",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.delete");
  assert.match(result.presentation.text, /confirmar a exclusão/i);
  assert.equal(result.presentation.card?.title, "Excluir proprietário");
});

test("IMOB turn resolver recognizes generic cadastro noun variants", () => {
  const result = resolveImobTurn({
    message: "iniciar cadastro",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.capture.clarify_target");
  assert.equal(result.presentation.metadata?.confidence?.action, "create");
  assert.equal(result.presentation.metadata?.choiceStyle, "inline");
});

test("IMOB turn resolver builds direct lead choices for generic lead input", () => {
  const result = resolveImobTurn({
    message: "lead",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.lead.clarify_target");
  assert.equal(result.presentation.text, "");
  assert.equal(result.presentation.metadata?.choiceStyle, "inline");
  assert.deepEqual(
    (result.presentation.card?.ctas ?? []).map((cta) => ({ label: cta.label, nextMessage: cta.nextMessage })),
    [
      { label: "Cadastrar comprador", nextMessage: "quero cadastrar comprador como lead" },
      { label: "Cadastrar locatário", nextMessage: "quero cadastrar locatário como lead" },
      { label: "Cadastrar lead", nextMessage: "cadastrar lead" },
    ],
  );
});

test("IMOB turn resolver builds generic cadastro options from the registry", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.capture.clarify_target");
  assert.equal(result.presentation.card?.title, "Escolha uma opção");
  assert.deepEqual(
    (result.presentation.card?.ctas ?? []).map((cta) => ({ label: cta.label, nextMessage: cta.nextMessage })),
    [
      { label: "Cadastrar proprietário", nextMessage: "quero incluir proprietário" },
      { label: "Cadastrar imóvel", nextMessage: "quero incluir imóvel" },
      { label: "Cadastrar comprador", nextMessage: "quero cadastrar comprador como lead" },
      { label: "Cadastrar vendedor", nextMessage: "quero incluir vendedor como proprietário" },
      { label: "Cadastrar locador", nextMessage: "quero incluir locador como proprietário" },
      { label: "Cadastrar locatário", nextMessage: "quero cadastrar locatário como lead" },
    ],
  );
  assert.equal(result.presentation.text, "");
  assert.equal(result.presentation.metadata?.choiceStyle, "inline");
});


test("IMOB turn resolver displays comprador copy while keeping lead flow internal", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar comprador como lead",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.conversationState.operational?.flow, "lead.qualify");
  assert.match(result.presentation.text, /cadastro do comprador/i);
  assert.match(result.presentation.text, /telefone do comprador/i);
  assert.match(result.presentation.nextStep ?? "", /dados do comprador/i);
  assert.match(result.presentation.blocker ?? "", /dados do comprador/i);
});

test("IMOB turn resolver displays locatário copy while keeping lead flow internal", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar locatário como lead",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.conversationState.operational?.flow, "lead.qualify");
  assert.match(result.presentation.text, /cadastro do locatário/i);
  assert.match(result.presentation.text, /telefone do locatário/i);
  assert.match(result.presentation.nextStep ?? "", /dados do locatário/i);
  assert.match(result.presentation.blocker ?? "", /dados do locatário/i);
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

test("IMOB turn resolver builds guided form for document validation", () => {
  const result = resolveImobTurn({
    message: "validar documento",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "documents.collect");
  assert.equal(result.presentation.form?.entity, "documento");
  assert.equal(result.presentation.form?.action, "validate");
  assert.equal(result.presentation.form?.label, "Validar documento");
});

test("IMOB turn resolver builds guided form for contract history", () => {
  const result = resolveImobTurn({
    message: "histórico de contrato",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.catalog.history");
  assert.equal(result.presentation.form?.entity, "contrato");
  assert.equal(result.presentation.form?.action, "history");
  assert.equal(result.presentation.form?.label, "Ver histórico do contrato");
});

test("IMOB turn resolver builds guided form for send contract for signature", () => {
  const result = resolveImobTurn({
    message: "enviar contrato para assinatura",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "contract.prepare");
  assert.equal(result.presentation.form?.entity, "contrato");
  assert.equal(result.presentation.form?.action, "sendForSignature");
  assert.equal(result.presentation.form?.label, "Enviar contrato para assinatura");
});

test("IMOB turn resolver propagates confidence metadata on execute responses", () => {
  const result = resolveImobTurn({
    message: "quero incluir proprietário",
    semanticIntent: {
      entity: "proprietario",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: "Cadastrar proprietário",
    },
    semanticIntentSource: "openai",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.presentation.metadata?.confidence?.entity, "proprietario");
  assert.equal(result.presentation.metadata?.confidence?.action, "create");
  assert.equal(result.presentation.metadata?.confidence?.source, "openai");
  assert.equal(result.presentation.metadata?.confidence?.lowConfidence, false);
});

test("IMOB turn resolver routes explicit anuncio.publish semantic intent to listing execution", () => {
  const result = resolveImobTurn({
    message: "quero botar esse imóvel pra rodar",
    semanticIntent: {
      entity: "anuncio",
      action: "publish",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: "Publicar anúncio",
    },
    semanticIntentSource: "parser_fallback",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "listing.activate");
  assert.equal(result.threadLabel, "Listing");
  assert.equal(result.presentation.form?.entity, "anuncio");
  assert.equal(result.presentation.metadata?.confidence?.entity, "anuncio");
  assert.equal(result.presentation.metadata?.confidence?.action, "publish");
});

test("IMOB turn resolver builds guided form for listing.activate", () => {
  const result = resolveImobTurn({
    message: "anúncio",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "listing.activate");
  assert.equal(result.presentation.form?.entity, "anuncio");
  assert.equal(result.presentation.form?.action, "publish");
  assert.equal(result.presentation.form?.label, "Publicar anúncio");
  assert.deepEqual(
    result.presentation.form?.fields.map((field) => field.name),
    ["propertyId", "listingTitle", "publicationGoal", "publicationChannels"],
  );
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
  assert.equal(result.presentation.form?.entity, "proprietario");
  assert.equal(result.presentation.form?.action, "create");
  assert.equal(result.presentation.form?.label, "Cadastrar proprietário");
  assert.equal(result.presentation.text, "");
  assert.deepEqual(
    result.presentation.form?.fields.map((field) => field.name),
    ["ownerName", "ownerPhone", "ownerEmail", "ownerDocument"],
  );
  const ownerDocumentField = result.presentation.form?.fields.find((field) => field.name === "ownerDocument");
  assert.equal(ownerDocumentField?.allowAttachment, true);
  assert.equal(ownerDocumentField?.attachmentLabel, "Anexar documento");
});

test("IMOB turn resolver builds guided form for vendedor on owner.create", () => {
  const result = resolveImobTurn({
    message: "quero incluir vendedor como proprietário",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "owner.create");
  assert.equal(result.conversationState.operational?.ownerDraft?.ownerPersona, "vendedor");
  assert.equal(result.presentation.form?.entity, "vendedor");
  assert.equal(result.presentation.form?.label, "Cadastrar vendedor");
  assert.equal(result.presentation.form?.fields.find((field) => field.name === "ownerDocument")?.allowAttachment, true);
});

test("IMOB turn resolver builds guided form for locador on owner.create", () => {
  const result = resolveImobTurn({
    message: "quero incluir locador como proprietário",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "owner.create");
  assert.equal(result.conversationState.operational?.ownerDraft?.ownerPersona, "locador");
  assert.equal(result.presentation.form?.entity, "locador");
  assert.equal(result.presentation.form?.label, "Cadastrar locador");
});

test("IMOB turn resolver builds guided form for property.create", () => {
  const result = resolveImobTurn({
    message: "quero incluir imóvel",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "property.create");
  assert.equal(result.presentation.form?.entity, "imovel");
  assert.equal(result.presentation.form?.label, "Cadastrar imóvel");
  assert.deepEqual(
    result.presentation.form?.fields.map((field) => field.name),
    ["propertyType", "goal", "cep", "city", "address"],
  );
  assert.equal(result.presentation.form?.fields.find((field) => field.name === "cep")?.lookup?.kind, "cep");
});

test("IMOB turn resolver prioritizes explicit property capture over options token", () => {
  const result = resolveImobTurn({
    message: "cadastrar imóvel opções",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.notEqual(result.action, "crm.capture.entry_options");
  assert.equal(result.conversationState.operational?.flow, "property.create");
  assert.equal(result.presentation.form?.entity, "imovel");
});

test("IMOB turn resolver treats plural imóveis as property.create capture", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar 10 imóveis",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "realestate.register_property");
  assert.equal(result.conversationState.operational?.flow, "property.create");
  assert.equal(result.presentation.form?.entity, "imovel");
});

test("IMOB turn resolver builds guided form for comprador on lead.qualify", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar comprador como lead",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.presentation.form?.entity, "comprador");
  assert.equal(result.presentation.form?.label, "Cadastrar comprador");
  assert.deepEqual(
    result.presentation.form?.fields.map((field) => field.name),
    ["leadName", "leadPhone", "leadEmail", "desiredGoal", "desiredCity", "budgetMax"],
  );
});

test("IMOB turn resolver builds guided form for locatário on lead.qualify", () => {
  const result = resolveImobTurn({
    message: "quero cadastrar locatário como lead",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.presentation.form?.entity, "locatario");
  assert.equal(result.presentation.form?.label, "Cadastrar locatário");
});

test("IMOB turn resolver accepts form-style lead budget labels", () => {
  const result = resolveImobTurn({
    message: "nome do lead Merlo telefone do lead 47 999674434 e-mail do lead mmerlon.adv@gmail.com objetivo do lead locacao cidade de interesse do lead Balneário Camboriú faixa de orçamento do lead 2000",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "lead.qualify");
  assert.equal(result.conversationState.operational?.leadDraft?.budgetMax, 2000);
  assert.ok(!result.conversationState.operational?.pendingFields.includes("budgetMax"));
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
  assert.match(result.presentation.text, /Ainda preciso de|cadastro do lead/i);
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


test("IMOB turn resolver builds explicit contract.prepare operational state with legal handoff", () => {
  const result = resolveImobTurn({
    message: "Preparar contrato de venda do imóvel 4455 para lead Maria com documentos completos",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "contract");
  assert.equal(result.executionRequest?.operation, "contract.prepare");
  assert.equal(result.threadLabel, "Contrato");
  assert.equal(result.conversationState.operational?.flow, "contract.prepare");
  assert.equal(result.conversationState.operational?.contractDraft?.propertyId, "property-4455");
  assert.equal(result.conversationState.operational?.contractDraft?.counterpartyName, "Maria");
  assert.equal(result.conversationState.operational?.contractDraft?.contractType, "sale");
  assert.equal(result.conversationState.operational?.contractDraft?.documentPacketStatus, "ready");
  assert.equal(result.conversationState.operational?.contractDraft?.handoffTarget, "LEGAL");
  assert.equal(result.conversationState.operational?.contractDraft?.approvalRequired, true);
  assert.match(result.presentation.text, /handoff juridico|handoff jurídico/i);
});


test("IMOB turn resolver builds explicit deal.review operational state", () => {
  const result = resolveImobTurn({
    message: "Revisar negócio 7788 do imóvel 4455 na fase de contrato com documentos pendentes e aprovação humana",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "deal");
  assert.equal(result.executionRequest?.operation, "deal.review");
  assert.equal(result.executionRequest?.action, "realestate.review_deal");
  assert.equal(result.threadLabel, "Deal Review");
  assert.equal(result.conversationState.operational?.flow, "deal.review");
  assert.equal(result.conversationState.operational?.dealDraft?.dealId, "deal-7788");
  assert.equal(result.conversationState.operational?.dealDraft?.propertyId, "property-4455");
  assert.equal(result.conversationState.operational?.dealDraft?.reviewStage, "contract");
  assert.deepEqual(result.conversationState.operational?.dealDraft?.blockers, ["document_packet_pending", "human_approval_required"]);
  assert.equal(result.conversationState.operational?.dealDraft?.handoffTarget, "LEGAL");
  assert.equal(result.conversationState.operational?.dealDraft?.approvalRequired, true);
  assert.match(result.presentation.text, /revisão do negócio/i);
});


test("IMOB turn resolver builds explicit commission.settle operational state", () => {
  const result = resolveImobTurn({
    message: "Liberar comissão do negócio 7788 para corretor Joao valor 12500 via pix pronta para pagar",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.intent, "commission");
  assert.equal(result.executionRequest?.operation, "commission.settle");
  assert.equal(result.executionRequest?.action, "realestate.release_commission");
  assert.equal(result.threadLabel, "Comissão");
  assert.equal(result.conversationState.operational?.flow, "commission.settle");
  assert.equal(result.conversationState.operational?.commissionDraft?.dealId, "deal-7788");
  assert.equal(result.conversationState.operational?.commissionDraft?.brokerRef, "broker-joao");
  assert.equal(result.conversationState.operational?.commissionDraft?.amountCents, 1250000);
  assert.equal(result.conversationState.operational?.commissionDraft?.settlementStatus, "ready");
  assert.equal(result.conversationState.operational?.commissionDraft?.payoutChannel, "pix");
  assert.equal(result.conversationState.operational?.commissionDraft?.approvalRequired, true);
  assert.match(result.presentation.text, /liquidação da comissão/i);
});

test("IMOB turn resolver starts rules.configure only for seasonal rental rules", () => {
  const result = resolveImobTurn({
    message: "Configurar regras do imóvel 4455 para aluguel por temporada",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "realestate.configure_property_rules");
  assert.equal(result.threadLabel, "Regras do imóvel");
  assert.equal(result.conversationState.operational?.flow, "rules.configure");
  assert.equal(result.conversationState.operational?.status, "collecting");
  assert.equal(result.conversationState.operational?.rulesDraft?.propertyId, "property-4455");
  assert.equal(result.conversationState.operational?.rulesDraft?.propertyFinality, "aluguel_por_temporada");
  assert.deepEqual(result.conversationState.operational?.pendingFields, ["checkin", "checkout", "minHospedes", "maxHospedes"]);
  assert.equal(result.presentation.form?.action, "configureRules");
  assert.match(result.presentation.text, /regras de temporada/i);
});

test("IMOB turn resolver maps semantic imovel.configure to rules.configure", () => {
  const result = resolveImobTurn({
    message: "Definir check-in do imóvel 4455 para aluguel por temporada",
    semanticIntent: {
      entity: "imovel",
      action: "configure",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: "singular",
      canonicalLabel: "Configurar regras do imóvel",
    },
    semanticIntentSource: "openai",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "realestate.configure_property_rules");
  assert.equal(result.threadLabel, "Regras do imóvel");
  assert.equal(result.conversationState.operational?.flow, "rules.configure");
  assert.equal(result.presentation.metadata?.confidence?.source, "openai");
});

test("IMOB turn resolver blocks rules.configure outside seasonal rental", () => {
  const result = resolveImobTurn({
    message: "Configurar regras do imóvel 4455 para locação",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.action, "realestate.configure_property_rules");
  assert.equal(result.threadLabel, "Regras do imóvel");
  assert.equal(result.conversationState.operational?.flow, "rules.configure");
  assert.equal(result.conversationState.operational?.rulesDraft?.propertyFinality, "locacao");
  assert.equal(result.presentation.metadata?.reasonCode, "rules_configure_requires_seasonal_rental");
  assert.match(result.presentation.text, /não é aluguel por temporada/i);
});

test("IMOB turn resolver continues rules.configure until governed execution request", () => {
  const first = resolveImobTurn({
    message: "Configurar regras do imóvel 4455 para aluguel por temporada",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  const second = resolveImobTurn({
    message: "checkin 15h checkout 11h 1 a 4 hospedes regras: sem festas",
    threadLabel: first.threadLabel,
    threadState: first.conversationState,
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(second.mode, "execute");
  assert.equal(second.action, "realestate.configure_property_rules");
  assert.equal(second.executionRequest?.intent, "rules");
  assert.equal(second.executionRequest?.operation, "rules.configure");
  assert.equal(second.executionRequest?.action, "realestate.configure_property_rules");
  assert.equal(second.conversationState.operational?.flow, "rules.configure");
  assert.equal(second.conversationState.operational?.status, "ready_for_review");
  assert.equal(second.conversationState.operational?.rulesDraft?.propertyId, "property-4455");
  assert.equal(second.conversationState.operational?.rulesDraft?.propertyFinality, "aluguel_por_temporada");
  assert.equal(second.conversationState.operational?.rulesDraft?.checkin, "15:00");
  assert.equal(second.conversationState.operational?.rulesDraft?.checkout, "11:00");
  assert.equal(second.conversationState.operational?.rulesDraft?.minHospedes, 1);
  assert.equal(second.conversationState.operational?.rulesDraft?.maxHospedes, 4);
  assert.equal(second.executionRequest?.input.propertyFinality, "aluguel_por_temporada");
  assert.equal(second.executionRequest?.input.approvalRequired, true);
  assert.match(second.presentation.text, /prontas para revisão/i);
});


test("IMOB turn resolver continues proposal.create flow when the user replies only with the missing phone", () => {
  const first = resolveImobTurn({
    message: "Gerar proposta para lead Maria no imóvel 4455 com oferta de 750000",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  const second = resolveImobTurn({
    message: "47999998888",
    threadLabel: first.threadLabel,
    threadState: first.conversationState,
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(second.mode, "execute");
  assert.equal(second.executionRequest?.intent, "proposal");
  assert.equal(second.executionRequest?.operation, "proposal.create");
  assert.equal(second.conversationState.operational?.flow, "proposal.create");
  assert.equal(second.conversationState.operational?.proposalDraft?.buyerPhone, "47999998888");
  assert.equal(second.conversationState.operational?.proposalDraft?.propertyId, "property-4455");
  assert.equal(second.conversationState.operational?.proposalDraft?.offerAmount, 750000);
  assert.ok(!second.conversationState.operational?.pendingFields.includes("buyerPhone"));
});

test("IMOB turn resolver pivots owner collecting flow to property capture on explicit selling intent", () => {
  const result = resolveImobTurn({
    message: "quero vender",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Nilsen Majolo",
          ownerEmail: "nilsen@gmail.com",
          ownerPhone: "47999886868",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.flow, "property.create");
  assert.equal(result.conversationState.operational?.propertyDraft?.goal, "venda");
  assert.equal(result.conversationState.operational?.ownerDraft, undefined);
});

test("IMOB turn resolver returns vertical guidance menu on generic continuity request during collecting flow", () => {
  const result = resolveImobTurn({
    message: "como continuar aqui",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Nilsen Majolo",
          ownerEmail: "nilsen@gmail.com",
          ownerPhone: "47999886868",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.capture.flow_guidance");
  assert.match(result.presentation.text ?? "", /direcionar agora no fluxo imobiliário/i);
  assert.equal(result.presentation.card?.title, "Posso seguir com uma destas ações agora.");
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => cta.label === "Continuar proprietário"));
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => cta.label === "Cadastrar imóvel"));
});

test("IMOB turn resolver returns EIAH front door guidance on generic navigation request", () => {
  const result = resolveImobTurn({
    message: "me perdi",
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.capture.flow_guidance");
  assert.match(result.presentation.text ?? "", /jornada imobiliaria|jornada imobiliária/i);
  assert.equal(result.presentation.card?.title, "Posso seguir com uma destas ações agora.");
  assert.equal(result.presentation.metadata?.frontDoorAgentId, "EIAH");
  assert.ok((result.presentation.card?.ctas ?? []).some((cta) => cta.label === "Cadastrar imóvel"));
});

test("IMOB turn resolver accepts freeform lead city when informed with explicit label", () => {
  const result = resolveImobTurn({
    message: "cidade de interesse do lead sarandi",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: "venda",
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: 500000,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "lead.qualify",
        status: "collecting",
        pendingFields: ["desiredCity"],
        leadDraft: {
          leadPersona: "lead",
          leadName: "Maria",
          leadEmail: "maria@gmail.com",
          leadPhone: "11999999999",
          desiredGoal: "venda",
          desiredCity: null,
          budgetMax: 500000,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.flow, "lead.qualify");
  assert.equal(result.conversationState.operational?.leadDraft?.desiredCity, "Sarandi");
  assert.ok(!result.conversationState.operational?.pendingFields.includes("desiredCity"));
});

test("IMOB turn resolver prioritizes pending field parse over generic guidance in active flow", () => {
  const result = resolveImobTurn({
    message: "continuar cadastro cpf 12345678901",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Nilsen Majolo",
          ownerEmail: "nilsen@gmail.com",
          ownerPhone: "47999886868",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.notEqual(result.action, "crm.capture.flow_guidance");
  assert.equal(result.conversationState.operational?.flow, "owner.create");
  assert.equal(result.conversationState.operational?.ownerDraft?.ownerDocument, "12345678901");
  assert.ok(!result.conversationState.operational?.pendingFields.includes("ownerDocument"));
});

test("IMOB turn resolver parses 'documento do proprietário' for owner document pending", () => {
  const result = resolveImobTurn({
    message: "continuar cadastro documento do proprietário 41411414410",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Proprio Ontario",
          ownerEmail: "pro@gmail.com",
          ownerPhone: "11646466464",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.ownerDraft?.ownerDocument, "41411414410");
  assert.ok(!result.conversationState.operational?.pendingFields.includes("ownerDocument"));
});

test("IMOB turn resolver parses 'cpf do proprietário' for owner document pending", () => {
  const result = resolveImobTurn({
    message: "cpf do proprietário 12345678901",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Proprio Ontario",
          ownerEmail: "pro@gmail.com",
          ownerPhone: "11646466464",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.ownerDraft?.ownerDocument, "12345678901");
  assert.ok(!result.conversationState.operational?.pendingFields.includes("ownerDocument"));
});

test("IMOB turn resolver parses 'cnpj do proprietário' for owner document pending", () => {
  const result = resolveImobTurn({
    message: "cnpj do proprietário 12345678000199",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Proprio Ontario",
          ownerEmail: "pro@gmail.com",
          ownerPhone: "11646466464",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.ownerDraft?.ownerDocument, "12345678000199");
  assert.ok(!result.conversationState.operational?.pendingFields.includes("ownerDocument"));
});

test("IMOB turn resolver keeps active case continuity on explicit continuation request", () => {
  const result = resolveImobTurn({
    message: "continuar este cadastro deste caso",
    threadState: {
      slots: {
        query: null,
        city: null,
        region: null,
        neighborhood: null,
        goal: null,
        propertyType: null,
        bedrooms: null,
        bathrooms: null,
        budgetMax: null,
        hasPool: null,
        petsAllowed: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "owner.create",
        status: "collecting",
        pendingFields: ["ownerDocument"],
        ownerDraft: {
          ownerPersona: "proprietario",
          ownerName: "Nilsen Majolo",
          ownerEmail: "nilsen@gmail.com",
          ownerPhone: "47999886868",
          ownerDocument: null,
        },
      },
    },
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
  });

  assert.equal(result.conversationState.operational?.flow, "owner.create");
  assert.notEqual(result.action, "crm.capture.flow_guidance");
});
