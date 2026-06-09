import assert from "node:assert/strict";
import test from "node:test";

import { MktCampaignReportSchema } from "../mktCampaignReportSchema";
import { RunAtivoReportingInputSchema } from "../runAtivoSchema";

test("mkt campaign report schema accepts structured campaign payload", () => {
  const report = MktCampaignReportSchema.parse({
    schemaVersion: "mkt_campaign_report.v1",
    campaignTitle: "Campanha Vertical Legal",
    objective: "Gerar pipeline qualificado de escritorios para parceria e piloto.",
    campaignSummary: "Campanha B2B com foco em LinkedIn, email e parcerias setoriais.",
    positioning: "Vertical Legal como infraestrutura juridica auditavel e incremental.",
    audience: {
      primary: "Socios e heads de inovacao de escritorios consultivos.",
      segments: ["Trabalhista", "Contratual", "LGPD"],
      geography: ["Sao Paulo", "Rio de Janeiro"],
    },
    priorityChannels: ["linkedin", "email", "partnerships"],
    channelPlans: [
      {
        channel: "linkedin",
        label: "LinkedIn outbound",
        objective: "Abrir conversas com decisores juridicos.",
        approach: "Cadencia de conexao, mensagem e follow-up.",
        contentFocus: ["posicionamento", "cta"],
      },
    ],
    timeline: [
      {
        period: "Semana 1",
        activity: "Definir ICP",
        description: "Fechar tese, lista de contas e scripts iniciais.",
      },
    ],
    requiredAssets: [
      {
        name: "One-pager da Vertical Legal",
        objective: "Explicar proposta de valor e piloto.",
      },
    ],
    kpis: [
      {
        name: "Reunioes agendadas",
        target: "10",
        channel: "linkedin",
      },
    ],
    qualificationCriteria: [
      {
        category: "lead",
        criteria: ["atua em trabalhista", "abertura para tecnologia juridica"],
      },
    ],
    risks: ["Mensagem prometer capabilities nao homologadas."],
    nextActions: ["Fechar ICP", "Preparar assets", "Iniciar outreach"],
  });

  assert.equal(report.schemaVersion, "mkt_campaign_report.v1");
  assert.equal(report.priorityChannels.includes("linkedin"), true);
  assert.equal(report.channelPlans.length, 1);
});

test("run ativo reporting input accepts optional mkt campaign report", () => {
  const payload = RunAtivoReportingInputSchema.parse({
    metadata: {
      agente: "MKT",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      mktCampaignReport: {
        schemaVersion: "mkt_campaign_report.v1",
        campaignTitle: "Campanha Vertical Legal",
        objective: "Gerar leads qualificados.",
        campaignSummary: "Campanha executiva com canais priorizados.",
        audience: {
          primary: "Socios de escritorios.",
        },
      },
    },
  });

  assert.equal(payload.metadata.mktCampaignReport?.schemaVersion, "mkt_campaign_report.v1");
  assert.equal(payload.metadata.mktCampaignReport?.audience.primary, "Socios de escritorios.");
});
