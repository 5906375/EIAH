import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import runsOverviewPrint from "../../../assets/playbook/runs/runs-overview.svg";
import runsCreatePrint from "../../../assets/playbook/runs/runs-criar.svg";
import runsStatusPrint from "../../../assets/playbook/runs/runs-status.svg";
import runsHistoryPrint from "../../../assets/playbook/runs/runs-historico.svg";
import runsResultPrint from "../../../assets/playbook/runs/runs-resultado.svg";
import AgentSelect from "../../../components/agents/AgentSelect";
import ChatAgentLauncher from "../../../components/agents/ChatAgentLauncher";
import { apiGetAgentBillingSummary, type Agent, type AgentBillingSummaryItem } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import { useAgents } from "@/hooks/useAgents";

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
    "O chat IMOB atua como assistente operacional agent-driven, com contexto de caso e próximo passo governado.",
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
  agentes: ["/app/chat", "/app/chat?agent=eiah#playbook-panel", "/app/chat#chat-agent-launcher", "/app/chat"],
  billing: ["/app/billing", "/app/billing", "/app/billing", "/app/billing"],
  marketplace: ["/app/marketplace", "/app/marketplace", "/app/marketplace", "/app/chat"],
  imob: ["/app/imob/dashboard", "/app/imob/chat", "/app/imob/dashboard", "/app/imob/dashboard"],
  selfservice: ["/app/self-service", "/app/self-service", "/app/self-service", "/app/chat?agent=eiah#chat-agent-launcher"],
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
  aadv: {
    title: "AADV Self-Service — Consolidação de evidências",
    intro:
      "Use o AADV para estruturar valor, FinOps e segurança em uma trilha clara antes da consolidação auditável do caso.",
    routes: [
      "Identificar o bloco principal do caso: valor, custo, risco, segurança ou governança.",
      "Reunir evidências mínimas de operação, FinOps, RBAC e trilha assinada antes de concluir.",
      "Separar hipótese, evidência validada, red flags e lacunas que ainda precisam ser fechadas.",
      "Consolidar um resumo executivo auditável com decisão, ação corretiva e próximos passos objetivos.",
    ],
    directives: [
      "Não concluir o caso sem indicar claramente o que ainda está faltando.",
      "Separar dado validado, hipótese e decisão recomendada.",
      "Explicar riscos de FinOps, RBAC e trilha assinada em linguagem clara.",
      "Usar o resumo executivo apenas depois de confirmar as evidências mínimas.",
      "Quando houver bloqueio, explicitar qual evidência está ausente e qual decisão depende dela.",
      "Se existir dúvida operacional, indicar primeiro o bloco faltante em vez de pular direto para conclusão.",
    ],
    checklist:
      "Checklist rápido: defina qual bloco está faltando, quais evidências já existem, quais riscos ainda não foram fechados e qual decisão depende dessa consolidação.",
    documentationLinks: [
      { label: "Agentes", to: "/app/chat" },
      { label: "Billing", to: "/app/billing" },
      { label: "Runs", to: "/app/runs#runs-overview" },
      { label: "Runs: resultado", to: "/app/runs#runs-resultado" },
      { label: "Perfil", to: "/profile" },
    ],
    guideTabs: [
      {
        id: "aadv-overview",
        label: "Visão geral",
        to: "/app/chat",
        purpose:
          "Entender qual bloco precisa ser consolidado antes de transformar o caso em resumo executivo auditável.",
        howItWorks:
          "O AADV organiza o caso em blocos de evidência, risco e decisão. Primeiro você identifica o bloco crítico, depois confirma o que já existe e só então consolida a recomendação final.",
        steps: [
          "Defina se o caso está travado por valor, custo, risco, segurança ou governança.",
          "Liste o que já está validado e o que ainda é hipótese.",
          "Aponte qual decisão depende dessa consolidação.",
          "Só depois avance para o resumo executivo auditável.",
        ],
      },
      {
        id: "aadv-finops",
        label: "FinOps e custo",
        to: "/app/billing",
        purpose:
          "Validar se o caso tem base mínima de custo, reconciliação e previsibilidade antes da conclusão.",
        howItWorks:
          "O AADV usa sinais de billing e operação para mostrar se o caso já tem base suficiente de FinOps ou se ainda faltam reconciliação, quota ou leitura confiável de custo.",
        steps: [
          "Confirme se existe custo vivo por run ou ledger consolidado.",
          "Verifique se a reconciliação foi concluída.",
          "Confira se quota, limites e anomalias já foram avaliados.",
          "Explique o impacto disso na decisão final do caso.",
        ],
      },
      {
        id: "aadv-governance",
        label: "Governança",
        to: "/profile",
        purpose:
          "Garantir que RBAC, trilha assinada e responsabilidades estejam claros antes de fechar o caso.",
        howItWorks:
          "O AADV ajuda a distinguir o que é risco operacional, o que é risco de segurança e o que ainda depende de aprovação ou visibilidade adequada no workspace.",
        steps: [
          "Confirme quem aprova, quem visualiza e quais papéis estão ativos.",
          "Verifique se a trilha assinada e os logs mascarados estão válidos.",
          "Aponte o risco se faltar RBAC, isolamento ou validação de auditoria.",
          "Consolide a ação corretiva antes de emitir o veredito.",
        ],
      },
    ],
  },
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
    title: "Guardian — Evidências com verificação pública",
    intro: (
      <>
        Use o Guardian como camada determinística de compliance. Ele responde em JSON{" "}
        {`{schema_version, action, status, data, errors?}`} e bloqueia dados pessoais antes de qualquer ancoragem.
      </>
    ),
    routes: [
      <>
        <strong>POST /provas/processuais</strong>: consolida hash SHA-256, cadeia de custódia e fila Merkle com <code>verify_url</code> imediato.
      </>,
      <>
        <strong>POST /runs/&lt;id&gt;/receipt</strong>: emite recibo assinado, prepara downloads (badge HTML, PDF) e expõe <code>audit.chain_id</code>.
      </>,
      <>
        <strong>POST /privacy/erasure</strong>: confirma apagamento irrevogável mantendo apenas hash residual para auditoria.
      </>,
      <>
        <strong>POST /nft/mint</strong>: gera certificado <code>hash_only</code> em L2 com alerta automático quando houver risco de dado pessoal.
      </>,
    ],
    directives: [
      <>
        Sempre ecoar <code>trace_id</code> e <code>idempotency_key</code> em <code>data</code>.
      </>,
      <>
        Fornecer <code>verify_url</code> válido; se estiver indisponível, usar <code>about:blank</code> com justificativa.
      </>,
      <>
        Telemetria FinOps obrigatória: <code>{`{l2, unit_cost_usd, batch_size, route}`}</code> com fallback quando o custo for &gt; US$ 0,01 por 1 mil eventos.
      </>,
      <>
        O status de âncora deve respeitar {`{queued, anchoring, confirmed, reorged}`} com <code>audit.confirmations ≥ 12</code>.
      </>,
    ],
    checklist:
      "Checklist rápido: remova dados pessoais, informe MIME e bytes válidos, configure consenso multi-L2 e escolha o modo de download adequado (links ou inline).",
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
    title: "EIAH",
    intro:
      "Use o EIAH como front door da plataforma: ele explica o produto, orienta navegação, organiza o próximo passo e encaminha para especialistas quando o caso pede profundidade real.",
    routes: [
      "Atuar como porta de entrada única da conversa: entender se o usuário precisa de ajuda geral, navegação, proposal, triagem ou especialista.",
      "Explicar a plataforma em linguagem simples, sempre com foco na ação que o usuário deve executar em seguida.",
      "Explicar o que cada agente faz, quando usar e qual limite de atuação cada um possui no workspace.",
      "Usar a taxonomia do ecossistema com clareza: EIAH como front door; J_360, FinNexus, Guardian, AADV, DeFi One, On-chain Monitor e Risk Analyzer como especialistas de domínio; MKT, Pitch e I_BC como especialistas de negócio; Flow Orchestrator, Diarias, NFT PY e Image NFT Diarias como agentes mais operacionais ou internos.",
      "Usar o menu de guia por página abaixo para orientar Runs, Agentes, Billing, Marketplace, IMOB, Self-service e Perfil.",
      "Quando o pedido exigir profundidade de domínio, encaminhar para o especialista correto sem quebrar a continuidade da conversa.",
      "No modo proposal, apresentar recomendação de plano e estimativa de custo com a regra oficial de billing.",
    ],
    directives: [
      "Assumir o papel de front door: responder primeiro com clareza e so depois encaminhar quando houver necessidade real de especialista.",
      "Usar apenas informacoes documentadas; se faltar dado, declarar explicitamente.",
      "Sempre priorizar linguagem de negocio: explicar o que o usuario ganha e qual acao deve tomar em seguida.",
      "Evitar termos tecnicos internos quando nao forem necessarios para a decisao do solicitante.",
      "Quando citar termos tecnicos, traduzir em seguida com frase simples e exemplo pratico.",
      "Separar claramente agentes de uso direto de agentes mais operacionais: o usuario deve entender quem entra na conversa principal e quem serve mais a fluxos internos ou avançados.",
      "Explicar cada pagina com estrutura: para que serve, quando usar, passos principais e resultado esperado.",
      "Explicar agentes com a estrutura: o que faz, quando usar, quando nao usar e qual especialista entra se o caso sair do escopo do EIAH.",
      "Fazer transferência quando o caso exigir profundidade de dominio, por exemplo: J_360 para contratos e clausulas, FinNexus para pagamentos e conciliacao, Guardian para evidencias e integridade, AADV para consolidacao de evidencias e decisao executiva, e DeFi One para simulacao DeFi.",
      "Usar verticais como contexto real da conversa: IMOB com linguagem e atalhos da jornada imobiliaria; LEGAL com linguagem juridica, coleta minima e handoff adequado.",
      "Nao agir como especialista profundo em todos os dominios; o papel do EIAH e orientar, triar, explicar e encaminhar com clareza.",
      "Para comandos, explicar com verbo de acao: clicar, preencher, enviar, revisar, confirmar.",
      "Para duvidas de navegacao, orientar caminho completo: menu > pagina > bloco > acao.",
      "No modo proposal, usar a formula real de billing (mesma regra do backend) para evitar divergencia de preco.",
      "Manter resposta objetiva e acionavel, sem bloco tecnico para o usuario final.",
      "Finalizar atendimento comercial com CTA: abrir proposta, agendar demonstracao ou criar trial assistido.",
    ],
    checklist:
      "Checklist rápido: papel do turno (help, triagem, handoff ou proposal), página ou agente correto, vertical ativa quando existir, passo a passo em linguagem simples, especialista elegível quando necessário, fonte utilizada, cálculo validado (quando houver preço) e próximo passo recomendado.",
    documentationLinks: [
      { label: "Visão geral do playbook", to: "/app/chat?agent=eiah#playbook-panel" },
      { label: "Runs (visão geral)", to: "/app/runs#runs-overview" },
      { label: "Runs: criar", to: "/app/runs#runs-criar" },
      { label: "Runs: status", to: "/app/runs#runs-status" },
      { label: "Runs: histórico", to: "/app/runs#runs-historico" },
      { label: "Runs: resultado", to: "/app/runs#runs-resultado" },
      { label: "Agentes", to: "/app/chat" },
      { label: "Billing", to: "/app/billing" },
      { label: "Marketplace", to: "/app/marketplace" },
      { label: "IMOB", to: "/app/imob/dashboard" },
      { label: "Self-service", to: "/app/self-service" },
      { label: "Perfil", to: "/profile" },
    ],
    guideTabs: [
      {
        id: "front-door",
        label: "Front door",
        to: "/app/chat#chat-agent-launcher",
        purpose:
          "Atuar como porta de entrada unica da conversa, organizando ajuda geral, navegacao, triagem e encaminhamento sem obrigar o usuario a entender a arquitetura interna.",
        howItWorks:
          "O EIAH recebe a pergunta, identifica o papel do turno e responde diretamente quando for tema geral da plataforma. Quando o caso pedir profundidade de dominio, ele encaminha para o especialista adequado sem quebrar a conversa.",
        steps: [
          "Receber a pergunta do usuário como ponto único de entrada da conversa.",
          "Responder claramente quando o usuário quiser saber quem está falando, qual agente está ativo ou o que o EIAH é.",
          "Explicar o papel de agentes como J_360, AADV, FinNexus, Guardian, DeFi One, MKT, Pitch, I_BC, Flow Orchestrator, Risk Analyzer, On-chain Monitor, Diarias, NFT PY e Image NFT Diarias antes de transferir quando isso ajudar o usuário a escolher melhor.",
          "Identificar se o caso é help, navegação, triagem, transferência ou proposal.",
          "Responder diretamente quando o tema for geral da plataforma ou de uso da interface.",
          "Encaminhar para especialista quando o pedido exigir profundidade real de domínio.",
          "Manter a continuidade da conversa, sem parecer troca brusca de bot.",
        ],
      },
      {
        id: "agentes-e-handoff",
        label: "Agentes e transferência",
        to: "/app/chat",
        purpose:
          "Explicar o papel de cada agente e definir quando o EIAH continua sozinho e quando faz transferência para especialista.",
        howItWorks:
          "O EIAH deve explicar o que cada agente faz, quando usar e quais limites existem. A transferência só deve acontecer quando o pedido realmente exigir profundidade de dominio ou execucao especializada.",
        steps: [
          "Explicar o papel de cada agente em linguagem simples para o usuário.",
          "Deixar explícita a taxonomia: EIAH como front door; J_360, FinNexus, Guardian, AADV, DeFi One, On-chain Monitor e Risk Analyzer como especialistas de domínio; MKT, Pitch e I_BC como especialistas de negócio; Flow Orchestrator, Diarias, NFT PY e Image NFT Diarias como agentes operacionais ou internos.",
          "Dizer quando vale usar um especialista e quando o próprio EIAH resolve a dúvida.",
          "Explicar J_360 como especialista em contratos, cláusulas, riscos e organização da análise jurídica.",
          "Explicar FinNexus como especialista em pagamentos, pendências, billing operacional e conciliação financeira.",
          "Explicar Guardian como especialista em evidências, receipt, verify_url, integridade e verificabilidade auditável.",
          "Explicar AADV como especialista em consolidar evidências, FinOps, risco e próximos passos executivos.",
          "Explicar DeFi One como especialista em simulação DeFi, custo, risco e comparação de cenários antes da execução.",
          "Explicar MKT, Pitch e I_BC como especialistas de negócio para campanhas, narrativa e inteligência comercial.",
          "Explicar Flow Orchestrator, Diarias, NFT PY e Image NFT Diarias como agentes mais operacionais ou internos, usados em fluxos avançados e não como front door principal.",
          "Fazer transferência só depois de explicar o papel do especialista e confirmar que ele é o próximo passo mais adequado.",
        ],
      },
      {
        id: "chat-launcher",
        label: "Chat Launcher",
        to: "/app/chat#chat-agent-launcher",
        purpose:
          "Usar o Chat Agent Launcher como canal principal para pedir orientação, executar fluxos com apoio de agente e seguir para o especialista certo sem sair da conversa.",
        howItWorks:
          "O launcher recebe a pergunta do usuário, deixa o agente ativo responder quando o caso for simples e, quando necessário, aciona transferência ou run sem quebrar a continuidade da experiência.",
        steps: [
          "Use o launcher quando quiser ajuda prática, próximo passo, explicação de página, ajuda para criar run ou triagem para especialista.",
          "Peça orientação em linguagem natural, sem precisar escolher a arquitetura interna do sistema.",
          "Quando a dúvida for geral, o EIAH responde diretamente com explicação, navegação ou guia rápido.",
          "Se você escolher um agente no seletor, ganha foco e profundidade imediata no domínio certo, com menos triagem e menos ambiguidade.",
          "Se não escolher, o EIAH continua como front door: entende a intenção, explica o caminho e te direciona para o especialista quando necessário.",
          "Quando a dúvida for sobre um agente do seletor, o EIAH explica primeiro o papel desse agente e só então sugere a transferência quando fizer sentido.",
          "Quando o caso exigir profundidade de domínio, o launcher mantém a conversa e aciona o especialista correto.",
          "Quando a situação exigir execução real, o launcher pode seguir para run e depois conectar Policy, Real-time e Audit ao mesmo fluxo.",
          "Use o playbook e o seletor de agentes para entender o papel de cada agente antes de executar casos mais específicos.",
        ],
      },
      {
        id: "verticais",
        label: "Verticais",
        to: "/app/chat?agent=eiah#playbook-panel",
        purpose:
          "Usar IMOB e LEGAL como contexto real da conversa, com linguagem, especialistas e affordances adequadas ao dominio.",
        howItWorks:
          "Quando a conversa estiver em IMOB, o EIAH deve priorizar jornada imobiliaria, pipeline, proposta e contrato. Quando estiver em LEGAL, deve usar linguagem juridica clara, pedir o minimo necessario e encaminhar para o Jurídico quando houver análise contratual ou risco jurídico.",
        steps: [
          "Identificar se a conversa está em contexto IMOB ou LEGAL antes de responder ou encaminhar.",
          "Em IMOB, priorizar linguagem de jornada imobiliária, pipeline, proposta, imóvel e contrato.",
          "Em LEGAL, usar linguagem jurídica clara, pedir apenas o mínimo necessário e preparar transferência para o Jurídico quando couber.",
          "Filtrar quick replies, atalhos e especialistas pelo contexto ativo da vertical.",
          "Evitar resposta genérica quando a vertical já indicar domínio, linguagem e próximo passo mais adequados.",
        ],
      },
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
        to: "/app/chat",
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

function formatGovernanceValue(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAgentCostLabel(cents?: number | null) {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatCompactNumber(value?: number | null) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("pt-BR");
}

function formatModeContractsSummary(agent: Agent) {
  if (!Array.isArray(agent.modeContracts) || agent.modeContracts.length === 0) return undefined;
  return agent.modeContracts.map((contract) => formatGovernanceValue(contract.mode)).join(" • ");
}

function formatModeContractsDetails(agent: Agent) {
  if (!Array.isArray(agent.modeContracts) || agent.modeContracts.length === 0) return undefined;
  return agent.modeContracts
    .map((contract) => {
      const shape = contract.uxContract?.responseShape
        ? formatGovernanceValue(contract.uxContract.responseShape)
        : null;
      return shape ? `${formatGovernanceValue(contract.mode)} (${shape})` : formatGovernanceValue(contract.mode);
    })
    .join(" • ");
}

function getCriticalityTone(criticality?: NonNullable<Agent["governance"]>["criticality"]) {
  switch (criticality) {
    case "critical":
      return "border-red-400/40 bg-red-500/15 text-red-100";
    case "high":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "medium":
      return "border-sky-400/40 bg-sky-500/15 text-sky-100";
    default:
      return "border-white/10 bg-white/5 text-muted-foreground";
  }
}

const AGENT_SPECIALTY_TAGS: Record<string, string[]> = {
  j360: ["Contratos", "Clausulas", "Risco", "Imobiliario", "Rescisao", "Garantias"],
  aadv: ["Evidencias", "Custos", "Seguranca", "Decisao", "Resumo executivo"],
  finnexus: ["Pagamentos", "Conciliacao", "Fluxo de caixa", "Cobranca"],
  guardian: ["Evidencias", "Comprovantes", "Auditoria", "Integridade"],
  "defi-one": ["Simulacao", "Custo", "Risco", "Swap", "Yield"],
  mkt: ["Campanhas", "Canais", "Briefing", "Metricas"],
  pitch: ["Narrativa", "Proposta de valor", "CTA", "Apresentacao"],
  i_bc: ["Pipeline", "ICP", "Expansao", "Fechamento"],
  "flow-orchestrator": ["Fluxos", "Sequencia", "Validacoes", "Execucao"],
  "risk-analyzer": ["Risco", "Impacto", "Mitigacao", "Compliance"],
  "onchain-monitor": ["Alertas", "Carteiras", "Eventos", "Blockchain"],
  diarias: ["Rotina", "Resumo do dia", "Backlog", "Bloqueios"],
};

function buildAgentSpecialtyPresentation(agent: Agent) {
  const normalizedId = normalizeAgentKey(agent.id);
  const description = (agent.description ?? "").trim();
  const summary = description
    ? description.split(/[.!?]/)[0]?.trim() || description
    : "Sem especialidade declarada.";
  const tags = AGENT_SPECIALTY_TAGS[normalizedId] ?? [];
  return {
    summary: summary.length > 110 ? `${summary.slice(0, 107).trimEnd()}...` : summary,
    tags,
  };
}

function GovernanceChips({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function CompactAttributeList({
  items,
  emptyLabel,
}: {
  items: Array<{ label: string; value?: string }>;
  emptyLabel: string;
}) {
  const visibleItems = items.filter((item) => item.value);
  if (visibleItems.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      {visibleItems.map((item) => (
        <p key={item.label}>
          <span className="text-foreground">{item.label}:</span> {item.value}
        </p>
      ))}
    </div>
  );
}

const AgentsPage: React.FC = () => {
  const location = useLocation();
  const { workspaceId } = useSession();
  const [agentId, setAgentId] = useState<string>();
  const [playbookAgent, setPlaybookAgent] = useState<string | null>(null);
  const [activeGuideTabId, setActiveGuideTabId] = useState<string | null>(null);
  const { items: agentItems, status: agentsStatus, error: agentsError } = useAgents();
  const [agentBillingSummary, setAgentBillingSummary] = useState<AgentBillingSummaryItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const catalogAgents = useMemo(
    () => [...agentItems].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
    [agentItems]
  );
  const catalogLoading = agentsStatus === "idle" || agentsStatus === "loading" || billingLoading;
  const catalogError = agentsError;

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

  useEffect(() => {
    setBillingLoading(true);
    apiGetAgentBillingSummary({ workspaceId })
      .then((billingResponse) => {
        setAgentBillingSummary(
          Array.isArray(billingResponse?.data?.items) ? billingResponse.data.items : []
        );
      })
      .catch(() => {
        setAgentBillingSummary([]);
      })
      .finally(() => setBillingLoading(false));
  }, [workspaceId]);

  const billingSummaryByAgent = useMemo(() => {
    const map = new Map<string, AgentBillingSummaryItem>();
    for (const item of agentBillingSummary) {
      map.set(normalizeAgentKey(item.agent), item);
    }
    return map;
  }, [agentBillingSummary]);
  const visibleCatalogAgents = useMemo(() => {
    if (!agentId) return catalogAgents;
    const filtered = catalogAgents.filter(
      (agent) => normalizeAgentKey(agent.id) === normalizeAgentKey(agentId)
    );
    return filtered.length > 0 ? filtered : catalogAgents;
  }, [agentId, catalogAgents]);
  const visibleAgentBillingSummary = useMemo(() => {
    if (!agentId) return agentBillingSummary;
    const filtered = agentBillingSummary.filter(
      (item) => normalizeAgentKey(item.agent) === normalizeAgentKey(agentId)
    );
    return filtered.length > 0 ? filtered : agentBillingSummary;
  }, [agentBillingSummary, agentId]);
  const showGovernanceSummaryCards = visibleCatalogAgents.length > 1;
  const rankedAgentsByCost = useMemo(
    () => [...visibleAgentBillingSummary].sort((a, b) => b.costCents - a.costCents),
    [visibleAgentBillingSummary]
  );
  const rankedAgentsByRuns = useMemo(
    () => [...visibleAgentBillingSummary].sort((a, b) => b.runs - a.runs),
    [visibleAgentBillingSummary]
  );
  const rankedAgentsByTokens = useMemo(
    () => [...visibleAgentBillingSummary].sort((a, b) => b.tokens - a.tokens),
    [visibleAgentBillingSummary]
  );
  const selectedAgentBilling = useMemo(() => {
    if (!agentId) return null;
    return billingSummaryByAgent.get(normalizeAgentKey(agentId)) ?? null;
  }, [agentId, billingSummaryByAgent]);
  const showImpactPanels =
    Boolean(selectedAgentBilling?.byModel?.length) ||
    visibleAgentBillingSummary.some((item) => item.costCents > 0 || item.runs > 0 || item.tokens > 0);
  const selectedAgentImpactSummary = useMemo(() => {
    if (!selectedAgentBilling) {
      return [
        "Selecione um agente para ver custo, volume e impacto financeiro no workspace atual.",
      ];
    }
    const totalCost = agentBillingSummary.reduce((sum, item) => sum + item.costCents, 0);
    const costShare = totalCost > 0 ? (selectedAgentBilling.costCents / totalCost) * 100 : 0;
    const topModel = selectedAgentBilling.byModel?.[0] ?? null;
    return [
      `${selectedAgentBilling.agent} consumiu ${formatAgentCostLabel(selectedAgentBilling.costCents)} em ${formatCompactNumber(selectedAgentBilling.runs)} run(s).`,
      `Isso representa ${costShare.toFixed(1)}% do custo agregado dos agentes deste workspace.`,
      topModel
        ? `O maior peso veio de ${topModel.provider} / ${topModel.model}, com ${formatAgentCostLabel(topModel.costCents)} e ${formatCompactNumber(topModel.tokens)} tokens.`
        : "Ainda não há drill-down por provider/model suficiente para este agente.",
    ];
  }, [agentBillingSummary, selectedAgentBilling]);

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
                onAgentChangeRequest={setAgentId}
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
      <section className="mt-8 rounded-3xl border border-white/10 bg-surface/80 p-6 shadow-lg shadow-black/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Governanca</p>
            <h2 className="text-2xl font-display font-semibold text-foreground">
              Inventario governado de agentes
            </h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
            {catalogLoading
              ? "Atualizando catálogo..."
              : `${visibleCatalogAgents.length} agente(s) com snapshot de governança`}
          </div>
        </div>

        {catalogError ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {catalogError}
          </div>
        ) : null}

        {showGovernanceSummaryCards ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Maior custo</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {rankedAgentsByCost[0]?.agent ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatAgentCostLabel(rankedAgentsByCost[0]?.costCents)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Maior volume</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {rankedAgentsByRuns[0]?.agent ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCompactNumber(rankedAgentsByRuns[0]?.runs)} run(s)
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Maior uso de tokens</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {rankedAgentsByTokens[0]?.agent ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCompactNumber(rankedAgentsByTokens[0]?.tokens)} tokens
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Agentes com custo</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {visibleAgentBillingSummary.filter((item) => item.costCents > 0).length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                de {visibleAgentBillingSummary.length} com atividade financeira
              </p>
            </div>
          </div>
        ) : null}

        {showImpactPanels ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-[0.45fr,0.55fr]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Leitura simples de impacto financeiro
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {selectedAgentImpactSummary.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Drill-down por provider/model
                </p>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                  {selectedAgentBilling?.byModel?.length ?? 0} grupo(s)
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(selectedAgentBilling?.byModel ?? []).slice(0, 6).map((item) => (
                  <div
                    key={`${selectedAgentBilling?.agent ?? "agent"}:${item.provider}:${item.model}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">
                        {item.provider} • {item.model}
                      </p>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-foreground">
                        {formatAgentCostLabel(item.costCents)}
                      </span>
                    </div>
                    <p className="mt-1">
                      {formatCompactNumber(item.runs)} run(s) • {formatCompactNumber(item.tokens)} tokens
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 hidden overflow-x-auto xl:block">
          <table className="min-w-full table-fixed border-separate border-spacing-y-3 text-left text-sm">
            <thead>
              <tr className="text-[10px] tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Especialidade</th>
                <th className="px-3 py-2">FinOps</th>
                <th className="px-3 py-2">Ferramentas</th>
                <th className="px-3 py-2">Risco</th>
                <th className="px-3 py-2">Aprovação</th>
                <th className="px-3 py-2">Comprovante</th>
                <th className="px-3 py-2">Contexto</th>
                <th className="px-3 py-2">Conhecimento</th>
                <th className="px-3 py-2">Cognitivo</th>
                <th className="px-3 py-2">Contrato</th>
              </tr>
            </thead>
            <tbody>
              {visibleCatalogAgents.map((agent) => {
                const isSelected = normalizeAgentKey(agent.id) === normalizeAgentKey(agentId ?? "");
                const billing = billingSummaryByAgent.get(normalizeAgentKey(agent.id));
                const specialty = buildAgentSpecialtyPresentation(agent);
                return (
                  <tr
                    key={agent.id}
                    className={`rounded-2xl bg-black/20 align-top ${
                      isSelected ? "ring-1 ring-accent/40" : ""
                    }`}
                  >
                    <td className="rounded-l-2xl px-3 py-4 text-foreground">{agent.name}</td>
                    <td className="px-3 py-4">
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-muted-foreground">{specialty.summary}</p>
                        <GovernanceChips
                          items={specialty.tags}
                          emptyLabel="Sem especialidades detalhadas"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <CompactAttributeList
                        emptyLabel="Sem custo operacional"
                        items={[
                          { label: "Custo", value: formatAgentCostLabel(billing?.costCents) },
                          { label: "Runs", value: typeof billing?.runs === "number" ? String(billing.runs) : undefined },
                          { label: "Tokens", value: typeof billing?.tokens === "number" ? String(billing.tokens) : undefined },
                        ]}
                      />
                    </td>
                    <td className="px-3 py-4">
                      <GovernanceChips
                        items={agent.governance?.toolCapabilities ?? []}
                        emptyLabel="Sem ferramentas declaradas"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                          getCriticalityTone(agent.governance?.criticality)
                        }`}
                      >
                        {agent.governance?.criticality ?? "low"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">
                      {formatGovernanceValue(agent.governance?.approval ?? "not_required")}
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">
                      {formatGovernanceValue(agent.governance?.receiptPolicy ?? "not_applicable")}
                    </td>
                    <td className="px-3 py-4">
                      <GovernanceChips
                        items={agent.governance?.requiredScopes ?? []}
                        emptyLabel="Sem contexto declarado"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <CompactAttributeList
                        emptyLabel="Sem knowledge policy"
                        items={[
                          {
                            label: "Sources",
                            value:
                              agent.knowledgePolicy?.deterministicSources.length
                                ? `${agent.knowledgePolicy.deterministicSources.length} deterministic source(s)`
                                : undefined,
                          },
                          {
                            label: "LLM",
                            value: formatGovernanceValue(agent.knowledgePolicy?.llmUsageMode ?? ""),
                          },
                          {
                            label: "Conflict",
                            value: formatGovernanceValue(agent.knowledgePolicy?.conflictResolution ?? ""),
                          },
                          {
                            label: "Fallback",
                            value: formatGovernanceValue(agent.knowledgePolicy?.fallbackPolicy ?? ""),
                          },
                          {
                            label: "Provenance",
                            value: formatGovernanceValue(agent.knowledgePolicy?.provenancePolicy ?? ""),
                          },
                        ]}
                      />
                    </td>
                    <td className="px-3 py-4">
                      <CompactAttributeList
                        emptyLabel="Sem perfil cognitivo"
                        items={[
                          { label: "Mode", value: formatGovernanceValue(agent.cognitiveProfile?.reasoningMode ?? "") },
                          { label: "Initiative", value: formatGovernanceValue(agent.cognitiveProfile?.initiativeLevel ?? "") },
                          { label: "Ambiguity", value: formatGovernanceValue(agent.cognitiveProfile?.ambiguityStrategy ?? "") },
                          { label: "Decision", value: formatGovernanceValue(agent.cognitiveProfile?.decisionPosture ?? "") },
                          { label: "Delegation", value: formatGovernanceValue(agent.cognitiveProfile?.delegationPolicy ?? "") },
                        ]}
                      />
                    </td>
                    <td className="rounded-r-2xl px-3 py-4">
                      <CompactAttributeList
                        emptyLabel="Sem contrato de UX"
                        items={[
                          { label: "Modes", value: formatModeContractsSummary(agent) },
                          { label: "Mode contracts", value: formatModeContractsDetails(agent) },
                          { label: "Value", value: agent.uxContract?.primaryUserValue },
                          { label: "Shape", value: formatGovernanceValue(agent.uxContract?.responseShape ?? "") },
                          { label: "Tone", value: formatGovernanceValue(agent.uxContract?.toneProfile ?? "") },
                          { label: "Interaction", value: formatGovernanceValue(agent.uxContract?.interactionPattern ?? "") },
                          { label: "CTA", value: agent.uxContract?.defaultCTA },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 xl:hidden">
          {visibleCatalogAgents.map((agent) => {
            const isSelected = normalizeAgentKey(agent.id) === normalizeAgentKey(agentId ?? "");
            const billing = billingSummaryByAgent.get(normalizeAgentKey(agent.id));
            const specialty = buildAgentSpecialtyPresentation(agent);
            return (
              <article
                key={agent.id}
                className={`rounded-2xl border border-white/10 bg-black/20 p-4 ${
                  isSelected ? "ring-1 ring-accent/40" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{agent.name}</h3>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                      getCriticalityTone(agent.governance?.criticality)
                    }`}
                  >
                    {agent.governance?.criticality ?? "low"}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">{specialty.summary}</p>
                  <GovernanceChips
                    items={specialty.tags}
                    emptyLabel="Sem especialidades detalhadas"
                  />
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">FinOps</dt>
                    <dd className="mt-2">
                      <CompactAttributeList
                        emptyLabel="Sem custo operacional"
                        items={[
                          { label: "Custo", value: formatAgentCostLabel(billing?.costCents) },
                          { label: "Runs", value: typeof billing?.runs === "number" ? String(billing.runs) : undefined },
                          { label: "Tokens", value: typeof billing?.tokens === "number" ? String(billing.tokens) : undefined },
                        ]}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Ferramentas</dt>
                    <dd className="mt-2">
                      <GovernanceChips
                        items={agent.governance?.toolCapabilities ?? []}
                        emptyLabel="Sem ferramentas declaradas"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Aprovação</dt>
                    <dd className="mt-1 text-foreground">
                      {formatGovernanceValue(agent.governance?.approval ?? "not_required")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Comprovante</dt>
                    <dd className="mt-1 text-foreground">
                      {formatGovernanceValue(agent.governance?.receiptPolicy ?? "not_applicable")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Contexto</dt>
                    <dd className="mt-2">
                      <GovernanceChips
                        items={agent.governance?.requiredScopes ?? []}
                        emptyLabel="Sem contexto declarado"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Conhecimento</dt>
                    <dd className="mt-2">
                      <CompactAttributeList
                        emptyLabel="Sem knowledge policy"
                        items={[
                          {
                            label: "Sources",
                            value:
                              agent.knowledgePolicy?.deterministicSources.length
                                ? `${agent.knowledgePolicy.deterministicSources.length} deterministic source(s)`
                                : undefined,
                          },
                          {
                            label: "LLM",
                            value: formatGovernanceValue(agent.knowledgePolicy?.llmUsageMode ?? ""),
                          },
                          {
                            label: "Conflict",
                            value: formatGovernanceValue(agent.knowledgePolicy?.conflictResolution ?? ""),
                          },
                          {
                            label: "Fallback",
                            value: formatGovernanceValue(agent.knowledgePolicy?.fallbackPolicy ?? ""),
                          },
                          {
                            label: "Provenance",
                            value: formatGovernanceValue(agent.knowledgePolicy?.provenancePolicy ?? ""),
                          },
                        ]}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Cognitivo</dt>
                    <dd className="mt-2">
                      <CompactAttributeList
                        emptyLabel="Sem perfil cognitivo"
                        items={[
                          { label: "Mode", value: formatGovernanceValue(agent.cognitiveProfile?.reasoningMode ?? "") },
                          { label: "Initiative", value: formatGovernanceValue(agent.cognitiveProfile?.initiativeLevel ?? "") },
                          { label: "Ambiguity", value: formatGovernanceValue(agent.cognitiveProfile?.ambiguityStrategy ?? "") },
                          { label: "Decision", value: formatGovernanceValue(agent.cognitiveProfile?.decisionPosture ?? "") },
                          { label: "Delegation", value: formatGovernanceValue(agent.cognitiveProfile?.delegationPolicy ?? "") },
                        ]}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">Contrato</dt>
                    <dd className="mt-2">
                      <CompactAttributeList
                        emptyLabel="Sem contrato de UX"
                        items={[
                          { label: "Modes", value: formatModeContractsSummary(agent) },
                          { label: "Mode contracts", value: formatModeContractsDetails(agent) },
                          { label: "Value", value: agent.uxContract?.primaryUserValue },
                          { label: "Shape", value: formatGovernanceValue(agent.uxContract?.responseShape ?? "") },
                          { label: "Tone", value: formatGovernanceValue(agent.uxContract?.toneProfile ?? "") },
                          { label: "Interaction", value: formatGovernanceValue(agent.uxContract?.interactionPattern ?? "") },
                          { label: "CTA", value: agent.uxContract?.defaultCTA },
                        ]}
                      />
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
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
