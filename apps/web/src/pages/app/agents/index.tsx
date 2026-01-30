import React, { useEffect, useMemo, useState } from "react";
import AgentSelect from "../../../components/agents/AgentSelect";
import ChatAgentLauncher, { type LedgerEvent } from "../../../components/agents/ChatAgentLauncher";
import PolicyPanel from "../../../components/agents/PolicyPanel";
import type { ConversationPolicy, ConversationStatus } from "@/hooks/useConversation";
import { useSession } from "@/state/sessionStore";

type PlaybookConfig = {
  title: string;
  intro: React.ReactNode;
  routes: React.ReactNode[];
  directives: React.ReactNode[];
  checklist: React.ReactNode;
};

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
    title: "EIAH — Central de ajuda",
    intro:
      "Use o EIAH para orientar fluxos, duvidas e melhores praticas do sistema.",
    routes: [
      "Identificar tema e contexto.",
      "Responder com passo a passo.",
      "Sugerir links e proximas acoes.",
      "Registrar recomendacoes.",
    ],
    directives: [
      "Manter linguagem simples.",
      "Evitar respostas longas sem necessidade.",
      "Indicar onde configurar cada item.",
      "Sugerir validacoes finais.",
    ],
    checklist: "Checklist rapido: contexto, objetivo e passos esperados.",
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
  const { workspaceId } = useSession();
  const [agentId, setAgentId] = useState<string>();
  const [playbookAgent, setPlaybookAgent] = useState<string | null>(null);
  const [showSse, setShowSse] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showRbac, setShowRbac] = useState(false);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [sseStatus, setSseStatus] = useState<"idle" | "connecting" | "live" | "polling" | "error">("idle");
  const [policyState, setPolicyState] = useState<{
    intent: string | null;
    policy: ConversationPolicy | null;
    status: ConversationStatus;
  }>({ intent: null, policy: null, status: "idle" });
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const playbookTargetId = agentId ? "playbook-panel" : null;

  const playbookData = useMemo(() => {
    if (!agentId) return null;
    const key = normalizeAgentKey(agentId);
    return PLAYBOOKS[key] ?? PLAYBOOKS.fallback;
  }, [agentId]);

  const policyDraft = useMemo(() => {
    const activeId = agentId?.trim() ? agentId : "geral";
    return [
      `agente.: ${activeId}`,
      "scope: market:plan.write",
      "trust_min: 85",
      "requires_confirmation: true",
      "ledger: guardrail_audit_ledger",
    ];
  }, [agentId]);

  const scopedLedger = useMemo(() => {
    if (!currentRunId) return [];
    const allowed = new Set([
      "run.started",
      "run.orchestrator.started",
      "run.action.plan",
      "run.action.call",
      "run.action.result",
      "run.completed",
      "run.blocked.guardrails",
    ]);
    return ledger.filter((event) => event.runId === currentRunId && allowed.has(event.label));
  }, [currentRunId, ledger]);

  useEffect(() => {
    setPlaybookAgent(null);
    setCurrentRunId(null);
    setLedger([]);
    setSseStatus("idle");
  }, [agentId]);

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
        <div className="grid gap-6 lg:grid-cols-[1fr,320px] lg:items-start">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Catálogo</p>
            <h2 className="text-3xl font-display font-semibold text-foreground">Agentes conectados</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Configure intenções, limites e credenciais; visualize rapidamente cada agente e seus diferenciais.
            </p>
            <div className="mt-6">
              <ChatAgentLauncher
                activeAgentId={agentId}
                onLedgerChange={setLedger}
                onRunIdChange={setCurrentRunId}
                onSseStatusChange={setSseStatus}
                onPolicyChange={setPolicyState}
                workspaceId={workspaceId}
              />
            </div>
          </div>
          <div className="w-full lg:max-w-xs lg:justify-self-end lg:self-start">
            <AgentSelect
              value={agentId}
              onChange={setAgentId}
              showPlaybook={Boolean(agentId)}
              onPlaybookClick={agentId ? handlePlaybookClick : undefined}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowSse((prev) => !prev)}
                className="pill transition hover:border-accent/40"
                aria-pressed={showSse}
              >
                REAL-TIME
              </button>
              <button
                type="button"
                onClick={() => setShowLedger((prev) => !prev)}
                className="pill transition hover:border-accent/40"
                aria-pressed={showLedger}
              >
                AUDIT & LOG
              </button>
              <button
                type="button"
                onClick={() => setShowRbac((prev) => !prev)}
                className="pill transition hover:border-accent/40"
                aria-pressed={showRbac}
              >
                POLICY
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              {showRbac && (
                <PolicyPanel
                  intent={policyState.intent}
                  policy={policyState.policy}
                  status={policyState.status}
                />
              )}

              {showLedger && (
                <div className="glass-subtle p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                    Ledger Stream
                  </h3>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    {scopedLedger.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                        Nenhum evento registrado para o run atual.
                      </div>
                    ) : (
                      scopedLedger.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                          <p className="text-[11px] font-semibold text-foreground">{event.label}</p>
                          <p className="mt-1">{event.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {showSse && (
                <div className="glass-subtle p-5 text-xs text-muted-foreground">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                    SSE Status
                  </h3>
                  <p className="mt-2">
                    {sseStatus === "live"
                      ? "Conexao SSE ativa."
                      : sseStatus === "polling"
                      ? "Fallback em polling via API."
                      : sseStatus === "error"
                      ? "Falha ao receber eventos."
                      : "Aguardando envio."}
                  </p>
                </div>
              )}
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Roteiros principais</h4>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                {playbookData.routes.map((item, index) => (
                  <li key={`route-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Diretrizes criticas</h4>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                {playbookData.directives.map((item, index) => (
                  <li key={`directive-${index}`}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <footer className="text-xs text-muted-foreground">{playbookData.checklist}</footer>
        </section>
      )}
    </>
  );
};

export default AgentsPage;
