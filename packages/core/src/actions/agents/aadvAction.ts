import type { AgentProfileSeed } from "./types";
import { profileAction } from "./types";

const personas = [
  "jovem_profissional",
  "aprendiz_meia_idade",
  "senior_ativo",
  "sabio_terceira_idade",
] as const;

const categories = [
  "valor_acao",
  "custo_finops",
  "produtividade",
  "valor_memoria",
  "custo_seguranca",
  "experiencia",
  "valor_simplicidade",
  "custo_confiabilidade",
  "autonomia",
  "valor_confianca",
  "custo_propriedade",
  "humanizacao",
] as const;

const checklistFinops = [
  "Pre-fatura visível",
  "Reconcile OK (eiah billing reconcile)",
  "PlanQuota definida",
  "Sem anomalias",
];

const checklistSeguranca = [
  "RBAC OK",
  "KMS ativo e logs mascarados",
  "Isolamento por workspace",
  "Trilha assinada OK",
];

const defaultSummaryHtml = `<h2 class="text-xl font-semibold">RESUMO_EXECUTIVO</h2>
<ul class="list-disc pl-5">
  <li><strong>Ganhos:</strong> custo vivo por run, aprovação humana visível, memória contínua, auditoria assinada, quotas.</li>
  <li><strong>Riscos:</strong> dados parciais; mitigação com reconciliação e guardrails.</li>
  <li><strong>Custos previstos:</strong> variam por persona; drivers: tokens, integrações, operação.</li>
  <li><strong>Decisão:</strong> go_condicional com PlanQuota e reconcile habilitados.</li>
  <li><strong>Próximos passos:</strong> habilitar 'awaiting_confirmation' em tarefas críticas; validar RBAC; teste 7 dias.</li>
</ul>`;

const aadvSchema = {
  persona: "string",
  categoria: "string",
  pergunta_critica: "string",
  hipotese_valor: "string",
  explicacao_leiga: "string",
  evidencias_requeridas: "string[]",
  metricas_alvo: {
    lat_ms: "string",
    p95_step_ms: "string",
    "taxa_erro_%": "string",
    "retrabalho_%": "string",
    custo_run_usd: "string",
    "tokens_tools_%": "string",
    ttfr_ms: "string",
  },
  procedimentos_verificacao: "string[]",
  checklist_finops: {
    previsibilidade: "boolean",
    reconciliacao_ok: "boolean",
    quota_definida: "boolean",
    alerta_anomalia: "boolean",
  },
  checklist_seguranca: {
    rbac_ok: "boolean",
    kms_ok: "boolean",
    isolation_ok: "boolean",
    logs_mascarados: "boolean",
    trilha_assinada_ok: "boolean",
  },
  riscos: "string[]",
  red_flags: "string[]",
  acao_corretiva: "string",
  veredito: "string",
  _fontes: {
    run_event: {
      tarefa: "string",
      inicio_iso: "ISO8601",
      fim_iso: "ISO8601",
      pausa_aprovacao: "boolean",
      pausa_duracao: "string",
      erros: "string",
      passos_ultimos: "string[]",
    },
    billing_ledger: {
      exec_id: "string",
      custo_total: "number|string",
      custo_ia: "number|string",
      custo_tools: "number|string",
      custo_em_tempo_real: "boolean",
    },
    rbac: {
      papel_usuario: "string",
      quem_aprova: "string",
      quem_visualiza: "string[]",
      papeis_ativos: "string[]",
    },
    paineis: {
      finops_leitura: "boolean",
      run_viewer_leitura: "boolean",
      ponto_aprovacao_visivel: "boolean",
    },
  },
};

export const aadvProfile: AgentProfileSeed = {
  agent: "AADV",
  name: "AADV Self-Service",
  description:
    "Entrevista personas e sintetiza evidências FinOps/segurança em JSONL e resumo executivo pronto para auditoria.",
  model: "gpt-4o-mini",
  systemPrompt: [
    "Você é o AADV (Auto Atendimento de Due Diligence de Valor).",
    "Guie usuários leigos em português para coletar:",
    "- Persona (jovem_profissional, aprendiz_meia_idade, senior_ativo, sabio_terceira_idade) e categoria (valor_acao, custo_finops etc.).",
    "- KPI alvo 90 dias, volume mensal, tempo por tarefa, custo/hora, taxa de erro, perdas monetizadas, integrações, dados sensíveis, RBAC necessário, orçamento e ferramenta atual.",
    "- Fontes run_event, billing_ledger, rbac e painéis (FinOps, Run Viewer, Approval UI).",
    "- Pergunta crítica, hipótese de valor e explicação leiga do fluxo (ex.: Run Viewer + awaiting_confirmation).",
    "Normalize datas para ISO 8601, remova símbolos monetários e trate booleanos (sim/não).",
    "Produza um JSONL respeitando o ESQUEMA_SAIDA (estrutura no metadata) e um RESUMO_EXECUTIVO em HTML com ganhos, riscos, custos, decisão e próximos passos.",
    "Sempre destaque evidências que precisam de CLI (eiah billing reconcile, eiah runs replay --trace) e mantenha o veredito padrão 'go_condicional' com ação corretiva PlanQuota + reconcile.",
  ].join(" "),
  tools: [
    {
      name: "finops.run-events",
      description:
        "Consulta eventos de execução para preencher tarefa, timestamps, pausas awaiting_confirmation e últimos passos.",
      method: "GET",
      url_by_env: {
        dev: "/api/ops/run-events",
        prod: "https://api.eiah.local/api/ops/run-events",
      },
      params: {
        type: "object",
        required: ["workspaceId"],
        properties: {
          workspaceId: { type: "string" },
          traceId: { type: "string" },
        },
      },
    },
    {
      name: "finops.billing-ledger",
      description:
        "Busca custos consolidados (total, IA, ferramentas) e indica se há streaming em tempo real.",
      method: "GET",
      url_by_env: {
        dev: "/api/billing/ledger",
        prod: "https://api.eiah.local/api/billing/ledger",
      },
      params: {
        type: "object",
        required: ["workspaceId"],
        properties: {
          workspaceId: { type: "string" },
          runId: { type: "string" },
        },
      },
    },
    {
      name: "security.rbac-audit",
      description:
        "Lista papéis ativos, aprovadores e visibilidade para compor o bloco RBAC.",
      method: "GET",
      url_by_env: {
        dev: "/api/rbac/audit",
        prod: "https://api.eiah.local/api/rbac/audit",
      },
      params: {
        type: "object",
        required: ["tenantId"],
        properties: {
          tenantId: { type: "string" },
          workspaceId: { type: "string" },
        },
      },
    },
  ],
  metadata: {
    personas,
    categories,
    schema: aadvSchema,
    checklist: {
      finops: checklistFinops,
      seguranca: checklistSeguranca,
    },
    defaultSummaryHtml,
    procedures: [
      "CLI: eiah billing reconcile",
      "CLI: eiah runs replay --trace",
      "Painel: FinOps",
      "Painel: Run Viewer",
    ],
  },
};

export const aadvAgent = profileAction(aadvProfile);
