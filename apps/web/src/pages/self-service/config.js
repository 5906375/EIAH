export const selfServiceConfigs = [
    {
        kind: "custom",
        slug: "mkt",
        agentId: "MKT",
        label: "",
        title: "Briefing de Campanha",
        description: "Reúna os dados principais e receba um plano de campanha multicanal personalizado pelo agente MKT.",
    },
    {
        kind: "custom",
        slug: "j360",
        agentId: "J_360",
        label: "",
        title: "Visão 360º do Cliente",
        description: "Reúna informações sobre a conta e obtenha um diagnóstico com recomendações priorizadas pelo agente J_360.",
    },
    {
        kind: "generic",
        slug: "flow-orchestrator",
        agentId: "flow-orchestrator",
        label: "",
        title: "Plano de Orquestração DeFi",
        description: "Defina o objetivo, redes e guardrails para o agente orquestrar execuções DeFi multi-chain com segurança.",
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
        kind: "generic",
        slug: "guardian",
        agentId: "guardian",
        label: "Guardian",
        title: "Guardian – Registro Probatorio & LGPD",
        description: "Capture o cenário jurídico-operacional e receba o plano sugerido para registrar evidências com verificabilidade pública e LGPD-first.",
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
                    piiSignals: Boolean((values === null || values === void 0 ? void 0 : values.piiSignals) && values.piiSignals.trim()),
                },
            };
        },
    },
    {
        kind: "generic",
        slug: "risk-analyzer",
        agentId: "risk-analyzer",
        label: "",
        title: "Checklist de Risco & Compliance",
        description: "Envie o contexto da operação para receber um checklist de riscos, recomendações de mitigação e status de compliance.",
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
        slug: "fin-nexus",
        agentId: "fin-nexus",
        label: "",
        title: "FinNexus Insight Financeiro",
        description: "O FinNexus é a inteligência artificial do EIAH que cuida de toda a sua área de pagamentos e recebimentos.",
    },
    {
        kind: "generic",
        slug: "onchain-monitor",
        agentId: "onchain-monitor",
        label: "",
        title: "Setup de Monitoramento On-chain",
        description: "Configure eventos, limiares e canais de alerta para que o agente monitore atividades on-chain em tempo real.",
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
        kind: "generic",
        slug: "i-bc",
        agentId: "I_BC",
        label: "",
        title: "Inteligência Comercial",
        description: "Colete informações da conta para gerar um plano de expansão e próximos passos para o time comercial.",
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
        kind: "generic",
        slug: "diarias",
        agentId: "Diarias",
        label: "",
        title: "Rotina Operacional Diária",
        description: "Capture prioridades, bloqueios e métricas para gerar um relatório diário automatizado para o time.",
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
        kind: "generic",
        slug: "nft-py",
        agentId: "NFT_PY",
        label: "",
        title: "Planejamento de Coleção NFT",
        description: "Defina o conceito, utilidades e público para receber um plano de lançamento de coleção NFT.",
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
        kind: "generic",
        slug: "imagenftdiarias",
        agentId: "ImageNFTDiarias",
        label: "",
        title: "Prompts Visuais Diários",
        description: "Informe o tema do dia para gerar prompts criativos focados em artes NFT com estilos e variações.",
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
        kind: "generic",
        slug: "defi-1",
        agentId: "DeFi_1",
        label: "",
        title: "Simulação DeFi",
        description: "Descreva a operação que deseja simular para obter passos, riscos e parâmetros sugeridos antes da execução real.",
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
        kind: "generic",
        slug: "pitch",
        agentId: "Pitch",
        label: "",
        title: "Montar Pitch",
        description: "Forneça dados do produto e público para gerar um pitch estruturado com storytelling e CTA claro.",
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
        kind: "generic",
        slug: "eiah",
        agentId: "EIAH",
        label: "",
        title: "Central de Ajuda EIAH",
        description: "Envie sua dúvida sobre a plataforma Mission Control e receba instruções passo a passo do agente EIAH Core.",
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
            const lines = [
                "Você é o EIAH Core.",
                "Responda com um guia prático passo a passo.",
                `Pergunta: ${values.question || "não informado"}.`,
                `Contexto adicional: ${values.context || "não informado"}.`,
                `Resultado desejado: ${values.desiredOutcome || "não informado"}.`,
                "Inclua seções: Resumo, Passo a passo, Ferramentas necessárias, Próximos passos.",
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
export function getAgentConfigBySlug(slug) {
    if (!slug)
        return undefined;
    return selfServiceConfigs.find((item) => item.slug.toLowerCase() === slug.toLowerCase());
}
