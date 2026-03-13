import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import runsOverviewPrint from "../../../assets/playbook/runs/runs-overview.svg";
import runsCreatePrint from "../../../assets/playbook/runs/runs-criar.svg";
import runsStatusPrint from "../../../assets/playbook/runs/runs-status.svg";
import runsHistoryPrint from "../../../assets/playbook/runs/runs-historico.svg";
import runsResultPrint from "../../../assets/playbook/runs/runs-resultado.svg";
import AgentSelect from "../../../components/agents/AgentSelect";
import ChatAgentLauncher from "../../../components/agents/ChatAgentLauncher";
import { useSession } from "@/state/sessionStore";

type PlaybookConfig = {
  title: string;
  intro: React.ReactNode;
  routes: React.ReactNode[];
  directives: React.ReactNode[];
  checklist: React.ReactNode;
  documentationLinks?: Array<{ label: string; to: string }>;
  guideTabs?: Array<{
    id: string;
    label: string;
    to: string;
    purpose: React.ReactNode;
    howItWorks: React.ReactNode;
    steps: React.ReactNode[];
  }>;
};

const DOC_LINK_CLASS = "font-semibold text-accent underline underline-offset-4";
const GUIDE_STEP_EXPLANATIONS: Record<string, string[]> = {
  runs: [
    "Esse bloco mostra o panorama atual das execuções e ajuda a priorizar o que precisa de atenção agora.",
    "Use o tour para entender rapidamente onde estão os botões e painéis mais importantes.",
    "Conferir o contexto evita rodar no ambiente errado e reduz erro operacional.",
    "A escolha do agente define o comportamento da execução e o tipo de resultado esperado.",
    "A previsão de custo ajuda a decidir se vale simular antes ou seguir para execução direta.",
    "Esses indicadores permitem identificar gargalos e agir antes que o problema escale.",
    "O bloco de aprendizado acelera adoção para usuários novos e reduz dependência do time técnico.",
    "Simular primeiro reduz risco; rodar agora acelera quando o fluxo já está validado.",
    "Mensagens de aviso/erro orientam correção rápida sem perder contexto da operação.",
    "A lista recente facilita acompanhamento contínuo e rotina de revisão do time.",
    "Selecionar uma execução específica permite investigação focada de casos críticos.",
    "Aqui você valida se a entrega foi concluída com qualidade e evidência suficiente.",
    "No contexto imobiliário, esse bloco centraliza acompanhamento e comprovantes do processo.",
    "Os atalhos levam direto ao ponto certo da página para ganhar tempo na operação.",
  ],
  agentes: [
    "Defina quem executa o atendimento para manter consistência de resposta.",
    "O playbook mostra o padrão correto de uso e evita respostas fora de contexto.",
    "O launcher é o canal principal para pedir ação, orientação e próximos passos.",
    "Esses painéis ajudam a acompanhar governança, fluxo de eventos e status da conversa.",
  ],
  billing: [
    "Comece pelo plano para ter a referência correta de franquia e custo base.",
    "Preencher usuários e runs aproxima a simulação da realidade do cliente.",
    "Essa comparação mostra claramente o impacto dos excedentes no mês.",
    "Com o valor final, fica mais fácil decidir upgrade, ajuste de uso ou proposta comercial.",
  ],
  marketplace: [
    "O catálogo mostra opções para diferentes objetivos de negócio.",
    "Revisar casos de uso evita ativar agente que não resolve seu cenário.",
    "A ativação conecta o agente ao workspace e libera uso operacional.",
    "Depois da ativação, siga para execução prática em Runs ou atendimento em Agentes.",
  ],
  imob: [
    "O dashboard mostra visão da operação imobiliária em andamento.",
    "O chat IMOB orienta decisões de forma assistida e contextual.",
    "A rastreabilidade garante histórico claro de cada avanço no processo.",
    "Essa revisão final ajuda a melhorar produtividade e qualidade comercial.",
  ],
  selfservice: [
    "Escolher o template certo acelera a configuração do pedido.",
    "Um contexto bem preenchido melhora a qualidade da orientação recebida.",
    "A revisão das recomendações evita retrabalho antes da execução.",
    "Com o acompanhamento do agente, a execução fica mais segura e previsível.",
  ],
  perfil: [
    "Manter os dados corretos melhora comunicação e rastreabilidade do usuário.",
    "Validar o contexto de acesso evita execução em conta ou ambiente incorreto.",
    "Preferências ajustadas reduzem fricção no dia a dia da plataforma.",
    "Essa confirmação final evita falhas antes de operações críticas.",
  ],
};

const GUIDE_STEP_PREVIEW_LINKS: Record<string, string[]> = {
  runs: [
    "/app/runs#runs-overview",
    "/app/runs#runs-overview",
    "/app/runs#runs-overview",
    "/app/runs#runs-overview",
    "/app/runs#runs-overview",
    "/app/runs#runs-status",
    "/app/runs#runs-overview",
    "/app/runs#runs-criar",
    "/app/runs#runs-status",
    "/app/runs#runs-historico",
    "/app/runs#runs-historico",
    "/app/runs#runs-resultado",
    "/app/imob/dashboard",
    "/app/runs#runs-overview",
  ],
  agentes: ["/app/agents", "/app/agents?agent=eiah#playbook-panel", "/app/agents#chat-agent-launcher", "/app/agents"],
  billing: ["/app/billing", "/app/billing", "/app/billing", "/app/billing"],
  marketplace: ["/app/marketplace", "/app/marketplace", "/app/marketplace", "/app/agents"],
  imob: ["/app/imob/dashboard", "/app/imob/chat", "/app/imob/dashboard", "/app/imob/dashboard"],
  selfservice: ["/app/self-service", "/app/self-service", "/app/self-service", "/app/agents?agent=eiah#chat-agent-launcher"],
  perfil: ["/profile", "/profile", "/profile", "/profile"],
};

const GUIDE_STEP_PREVIEW_IMAGES: Record<string, string[]> = {
  runs: [
    runsOverviewPrint,
    runsOverviewPrint,
    runsOverviewPrint,
    runsOverviewPrint,
    runsOverviewPrint,
    runsStatusPrint,
    runsOverviewPrint,
    runsCreatePrint,
    runsStatusPrint,
    runsHistoryPrint,
    runsHistoryPrint,
    runsResultPrint,
    runsOverviewPrint,
    runsOverviewPrint,
  ],
};

function getGuideStepExplanation(tabId: string, stepIndex: number) {
  return GUIDE_STEP_EXPLANATIONS[tabId]?.[stepIndex] ?? "Essa etapa orienta uma ação prática para você avançar com segurança.";
}

function getGuideStepPreviewLink(tabId: string, stepIndex: number, fallback: string) {
  return GUIDE_STEP_PREVIEW_LINKS[tabId]?.[stepIndex] ?? fallback;
}

function getGuideStepPreviewImage(tabId: string, stepIndex: number) {
  return GUIDE_STEP_PREVIEW_IMAGES[tabId]?.[stepIndex] ?? runsOverviewPrint;
}

const PLAYBOOKS: Record<string, PlaybookConfig> = {
  mkt: {
    title: "MKT — Briefing de Campanha",
    intro:
      "Use o MKT para consolidar objetivo, publico e canais. Ele gera um plano com KPIs, cronograma e orcamento.",
    routes: [
      "Definir objetivo, publico e oferta principal.",
      "Estruturar canais, copys e criativos por etapa do funil.",
      "Gerar KPIs alvo (CTR, CPL, CAC) e metas por canal.",
      "Entregar plano multicanal com calendario e testes A/B.",
    ],
    directives: [
      "Evitar promessas sem base ou claims nao verificaveis.",
      "Indicar fonte dos dados quando usar benchmarks.",
      "Separar estrategia, taticas e execucao.",
      "Recomendar testes com minimo de 2 variacoes.",
    ],
    checklist: "Checklist rapido: defina meta principal, budget, canais prioritarios e prazo de campanha.",
  },
  j360: {
    title: "J_360 — Guia juridico rapido",
    intro:
      "Use o J_360 para analisar contratos, identificar riscos e gerar minutas com confirmacao humana obrigatoria.",
    routes: [
      "Revisar clausulas criticas e riscos sensiveis.",
      "Pesquisar fundamentos legais e jurisprudencia.",
      "Gerar minuta com pontos de atencao destacados.",
      "Sugerir melhorias e clausulas faltantes.",
    ],
    directives: [
      "Sempre manter trilha de auditoria e referencias.",
      "Nao aprovar envio sem confirmacao humana.",
      "Destacar clausulas com alto impacto juridico.",
      "Separar fatos, opiniao e recomendacao.",
    ],
    checklist: "Checklist rapido: envie contrato, identifique objetivo e informe prazo de analise.",
  },
  floworchestrator: {
    title: "Flow Orchestrator — Orquestracao DeFi",
    intro:
      "Use o Flow Orchestrator para sequenciar passos DeFi com guardrails, validacoes e logs operacionais.",
    routes: [
      "Definir objetivo e redes alvo (L1/L2).",
      "Mapear etapas: swap, pool, stake, bridge, etc.",
      "Validar riscos e limites por etapa.",
      "Gerar checklist operacional e rollback.",
    ],
    directives: [
      "Sempre declarar limites de slippage e gas.",
      "Prever fallback caso falhe uma etapa.",
      "Separar simulacao e execucao.",
      "Registrar hashes e referencias de transacao.",
    ],
    checklist: "Checklist rapido: redes, ativos, limites, slippage e parametros de seguranca.",
  },
  guardian: {
    title: "Guardian — Evidencias com verificacao publica",
    intro: (
      <>
        Use o Guardian como camada deterministica de compliance: ele so responde em JSON{" "}
        {`{schema_version, action, status, data, errors?}`} e bloqueia qualquer PII antes da ancoragem.
      </>
    ),
    routes: [
      <>
        <strong>POST /provas/processuais</strong>: consolida hash SHA-256, cadeia de custodia e fila Merkle com verify_url imediato.
      </>,
      <>
        <strong>POST /runs/&lt;id&gt;/receipt</strong>: emite recibo assinado, prepara downloads (badge HTML, PDF) e expoe audit.chain_id.
      </>,
      <>
        <strong>POST /privacy/erasure</strong>: confirma apagamento irrevogavel mantendo apenas hash residual para auditoria.
      </>,
      <>
        <strong>POST /nft/mint</strong>: gera certificado hash_only em L2 com alerta automatico quando houver risco de PII.
      </>,
    ],
    directives: [
      <>
        Sempre ecoar <code>trace_id</code> e <code>idempotency_key</code> em <code>data</code>.
      </>,
      <>
        Fornecer <code>verify_url</code> valido; se indisponivel, usar <code>about:blank</code> com justificativa.
      </>,
      <>
        Telemetria FinOps obrigatoria: <code>{`{l2, unit_cost_usd, batch_size, route}`}</code> com fallback quando custo &gt; US$0,01/1k eventos.
      </>,
      <>
        Status de ancora deve respeitar {`{queued, anchoring, confirmed, reorged}`} com <code>audit.confirmations ≥ 12</code>.
      </>,
    ],
    checklist:
      "Checklist rapido: sanitize PII, informe MIME/bytes validos, configure consenso multi-L2 e publique download_mode adequado (links ou inline).",
  },
  riskanalyzer: {
    title: "Risk Analyzer — Checklist de risco",
    intro:
      "Use o Risk Analyzer para identificar riscos, classificacao e mitigacoes com prioridade clara.",
    routes: [
      "Coletar contexto, escopo e ativos criticos.",
      "Classificar risco (baixo/medio/alto).",
      "Mapear mitigacoes e responsaveis.",
      "Gerar plano de acompanhamento e KPIs.",
    ],
    directives: [
      "Separar risco tecnico, legal e operacional.",
      "Informar probabilidade e impacto.",
      "Evitar conclusoes sem evidencias.",
      "Recomendar acoes com dono e prazo.",
    ],
    checklist: "Checklist rapido: ativos, ameacas, dependencias e SLAs.",
  },
  finnexus: {
    title: "Fin Nexus — Insight financeiro",
    intro:
      "Use o Fin Nexus para consolidar fluxo, indicadores e recomendacoes de otimizacao de custos.",
    routes: [
      "Coletar receitas, despesas e centros de custo.",
      "Calcular margem, burn e runway.",
      "Identificar gargalos e alavancas.",
      "Gerar plano de otimizacao e metas.",
    ],
    directives: [
      "Usar periodos comparaveis para analise.",
      "Destacar variacoes significativas.",
      "Separar custos fixos e variaveis.",
      "Sugerir acoes com impacto estimado.",
    ],
    checklist: "Checklist rapido: receitas, custos, headcount, metas e horizonte de analise.",
  },
  onchainmonitor: {
    title: "Onchain Monitor — Monitoramento on-chain",
    intro:
      "Use o Onchain Monitor para configurar alertas, eventos e rotinas de monitoramento.",
    routes: [
      "Definir contratos, wallets e eventos.",
      "Configurar filtros e thresholds.",
      "Criar alertas e rotas de notificacao.",
      "Gerar relatorio de saude e riscos.",
    ],
    directives: [
      "Priorizar eventos criticos com severidade.",
      "Evitar ruido com thresholds claros.",
      "Registrar origem e timestamp do evento.",
      "Manter fallback de consulta manual.",
    ],
    checklist: "Checklist rapido: contratos, eventos, thresholds e canais de alerta.",
  },
  ibc: {
    title: "I_BC — Inteligencia comercial",
    intro:
      "Use o I_BC para mapear pipeline, prioridades e estrategias de fechamento.",
    routes: [
      "Definir ICP e etapas do funil.",
      "Qualificar oportunidades e riscos.",
      "Recomendar proximas acoes.",
      "Gerar metas e indicadores comerciais.",
    ],
    directives: [
      "Separar dados confirmados e suposicoes.",
      "Manter historico por conta.",
      "Sugerir playbook por etapa do funil.",
      "Mensurar impacto de cada acao.",
    ],
    checklist: "Checklist rapido: ICP, pipeline, tickets e prazos.",
  },
  diarias: {
    title: "Diarias — Rotina operacional",
    intro:
      "Use o Diarias para consolidar resumo do dia, bloqueios e proximos passos.",
    routes: [
      "Reunir metricas e eventos do dia.",
      "Identificar bloqueios e riscos.",
      "Apontar destaques e prioridades.",
      "Gerar plano de acao para o dia seguinte.",
    ],
    directives: [
      "Priorizar itens por impacto.",
      "Evitar jargao tecnico sem necessidade.",
      "Separar fatos e opiniao.",
      "Apontar dono para cada acao.",
    ],
    checklist: "Checklist rapido: KPIs, bloqueios, dependencias e prazos.",
  },
  nftpy: {
    title: "NFT_PY — Planejamento de colecao NFT",
    intro:
      "Use o NFT_PY para definir narrativa, utilidade e roadmap de colecao.",
    routes: [
      "Definir narrativa e utilidade.",
      "Planejar supply, tiers e raridade.",
      "Criar cronograma de lancamento.",
      "Listar riscos e compliance.",
    ],
    directives: [
      "Evitar claims financeiros sem base.",
      "Definir direitos do holder claramente.",
      "Separar fases de pre e pos-lancamento.",
      "Prever suporte e comunidade.",
    ],
    checklist: "Checklist rapido: narrativa, supply, utilidade e roadmap.",
  },
  imagenftdiarias: {
    title: "ImageNFTDiarias — Prompts visuais diarios",
    intro:
      "Use o ImageNFTDiarias para criar prompts visuais consistentes com identidade.",
    routes: [
      "Definir estilo visual e paleta.",
      "Gerar prompts diarios com variacoes.",
      "Listar referencias e parametros.",
      "Organizar entregas por lote.",
    ],
    directives: [
      "Manter consistencia de identidade.",
      "Evitar referencias sensiveis.",
      "Registrar seeds e parametros.",
      "Validar qualidade antes de publicar.",
    ],
    checklist: "Checklist rapido: estilo, parametros, referencias e calendario.",
  },
  defi1: {
    title: "DeFi_1 — Simulacao DeFi",
    intro:
      "Use o DeFi_1 para simular operacoes e avaliar risco/retorno.",
    routes: [
      "Definir ativos e redes.",
      "Simular taxas, slippage e gas.",
      "Comparar rotas e pools.",
      "Gerar recomendacao com risco.",
    ],
    directives: [
      "Sempre indicar premissas.",
      "Separar simulacao de execucao.",
      "Estimar impacto de liquidez.",
      "Alertar para volatilidade.",
    ],
    checklist: "Checklist rapido: ativos, rede, slippage, gas e premissas.",
  },
  pitch: {
    title: "Pitch — Montar Pitch",
    intro:
      "Use o Pitch para estruturar narrativa, problema, solucao e tracao.",
    routes: [
      "Definir dor, publico e proposta.",
      "Montar storyline e diferenciais.",
      "Listar tracao, mercado e competidores.",
      "Gerar slides e roteiro de fala.",
    ],
    directives: [
      "Evitar claims sem dados.",
      "Manter story curto e direto.",
      "Incluir CTA e proximos passos.",
      "Separar visao e execucao.",
    ],
    checklist: "Checklist rapido: problema, solucao, tracao e CTA.",
  },
  eiah: {
    title: "Central de Ajuda EIAH",
    intro:
      "Use a Central de Ajuda EIAH como guia oficial da plataforma SaaS: explicações claras, passo a passo prático e orientação comercial quando necessário.",
    routes: [
      "Identificar o tipo de atendimento: help (suporte de uso da plataforma) ou proposal (solicitação comercial).",
      "Explicar a plataforma em linguagem simples, sempre com foco na ação que o usuário deve executar.",
      "Usar o menu de guia por página abaixo para orientar Runs, Agentes, Billing, Marketplace, IMOB, Self-service e Perfil.",
      "Quando o usuário perguntar sobre IMOB (ex.: 'como usar o IMOB'), responder com guia prático e atalhos para dashboard/chat.",
      "Fechar cada resposta com próximo passo claro: onde clicar, o que preencher e qual resultado esperar.",
      "No modo proposal, apresentar recomendação de plano e estimativa de custo com a regra oficial de billing.",
    ],
    directives: [
      "Usar apenas informacoes documentadas; se faltar dado, declarar explicitamente.",
      "Sempre priorizar linguagem de negocio: explicar o que o usuario ganha e qual acao deve tomar em seguida.",
      "Evitar termos tecnicos internos quando nao forem necessarios para a decisao do solicitante.",
      "Quando citar termos tecnicos, traduzir em seguida com frase simples e exemplo pratico.",
      "Explicar cada pagina com estrutura: para que serve, quando usar, passos principais e resultado esperado.",
      "Para comandos, explicar com verbo de acao: clicar, preencher, enviar, revisar, confirmar.",
      "Para duvidas de navegacao, orientar caminho completo: menu > pagina > bloco > acao.",
      "No modo proposal, usar a formula real de billing (mesma regra do backend) para evitar divergencia de preco.",
      "Manter resposta objetiva e acionavel, sem bloco tecnico para o usuario final.",
      "Finalizar atendimento comercial com CTA: abrir proposta, agendar demonstracao ou criar trial assistido.",
    ],
    checklist:
      "Checklist rápido: tipo de atendimento (help/proposal), página solicitada, passo a passo em linguagem simples, fonte utilizada, cálculo validado (quando houver preço) e próximo passo recomendado.",
    documentationLinks: [
      { label: "Visão geral do playbook", to: "/app/agents?agent=eiah#playbook-panel" },
      { label: "Runs (visão geral)", to: "/app/runs#runs-overview" },
      { label: "Runs: criar", to: "/app/runs#runs-criar" },
      { label: "Runs: status", to: "/app/runs#runs-status" },
      { label: "Runs: histórico", to: "/app/runs#runs-historico" },
      { label: "Runs: resultado", to: "/app/runs#runs-resultado" },
      { label: "Agentes", to: "/app/agents" },
      { label: "Billing", to: "/app/billing" },
      { label: "Marketplace", to: "/app/marketplace" },
      { label: "IMOB", to: "/app/imob/dashboard" },
      { label: "Self-service", to: "/app/self-service" },
      { label: "Perfil", to: "/profile" },
    ],
    guideTabs: [
      {
        id: "runs",
        label: "Runs",
        to: "/app/runs#runs-overview",
        purpose:
          "Acompanhar tudo o que acontece nas execuções, do início ao resultado final, com clareza para tomar decisão rápida.",
        howItWorks:
          "Você entra na página, escolhe quem vai executar, acompanha os indicadores, revisa o histórico e confere o resultado final com segurança.",
        steps: [
          "Veja o painel principal de execução para entender o cenário atual da operação.",
          "Use o tour guiado para aprender a página em poucos minutos.",
          "Confirme o contexto ativo (empresa, ambiente e agente selecionado).",
          "Escolha o agente que vai operar.",
          "Confira a previsão de custo antes de executar.",
          "Acompanhe os indicadores principais: total, em andamento, concluídas, falhas/bloqueios, tempo médio e custo acumulado.",
          "Use o bloco de aprendizado com vídeo curto, exemplos práticos e modelos prontos.",
          "Escolha entre “Simular primeiro” ou “Rodar agora”, conforme o nível de confiança no fluxo.",
          "Observe os avisos e mensagens da operação para agir rápido em caso de erro.",
          "Atualize e revise a lista de execuções recentes sempre que precisar.",
          "Selecione uma execução específica para análise detalhada.",
          "Confira entrada, saída e evidências da execução para validar o resultado.",
          "Quando aplicável, use a área IMOB para revisar execuções do contexto imobiliário e baixar comprovantes.",
          "Use os atalhos rápidos da própria documentação para abrir direto cada parte da página (visão geral, criar, status, histórico e resultado).",
        ],
      },
      {
        id: "agentes",
        label: "Agentes",
        to: "/app/agents",
        purpose: "Gerenciar agentes conectados, revisar playbooks e operar pelo Chat Agent Launcher.",
        howItWorks: "A página reúne seleção de agente, conversa assistida, painel de política e trilha de eventos de execução.",
        steps: [
          "Escolha o agente no seletor.",
          "Abra o playbook para revisar o roteiro de uso.",
          "Converse no launcher para executar ou pedir orientação.",
          "Acompanhe Policy, Real-time e Audit conforme necessidade.",
        ],
      },
      {
        id: "billing",
        label: "Billing",
        to: "/app/billing",
        purpose: "Entender custos, franquias, excedentes e previsão de valor mensal por plano.",
        howItWorks: "A página calcula consumo com a regra oficial de billing e mostra o impacto de usuários e runs no custo final.",
        steps: [
          "Selecione o plano de referência.",
          "Informe usuários e runs para simulação.",
          "Compare custo base, excedentes e total estimado.",
          "Use o resultado para proposta comercial ou ajuste de capacidade.",
        ],
      },
      {
        id: "marketplace",
        label: "Marketplace",
        to: "/app/marketplace",
        purpose: "Descobrir agentes disponíveis e ativar os que fazem sentido para o seu fluxo.",
        howItWorks: "Você avalia o objetivo de cada agente e conecta no workspace para usar no Mission Control.",
        steps: [
          "Navegue pelo catálogo de agentes.",
          "Revise descrição e casos de uso.",
          "Ative o agente no workspace.",
          "Volte para Runs ou Agentes para operar.",
        ],
      },
      {
        id: "imob",
        label: "IMOB",
        to: "/app/imob/dashboard",
        purpose: "Operar a jornada imobiliária com apoio de IA: leads, proposta, contrato e acompanhamento.",
        howItWorks: "O módulo organiza etapas comerciais e reduz retrabalho com fluxo guiado para a operação do time.",
        steps: [
          "Abra o dashboard para ver pipeline e contexto.",
          "Use o chat IMOB para orientar a próxima ação.",
          "Acompanhe o processo e avance etapas com rastreabilidade.",
          "Revise resultados e gargalos operacionais do time.",
        ],
      },
      {
        id: "selfservice",
        label: "Self-service",
        to: "/app/self-service",
        purpose: "Configurar pedidos com templates guiados, sem depender do time técnico.",
        howItWorks: "Os formulários estruturam o pedido e geram orientação prática para execução assistida.",
        steps: [
          "Escolha o template adequado ao objetivo.",
          "Preencha contexto e resultado esperado.",
          "Envie e revise recomendações geradas.",
          "Siga para execucao com acompanhamento do agente.",
        ],
      },
      {
        id: "perfil",
        label: "Perfil",
        to: "/profile",
        purpose: "Gerenciar dados da conta, preferências e contexto de acesso do usuário.",
        howItWorks: "Centraliza informações pessoais e de sessão para garantir uso consistente da plataforma.",
        steps: [
          "Revise os dados do usuário e identificação.",
          "Valide o contexto de tenant/workspace.",
          "Ajuste preferências necessárias para operação.",
          "Confirme o acesso antes de iniciar runs críticas.",
        ],
      },
    ],
  },
  fallback: {
    title: "Playbook do agente",
    intro: "Use este playbook como referencia para executar o agente de forma segura.",
    routes: ["Definir objetivo e contexto.", "Executar com validacoes.", "Registrar saidas e auditoria.", "Revisar resultados."],
    directives: ["Respeitar limites e politicas.", "Manter rastreabilidade.", "Separar simulacao e execucao.", "Confirmar acoes criticas."],
    checklist: "Checklist rapido: objetivo, limites, dados e validacao.",
  },
};

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const AgentsPage: React.FC = () => {
  const location = useLocation();
  const { workspaceId } = useSession();
  const [agentId, setAgentId] = useState<string>();
  const [playbookAgent, setPlaybookAgent] = useState<string | null>(null);
  const [activeGuideTabId, setActiveGuideTabId] = useState<string | null>(null);

  const playbookTargetId = agentId ? "playbook-panel" : null;
  const launcherTopic = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("topic")?.trim().toLowerCase() ?? null;
  }, [location.search]);
  const launcherPlanHint = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("plan")?.trim() ?? null;
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedAgent = params.get("agent")?.trim().toLowerCase();
    if (requestedAgent === "eiah") {
      setAgentId("EIAH");
      requestAnimationFrame(() => {
        document.getElementById("chat-agent-launcher")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [location.search]);

  const playbookData = useMemo(() => {
    if (!agentId) return null;
    const key = normalizeAgentKey(agentId);
    return PLAYBOOKS[key] ?? PLAYBOOKS.fallback;
  }, [agentId]);
  const hidePlaybookDirectives = useMemo(
    () => normalizeAgentKey(agentId ?? "") === "eiah",
    [agentId]
  );
  const activeGuideTab = useMemo(() => {
    if (!playbookData?.guideTabs || playbookData.guideTabs.length === 0) return null;
    if (activeGuideTabId) {
      const found = playbookData.guideTabs.find((tab) => tab.id === activeGuideTabId);
      if (found) return found;
    }
    return playbookData.guideTabs[0] ?? null;
  }, [playbookData, activeGuideTabId]);

  useEffect(() => {
    setPlaybookAgent(null);
    setActiveGuideTabId(null);
  }, [agentId]);

  useEffect(() => {
    if (!playbookData?.guideTabs || playbookData.guideTabs.length === 0) {
      setActiveGuideTabId(null);
      return;
    }
    setActiveGuideTabId((current) => current ?? playbookData.guideTabs?.[0]?.id ?? null);
  }, [playbookData]);

  const handlePlaybookClick = () => {
    if (!agentId || !playbookTargetId) return;
    setPlaybookAgent(agentId);
    requestAnimationFrame(() => {
      document.getElementById(playbookTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <div className="glass-panel p-8">
        <div className="grid gap-6 lg:grid-cols-1 lg:items-start">
          <div className="space-y-2">
            <div className="mt-6" id="chat-agent-launcher">
              <ChatAgentLauncher
                activeAgentId={agentId}
                onPlaybookClick={agentId ? handlePlaybookClick : undefined}
                headerControls={
                  <AgentSelect
                    value={agentId}
                    onChange={setAgentId}
                    showPlaybook={false}
                    inline
                  />
                }
                workspaceId={workspaceId}
                launcherContext={{
                  topic: launcherTopic,
                  planHint: launcherPlanHint,
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {playbookAgent && playbookData && (
        <section
          id="playbook-panel"
          className="mt-8 space-y-4 rounded-3xl border border-accent/30 bg-surface/80 p-8 text-sm text-muted-foreground shadow-lg shadow-accent/20"
        >
          <header className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Playbook</p>
                <h3 className="text-2xl font-display font-semibold text-foreground">{playbookData.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPlaybookAgent(null)}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40"
              >
                Fechar
              </button>
            </div>
            <p>{playbookData.intro}</p>
          </header>
          {playbookData.guideTabs && playbookData.guideTabs.length > 0 ? (
            <div className="glass-subtle rounded-2xl p-4">
              <h4 className="text-sm font-semibold text-foreground">Guia de uso por página</h4>
              <div className="mt-3 rounded-full border border-white/10 bg-surface-strong/70 p-1">
                <div className="flex flex-wrap items-center gap-1">
                  {playbookData.guideTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveGuideTabId(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        activeGuideTab?.id === tab.id
                          ? "bg-accent/20 text-accent"
                          : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {activeGuideTab ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">{activeGuideTab.label}</p>
                  <p className="mt-2">
                    <strong className="text-foreground">Para que serve:</strong> {activeGuideTab.purpose}
                  </p>
                  <p className="mt-2">
                    <strong className="text-foreground">Como funciona:</strong> {activeGuideTab.howItWorks}
                  </p>
                  <div className="mt-2">
                    <p className="text-foreground"><strong>Como usar:</strong></p>
                    <div className="mt-2 space-y-2">
                      {activeGuideTab.steps.map((step, index) => (
                        <details key={`${activeGuideTab.id}-step-${index}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <summary className="cursor-pointer list-none text-foreground">• {step}</summary>
                          <p className="mt-2 leading-relaxed text-muted-foreground">
                            {getGuideStepExplanation(activeGuideTab.id, index)}
                          </p>
                          {(() => {
                            const previewTo = getGuideStepPreviewLink(activeGuideTab.id, index, activeGuideTab.to);
                            const previewImage = getGuideStepPreviewImage(activeGuideTab.id, index);
                            return (
                              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                <p className="px-3 pt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Print do contexto da explicacao
                                </p>
                                <img
                                  src={previewImage}
                                  alt={`Print do contexto: ${activeGuideTab.label} - etapa ${index + 1}`}
                                  className="mt-2 h-36 w-full border-t border-white/10 object-cover"
                                  loading="lazy"
                                />
                                <Link to={previewTo} className={`inline-flex px-3 py-2 text-[11px] ${DOC_LINK_CLASS}`}>
                                  Abrir pagina relacionada
                                </Link>
                              </div>
                            );
                          })()}
                        </details>
                      ))}
                    </div>
                  </div>
                  <Link to={activeGuideTab.to} className={`mt-3 inline-flex ${DOC_LINK_CLASS}`}>
                    Abrir {activeGuideTab.label}
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className={`grid gap-4 ${hidePlaybookDirectives ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
            <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Roteiros principais</h4>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                {playbookData.routes.map((item, index) => (
                  <li key={`route-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
            {!hidePlaybookDirectives ? (
              <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Diretrizes críticas</h4>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                  {playbookData.directives.map((item, index) => (
                    <li key={`directive-${index}`}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <footer className="text-xs text-muted-foreground">{playbookData.checklist}</footer>
          {playbookData.documentationLinks && playbookData.documentationLinks.length > 0 ? (
            <div className="glass-subtle rounded-2xl p-4">
              <h4 className="text-sm font-semibold text-foreground">Documentação completa</h4>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {playbookData.documentationLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-accent transition hover:border-accent/60"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
};

export default AgentsPage;
