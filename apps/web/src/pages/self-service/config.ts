export type FieldConfig = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "textarea";
  helper?: string;
  rows?: number;
};

type BaseConfig = {
  slug: string;
  agentId: string;
  label: string;
  title: string;
  description: string;
};

export type GenericAgentConfig = BaseConfig & {
  kind: "custom";
  fields: FieldConfig[];
  buildPrompt: (values: Record<string, string>) => {
    prompt: string;
    metadata?: Record<string, unknown>;
  };
};

export type CustomAgentConfig = BaseConfig & {
  kind: "custom";
};

export type SelfServiceAgentConfig = GenericAgentConfig | CustomAgentConfig;

export const selfServiceConfigs: SelfServiceAgentConfig[] = [
  {
    kind: "custom",
    slug: "aadv",
    agentId: "AADV",
    label: "",
    title: "AADV Self-Service",
    description:
      "Colete sinais operacionais, financeiros e de auditoria para gerar o dossiê AADV (JSONL + resumo executivo).",
  },
  {
    kind: "custom",
    slug: "mkt",
    agentId: "MKT",
    label: "",
    title: "Briefing de Campanha",
    description:
      "Reúna os dados principais e receba um plano de campanha multicanal personalizado pelo agente MKT.",
  },
  {
    kind: "custom",
    slug: "j360",
    agentId: "J_360",
    label: "",
    title: "Visão 360º do Cliente",
    description:
      "Reúna informações sobre a conta e obtenha um diagnóstico com recomendações priorizadas pelo agente J_360.",
  },
  {
    kind: "custom",
    slug: "flow-orchestrator",
    agentId: "flow-orchestrator",
    label: "",
    title: "Plano de Orquestração DeFi",
    description:
      "Defina o objetivo, redes e guardrails para o agente orquestrar execuções DeFi multi-chain com segurança.",
    fields: [
      {
        key: "objective",
        label: "Objetivo da operação",
        placeholder: "Ex.: Mint de NFT com verificação KYC antes do envio on-chain",
        rows: 3,
      },
      {
        key: "chains",
        label: "Redes / Chain IDs envolvidos",
        placeholder: "Sepolia, Polygon PoS, BSC...",
        rows: 2,
      },
      {
        key: "contracts",
        label: "Contratos / funções críticas",
        placeholder: "Endereços, ABIs, permissões necessárias...",
        rows: 3,
      },
      {
        key: "riskChecks",
        label: "Checagens de risco obrigatórias",
        placeholder: "Compliance, limites de valor, aprovação humana...",
        rows: 3,
      },
      {
        key: "guardrails",
        label: "Guardrails adicionais",
        placeholder: "Tolerância de slippage, limites de gas, callbacks...",
        rows: 3,
      },
      {
        key: "notes",
        label: "Observações extras",
        placeholder: "Itens fora do padrão ou dependências externas",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o Flow Orchestrator.",
        "Monte um plano de execução passo a passo com validações, previa de custos e stakeholders.",
        `Objetivo: ${values.objective || "não informado"}.`,
        `Redes/Chain IDs: ${values.chains || "não informado"}.`,
        `Contratos/funções: ${values.contracts || "não informado"}.`,
        `Checagens de risco obrigatórias: ${values.riskChecks || "não informado"}.`,
        `Guardrails adicionais: ${values.guardrails || "não informado"}.`,
        values.notes ? `Observações extras: ${values.notes}.` : "",
        "Entregue o plano com seções: Resumo, Pré-checagens, Fluxo detalhado, Riscos, Próximas ações.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "defi_orchestration",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "risk-analyzer",
    agentId: "risk-analyzer",
    label: "",
    title: "Checklist de Risco & Compliance",
    description:
      "Envie o contexto da operação para receber um checklist de riscos, recomendações de mitigação e status de compliance.",
    fields: [
      {
        key: "context",
        label: "Contexto da operação",
        placeholder: "Tipo de fluxo, stakeholders, objetivos...",
        rows: 3,
      },
      {
        key: "jurisdiction",
        label: "Juriações / Normas aplicáveis",
        placeholder: "LGPD, GDPR, SEC, BACEN...",
        rows: 2,
      },
      {
        key: "assets",
        label: "Ativos / Dados sensíveis",
        placeholder: "Tokens, informações pessoais, dados financeiros...",
        rows: 2,
      },
      {
        key: "controls",
        label: "Controles existentes",
        placeholder: "Políticas, auditorias, guardrails atuais...",
        rows: 2,
      },
      {
        key: "questions",
        label: "Dúvidas específicas",
        placeholder: "Pontos de atenção que precisam de resposta direta",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o Risk Analyzer.",
        "Analise riscos regulatórios e operacionais e produza recomendações acionáveis.",
        `Contexto: ${values.context || "não informado"}.`,
        `Jurisdicões/normas: ${values.jurisdiction || "não informado"}.`,
        `Ativos/dados sensíveis: ${values.assets || "não informado"}.`,
        `Controles atuais: ${values.controls || "não informado"}.`,
        values.questions ? `Perguntas específicas: ${values.questions}.` : "",
        "Entregue em seções: Riscos identificados, Mitigações, Itens de conformidade, Ações imediatas.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "risk_compliance",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "guardian",
    agentId: "guardian",
    label: "Guardian",
    title: "Guardian – Registro Probatorio & LGPD",
    description:
      "Capture o cenário jurídico-operacional e receba o plano sugerido para registrar evidências com verificabilidade pública e LGPD-first.",
    fields: [
      {
        key: "requestType",
        label: "Rota alvo / endpoint",
        placeholder: "Ex.: POST /provas/processuais, POST /runs/{id}/receipt, POST /privacy/erasure...",
        type: "text",
      },
      {
        key: "objective",
        label: "Objetivo principal da requisição",
        placeholder: "Que evidência, recibo ou NFT precisa ser gerado? Há dependências externas?",
        rows: 3,
      },
      {
        key: "evidence",
        label: "Itens e hashes disponíveis",
        placeholder: "Descreva os arquivos, hashes, DIDs e qualquer cadeia de custódia pré-existente.",
        rows: 3,
      },
      {
        key: "piiSignals",
        label: "PII / termos sensíveis a bloquear",
        placeholder: "Nome de pessoas, e-mails, CPFs, segredos comerciais... informe se já foram ofuscados.",
        rows: 2,
      },
      {
        key: "finops",
        label: "Preferências de FinOps",
        placeholder: "L2 preferido, custo máximo estimado, necessidade de fallback automático...",
        rows: 2,
      },
      {
        key: "notes",
        label: "Notas adicionais / SLA / reportes",
        placeholder: "Janelas de auditoria, relatórios probatórios, consumo esperado em runs/mês...",
        rows: 3,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Aja como operador do Agente Guardian (schema 1.2) seguindo LGPD-first.",
        `Rota alvo: ${values.requestType || "não informado"}.`,
        `Objetivo da requisição: ${values.objective || "não informado"}.`,
        `Itens e hashes disponíveis: ${values.evidence || "não informado"}.`,
        `PII ou termos sensíveis mapeados: ${values.piiSignals || "não informado"}.`,
        `Preferências FinOps: ${values.finops || "não informado"}.`,
        `Notas adicionais / SLA: ${values.notes || "não informado"}.`,
        "Retorne um plano estruturado com: pré-validações LGPD, rota recomendada (com fallback se necessário), requisitos de verify_url imediato, artefatos baixáveis esperados e telemetria de auditoria (chain_id, confirmações, ancoragem).",
        "Se identificar risco de PII, destaque bloqueios e ações corretivas antes de acionar o agente.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "guardian_compliance",
          form: values,
          piiSignals: Boolean(values.piiSignals?.trim()),
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "fin-nexus",
    agentId: "fin-nexus",
    label: "",
    title: "FinNexus Insight Financeiro",
    description:
      "O FinNexus é a inteligência artificial do EIAH que cuida de toda a sua área de pagamentos e recebimentos.",
  },
  {
    kind: "custom",
    slug: "onchain-monitor",
    agentId: "onchain-monitor",
    label: "",
    title: "Setup de Monitoramento On-chain",
    description:
      "Configure eventos, limiares e canais de alerta para que o agente monitore atividades on-chain em tempo real.",
    fields: [
      {
        key: "network",
        label: "Rede / RPC",
        placeholder: "Ethereum mainnet, Sepolia, Solana...",
        rows: 2,
      },
      {
        key: "events",
        label: "Eventos / filtros",
        placeholder: "Transfer(address,address,uint256) para contrato X, mudanças de saldo, etc.",
        rows: 3,
      },
      {
        key: "thresholds",
        label: "Limiar / critérios de alerta",
        placeholder: "Valor mínimo, frequência, volume agregado...",
        rows: 3,
      },
      {
        key: "channels",
        label: "Canais de notificação",
        placeholder: "Slack, e-mail, webhook...",
        rows: 2,
      },
      {
        key: "notes",
        label: "Observações adicionais",
        placeholder: "Janela de operação, horários críticos, contatos on-call...",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o On-chain Monitor.",
        "Monte um plano de monitoramento com métricas, frequência e formato dos alertas.",
        `Rede/RPC: ${values.network || "não informado"}.`,
        `Eventos/filtros: ${values.events || "não informado"}.`,
        `Limiar/critério: ${values.thresholds || "não informado"}.`,
        `Canais de alerta: ${values.channels || "não informado"}.`,
        values.notes ? `Observações: ${values.notes}.` : "",
        "Output esperado: Configuração recomendada, testes sugeridos, playbook de resposta.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "onchain_monitoring",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "i-bc",
    agentId: "I_BC",
    label: "",
    title: "Inteligência Comercial",
    description:
      "Colete informações da conta para gerar um plano de expansão e próximos passos para o time comercial.",
    fields: [
      { key: "account", label: "Conta / Cliente", placeholder: "Nome da empresa ou squad", rows: 2 },
      {
        key: "icpFit",
        label: "Fit com ICP / Segmento",
        placeholder: "Por que essa conta é aderente ao ICP, personas envolvidas...",
        rows: 2,
      },
      {
        key: "currentStatus",
        label: "Status atual do relacionamento",
        placeholder: "Pipeline, produtos adquiridos, histórico recente...",
        rows: 3,
      },
      {
        key: "stakeholders",
        label: "Stakeholders e cargos",
        placeholder: "Decisores, champion, detratores...",
        rows: 2,
      },
      {
        key: "nextMeeting",
        label: "Próxima reunião / objetivo",
        placeholder: "Data, pauta, resultado esperado...",
        rows: 2,
      },
      {
        key: "asks",
        label: "Solicitações ao agente",
        placeholder: "Ex.: script de call, perguntas diferenciadoras, argumentos-chave...",
        rows: 3,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o agente I_BC.",
        "Monte um briefing de inteligência comercial com posicionamento, objeções e plano de ação.",
        `Conta: ${values.account || "não informado"}.`,
        `Fit com ICP: ${values.icpFit || "não informado"}.`,
        `Status atual: ${values.currentStatus || "não informado"}.`,
        `Stakeholders: ${values.stakeholders || "não informado"}.`,
        `Próxima reunião: ${values.nextMeeting || "não informado"}.`,
        values.asks ? `Pedidos específicos: ${values.asks}.` : "",
        "Entregue com seções: Contexto, Proposta de valor, Objeções prováveis, Plano de follow-up.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "inteligencia_comercial",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "diarias",
    agentId: "Diarias",
    label: "",
    title: "Rotina Operacional Diária",
    description:
      "Capture prioridades, bloqueios e métricas para gerar um relatório diário automatizado para o time.",
    fields: [
      { key: "team", label: "Time / Squad", placeholder: "Responsável pelo relatório diário", rows: 2 },
      {
        key: "todayFocus",
        label: "Foco do dia",
        placeholder: "Entregas, objetivos, campanhas em andamento...",
        rows: 3,
      },
      {
        key: "blocked",
        label: "Bloqueios / Alertas",
        placeholder: "Dependências, riscos, itens críticos...",
        rows: 3,
      },
      {
        key: "wins",
        label: "Vitórias / Destaques",
        placeholder: "Conquistas, milestones atingidos, feedbacks positivos...",
        rows: 3,
      },
      {
        key: "metrics",
        label: "Métricas chave",
        placeholder: "KPIs do dia, números relevantes...",
        rows: 2,
      },
      {
        key: "handoff",
        label: "Handoff / próximos passos",
        placeholder: "Quem assume, o que precisa ser entregue amanhã...",
        rows: 3,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o agente Diarias.",
        "Crie um relatório diário conciso e acionável.",
        `Time/Squad: ${values.team || "não informado"}.`,
        `Foco do dia: ${values.todayFocus || "não informado"}.`,
        `Bloqueios: ${values.blocked || "não informado"}.`,
        `Vitórias: ${values.wins || "não informado"}.`,
        `Métricas: ${values.metrics || "não informado"}.`,
        `Handoff: ${values.handoff || "não informado"}.`,
        "Estruture em seções: Resumo do dia, Métricas, Bloqueios, Destaques, Próximos passos.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "daily_ops",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "nft-py",
    agentId: "NFT_PY",
    label: "",
    title: "Planejamento de Coleção NFT",
    description:
      "Defina o conceito, utilidades e público para receber um plano de lançamento de coleção NFT.",
    fields: [
      {
        key: "theme",
        label: "Tema / narrativa",
        placeholder: "História, universo, referência principal...",
        rows: 3,
      },
      {
        key: "collectionDetails",
        label: "Detalhes da coleção",
        placeholder: "Quantidade de itens, blockchain, formato (generativa, 1/1, etc.)",
        rows: 3,
      },
      {
        key: "utilities",
        label: "Utilidades / perks",
        placeholder: "Acesso, experiências, governança, produtos físicos...",
        rows: 3,
      },
      {
        key: "audience",
        label: "Público alvo / comunidade",
        placeholder: "Quem queremos atingir, canais atuais, tamanho da base...",
        rows: 3,
      },
      {
        key: "timeline",
        label: "Timeline / marcos",
        placeholder: "Datas de pre-line, allowlist, reveal...",
        rows: 3,
      },
      {
        key: "notes",
        label: "Observações adicionais",
        placeholder: "Parcerias, collabs desejadas, assets já prontos...",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o NFT_PY.",
        "Crie um plano de lançamento detalhado para a coleção.",
        `Tema/narrativa: ${values.theme || "não informado"}.`,
        `Detalhes da coleção: ${values.collectionDetails || "não informado"}.`,
        `Utilidades: ${values.utilities || "não informado"}.`,
        `Público alvo: ${values.audience || "não informado"}.`,
        `Timeline: ${values.timeline || "não informado"}.`,
        values.notes ? `Observações: ${values.notes}.` : "",
        "Estruture a resposta com seções: Overview, Roadmap, Canais de hype, Estratégia de mint, Pós-lançamento.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "nft_strategy",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "imagenftdiarias",
    agentId: "ImageNFTDiarias",
    label: "",
    title: "Prompts Visuais Diários",
    description:
      "Informe o tema do dia para gerar prompts criativos focados em artes NFT com estilos e variações.",
    fields: [
      {
        key: "theme",
        label: "Tema do dia",
        placeholder: "Ex.: Cyberpunk tropical, floresta neon...",
        rows: 3,
      },
      {
        key: "palette",
        label: "Paleta / cores desejadas",
        placeholder: "Cores principais, iluminação, clima...",
        rows: 3,
      },
      {
        key: "style",
        label: "Estilos / referências",
        placeholder: "Arte generativa, aquarela, synthwave, artistas para inspiração...",
        rows: 3,
      },
      {
        key: "story",
        label: "Narrativa ou mood",
        placeholder: "Mensagem, emoção, história que a peça deve transmitir...",
        rows: 3,
      },
      {
        key: "dailyNotes",
        label: "Notas extras",
        placeholder: "Formatos específicos, plataforma alvo, coleções anteriores...",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o ImageNFTDiarias.",
        "Gere prompts visuais diferenciados para artes NFT.",
        `Tema do dia: ${values.theme || "não informado"}.`,
        `Paleta: ${values.palette || "não informado"}.`,
        `Estilos/referências: ${values.style || "não informado"}.`,
        `Narrativa/mood: ${values.story || "não informado"}.`,
        values.dailyNotes ? `Notas extras: ${values.dailyNotes}.` : "",
        "Retorne pelo menos 3 variações de prompts e sugestões de parâmetros (aspect ratio, seed, guidance).",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "visual_prompts",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "defi-1",
    agentId: "DeFi_1",
    label: "",
    title: "Simulação DeFi",
    description:
      "Descreva a operação que deseja simular para obter passos, riscos e parâmetros sugeridos antes da execução real.",
    fields: [
      {
        key: "operation",
        label: "Tipo de operação",
        placeholder: "Swap, lend/borrow, liquidez, bridging...",
        rows: 3,
      },
      {
        key: "protocols",
        label: "Protocolos / contratos envolvidos",
        placeholder: "Aave, Uniswap, contratos internos...",
        rows: 3,
      },
      {
        key: "wallets",
        label: "Carteiras / atores",
        placeholder: "Wallet de origem, tesouraria, multisig...",
        rows: 3,
      },
      {
        key: "riskTolerance",
        label: "Tolerância a risco",
        placeholder: "Preferência por estratégias conservadoras/agressivas, limites de perda...",
        rows: 2,
      },
      {
        key: "approvals",
        label: "Aprovações necessárias",
        placeholder: "Stakeholders, compliance, assinaturas multisig...",
        rows: 2,
      },
      {
        key: "notes",
        label: "Observações",
        placeholder: "Dependências técnicas, feeds de preço, integrações externas...",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o DeFi One.",
        "Simule a operação e apresente parâmetros recomendados, riscos e checklist.",
        `Tipo de operação: ${values.operation || "não informado"}.`,
        `Protocolos: ${values.protocols || "não informado"}.`,
        `Carteiras/atores: ${values.wallets || "não informado"}.`,
        `Tolerância a risco: ${values.riskTolerance || "não informado"}.`,
        `Aprovações necessárias: ${values.approvals || "não informado"}.`,
        values.notes ? `Observações: ${values.notes}.` : "",
        "Output: Resumo, Parâmetros sugeridos, Riscos, Pré-condições, Próximos passos.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "defi_simulation",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "pitch",
    agentId: "Pitch",
    label: "",
    title: "Montar Pitch",
    description:
      "Forneça dados do produto e público para gerar um pitch estruturado com storytelling e CTA claro.",
    fields: [
      { key: "product", label: "Produto / solução", placeholder: "O que estamos apresentando?", rows: 3 },
      {
        key: "audience",
        label: "Audiência",
        placeholder: "Investidores, clientes enterprise, decisores técnicos...",
        rows: 2,
      },
      {
        key: "pain",
        label: "Dor principal",
        placeholder: "Problema que a solução resolve...",
        rows: 3,
      },
      {
        key: "solution",
        label: "Prova / diferenciais",
        placeholder: "Features chave, diferenciais competitivos...",
        rows: 3,
      },
      {
        key: "proof",
        label: "Provas sociais / métricas",
        placeholder: "Clientes, cases, números relevantes...",
        rows: 2,
      },
      {
        key: "cta",
        label: "Próximo passo desejado",
        placeholder: "Reunião técnica, assinatura de NDA, trial...",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const lines = [
        "Você é o agente Pitch.",
        "Monte um pitch envolvente com narrativa e bullets claros.",
        `Produto: ${values.product || "não informado"}.`,
        `Audiência: ${values.audience || "não informado"}.`,
        `Dor principal: ${values.pain || "não informado"}.`,
        `Proposta de solução: ${values.solution || "não informado"}.`,
        `Provas sociais: ${values.proof || "não informado"}.`,
        `CTA desejado: ${values.cta || "não informado"}.`,
        "Retorne seções: Abertura, Problema, Solução, Diferenciais, Provas, CTA.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "pitch",
          form: values,
        },
      };
    },
  },
  {
    kind: "custom",
    slug: "eiah",
    agentId: "EIAH",
    label: "",
    title: "Central de Ajuda EIAH",
    description:
      "Envie sua dúvida sobre a plataforma Mission Control e receba instruções passo a passo com manual operacional para Perfil, Workspace, Marketplace e troubleshooting.",
    fields: [
      {
        key: "question",
        label: "Pergunta principal",
        placeholder: "Ex.: Como configurar um novo agente com billing customizado?",
        rows: 3,
      },
      {
        key: "context",
        label: "Contexto adicional",
        placeholder: "Ambiente, time, integrações envolvidas...",
        rows: 3,
      },
      {
        key: "desiredOutcome",
        label: "Resultado esperado",
        placeholder: "O que você gostaria que acontecesse após seguir as instruções?",
        rows: 2,
      },
    ],
    buildPrompt: (values) => {
      const userManual = [
        "MANUAL OPERACIONAL EIAH (resumo oficial):",
        "1) Onboarding inicial",
        "- Fazer login na conta correta.",
        "- Criar ou editar perfil em /profile.",
        "- Tenant ID: usar o tenant da sessão; se houver dúvida, deixar em branco.",
        "- Workspace ID: no primeiro salvamento do perfil, pode ficar em branco.",
        "",
        "2) Workspace",
        "- Criar workspace na área de Perfil.",
        "- Se necessário, vincular explicitamente o workspace no perfil após criação.",
        "- O workspace deve pertencer ao mesmo tenant da sessão ativa.",
        "",
        "3) Assinar agentes (Marketplace)",
        "- Acessar /self-service pelo botão 'Assinar agentes'.",
        "- Escolher item do catálogo e clicar em Ativar.",
        "- Confirmar termos (scope, trust mínimo e validade).",
        "- Se a policy exigir, o status ficará 'pending_approval'.",
        "- Os agentes do Self-Service são auto-publicados no marketplace por tenant.",
        "- Admin EIAH pode remover itens auto-publicados com credencial elevada (x-eiah-admin-token).",
        "- Leitura padrão do card assinado: tipo/versão, nome, descrição, lifecycle (ACTIVE), status da delegação (ATIVO/PENDENTE), trust sugerido, visibilidade (Público/Privado), publisher, validade e campos de policy (Scope, Trust mínimo, Válido até).",
        "- Interpretação de Scope: read=consulta, execute=execução padrão, admin=maior privilégio/risco.",
        "",
        "4) Permissões mínimas",
        "- Para assinar/ativar: Tenant Admin + permissão delegation.manage.",
        "- Sem essas permissões, o usuário consegue visualizar, mas não ativar.",
        "",
        "5) Erros comuns e correção",
        "- 'Profile tenant mismatch': tenant informado no perfil difere do tenant da sessão.",
        "- 'Workspace does not belong to tenant': workspace é de outro tenant ou ID incorreto.",
        "- 'Tenant membership inactive/required': membership não ativa ou inexistente.",
        "- 'HTTP 403 Workspace mismatch' no /self-service: o workspace da sessão não pertence ao tenant da sessão.",
        "  Correção: ativar perfil correto (tenant/workspace compatíveis), relogar se necessário e confirmar em /api/auth/me.",
        "",
        "6) Checklist de diagnóstico rápido",
        "- Confirmar tenantId/workspaceId em /api/auth/me.",
        "- Verificar se perfil ativo está correto.",
        "- Validar se o workspace existe dentro do tenant atual.",
        "- Confirmar role/permissões do usuário para delegação.",
        "",
        "7) Botões da seção 'Perfis cadastrados' (manual de uso)",
        "- Editar selecionado: carrega no formulário superior o perfil atualmente selecionado para ajuste.",
        "- Seleção de linha: clique na linha do perfil para selecioná-lo.",
        "- Excluir: remove o perfil selecionado da base (ação destrutiva).",
        "- Regras visuais: o botão Editar selecionado fica desabilitado quando não há perfil selecionado.",
        "",
        "8) Hierarquia de perfis (empresa)",
        "- Quando o usuário logado é Dev Master EIAH, o perfil ativo deve aparecer como 'Perfil mestre'.",
        "- Os demais perfis do mesmo tenant aparecem como 'Subperfil corporativo'.",
        "- Cada linha deve exibir role e resumo de permissões (Admin/Operator/Viewer) para reduzir ambiguidade operacional.",
        "- A hierarquia é visual; auditoria e controle continuam por role + tenant/workspace no backend.",
        "",
        "9) Conta x Membro do tenant x Perfil (diferença correta)",
        "- Conta (autenticação): e-mail + senha para login.",
        "- Membro do tenant (autorização): vínculo ativo com o Tenant ID e role (admin/operator/viewer).",
        "- Perfil (contexto operacional): dados e contexto de uso (workspace, preferências, exibição), sem criar senha.",
        "- Regra prática: sem conta não entra; sem membership ativa não acessa tenant; sem perfil perde contexto operacional.",
        "",
        "10) Convite de membro (obrigatório para acesso no tenant)",
        "- Para dar acesso a outro usuário no tenant, usar a seção Membros > Convidar membro.",
        "- Informar e-mail e role do convidado.",
        "- Após convite, o usuário precisa ter conta própria (ou criar conta) e a membership deve ficar ativa/aprovada.",
        "- Sem convite/vínculo ativo, o usuário não acessa o tenant mesmo com conta existente.",
        "",
        "11) O que é Action e como publicar",
        "- Action: operação/ferramenta específica publicável no marketplace (ex.: gerar relatório, ancorar hash, executar rotina).",
        "- Agent: serviço completo com jornada/orquestração; Action é capacidade pontual reutilizável.",
        "- Para publicar Action: Self-service > Marketplace > Registrar.",
        "- Preencher no registro: type=action, name, version, description, publisher e visibilidade (público/privado).",
        "- Após publicar: validar em Catálogo com filtro ACTIONS ou TODOS.",
        "- Assinatura/uso de Action segue políticas de delegação (scope, trust mínimo, validade e aprovações quando exigidas).",
        "",
        "12) Marketplace: agentes, actions e aprovações (guia rápido)",
        "- Agent: item de serviço/jornada completa; Action: capacidade específica e reutilizável.",
        "- Visibilidade: público aparece para outros tenants; privado fica restrito ao tenant publisher.",
        "- Catálogo: lista itens disponíveis para assinatura conforme filtro (TODOS, AGENTS, ACTIONS).",
        "- Assinar/Ativar: cria delegação e aplica políticas (scope, trust mínimo, validade).",
        "- Status comum de delegação: active, pending_approval, rejected, revoked, expired.",
        "- Aprovações: Self-service > Marketplace > aba APROVAÇÕES.",
        "- Quem aprova: usuário com permissão de aprovação (ex.: approvals.approve).",
        "- Publicação de item e aprovação de delegação são fluxos diferentes: publicar registra item; aprovar decide uso quando policy exigir.",
      ].join("\n");

      const lines = [
        "Você é o EIAH Core.",
        "Responda com um guia prático passo a passo para usuários finais.",
        "Use o manual operacional abaixo como base obrigatória e adapte ao cenário informado.",
        userManual,
        `Pergunta: ${values.question || "não informado"}.`,
        `Contexto adicional: ${values.context || "não informado"}.`,
        `Resultado desejado: ${values.desiredOutcome || "não informado"}.`,
        "Regra obrigatória de resposta: quando o usuário pedir explicações, sempre incluir a interpretação dos dados exibidos na UI (especialmente campos de marketplace/delegação) e a recomendação prática de uso seguro.",
        "Quando a pergunta envolver botões/telas, descrever a função de cada botão visível e o efeito esperado após o clique.",
        "Inclua seções: Resumo, Passo a passo, Validações, Erros comuns, Próximos passos.",
      ].filter(Boolean);

      return {
        prompt: lines.join("\n"),
        metadata: {
          domain: "support",
          form: values,
        },
      };
    },
  },
];

export function getAgentConfigBySlug(slug: string | undefined) {
  if (!slug) return undefined;
  return selfServiceConfigs.find((item) => item.slug.toLowerCase() === slug.toLowerCase());
}
