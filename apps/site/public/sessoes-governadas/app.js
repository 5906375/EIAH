"use strict";

const PROTOCOL_VERSION = "gov-eiah-mtg.v3";
const SCHEMA_VERSION = "eiah.governed-session-evidence.v3";

const VERTICAL_CONTEXTS = {
  legal: {
    label: "Legal", domain: "operações jurídicas", tenantId: "escritorio-demo.eiah", workspaceId: "revisao-legal",
    title: "Conversa com revisor especialista da Vertical Legal",
    purpose: "Avaliar experiência, riscos jurídicos, critérios de revisão e possível participação em piloto controlado da Vertical Legal.",
    agendaVersion: "legal-reviewer.v1", riskTier: "HIGH",
    description: "Revisão especializada de triagem, documentos, riscos e minutas preliminares, sem conclusão jurídica autônoma.",
    gates: "sigilo profissional, fontes, conflito de interesses, aprovação do advogado e proibição de atuação externa automática",
    useCaseQuestion: "Qual atividade jurídica seria mais adequada para um primeiro piloto com dados fictícios?",
    riskQuestion: "Qual erro de um agente de IA poderia causar maior risco jurídico ou profissional?",
    approvalQuestion: "Quais conclusões, minutas ou atos nunca podem avançar sem um advogado responsável?",
    evidenceQuestion: "Quais documentos, fontes e justificativas precisam acompanhar uma análise para permitir revisão jurídica responsável?"
  },
  logistica: {
    label: "Logística", domain: "operações logísticas e portuárias", tenantId: "operacao-logistica.eiah", workspaceId: "revisao-logistica",
    title: "Conversa com especialista da Vertical Logística",
    purpose: "Avaliar experiência operacional, eventos críticos, evidências e possível participação em piloto controlado da Vertical Logística.",
    agendaVersion: "logistica-specialist.v1", riskTier: "HIGH",
    description: "Validação de eventos, prazos, documentos, custos contestáveis e responsabilidades entre atores da cadeia.",
    gates: "origem do evento, integridade documental, atribuição de responsabilidade, aprovação operacional e prova compartilhada",
    useCaseQuestion: "Qual evento da cadeia logística deveria ser o primeiro piloto controlado?",
    riskQuestion: "Qual erro de classificação ou prazo poderia gerar maior impacto operacional ou financeiro?",
    approvalQuestion: "Quais decisões de gate, cobrança ou contestação precisam obrigatoriamente de aprovação humana?",
    evidenceQuestion: "Quais documentos e eventos são indispensáveis para reconstruir uma linha do tempo confiável?"
  },
  imob: {
    label: "Imóveis", domain: "operações imobiliárias", tenantId: "imobiliaria-demo.eiah", workspaceId: "revisao-imob",
    title: "Conversa com especialista da Vertical Imóveis",
    purpose: "Avaliar jornadas imobiliárias, riscos documentais, aprovações e possível participação em piloto controlado da Vertical Imóveis.",
    agendaVersion: "imob-specialist.v1", riskTier: "HIGH",
    description: "Jornadas de lead, imóvel, visita, proposta, contrato e entrega sob separação de dados e revisão profissional.",
    gates: "PII, titularidade, documentos do imóvel, proposta, contrato, conflito de interesse e aprovação do responsável",
    useCaseQuestion: "Qual etapa entre captação, visita, proposta e contrato deveria ser validada primeiro?",
    riskQuestion: "Qual erro documental ou comercial teria maior impacto em uma operação imobiliária?",
    approvalQuestion: "Quais alterações de proposta, contrato ou estado do imóvel exigem aprovação humana?",
    evidenceQuestion: "Quais documentos e registros devem acompanhar uma recomendação imobiliária?"
  },
  marketing: {
    label: "Marketing", domain: "marketing e comunicação", tenantId: "empresa-marketing.eiah", workspaceId: "revisao-marketing",
    title: "Conversa com especialista da Vertical Marketing",
    purpose: "Avaliar briefing, criação multicanal, riscos de comunicação e possível participação em piloto controlado da Vertical Marketing.",
    agendaVersion: "marketing-specialist.v1", riskTier: "MEDIUM",
    description: "Briefing, criação, adaptação por canal e aprovação editorial antes de qualquer publicação.",
    gates: "uso da marca, direitos autorais, alegações, público, canal, aprovação editorial e publicação externa",
    useCaseQuestion: "Qual campanha ou formato seria adequado para validar o primeiro fluxo multicanal?",
    riskQuestion: "Qual erro de linguagem, promessa ou segmentação poderia causar maior dano à marca?",
    approvalQuestion: "Quais peças e canais nunca devem ser publicados sem aprovação humana?",
    evidenceQuestion: "Quais elementos do briefing, versões e aprovações devem permanecer registrados?"
  },
  finance: {
    label: "BPO Financeiro", domain: "operações financeiras", tenantId: "financeiro-demo.eiah", workspaceId: "revisao-financeira",
    title: "Conversa com especialista da Vertical BPO Financeiro",
    purpose: "Avaliar conciliação, cobrança, aprovações financeiras e possível participação em piloto controlado da Vertical BPO Financeiro.",
    agendaVersion: "finance-specialist.v1", riskTier: "HIGH",
    description: "Conferência e organização de pendências financeiras sem pagamento, cobrança ou alteração contábil autônoma.",
    gates: "segregação de funções, valores, documentos fiscais, dupla aprovação, pagamento e trilha de reconciliação",
    useCaseQuestion: "Qual fluxo entre conciliação, cobrança e conferência deveria ser testado primeiro?",
    riskQuestion: "Qual erro de valor, favorecido ou classificação representa maior risco financeiro?",
    approvalQuestion: "Quais operações exigem dupla aprovação ou devem permanecer fora da automação?",
    evidenceQuestion: "Quais comprovantes e reconciliações devem acompanhar uma recomendação financeira?"
  },
  guardian: {
    label: "Guardian / Evidências", domain: "governança, risco e auditoria", tenantId: "governanca-demo.eiah", workspaceId: "guardian-evidencias",
    title: "Conversa com especialista Guardian / Evidências",
    purpose: "Avaliar controles, integridade, auditoria e possível participação em piloto controlado da capacidade Guardian.",
    agendaVersion: "guardian-specialist.v1", riskTier: "HIGH",
    description: "Controles transversais de policy, integridade, comprovantes, auditoria, bloqueios e verificação de cadeias de execução.",
    gates: "identidade, escopo, policy, integridade, cadeia de custódia, retenção, acesso e verificação independente",
    useCaseQuestion: "Qual evento crítico deveria ser usado para validar primeiro a superfície de evidências?",
    riskQuestion: "Qual lacuna de auditoria ou integridade seria bloqueante para aceitar uma evidência?",
    approvalQuestion: "Quais exceções de policy exigem aprovação formal e segregada?",
    evidenceQuestion: "Quais metadados, hashes, recibos e logs são necessários para verificação independente?"
  },
  legacy: {
    label: "Legacy", domain: "modernização de sistemas legados", tenantId: "empresa-legacy.eiah", workspaceId: "revisao-modernizacao",
    title: "Conversa com especialista da Vertical Legacy",
    purpose: "Avaliar dependências, riscos de continuidade, critérios de migração e possível participação em piloto controlado da Vertical Legacy.",
    agendaVersion: "legacy-specialist.v1", riskTier: "HIGH",
    description: "Diagnóstico e modernização incremental com inventário, dependências, rollback e aprovação antes de alterações de ambiente.",
    gates: "inventário, dependências, continuidade, dados, janela de mudança, rollback e aprovação técnica",
    useCaseQuestion: "Qual sistema ou processo seria adequado para um primeiro diagnóstico sem alteração de ambiente?",
    riskQuestion: "Qual dependência ou falha de continuidade seria mais perigosa durante uma modernização?",
    approvalQuestion: "Quais mudanças de sistema, dados ou integração exigem gate humano e plano de rollback?",
    evidenceQuestion: "Quais inventários, testes e evidências são indispensáveis antes de aprovar uma migração?"
  },
  urban: {
    label: "Urban", domain: "serviços urbanos e atendimento ao cidadão", tenantId: "municipio-demo.gov.br", workspaceId: "revisao-urban",
    title: "Conversa com especialista da Vertical Urban",
    purpose: "Avaliar atendimento, informação pública, proteção de dados e possível participação em piloto controlado da Vertical Urban.",
    agendaVersion: "urban-specialist.v1", riskTier: "HIGH",
    description: "Orientação e encaminhamento de demandas urbanas sem decisão administrativa ou execução automática de serviços públicos.",
    gates: "competência municipal, PII, informação oficial, acessibilidade, encaminhamento humano e decisão administrativa",
    useCaseQuestion: "Qual demanda cidadã seria segura e representativa para um primeiro piloto municipal?",
    riskQuestion: "Qual orientação incorreta poderia causar maior prejuízo ao cidadão ou ao município?",
    approvalQuestion: "Quais encaminhamentos e decisões devem permanecer exclusivamente com o agente público responsável?",
    evidenceQuestion: "Quais fontes oficiais, versões e registros precisam acompanhar uma orientação ao cidadão?"
  },
  core: {
    label: "Core EIAH", domain: "governança de agentes e verticais", tenantId: "eiah-core.eiah", workspaceId: "revisao-core",
    title: "Conversa de validação do Core EIAH",
    purpose: "Avaliar arquitetura, governança, experiência transversal e possível participação em piloto controlado do Core EIAH.",
    agendaVersion: "eiah-core-review.v1", riskTier: "HIGH",
    description: "Validação transversal de intents, policy, RBAC, aprovações, providers, comprovantes e presentation snapshots.",
    gates: "tenant, workspace, identidade, RBAC, entitlement, policy, provider router, aprovação e recibo verificável",
    useCaseQuestion: "Qual fluxo transversal deveria validar primeiro o Core EIAH de ponta a ponta?",
    riskQuestion: "Qual falha de governança seria bloqueante para operar qualquer vertical?",
    approvalQuestion: "Quais ações do Core exigem aprovação humana ou dupla validação?",
    evidenceQuestion: "Quais eventos, receipts e snapshots precisam existir para demonstrar uma execução governada?"
  }
};

const VERTICAL_WORKBENCHES = {
  legal: {
    pilotTitle: "Piloto Legal · revisão de minuta fictícia",
    pilotObjective: "Validar extração de fatos, indicação de riscos e produção de minuta preliminar, sempre sujeita à revisão do advogado.",
    reviewTitle: "8. Bancada de revisão jurídica",
    reviewDescription: "Caso, minuta simulada e manifestação do advogado revisor.",
    safetyText: "não insira nomes de clientes, números processuais reais, documentos sigilosos ou estratégias de casos existentes.",
    caseLabel: "Descrição do caso fictício *", artifactLabel: "Minuta preliminar simulada *",
    scenarios: {
      labor_defense: { label: "Contestação trabalhista fictícia", caseText: "CASO FICTÍCIO: organização simulada recebeu reclamação trabalhista hipotética. Há alegação de horas extras e divergências em registros sintéticos. Não existem partes, processo ou documentos reais.", artifactText: "MINUTA PRELIMINAR SIMULADA: organizar cronologia e pontos controvertidos, confrontar alegações com registros sintéticos e bloquear conclusão ou protocolo sem revisão do advogado." },
      deadline_conflict: { label: "Conflito fictício de datas e prazos", caseText: "CASO FICTÍCIO: duas comunicações simuladas apresentam datas incompatíveis para ciência de uma decisão hipotética.", artifactText: "NOTA PRELIMINAR SIMULADA: registrar a divergência, solicitar fonte oficial e impedir cálculo definitivo de prazo sem validação do advogado." },
      missing_documents: { label: "Triagem fictícia com documentos ausentes", caseText: "CASO FICTÍCIO: conjunto documental sintético contém contrato e comprovantes parciais, mas faltam registros essenciais.", artifactText: "CHECKLIST PRELIMINAR SIMULADO: apontar ausências, limitar a análise e impedir peça conclusiva antes da complementação e revisão profissional." }
    }
  },
  logistica: {
    pilotTitle: "Piloto Logística · linha do tempo operacional fictícia",
    pilotObjective: "Validar reconstrução de eventos, documentos, prazos e responsabilidades, com aprovação humana antes de gate, cobrança ou contestação.",
    reviewTitle: "8. Bancada de revisão logística",
    reviewDescription: "Evento operacional simulado, linha do tempo e manifestação do especialista da cadeia.",
    safetyText: "não insira embarques, contêineres, clientes, documentos aduaneiros, valores ou ocorrências reais.",
    caseLabel: "Descrição do evento logístico fictício *", artifactLabel: "Linha do tempo / parecer operacional simulado *",
    scenarios: {
      detention_dispute: { label: "Demurrage e detention fictícios", caseText: "CENÁRIO FICTÍCIO: contêiner DEMO-001 chegou ao terminal em datas simuladas; aviso de chegada e liberação apresentam divergência de 24 horas.", artifactText: "LINHA DO TEMPO SIMULADA: listar eventos e fontes, marcar a divergência, separar fato de inferência e bloquear atribuição de custo até revisão operacional." },
      gate_release: { label: "Liberação de gate fictícia", caseText: "CENÁRIO FICTÍCIO: unidade DEMO-002 possui liberação documental parcial e status operacional conflitante entre dois atores simulados.", artifactText: "PARECER OPERACIONAL SIMULADO: manter gate bloqueado, solicitar prova da liberação e exigir aprovação do responsável antes de qualquer mudança de status." },
      damaged_cargo: { label: "Avaria de carga fictícia", caseText: "CENÁRIO FICTÍCIO: registro de avaria contém fotos sintéticas sem horário verificável e versões divergentes sobre a custódia.", artifactText: "CHECKLIST DE EVIDÊNCIAS SIMULADO: preservar fontes, ordenar custódia, identificar lacunas e impedir conclusão automática de responsabilidade." }
    }
  },
  imob: {
    pilotTitle: "Piloto Imóveis · jornada documental fictícia",
    pilotObjective: "Validar triagem de imóvel, visita, proposta e documentos simulados, sem alterar estado, contrato ou dados reais.",
    reviewTitle: "8. Bancada de revisão imobiliária", reviewDescription: "Jornada imobiliária simulada e manifestação do profissional responsável.",
    safetyText: "não insira proprietários, leads, endereços, matrículas, propostas ou contratos reais.",
    caseLabel: "Descrição da jornada imobiliária fictícia *", artifactLabel: "Checklist / recomendação imobiliária simulada *",
    scenarios: {
      proposal_documents: { label: "Proposta com documentos fictícios", caseText: "CENÁRIO FICTÍCIO: proposta DEMO apresenta documentos sintéticos incompletos e condição comercial pendente.", artifactText: "CHECKLIST SIMULADO: apontar documentos ausentes, condições pendentes e bloquear aceite ou contrato sem validação profissional." },
      visit_conflict: { label: "Conflito de agenda de visita fictício", caseText: "CENÁRIO FICTÍCIO: duas visitas simuladas foram associadas ao mesmo horário e imóvel demonstrativo.", artifactText: "RECOMENDAÇÃO SIMULADA: registrar conflito, sugerir opções e exigir confirmação humana antes de qualquer alteração de agenda." }
    }
  },
  marketing: {
    pilotTitle: "Piloto Marketing · campanha multicanal fictícia",
    pilotObjective: "Validar briefing, versões e riscos editoriais com aprovação humana antes de qualquer publicação.",
    reviewTitle: "8. Bancada de revisão editorial", reviewDescription: "Briefing e peça simulada para revisão de marca, alegações e canal.",
    safetyText: "não insira campanhas, públicos, credenciais, ativos licenciados ou dados de clientes reais.",
    caseLabel: "Briefing fictício *", artifactLabel: "Peça / plano editorial simulado *",
    scenarios: {
      product_launch: { label: "Lançamento fictício multicanal", caseText: "BRIEFING FICTÍCIO: lançamento de serviço demonstrativo para público genérico, sem oferta ou marca real.", artifactText: "PLANO EDITORIAL SIMULADO: adaptar mensagem por canal, marcar alegações que exigem comprovação e bloquear publicação até aprovação." },
      sensitive_claim: { label: "Alegação sensível fictícia", caseText: "BRIEFING FICTÍCIO: peça contém promessa de resultado não comprovada em ambiente demonstrativo.", artifactText: "REVISÃO SIMULADA: remover promessa absoluta, solicitar fonte e submeter versão corrigida ao responsável editorial." }
    }
  },
  finance: {
    pilotTitle: "Piloto BPO Financeiro · conciliação fictícia",
    pilotObjective: "Validar conferência de valores e pendências simuladas, sem pagamento, cobrança ou lançamento contábil.",
    reviewTitle: "8. Bancada de revisão financeira", reviewDescription: "Conciliação simulada e manifestação do responsável financeiro.",
    safetyText: "não insira contas, favorecidos, notas fiscais, dados bancários, valores ou documentos reais.",
    caseLabel: "Descrição da operação financeira fictícia *", artifactLabel: "Conciliação / recomendação financeira simulada *",
    scenarios: {
      reconciliation_gap: { label: "Divergência de conciliação fictícia", caseText: "CENÁRIO FICTÍCIO: extrato e razão demonstrativos apresentam diferença sintética de classificação.", artifactText: "CONCILIAÇÃO SIMULADA: localizar divergência, preservar referências e bloquear ajuste até dupla validação." },
      duplicate_payment: { label: "Possível pagamento duplicado fictício", caseText: "CENÁRIO FICTÍCIO: duas instruções demonstrativas possuem mesmo favorecido e valor, com identificadores distintos.", artifactText: "ALERTA SIMULADO: suspender recomendação de pagamento, verificar origem e exigir dupla aprovação." }
    }
  },
  guardian: {
    pilotTitle: "Piloto Guardian · verificação de evidência fictícia",
    pilotObjective: "Validar integridade, cadeia de custódia, reasonCodes e verificabilidade de eventos sintéticos.",
    reviewTitle: "8. Bancada de revisão de evidências", reviewDescription: "Evento governado simulado e manifestação do revisor de integridade.",
    safetyText: "não insira credenciais, hashes de produção, recibos, logs ou incidentes reais.",
    caseLabel: "Evento governado fictício *", artifactLabel: "Recibo / análise de integridade simulada *",
    scenarios: {
      broken_chain: { label: "Cadeia de evidência incompleta", caseText: "CENÁRIO FICTÍCIO: sequência demonstrativa contém evento sem vínculo verificável com o hash anterior.", artifactText: "ANÁLISE SIMULADA: marcar cadeia inválida, emitir reasonCode e bloquear aceitação da evidência." },
      scope_denied: { label: "Escopo fictício não autorizado", caseText: "CENÁRIO FICTÍCIO: ação demonstrativa foi solicitada fora do workspace autorizado.", artifactText: "RECIBO SIMULADO: registrar bloqueio fail-closed, identidade contextual e reasonCode SCOPE_DENIED." }
    }
  },
  legacy: {
    pilotTitle: "Piloto Legacy · diagnóstico técnico fictício",
    pilotObjective: "Validar inventário, dependências, riscos e rollback em ambiente inteiramente simulado, sem mudança técnica externa.",
    reviewTitle: "8. Bancada de revisão de modernização", reviewDescription: "Sistema legado simulado e manifestação do responsável técnico.",
    safetyText: "não insira código proprietário, topologia, credenciais, vulnerabilidades ou dados de produção.",
    caseLabel: "Descrição do sistema legado fictício *", artifactLabel: "Diagnóstico / plano de modernização simulado *",
    scenarios: {
      dependency_map: { label: "Dependências legadas fictícias", caseText: "CENÁRIO FICTÍCIO: aplicação demonstrativa depende de serviço sem documentação e banco simulado compartilhado.", artifactText: "DIAGNÓSTICO SIMULADO: inventariar dependências, classificar riscos e impedir migração antes de testes e rollback." },
      migration_window: { label: "Janela de migração fictícia", caseText: "CENÁRIO FICTÍCIO: mudança demonstrativa não possui janela aprovada nem critério de reversão.", artifactText: "PLANO SIMULADO: bloquear execução, definir testes, responsáveis, janela e critérios explícitos de rollback." }
    }
  },
  urban: {
    pilotTitle: "Piloto Urban · atendimento cidadão fictício",
    pilotObjective: "Validar orientação e encaminhamento simulados com fonte oficial e revisão do agente público, sem decisão administrativa.",
    reviewTitle: "8. Bancada de revisão de serviço urbano", reviewDescription: "Demanda cidadã simulada e manifestação do responsável público.",
    safetyText: "não insira cidadãos, endereços, protocolos, documentos, ocorrências ou dados municipais reais.",
    caseLabel: "Demanda urbana fictícia *", artifactLabel: "Orientação / encaminhamento simulado *",
    scenarios: {
      service_request: { label: "Solicitação urbana fictícia", caseText: "CENÁRIO FICTÍCIO: cidadão demonstrativo relata iluminação inoperante em endereço inexistente.", artifactText: "ORIENTAÇÃO SIMULADA: indicar canal oficial, registrar fonte e bloquear criação automática de protocolo." },
      jurisdiction_conflict: { label: "Competência administrativa fictícia", caseText: "CENÁRIO FICTÍCIO: demanda demonstrativa pode pertencer a órgãos distintos.", artifactText: "ENCAMINHAMENTO SIMULADO: declarar incerteza, consultar fonte oficial e exigir validação do agente público." }
    }
  },
  core: {
    pilotTitle: "Piloto Core EIAH · execução governada fictícia",
    pilotObjective: "Validar intent, identidade contextual, policy, aprovação, provider router e recibo em fluxo sintético ponta a ponta.",
    reviewTitle: "8. Bancada de revisão do Core EIAH", reviewDescription: "Execução transversal simulada e manifestação do revisor de governança.",
    safetyText: "não insira tokens, credenciais, tenants, workspaces, payloads ou evidências de produção.",
    caseLabel: "Execução governada fictícia *", artifactLabel: "Snapshot / recibo simulado *",
    scenarios: {
      high_risk_action: { label: "Ação HIGH fictícia", caseText: "CENÁRIO FICTÍCIO: ação demonstrativa HIGH possui contexto válido, mas aprovação humana ainda ausente.", artifactText: "SNAPSHOT SIMULADO: bloquear provider, registrar HUMAN_APPROVAL_REQUIRED e produzir estado renderizável sem efeito externo." },
      missing_workspace: { label: "Contexto obrigatório ausente", caseText: "CENÁRIO FICTÍCIO: requisição demonstrativa não contém workspaceId.", artifactText: "RECIBO SIMULADO: aplicar fail-closed com WORKSPACE_REQUIRED e nenhuma chamada ao provider." }
    }
  }
};

function topicsFor(profile) {
  return [
    { id: "interest_origin", label: "Origem do interesse", question: "O que chamou sua atenção no convite e motivou esta conversa?" },
    { id: "domain_experience", label: `Experiência em ${profile.label}`, question: `Como sua experiência se relaciona com ${profile.domain}?` },
    { id: "ai_usage", label: "Uso atual de IA", question: "Você já utiliza Inteligência Artificial nesta rotina? Em quais atividades?" },
    { id: "first_use_case", label: "Primeiro caso de uso", question: profile.useCaseQuestion },
    { id: "critical_risks", label: "Riscos críticos", question: profile.riskQuestion },
    { id: "human_approval", label: "Aprovação humana", question: profile.approvalQuestion },
    { id: "required_evidence", label: "Evidências necessárias", question: profile.evidenceQuestion },
    { id: "availability", label: "Disponibilidade", question: "Quanto tempo você poderia disponibilizar inicialmente para um piloto?" },
    { id: "expectations", label: "Expectativas", question: "O que você espera receber ou construir com essa participação?" },
    { id: "pilot_acceptance", label: "Aceite do piloto", question: `Faria sentido avançarmos para um teste controlado da Vertical ${profile.label}, com escopo delimitado?` }
  ];
}

function workbenchFor(verticalKey) {
  return VERTICAL_WORKBENCHES[verticalKey] || VERTICAL_WORKBENCHES.legal;
}

function applyVerticalWorkbench(verticalKey) {
  const workbench = workbenchFor(verticalKey);
  byId("pilotTitle").value = workbench.pilotTitle;
  byId("pilotObjective").value = workbench.pilotObjective;
  const scenarioSelect = byId("pilotScenario");
  scenarioSelect.replaceChildren();
  for (const [value, scenario] of Object.entries(workbench.scenarios)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = scenario.label;
    scenarioSelect.append(option);
  }
  byId("reviewCardTitle").textContent = workbench.reviewTitle;
  byId("reviewCardDescription").textContent = workbench.reviewDescription;
  byId("reviewSafetyText").textContent = workbench.safetyText;
  byId("fictionalCaseLabel").textContent = workbench.caseLabel;
  byId("simulatedDraftLabel").textContent = workbench.artifactLabel;
  byId("fictionalCase").value = "";
  byId("simulatedDraft").value = "";
  byId("reviewDecision").value = "";
  byId("reviewNotes").value = "";
  byId("reviewHumanConfirmed").checked = false;
  byId("generateSyntheticCaseBtn").textContent = `Carregar cenário fictício · ${VERTICAL_CONTEXTS[verticalKey]?.label || "Legal"}`;
}

let topics = topicsFor(VERTICAL_CONTEXTS.legal);

const state = {
  sessionId: null,
  prepared: false,
  consented: false,
  startedAt: null,
  finalizedAt: null,
  context: null,
  consent: null,
  participants: [],
  participantSequence: 0,
  segments: [],
  coverage: Object.fromEntries(topics.map((topic) => [topic.id, false])),
  events: [],
  previousHash: "GENESIS",
  finalSummary: "",
  humanConfirmed: false,
  decision: null,
  pilot: null,
  pilotCases: [],
  reviews: [],
  media: {
    adapter: null,
    scope: null,
    status: "inactive",
    stream: null,
    recorder: null,
    recognition: null,
    chunks: [],
    artifact: null,
    downloadUrl: null,
    startedAt: null,
    stoppedAt: null
  }
};

const byId = (id) => document.getElementById(id);

function isoNow() { return new Date().toISOString(); }
function shortTime(value) { return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function newId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error("CRYPTO_UNAVAILABLE");
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(value) {
  if (!globalThis.crypto?.subtle) throw new Error("CRYPTO_UNAVAILABLE");
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendEvent(eventType, payload = {}) {
  const event = {
    eventId: newId("EVT"),
    sessionId: state.sessionId,
    eventType,
    createdAt: isoNow(),
    actorRef: state.context?.userId || "anonymous-preview",
    previousHash: state.previousHash,
    payload
  };
  event.eventHash = await sha256(JSON.stringify(event));
  state.previousHash = event.eventHash;
  state.events.push(event);
  renderEvents();
  updateMetrics();
  return event;
}

function showReason(elementId, code, message) {
  const element = byId(elementId);
  element.textContent = `${code} · ${message}`;
  element.classList.add("show");
}

function clearReason(elementId) {
  const element = byId(elementId);
  element.textContent = "";
  element.classList.remove("show");
}

function setPill(id, label, stateName) {
  const pill = byId(id);
  pill.textContent = label;
  pill.dataset.state = stateName;
}

function setStep(id, mode) {
  const step = byId(id);
  step.classList.toggle("active", mode === "active");
  step.classList.toggle("done", mode === "done");
}

function requiredValue(id, reasonCode) {
  const value = byId(id).value.trim();
  if (!value) throw new Error(reasonCode);
  return value;
}

function readContext() {
  return {
    tenantId: requiredValue("tenantId", "TENANT_REQUIRED"),
    workspaceId: requiredValue("workspaceId", "WORKSPACE_REQUIRED"),
    userId: requiredValue("userId", "USER_REQUIRED"),
    vertical: requiredValue("vertical", "VERTICAL_REQUIRED"),
    title: requiredValue("sessionTitle", "SESSION_TITLE_REQUIRED"),
    meetingMode: requiredValue("meetingMode", "MEETING_MODE_REQUIRED"),
    purpose: requiredValue("purpose", "PURPOSE_REQUIRED"),
    retention: requiredValue("retention", "RETENTION_POLICY_REQUIRED"),
    riskTier: requiredValue("riskTier", "RISK_TIER_REQUIRED"),
    agendaVersion: requiredValue("agendaVersion", "AGENDA_VERSION_REQUIRED")
  };
}

function lockPrepareForm(locked) {
  byId("prepareForm").querySelectorAll("input, select, textarea").forEach((control) => {
    control.disabled = locked;
  });
  byId("prepareBtn").classList.toggle("hidden", locked);
  byId("editContextBtn").classList.toggle("hidden", !locked);
}

function applyVerticalContext(verticalKey) {
  if (state.consented) {
    showReason("prepareReason", "SESSION_CONTEXT_LOCKED", "O contexto não pode ser alterado depois do consentimento.");
    byId("vertical").value = state.context?.vertical || "legal";
    return;
  }
  const profile = VERTICAL_CONTEXTS[verticalKey] || VERTICAL_CONTEXTS.legal;
  byId("vertical").value = verticalKey in VERTICAL_CONTEXTS ? verticalKey : "legal";
  byId("tenantId").value = profile.tenantId;
  byId("workspaceId").value = profile.workspaceId;
  byId("sessionTitle").value = profile.title;
  byId("purpose").value = profile.purpose;
  byId("riskTier").value = profile.riskTier;
  byId("agendaVersion").value = profile.agendaVersion;
  byId("verticalContextTitle").textContent = `Contexto ${profile.label}`;
  byId("verticalContextDesc").textContent = profile.description;
  byId("verticalContextGates").textContent = profile.gates;
  applyVerticalWorkbench(verticalKey in VERTICAL_CONTEXTS ? verticalKey : "legal");
  topics = topicsFor(profile);
  state.coverage = Object.fromEntries(topics.map((topic) => [topic.id, false]));
  renderCoverage();
  updateQuestionSuggestion();
  updateMetrics();
  clearReason("prepareReason");
  if (state.prepared) {
    state.prepared = false;
    state.context = null;
    setPill("prepareStatus", "Revalidação necessária", "pending");
    setPill("consentStatus", "Bloqueado", "blocked");
    refreshConsentButton();
  }
}

function editContext() {
  clearReason("prepareReason");
  if (state.consented) {
    return showReason("prepareReason", "SESSION_CONTEXT_LOCKED", "O contexto integra a evidência e não pode ser editado depois do consentimento.");
  }
  state.sessionId = null;
  state.prepared = false;
  state.context = null;
  state.consent = null;
  state.participants = [];
  state.participantSequence = 0;
  state.events = [];
  state.previousHash = "GENESIS";
  state.startedAt = null;
  state.finalizedAt = null;
  state.finalSummary = "";
  state.humanConfirmed = false;
  state.decision = null;
  state.pilot = null;
  state.pilotCases = [];
  state.reviews = [];
  state.coverage = Object.fromEntries(topics.map((topic) => [topic.id, false]));
  lockPrepareForm(false);
  setPill("prepareStatus", "Pendente", "blocked");
  setPill("participantsStatus", "Aguardando contexto", "blocked");
  setPill("consentStatus", "Bloqueado", "blocked");
  setStep("step-prepare", "active");
  setStep("step-participants", "");
  setStep("step-consent", "");
  setStep("step-live", "");
  setStep("step-close", "");
  setStep("step-decision", "");
  setStep("step-pilot", "");
  setStep("step-review", "");
  setStep("step-evidence", "");
  setParticipantFormEnabled(false);
  renderParticipants();
  renderParticipantConsents();
  renderSpeakerOptions();
  renderCoverage();
  renderEvents();
  updateQuestionSuggestion();
  updateMetrics();
  refreshConsentButton();
}

async function prepareSession() {
  clearReason("prepareReason");
  try {
    state.context = readContext();
    state.sessionId = newId("MTG");
    state.prepared = true;
    await appendEvent("session.prepared", {
      protocolVersion: PROTOCOL_VERSION,
      vertical: state.context.vertical,
      riskTier: state.context.riskTier,
      agendaVersion: state.context.agendaVersion,
      externalEffect: false
    });
    setPill("prepareStatus", "Contexto válido", "ready");
    setPill("participantsStatus", "Aguardando convidados", "pending");
    setPill("consentStatus", "Aguardando participantes", "blocked");
    setStep("step-prepare", "done");
    setStep("step-participants", "active");
    lockPrepareForm(true);
    setParticipantFormEnabled(true);
    refreshConsentButton();
    byId("participantsCard").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONTEXT_INVALID";
    showReason("prepareReason", code, "Preencha todos os identificadores e a finalidade antes de continuar.");
    setPill("prepareStatus", "Bloqueado", "blocked");
  }
}

function setParticipantFormEnabled(enabled) {
  ["participantName", "participantEmail", "participantRole", "addParticipantBtn"].forEach((id) => {
    byId(id).disabled = !enabled;
  });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function addParticipant() {
  clearReason("participantReason");
  if (!state.prepared) return showReason("participantReason", "SESSION_CONTEXT_REQUIRED", "Valide o contexto antes do pré-cadastro.");
  if (state.consented) return showReason("participantReason", "PARTICIPANT_LIST_LOCKED", "A lista fica bloqueada depois do consentimento.");
  const participantLimit = state.context.meetingMode === "individual" ? 1 : 10;
  if (state.participants.length >= participantLimit) return showReason("participantReason", "PARTICIPANT_LIMIT_EXCEEDED", `Esta modalidade aceita no máximo ${participantLimit} participante(s).`);
  const displayName = byId("participantName").value.trim();
  const email = byId("participantEmail").value.trim().toLowerCase();
  const role = byId("participantRole").value;
  if (!displayName) return showReason("participantReason", "PARTICIPANT_NAME_REQUIRED", "Informe o nome do convidado.");
  if (!validEmail(email)) return showReason("participantReason", "PARTICIPANT_EMAIL_INVALID", "Informe um endereço de e-mail válido.");
  if (state.participants.some((participant) => participant.email === email)) return showReason("participantReason", "PARTICIPANT_DUPLICATE", "Este e-mail já está associado à sessão.");

  state.participantSequence += 1;
  const participant = {
    profileRef: newId("GUEST"),
    alias: `Participante ${state.participantSequence}`,
    displayName,
    email,
    contactHash: await sha256(email),
    role,
    profileStatus: "guest_pre_registered",
    ecosystemMembership: "none",
    vertical: state.context.vertical,
    invitedAt: isoNow(),
    consentConfirmed: false,
    consentRecordedAt: null
  };
  state.participants.push(participant);
  await appendEvent("guest_profile.pre_registered", {
    profileRef: participant.profileRef,
    alias: participant.alias,
    contactHash: participant.contactHash,
    role: participant.role,
    profileStatus: participant.profileStatus,
    ecosystemMembership: participant.ecosystemMembership,
    vertical: participant.vertical,
    piiStoredInEvidence: false
  });
  byId("participantName").value = "";
  byId("participantEmail").value = "";
  renderParticipants();
  renderParticipantConsents();
  renderSpeakerOptions();
  setPill("participantsStatus", `${state.participants.length}/10 pré-cadastrado(s)`, "ready");
  setPill("consentStatus", "Aguardando manifestações", "pending");
  setStep("step-participants", "done");
  setStep("step-consent", "active");
  refreshConsentButton();
}

async function removeParticipant(profileRef) {
  clearReason("participantReason");
  if (state.consented) return showReason("participantReason", "PARTICIPANT_LIST_LOCKED", "A lista fica bloqueada depois do consentimento.");
  const participant = state.participants.find((item) => item.profileRef === profileRef);
  if (!participant) return;
  state.participants = state.participants.filter((item) => item.profileRef !== profileRef);
  await appendEvent("session.participant_removed", { profileRef, contactHash: participant.contactHash, guestProfilePreserved: true });
  renderParticipants();
  renderParticipantConsents();
  renderSpeakerOptions();
  setPill("participantsStatus", state.participants.length ? `${state.participants.length}/10 pré-cadastrado(s)` : "Aguardando convidados", state.participants.length ? "ready" : "pending");
  setPill("consentStatus", state.participants.length ? "Aguardando manifestações" : "Aguardando participantes", state.participants.length ? "pending" : "blocked");
  refreshConsentButton();
}

async function setParticipantConsent(profileRef, confirmed) {
  const participant = state.participants.find((item) => item.profileRef === profileRef);
  if (!participant || state.consented) return;
  participant.consentConfirmed = confirmed;
  participant.consentRecordedAt = confirmed ? isoNow() : null;
  await appendEvent(confirmed ? "consent.participant_recorded" : "consent.participant_revoked", {
    profileRef,
    contactHash: participant.contactHash,
    recordedAt: participant.consentRecordedAt
  });
  renderParticipants();
  renderParticipantConsents();
  refreshConsentButton();
}

function renderParticipants() {
  const list = byId("participantList");
  list.replaceChildren();
  if (!state.participants.length) {
    const empty = document.createElement("div");
    empty.className = "helper participant-empty";
    empty.textContent = "Nenhum convidado pré-cadastrado. A sessão exige pelo menos um.";
    list.append(empty);
    return;
  }
  for (const participant of state.participants) {
    const row = document.createElement("article");
    row.className = "participant-row";
    const identity = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = participant.displayName;
    const meta = document.createElement("small"); meta.textContent = `${participant.alias} · ${participant.email} · ${participant.role} · convidado externo sem vínculo`;
    identity.append(name, meta);
    const status = document.createElement("span");
    status.className = "participant-state";
    status.dataset.state = participant.consentConfirmed ? "ready" : "pending";
    status.textContent = participant.consentConfirmed ? "Consentimento registrado" : "Consentimento pendente";
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "btn compact"; remove.textContent = "Remover da sessão";
    remove.disabled = state.consented;
    remove.addEventListener("click", () => removeParticipant(participant.profileRef));
    row.append(identity, status, remove);
    list.append(row);
  }
}

function renderParticipantConsents() {
  const list = byId("participantConsentList");
  list.replaceChildren();
  if (!state.participants.length) {
    const empty = document.createElement("div"); empty.className = "helper"; empty.textContent = "Pré-cadastre os convidados para habilitar as manifestações individuais."; list.append(empty); return;
  }
  for (const participant of state.participants) {
    const label = document.createElement("label"); label.className = "participant-consent";
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = participant.consentConfirmed; input.disabled = state.consented;
    input.addEventListener("change", () => setParticipantConsent(participant.profileRef, input.checked));
    const text = document.createElement("span");
    const strong = document.createElement("strong"); strong.textContent = participant.displayName;
    const small = document.createElement("small"); small.textContent = `${participant.alias} confirmou finalidade, transcrição, escopo de mídia e direitos.`;
    text.append(strong, small); label.append(input, text); list.append(label);
  }
}

function renderSpeakerOptions() {
  const select = byId("speaker");
  select.replaceChildren();
  const host = document.createElement("option"); host.value = "host"; host.textContent = "Anfitrião"; select.append(host);
  for (const participant of state.participants) {
    const option = document.createElement("option"); option.value = participant.profileRef; option.textContent = participant.displayName; select.append(option);
  }
}

function allConsentChecks() {
  return ["consentPurpose", "consentTranscript", "consentMedia", "consentRights"].every((id) => byId(id).checked);
}

function refreshConsentButton() {
  const allParticipantsConsented = state.participants.length > 0 && state.participants.every((participant) => participant.consentConfirmed);
  byId("consentBtn").disabled = !(state.prepared && allConsentChecks() && allParticipantsConsented && !state.consented);
}

async function registerConsent() {
  clearReason("consentReason");
  if (!state.prepared) return showReason("consentReason", "SESSION_CONTEXT_REQUIRED", "Valide o contexto antes do consentimento.");
  if (!state.participants.length) return showReason("consentReason", "PARTICIPANT_REQUIRED", "Pré-cadastre ao menos um participante.");
  if (!allConsentChecks()) return showReason("consentReason", "CONSENT_REQUIRED", "A manifestação precisa cobrir todas as finalidades apresentadas.");
  if (!state.participants.every((participant) => participant.consentConfirmed)) return showReason("consentReason", "ALL_PARTICIPANTS_CONSENT_REQUIRED", "Todos os convidados precisam confirmar individualmente.");
  try {
    const mediaAdapter = byId("mediaAdapter").value;
    const mediaScope = byId("mediaScope").value;
    state.media.adapter = mediaAdapter;
    state.media.scope = mediaScope;
    state.consent = state.participants.map((participant) => ({
      participantRef: participant.profileRef,
      participantAlias: participant.alias,
      contactHash: participant.contactHash,
      purposeInformed: true,
      transcriptAuthorized: true,
      mediaAdapter,
      mediaScope,
      audioStored: mediaScope === "audio_transcript" || mediaScope === "audio_video_transcript",
      videoStored: mediaScope === "audio_video_transcript",
      rightsInformed: true,
      retention: state.context.retention,
      recordedAt: participant.consentRecordedAt
    }));
    state.consented = true;
    state.startedAt = isoNow();
    await appendEvent("consent.group_gate_satisfied", { participantCount: state.participants.length, participantRefs: state.participants.map((participant) => participant.profileRef), mediaAdapter, mediaScope });
    await appendEvent("session.started", { captureMode: mediaAdapter, mediaScope, connectorConfigured: mediaAdapter === "browser_media", participantCount: state.participants.length });
    setPill("consentStatus", `${state.participants.length} consentimento(s) registrado(s)`, "ready");
    setPill("participantsStatus", `${state.participants.length} perfil(is) vinculado(s)`, "ready");
    setPill("liveStatus", "Captura autorizada", "ready");
    setPill("sessionStatus", "Em andamento", "ready");
    setStep("step-consent", "done");
    setStep("step-live", "active");
    byId("editContextBtn").classList.add("hidden");
    setParticipantFormEnabled(false);
    renderParticipants();
    renderParticipantConsents();
    byId("addSegmentBtn").disabled = false;
    byId("startMediaBtn").disabled = false;
    byId("mediaAdapter").disabled = true;
    byId("mediaScope").disabled = true;
    byId("finalizeBtn").disabled = false;
    refreshConsentButton();
    renderCoverage();
    updateQuestionSuggestion();
    byId("liveCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showReason("consentReason", "EVIDENCE_HASH_FAILED", "Não foi possível gerar a evidência de consentimento neste navegador.");
  }
}

async function createTranscriptSegment(text, sourceMode, confidence, speakerValue = "host") {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) throw new Error("TRANSCRIPT_SEGMENT_REQUIRED");
  const participant = state.participants.find((item) => item.profileRef === speakerValue);
  const segment = {
    segmentId: newId("SEG"),
    createdAt: isoNow(),
    speakerRef: speakerValue === "host" ? state.context.userId : participant?.profileRef,
    speakerRole: speakerValue === "host" ? "host" : "participant",
    rawText: normalizedText,
    sourceMode,
    confidence,
    reviewStatus: "pending"
  };
  segment.contentHash = await sha256(JSON.stringify(segment));
  state.segments.push(segment);
  await appendEvent("transcript.segment_added", {
    segmentId: segment.segmentId,
    contentHash: segment.contentHash,
    speakerRole: segment.speakerRole,
    sourceMode,
    confidence
  });
  renderSegments();
  updateMetrics();
  return segment;
}

async function addSegment() {
  clearReason("liveReason");
  if (!state.consented) return showReason("liveReason", "CONSENT_REQUIRED", "A captura permanece bloqueada sem consentimento.");
  if (state.finalizedAt) return showReason("liveReason", "SESSION_ALREADY_FINALIZED", "Crie uma nova sessão para continuar.");
  const text = byId("utterance").value.trim();
  if (!text) return showReason("liveReason", "TRANSCRIPT_SEGMENT_REQUIRED", "Digite ou cole um trecho antes de adicionar.");
  try {
    await createTranscriptSegment(text, "manual_fallback", Number(byId("confidence").value), byId("speaker").value);
    byId("utterance").value = "";
  } catch (error) {
    showReason("liveReason", "TRANSCRIPT_HASH_FAILED", "O trecho não foi incluído porque sua integridade não pôde ser calculada.");
  }
}

function setMediaUi(status, detail) {
  state.media.status = status;
  byId("mediaStateLabel").textContent = status === "active" ? "Captura automática ativa" : status === "stopped" ? "Captura encerrada" : "Captura inativa";
  byId("mediaStateDetail").textContent = detail;
  byId("recordDot").classList.toggle("active", status === "active");
  byId("startMediaBtn").disabled = status === "active" || !state.consented || Boolean(state.finalizedAt);
  byId("stopMediaBtn").disabled = status !== "active";
  setPill("liveStatus", status === "active" ? "Mídia ativa" : status === "stopped" ? "Mídia encerrada" : "Captura autorizada", status === "active" ? "ready" : "pending");
}

function startSpeechRecognition() {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) {
    showReason("mediaReason", "REALTIME_TRANSCRIPTION_UNAVAILABLE", "Este navegador não oferece transcrição automática. A mídia pode ser gravada localmente e o fallback manual permanece disponível.");
    return null;
  }
  const recognition = new Recognition();
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result.isFinal) continue;
      const alternative = result[0];
      createTranscriptSegment(alternative.transcript, "browser_mic", Number(alternative.confidence || 0.75), byId("speaker").value)
        .catch(() => showReason("mediaReason", "TRANSCRIPT_HASH_FAILED", "Um trecho automático não foi anexado à cadeia de evidências."));
    }
  };
  recognition.onerror = (event) => showReason("mediaReason", "REALTIME_TRANSCRIPTION_INTERRUPTED", `A transcrição foi interrompida (${event.error}). A gravação local pode continuar.`);
  recognition.start();
  return recognition;
}

async function startMediaCapture() {
  clearReason("mediaReason");
  if (!state.consented) return showReason("mediaReason", "CONSENT_REQUIRED", "A captura permanece bloqueada sem consentimento de todos.");
  if (state.finalizedAt) return showReason("mediaReason", "SESSION_ALREADY_FINALIZED", "A sessão encerrada não aceita nova captura.");
  if (state.media.adapter !== "browser_media") return showReason("mediaReason", "CONNECTOR_NOT_CONFIGURED", "O conector selecionado ainda não possui credenciais, webhook e ingress governado configurados.");
  if (!navigator.mediaDevices?.getUserMedia) return showReason("mediaReason", "BROWSER_MEDIA_UNAVAILABLE", "Este navegador não permite captura local de mídia.");
  try {
    const includeVideo = state.media.scope === "audio_video_transcript";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: includeVideo });
    state.media.stream = stream;
    state.media.startedAt = isoNow();
    state.media.chunks = [];
    if (includeVideo) {
      byId("mediaPreview").srcObject = stream;
      byId("mediaPreview").classList.remove("hidden");
      await byId("mediaPreview").play();
    }
    if (state.media.scope !== "transcript_only") {
      if (!globalThis.MediaRecorder) throw new Error("MEDIA_RECORDER_UNAVAILABLE");
      state.media.recorder = new MediaRecorder(stream);
      state.media.recorder.addEventListener("dataavailable", (event) => { if (event.data.size) state.media.chunks.push(event.data); });
      state.media.recorder.start(1000);
    }
    state.media.recognition = startSpeechRecognition();
    if (state.media.scope === "transcript_only" && !state.media.recognition) throw new Error("REALTIME_TRANSCRIPTION_UNAVAILABLE");
    await appendEvent("media.capture_started", { adapter: state.media.adapter, scope: state.media.scope, rawMediaInMemoryOnly: true });
    setMediaUi("active", "Fluxo local ativo. Nenhum dado está sendo enviado a servidor.");
  } catch (error) {
    state.media.stream?.getTracks().forEach((track) => track.stop());
    state.media.stream = null;
    const code = error instanceof Error && ["MEDIA_RECORDER_UNAVAILABLE", "REALTIME_TRANSCRIPTION_UNAVAILABLE"].includes(error.message) ? error.message : "MEDIA_PERMISSION_DENIED";
    showReason("mediaReason", code, code === "REALTIME_TRANSCRIPTION_UNAVAILABLE" ? "O modo somente transcrição exige Web Speech API. Selecione áudio + transcrição para preservar a gravação local ou use navegador compatível." : "A captura não começou. Verifique permissão de microfone/câmera e compatibilidade do navegador.");
    setMediaUi("inactive", "Falha fechada: nenhuma captura ativa.");
  }
}

async function stopMediaCapture() {
  if (state.media.status !== "active") return;
  clearReason("mediaReason");
  try {
    if (state.media.recognition) {
      try { state.media.recognition.stop(); } catch { /* reconhecimento já encerrado */ }
    }
    if (state.media.recorder && state.media.recorder.state !== "inactive") {
      await new Promise((resolve) => {
        state.media.recorder.addEventListener("stop", resolve, { once: true });
        state.media.recorder.stop();
      });
    }
    state.media.stream?.getTracks().forEach((track) => track.stop());
    byId("mediaPreview").srcObject = null;
    byId("mediaPreview").classList.add("hidden");
    state.media.stoppedAt = isoNow();
    if (state.media.chunks.length) {
      const mimeType = state.media.recorder?.mimeType || state.media.chunks[0].type || "application/octet-stream";
      const blob = new Blob(state.media.chunks, { type: mimeType });
      const mediaHash = await sha256Bytes(await blob.arrayBuffer());
      state.media.artifact = { artifactRef: newId("MEDIA"), mimeType, size: blob.size, mediaHash, stored: false, localDownloadOnly: true };
      if (state.media.downloadUrl) URL.revokeObjectURL(state.media.downloadUrl);
      state.media.downloadUrl = URL.createObjectURL(blob);
      byId("downloadMediaBtn").classList.remove("hidden");
    }
    await appendEvent("media.capture_stopped", { scope: state.media.scope, artifact: state.media.artifact, transcriptSegmentCount: state.segments.filter((segment) => segment.sourceMode === "browser_mic").length });
    setMediaUi("stopped", state.media.artifact ? "Mídia disponível somente para download local; metadados e hash entram na evidência." : "Transcrição encerrada sem armazenamento de mídia bruta.");
    updateMetrics();
  } catch {
    showReason("mediaReason", "MEDIA_FINALIZATION_FAILED", "A sessão continua aberta, mas o artefato de mídia não pôde ser finalizado.");
  }
}

function downloadMedia() {
  if (!state.media.downloadUrl || !state.media.artifact) return;
  const extension = state.media.artifact.mimeType.includes("video") ? "webm" : "webm";
  const link = document.createElement("a");
  link.href = state.media.downloadUrl;
  link.download = `${state.sessionId}-media.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
}

async function toggleTopic(topicId) {
  if (!state.consented || state.finalizedAt) return;
  state.coverage[topicId] = !state.coverage[topicId];
  await appendEvent("agenda.topic_reviewed", { topicId, covered: state.coverage[topicId], humanValidated: true });
  renderCoverage();
  updateQuestionSuggestion();
  updateMetrics();
  refreshFinalizeButton();
  updateDecisionCoverageReason();
}

function updateQuestionSuggestion() {
  const next = topics.find((topic) => !state.coverage[topic.id]);
  byId("nextQuestion").textContent = next ? next.question : "Todos os temas foram marcados como cobertos. Valide o resumo com o participante.";
}

async function finalizeSession() {
  clearReason("closeReason");
  if (!state.consented) return showReason("closeReason", "SESSION_NOT_STARTED", "Inicie a sessão pelo gate de consentimento.");
  if (state.media.status === "active") return showReason("closeReason", "MEDIA_CAPTURE_ACTIVE", "Encerre a captura de mídia antes de fechar a sessão.");
  if (!byId("humanConfirmation").checked) return showReason("closeReason", "HUMAN_CONFIRMATION_REQUIRED", "Registre a confirmação do participante.");
  const summary = byId("humanSummary").value.trim();
  if (!summary) return showReason("closeReason", "HUMAN_SUMMARY_REQUIRED", "Inclua o resumo confirmado ou as correções realizadas.");
  const outcome = byId("sessionDecision").value;
  if (!outcome) return showReason("closeReason", "SESSION_DECISION_REQUIRED", "Selecione o resultado confirmado da sessão.");
  if (outcome === "PILOT_ACCEPTED" && !coverageComplete()) return showReason("closeReason", "AGENDA_COVERAGE_INCOMPLETE", "Para registrar aceite do piloto, valide as 10 perguntas do roteiro. Para recusa, adiamento ou pedido de informações, a cobertura parcial será preservada na evidência.");
  try {
    state.finalSummary = summary;
    state.humanConfirmed = true;
    state.decision = {
      outcome,
      reason: byId("decisionReason").value.trim(),
      futureContactAllowed: byId("futureContactAllowed").checked,
      confirmedByHuman: true,
      recordedAt: isoNow()
    };
    await appendEvent("session.decision_recorded", { outcome, reasonHash: state.decision.reason ? await sha256(state.decision.reason) : null, futureContactAllowed: state.decision.futureContactAllowed });
    state.finalizedAt = isoNow();
    await appendEvent("session.human_confirmed", { summaryHash: await sha256(summary), participantRefs: state.participants.map((participant) => participant.profileRef) });
    await appendEvent("session.finalized", { segmentCount: state.segments.length, coveragePercent: coveragePercent() });
    setPill("closeStatus", "Validado", "ready");
    setPill("evidenceStatus", "Pronto para exportar", "ready");
    setPill("liveStatus", "Encerrada", "pending");
    setPill("sessionStatus", "Finalizada", "ready");
    setStep("step-live", "done");
    setStep("step-close", "done");
    setStep("step-decision", "done");
    setStep("step-evidence", "active");
    byId("addSegmentBtn").disabled = true;
    byId("startMediaBtn").disabled = true;
    byId("humanSummary").disabled = true;
    byId("humanConfirmation").disabled = true;
    byId("sessionDecision").disabled = true;
    byId("decisionReason").disabled = true;
    byId("futureContactAllowed").disabled = true;
    byId("finalizeBtn").disabled = true;
    byId("exportBtn").disabled = false;
    renderDecision();
    if (outcome === "PILOT_ACCEPTED") {
      setPill("pilotStatus", "Aceite registrado", "ready");
      setStep("step-pilot", "active");
      setPilotFormEnabled(true);
    } else {
      setPill("pilotStatus", "Encerrado sem piloto", "blocked");
      setStep("step-pilot", "done");
      setStep("step-review", "done");
    }
    updateMetrics();
    byId(outcome === "PILOT_ACCEPTED" ? "pilotCard" : "evidenceCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showReason("closeReason", "FINALIZATION_EVIDENCE_FAILED", "A sessão permanece aberta porque a evidência final não foi gerada.");
  }
}

function renderDecision() {
  const labels = {
    PILOT_ACCEPTED: "Concordou com piloto controlado",
    DECLINED: "Não concordou com a continuidade",
    MORE_INFORMATION_REQUIRED: "Solicitou mais informações",
    DECISION_POSTPONED: "Decisão postergada"
  };
  const summary = byId("decisionSummary");
  if (!state.decision) {
    summary.textContent = "Finalize a sessão com uma decisão estruturada.";
    return;
  }
  summary.dataset.outcome = state.decision.outcome;
  summary.textContent = `${labels[state.decision.outcome]}. ${state.decision.reason || "Sem justificativa adicional registrada."} Contato futuro: ${state.decision.futureContactAllowed ? "autorizado" : "não autorizado"}.`;
  setPill("decisionStatus", labels[state.decision.outcome], state.decision.outcome === "PILOT_ACCEPTED" ? "ready" : "pending");
}

function setPilotFormEnabled(enabled) {
  ["pilotTitle", "pilotScenario", "pilotObjective", "pilotSynthetic", "pilotHumanGate", "pilotNoExternalEffect", "createPilotBtn"].forEach((id) => { byId(id).disabled = !enabled; });
}

function setReviewEnabled(enabled) {
  ["fictionalCase", "simulatedDraft", "reviewDecision", "reviewNotes", "reviewHumanConfirmed", "generateSyntheticCaseBtn", "recordReviewBtn"].forEach((id) => { byId(id).disabled = !enabled; });
}

function pilotGatesSatisfied() {
  return ["pilotSynthetic", "pilotHumanGate", "pilotNoExternalEffect"].every((id) => byId(id).checked);
}

async function createPilot() {
  clearReason("pilotReason");
  if (!state.finalizedAt || state.decision?.outcome !== "PILOT_ACCEPTED") return showReason("pilotReason", "PILOT_ACCEPTANCE_REQUIRED", "Somente uma sessão encerrada com aceite pode originar piloto.");
  if (!pilotGatesSatisfied()) return showReason("pilotReason", "PILOT_GATES_REQUIRED", "Confirme dados fictícios, revisão humana e ausência de efeito externo.");
  const title = byId("pilotTitle").value.trim();
  const objective = byId("pilotObjective").value.trim();
  if (!title || !objective) return showReason("pilotReason", "PILOT_CONTEXT_REQUIRED", "Informe título e objetivo do piloto.");
  state.pilot = {
    pilotId: newId("PILOT"),
    parentSessionId: state.sessionId,
    tenantId: state.context.tenantId,
    workspaceId: state.context.workspaceId,
    vertical: state.context.vertical,
    title,
    scenario: byId("pilotScenario").value,
    objective,
    dataClassification: "SYNTHETIC_ONLY",
    externalEffect: false,
    humanReviewRequired: true,
    status: "PLANNED",
    createdAt: isoNow()
  };
  await appendEvent("pilot.plan_created", { pilotId: state.pilot.pilotId, parentSessionId: state.sessionId, scenario: state.pilot.scenario, dataClassification: state.pilot.dataClassification, externalEffect: false });
  setPilotFormEnabled(false);
  setPill("pilotStatus", "Plano criado", "ready");
  setStep("step-pilot", "done");
  setReviewEnabled(true);
  setPill("reviewStatus", `Pronta · ${VERTICAL_CONTEXTS[state.context.vertical].label}`, "ready");
  setStep("step-review", "active");
  byId("pilotResult").textContent = `${state.pilot.pilotId} vinculado à sessão ${state.sessionId}. Status: PLANNED · dados: SYNTHETIC_ONLY · efeito externo: bloqueado.`;
  byId("pilotResult").classList.remove("hidden");
  updateMetrics();
  byId("reviewCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadSyntheticCase() {
  clearReason("reviewReason");
  if (!state.pilot) return showReason("reviewReason", "PILOT_REQUIRED", "Crie o plano de piloto antes da bancada.");
  const sample = workbenchFor(state.context.vertical).scenarios[state.pilot.scenario];
  if (!sample) return showReason("reviewReason", "SYNTHETIC_SCENARIO_NOT_FOUND", "O cenário não pertence à vertical selecionada.");
  byId("fictionalCase").value = sample.caseText;
  byId("simulatedDraft").value = sample.artifactText;
}

async function recordReview() {
  clearReason("reviewReason");
  if (!state.pilot) return showReason("reviewReason", "PILOT_REQUIRED", "Crie o plano de piloto antes da revisão.");
  const caseText = byId("fictionalCase").value.trim();
  const draftText = byId("simulatedDraft").value.trim();
  const decision = byId("reviewDecision").value;
  const notes = byId("reviewNotes").value.trim();
  if (!caseText || !draftText) return showReason("reviewReason", "SYNTHETIC_CASE_REQUIRED", "Carregue ou descreva um cenário e um artefato integralmente fictícios.");
  if (!decision || !notes || !byId("reviewHumanConfirmed").checked) return showReason("reviewReason", "HUMAN_REVIEW_REQUIRED", "Decisão, fundamentos e confirmação humana são obrigatórios.");
  const review = {
    caseId: newId("CASE"),
    reviewId: newId("REVIEW"),
    pilotId: state.pilot.pilotId,
    vertical: state.context.vertical,
    caseClassification: "SYNTHETIC_ONLY",
    caseText,
    caseHash: await sha256(caseText),
    draftText,
    draftHash: await sha256(draftText),
    decision,
    notes,
    notesHash: await sha256(notes),
    humanConfirmed: true,
    reviewedAt: isoNow()
  };
  state.pilotCases.push({ caseId: review.caseId, pilotId: review.pilotId, classification: review.caseClassification, caseText: review.caseText, caseHash: review.caseHash });
  state.reviews.push(review);
  state.pilot.status = "HUMAN_REVIEW_RECORDED";
  await appendEvent("vertical.review_recorded", { vertical: state.context.vertical, pilotId: review.pilotId, caseId: review.caseId, reviewId: review.reviewId, decision, caseHash: review.caseHash, artifactHash: review.draftHash, notesHash: review.notesHash, humanConfirmed: true });
  setPill("reviewStatus", "Revisão humana registrada", "ready");
  setStep("step-review", "done");
  renderReviews();
  updateMetrics();
}

function renderReviews() {
  const history = byId("reviewHistory");
  history.replaceChildren();
  for (const review of [...state.reviews].reverse()) {
    const item = document.createElement("article"); item.className = "review-entry";
    const title = document.createElement("strong"); title.textContent = `${review.reviewId} · ${review.decision}`;
    const detail = document.createElement("p"); detail.textContent = `${VERTICAL_CONTEXTS[review.vertical]?.label || review.vertical} · ${review.caseId} · confirmação humana · ${shortTime(review.reviewedAt)} · hash do artefato ${review.draftHash.slice(0, 16)}…`;
    item.append(title, detail); history.append(item);
  }
}

function coveragePercent() {
  return Math.round((coverageCount() / topics.length) * 100);
}

function coverageCount() {
  return Object.values(state.coverage).filter(Boolean).length;
}

function coverageComplete() {
  return topics.length > 0 && coverageCount() === topics.length;
}

function renderSegments() {
  const list = byId("segmentList");
  list.replaceChildren();
  if (!state.segments.length) {
    const empty = document.createElement("div"); empty.className = "helper"; empty.textContent = "Nenhum trecho registrado."; list.append(empty); return;
  }
  for (const segment of [...state.segments].reverse()) {
    const wrapper = document.createElement("article"); wrapper.className = "segment";
    const meta = document.createElement("div"); meta.className = "segment-meta";
    const speaker = document.createElement("strong"); speaker.textContent = segment.speakerRef;
    const time = document.createElement("span"); time.textContent = shortTime(segment.createdAt);
    meta.append(speaker, time);
    const body = document.createElement("p"); body.textContent = segment.rawText;
    wrapper.append(meta, body); list.append(wrapper);
  }
}

function renderCoverage() {
  const list = byId("coverageList");
  list.replaceChildren();
  const profile = VERTICAL_CONTEXTS[state.context?.vertical || byId("vertical").value] || VERTICAL_CONTEXTS.legal;
  byId("coverageTitle").textContent = `Cobertura do roteiro · ${profile.label}`;
  byId("coverageSummary").textContent = `${coverageCount()} de ${topics.length} perguntas validadas.`;
  topics.forEach((topic, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "coverage-item";
    item.dataset.state = state.coverage[topic.id] ? "covered" : "pending";
    item.disabled = !state.consented || Boolean(state.finalizedAt);
    const copy = document.createElement("span"); copy.className = "coverage-copy";
    const label = document.createElement("span"); label.className = "coverage-topic"; label.textContent = `${index + 1}. ${topic.label}`;
    const question = document.createElement("span"); question.className = "coverage-question"; question.textContent = topic.question;
    copy.append(label, question);
    const status = document.createElement("b"); status.textContent = state.coverage[topic.id] ? "Validado" : "Pendente";
    item.append(copy, status);
    item.addEventListener("click", () => toggleTopic(topic.id));
    list.append(item);
  });
}

function renderEvents() {
  const list = byId("eventList");
  list.replaceChildren();
  if (!state.events.length) {
    const empty = document.createElement("div"); empty.className = "helper"; empty.textContent = "Os eventos governados aparecerão aqui."; list.append(empty); return;
  }
  for (const event of [...state.events].reverse()) {
    const wrapper = document.createElement("article"); wrapper.className = "event";
    const meta = document.createElement("div"); meta.className = "event-meta";
    const type = document.createElement("strong"); type.textContent = event.eventType;
    const time = document.createElement("span"); time.textContent = shortTime(event.createdAt);
    meta.append(type, time);
    const hash = document.createElement("p"); hash.className = "hash"; hash.textContent = event.eventHash;
    wrapper.append(meta, hash); list.append(wrapper);
  }
}

function updateMetrics() {
  byId("segmentMetric").textContent = String(state.segments.length);
  byId("coverageMetric").textContent = `${coveragePercent()}%`;
  byId("eventMetric").textContent = String(state.events.length);
  byId("validationMetric").textContent = state.humanConfirmed ? "Sim" : "Não";
  byId("decisionMetric").textContent = state.decision?.outcome || "Pendente";
  byId("pilotMetric").textContent = state.pilot ? "Sim" : "Não";
  byId("mediaMetric").textContent = state.media.artifact ? "1" : "0";
  byId("reviewMetric").textContent = String(state.reviews.length);
  byId("lastHash").textContent = state.previousHash;
}

async function buildEvidenceBundle() {
  if (!state.finalizedAt || !state.humanConfirmed || !state.decision) throw new Error("EVIDENCE_NOT_FINALIZED");
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    exportedAt: isoNow(),
    status: "prototype_evidence_not_server_attested",
    manifest: {
      sessionId: state.sessionId,
      tenantId: state.context.tenantId,
      workspaceId: state.context.workspaceId,
      userId: state.context.userId,
      vertical: state.context.vertical,
      title: state.context.title,
      purpose: state.context.purpose,
      meetingMode: state.context.meetingMode,
      participantCount: state.participants.length,
      participantRefs: state.participants.map((participant) => participant.profileRef),
      agendaVersion: state.context.agendaVersion,
      riskTier: state.context.riskTier,
      retention: state.context.retention,
      startedAt: state.startedAt,
      finalizedAt: state.finalizedAt,
      captureMode: state.media.adapter || "manual_fallback",
      mediaScope: state.media.scope || "transcript_only",
      externalEffect: false
    },
    guestProfiles: state.participants.map((participant) => ({
      profileRef: participant.profileRef,
      alias: participant.alias,
      contactHash: participant.contactHash,
      role: participant.role,
      profileStatus: participant.profileStatus,
      ecosystemMembership: participant.ecosystemMembership,
      vertical: participant.vertical,
      invitedAt: participant.invitedAt,
      piiRef: null
    })),
    consents: state.consent,
    transcriptSegments: state.segments,
    agendaProfile: {
      vertical: state.context.vertical,
      label: VERTICAL_CONTEXTS[state.context.vertical].label,
      domain: VERTICAL_CONTEXTS[state.context.vertical].domain,
      agendaVersion: state.context.agendaVersion,
      totalQuestions: topics.length
    },
    agendaCoverage: topics.map((topic, index) => ({ order: index + 1, topicId: topic.id, label: topic.label, question: topic.question, covered: state.coverage[topic.id], humanValidated: state.coverage[topic.id] })),
    humanValidation: { confirmed: true, summary: state.finalSummary },
    sessionDecision: state.decision,
    mediaCapture: {
      adapter: state.media.adapter,
      scope: state.media.scope,
      status: state.media.status,
      startedAt: state.media.startedAt,
      stoppedAt: state.media.stoppedAt,
      artifact: state.media.artifact,
      rawMediaEmbedded: false
    },
    pilotPlan: state.pilot,
    pilotCases: state.pilotCases,
    specialistReviews: state.reviews,
    legalReviews: state.context.vertical === "legal" ? state.reviews : [],
    eventChain: state.events,
    integrity: { algorithm: "SHA-256", genesis: "GENESIS", lastEventHash: state.previousHash },
    limitations: ["Sem autenticação", "Sem persistência em servidor", "Sem atestação externa", "Captura de mídia somente local", "Zoom, Meet e Teams sem conectores configurados", "Transcrição automática dependente do suporte do navegador", "Nenhum efeito jurídico ou protocolo externo"]
  };
  evidence.integrity.bundleHash = await sha256(JSON.stringify(evidence));
  return evidence;
}

async function exportEvidence() {
  if (!state.finalizedAt || !state.humanConfirmed) return;
  const evidence = await buildEvidenceBundle();
  const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.sessionId}-evidence.json`;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function resetSession() {
  if (state.events.length && !globalThis.confirm("A sessão atual será apagada deste navegador. Exporte a evidência antes de continuar. Deseja criar uma nova sessão?")) return;
  globalThis.location.reload();
}

function refreshFinalizeButton() {
  const outcome = byId("sessionDecision").value;
  const coverageAllowsDecision = outcome !== "PILOT_ACCEPTED" || coverageComplete();
  byId("finalizeBtn").disabled = !(state.consented && byId("humanConfirmation").checked && Boolean(outcome) && coverageAllowsDecision && !state.finalizedAt);
}

function updateDecisionCoverageReason() {
  if (state.finalizedAt) return;
  if (byId("sessionDecision").value === "PILOT_ACCEPTED" && !coverageComplete()) {
    showReason("closeReason", "AGENDA_COVERAGE_INCOMPLETE", `Aceite do piloto exige 100% do roteiro. Cobertura atual: ${coverageCount()} de ${topics.length}.`);
  } else {
    clearReason("closeReason");
  }
}

function handleSessionDecisionChange() {
  refreshFinalizeButton();
  updateDecisionCoverageReason();
}

byId("prepareBtn").addEventListener("click", prepareSession);
byId("editContextBtn").addEventListener("click", editContext);
byId("vertical").addEventListener("change", (event) => applyVerticalContext(event.target.value));
byId("addParticipantBtn").addEventListener("click", addParticipant);
["consentPurpose", "consentTranscript", "consentMedia", "consentRights"].forEach((id) => byId(id).addEventListener("change", refreshConsentButton));
byId("consentBtn").addEventListener("click", registerConsent);
byId("addSegmentBtn").addEventListener("click", addSegment);
byId("startMediaBtn").addEventListener("click", startMediaCapture);
byId("stopMediaBtn").addEventListener("click", stopMediaCapture);
byId("downloadMediaBtn").addEventListener("click", downloadMedia);
byId("humanConfirmation").addEventListener("change", refreshFinalizeButton);
byId("sessionDecision").addEventListener("change", handleSessionDecisionChange);
byId("finalizeBtn").addEventListener("click", finalizeSession);
byId("createPilotBtn").addEventListener("click", createPilot);
byId("generateSyntheticCaseBtn").addEventListener("click", loadSyntheticCase);
byId("recordReviewBtn").addEventListener("click", recordReview);
byId("exportBtn").addEventListener("click", exportEvidence);
byId("newSessionBtn").addEventListener("click", resetSession);
globalThis.addEventListener("beforeunload", () => {
  state.media.stream?.getTracks().forEach((track) => track.stop());
  if (state.media.downloadUrl) URL.revokeObjectURL(state.media.downloadUrl);
});

applyVerticalContext(byId("vertical").value);
renderParticipants();
renderParticipantConsents();
renderSpeakerOptions();
renderCoverage();
renderSegments();
renderEvents();
renderDecision();
renderReviews();
setPilotFormEnabled(false);
setReviewEnabled(false);
setMediaUi("inactive", "Aguardando consentimento.");
updateMetrics();
