import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMktLandingPageHtml,
  buildMktPdfHtml,
  extractMktCampaignReport,
  shouldUseMktCampaignRenderer,
} from "../mktCampaignReportRenderer";

const payload = {
  metadata: {
    agente: "MKT",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-mkt-1",
    recipeOrchestration: {
      intent: "marketing_campaign",
      domain: "marketing",
      riskLevel: "low",
      supportMode: "delegate_assisted",
      primaryAgent: {
        key: "mkt",
        displayName: "MKT",
        selectionReason: "Campanha estruturada.",
        confidence: 0.98,
      },
      recipeSteps: [],
      governance: {
        tenantIdPresent: true,
        workspaceIdPresent: true,
        rbacEvaluated: true,
        entitlementEvaluated: true,
        trustScoreEvaluated: true,
        costGuardEvaluated: true,
        policyDecision: "allowed",
        reasonCode: null,
      },
      limitations: [],
      howToProceedNow: [],
      recommendedRecipes: [],
      externalPlatformsInvolved: [],
      nextBestImplementationAction: null,
      practicalSteps: [],
      readyForRerunWhen: [],
      guardianReviewReason: [],
      requiresGuardianReview: false,
      allowedSelfServiceAgents: [],
      suggestedSelfServiceAgents: [],
      audit: {
        orchestrationDecisionId: null,
        selectedAt: null,
        basedOnPattern: "chat_imob_orchestrator",
      },
    },
    mktCampaignReport: {
      schemaVersion: "mkt_campaign_report.v1",
      workspaceBrand: {
        name: "Workspace Vertical Legal",
        logoUrl: "https://example.com/logo-mkt.png",
        primaryColor: "#0f766e",
        accentColor: "#123456",
      },
      documentIdentity: {
        documentName: "Campanha Vertical Legal",
        generatedAt: "2026-06-06T12:00:00.000Z",
        reportVersion: "v1",
      },
      reportSections: [],
      tableOfContents: [],
      campaignTitle: "Campanha de Divulgação e Prospecção — Vertical Legal EIAH",
      objective: "Gerar pipeline qualificado de escritórios para parceria e piloto.",
      campaignSummary: "Campanha B2B com foco em LinkedIn, email e parcerias setoriais.",
      positioning: "Vertical Legal como infraestrutura jurídica auditável e incremental.",
      offer: "Diagnóstico de aderência e piloto guiado da Vertical Legal.",
      audience: {
        primary: "Sócios e heads de inovação de escritórios consultivos.",
        segments: ["Trabalhista", "Contratual", "LGPD"],
        geography: ["São Paulo"],
        notes: null,
      },
      icp: [
        {
          cluster: "Boutique especializada",
          label: "Escritórios boutique trabalhistas",
          description: "Bancas consultivas com abertura para tecnologia jurídica.",
          priority: 1,
        },
      ],
      icpScoring: {
        positiveSignals: ["Especialidade Tier 1", "Cargo decisor"],
        negativeSignals: ["Resistência explícita a tecnologia"],
        scoreRules: [
          { criterion: "Especialidade Tier 1", score: 30, note: "Sinal positivo principal" },
        ],
        mqlThreshold: 60,
        sqlThreshold: 80,
      },
      coreMessage: "A Vertical Legal organiza operações jurídicas com governança e revisão humana quando necessária.",
      cta: "Agendar conversa para avaliar aderência à Vertical Legal.",
      complianceFlags: ["oab_publicidade"],
      valuePropositionByArea: [
        {
          legalArea: "Trabalhista",
          headline: "Seu escritório trabalhista analisa risco em minutos.",
          pain: "Passivo e retrabalho manual.",
          solution: "Fluxo estruturado com revisão humana.",
          cta: "Agendar demonstração.",
          complianceNote: "Evitar promessa de redução garantida de passivo.",
        },
      ],
      priorityChannels: ["linkedin", "email", "partnerships"],
      channelPlans: [
        {
          channel: "linkedin",
          label: "LinkedIn outbound",
          objective: "Abrir conversas com decisores jurídicos.",
          approach: "Cadência de conexão, mensagem e follow-up.",
          contentFocus: ["proposta de valor", "cta"],
          targetMetric: "10 reuniões",
          targetMetricValue: "10",
          cadence: "Revisão semanal",
        },
      ],
      outboundCadence: [
        {
          step: "Toque 1",
          dayOffset: 0,
          channel: "linkedin",
          action: "Primeiro contato com proposta de valor.",
          goal: "Abrir conversa",
        },
      ],
      timeline: [
        {
          period: "Semana 1",
          activity: "Definir ICP",
          description: "Fechar tese, contas e scripts.",
          owner: "Marketing",
        },
      ],
      requiredAssets: [
        {
          name: "One-pager da Vertical Legal",
          objective: "Explicar proposta de valor e piloto.",
          format: "PDF",
          owner: "Marketing",
        },
      ],
      kpis: [
        {
          name: "Reuniões agendadas",
          target: "10",
          channel: "linkedin",
          notes: null,
        },
      ],
      qualificationCriteria: [
        {
          category: "lead",
          criteria: ["atua em trabalhista", "abertura para tecnologia jurídica"],
        },
      ],
      coldEmailTemplates: [
        {
          legalArea: "Trabalhista",
          stage: "D0",
          subject: "Análise trabalhista com menos retrabalho",
          body: "A Vertical Legal organiza o fluxo e prepara relatório para revisão humana.",
          cta: "Posso te mostrar um exemplo?",
          complianceNote: "Não prometer redução garantida de passivo.",
        },
      ],
      launchChecklist: [
        {
          phase: "Pré-lançamento",
          item: "Fechar ICP e oferta.",
          owner: "Marketing",
          deadline: "D1-D3",
          complianceFlag: "oab_publicidade",
        },
      ],
      followUpPlan: ["Responder positivos em até 48h e reciclar contas frias após 30 dias."],
      prioritizationPlan: [
        {
          horizonDays: 30,
          focus: "Fechar ICP e scripts.",
          actions: ["Validar oferta", "Abrir primeira onda"],
          expectedOutcome: "Primeiras reuniões qualificadas.",
        },
      ],
      risks: ["Evitar prometer capabilities não homologadas."],
      riskLevel: "low",
      nextActions: ["Fechar ICP", "Preparar one-pager", "Iniciar outreach"],
      executiveGuidance: {
        adjustNow: ["Definir ICP", "Validar mensagem comercial"],
        dependsOnInternalReview: ["Revisar limites da promessa comercial com produto."],
        rerunWhen: ["Após a primeira onda de outreach."],
        readyToLaunchWhen: ["ICP, canais e materiais-base estiverem definidos."],
      },
    },
  },
  usuario: {},
  resumo: "Resumo",
  contexto: "Contexto",
  recomendacoes: [],
  insights: [],
  linksUteis: [],
  auditTrail: [],
  timeline: [],
} as const;

test("shouldUseMktCampaignRenderer activates for MKT campaign payload", () => {
  assert.equal(shouldUseMktCampaignRenderer(payload as any), true);
  const report = extractMktCampaignReport(payload as any);
  assert.ok(report);
  assert.equal(report?.campaignTitle, "Campanha de Divulgação e Prospecção — Vertical Legal EIAH");
});

test("buildMktLandingPageHtml renders campaign-only html", () => {
  const html = buildMktLandingPageHtml(payload as any);
  assert.match(html, /Menu da campanha/i);
  assert.match(html, /Resumo executivo/i);
  assert.match(html, /Público-alvo \/ ICP/i);
  assert.match(html, /Compliance/i);
  assert.match(html, /Proposta de valor por área/i);
  assert.match(html, /Canais prioritários/i);
  assert.match(html, /Cronograma/i);
  assert.match(html, /Assets necessários/i);
  assert.match(html, /Métricas-chave do plano/i);
  assert.match(html, /Dashboard de KPIs/i);
  assert.match(html, /Templates de cold e-mail/i);
  assert.match(html, /Checklist de lançamento/i);
  assert.match(html, /Próximos passos/i);
  assert.match(html, /Workspace Vertical Legal/i);
  assert.match(html, /logo-mkt\.png/i);
  assert.match(html, /Voltar ao topo/i);
  assert.doesNotMatch(html, /Recipe_Orchestrator|Guardian|healthcheck|rollback|Deck no Figma|Deck no Canva|API healthcheck|Nenhuma recomendação estruturada disponível/i);
});

test("buildMktPdfHtml renders printable campaign-only pdf html", () => {
  const html = buildMktPdfHtml(payload as any);
  assert.match(html, /Campanha de Divulgação e Prospecção — Vertical Legal EIAH/i);
  assert.match(html, /@page\s*\{\s*size:\s*A4;\s*margin:\s*3cm 2cm 2cm 3cm;/i);
  assert.match(html, /font-family:\s*"Times New Roman", Times, serif/i);
  assert.match(html, /Posicionamento/i);
  assert.match(html, /Oferta:/i);
  assert.match(html, /One-pager da Vertical Legal/i);
  assert.match(html, /Cadência outbound/i);
  assert.match(html, /Plano de follow-up/i);
  assert.match(html, /Priorização 30\/60\/90 dias/i);
  assert.match(html, /Métricas-chave do plano/i);
  assert.match(html, /Dashboard de KPIs/i);
  assert.match(html, /oab_publicidade/i);
  assert.match(html, /Templates de cold e-mail/i);
  assert.match(html, /Checklist de lançamento/i);
  assert.doesNotMatch(html, /Recipe_Orchestrator|Guardian|healthcheck|rollback|Deck no Figma|Deck no Canva|API healthcheck|Nenhuma recomendação estruturada disponível/i);
});
