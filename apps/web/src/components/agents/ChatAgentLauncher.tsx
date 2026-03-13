import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { selfServiceConfigs } from "@/pages/self-service/config";
import {
  apiApproveRun,
  apiAdoptRecommendation,
  apiCreateSession,
  apiFinalizeConversation,
  apiGetGovernanceReport,
  apiListAgents,
  apiQueryEiahHelp,
  apiCreateHelpdeskSession,
  apiGetBillingPricingQuote,
  apiGetRun,
  apiListRunEvents,
  BASE_URL,
  type EiahHelpQueryHit,
  type RunEvent,
} from "@/lib/api";
import { extractDocAndRecs, type ExtractedRec } from "@/utils";
import { useSession } from "@/state/sessionStore";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import {
  useConversation,
  type ConversationStatus,
  type ConversationPolicy,
  type IntentResult,
} from "@/hooks/useConversation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "streaming" | "done";
};

type ThreadSnapshot = {
  messages: ChatMessage[];
  runId: string | null;
};

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isHelpCenterAgent(params: { id?: string | null; slug?: string | null; title?: string | null }) {
  const id = normalizeAgentKey(String(params.id ?? ""));
  const slug = normalizeAgentKey(String(params.slug ?? ""));
  const titleRaw = String(params.title ?? "").toLowerCase();
  const title = normalizeAgentKey(titleRaw);
  if (id === "eiah" || slug === "eiah") return true;
  if (title.includes("centraldeajuda") || titleRaw.includes("central de ajuda")) return true;
  if (slug.includes("help") || id.includes("help") || title.includes("help")) return true;
  return false;
}

function getCatalogAgentDisplayName(agent: { id?: string; name?: string }) {
  const normalizedId = (agent.id ?? "").trim().toLowerCase();
  const normalizedName = (agent.name ?? "").trim().toLowerCase();
  if (normalizedId === "eiah" || normalizedName === "eiah core") {
    return "Central de Ajuda EIAH";
  }
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

export type LedgerEvent = {
  id: string;
  runId?: string;
  label: string;
  detail: string;
};

type GovernanceItem = {
  id: string;
  runId: string;
  agent: string | null;
  type: string;
  createdAt: string;
  ledgerHash: string | null;
  payload: {
    key: string | null;
    tatica: string | null;
    adopted: boolean | null;
    approvedBy: string | null;
    approvedAt: string | null;
    document?: string | null;
    runIds?: string[] | null;
  };
};

const baseLedger = (): LedgerEvent[] => [];
const FALLBACK_AGENT = {
  id: "EIAH",
  slug: "curator",
  title: "EIAH",
  description: "",
};

function formatLedgerDetail(payload?: RunEvent["payload"]) {
  if (!payload || typeof payload !== "object") return "event recebido";
  const record = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (record.stepId) parts.push(`step: ${String(record.stepId)}`);
  if (record.action) parts.push(`action: ${String(record.action)}`);
  if (record.status) parts.push(`status: ${String(record.status)}`);
  if (record.reason) parts.push(`reason: ${String(record.reason)}`);
  if (record.error) parts.push(`error: ${String(record.error)}`);
  if (record.description) parts.push(String(record.description));
  return parts.length > 0 ? parts.join(" • ") : "event recebido";
}

function eventToAssistantMessage(event: RunEvent) {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (event.type === "run.action.result" && payload?.status === "error") {
    return `Falha na ação: ${String(payload?.error ?? "erro desconhecido")}.`;
  }
  return null;
}

function formatResultPreview(result: unknown): string | null {
  if (!result) return null;
  let parsed: any = result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const recommendationLines: string[] = [];
      const blockRegex = /"tatica"\s*:\s*"([^"]+)"[\s\S]*?"prioridade"\s*:\s*([0-9.]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = blockRegex.exec(trimmed)) !== null) {
        recommendationLines.push(`- ${match[1]} (prioridade: ${match[2]})`);
      }
      if (recommendationLines.length > 0) {
        return `Resultado:\nRecomendações:\n${recommendationLines.join("\n")}`;
      }
      return `Resultado:\n${trimmed}`;
    }
  }

  if (parsed && typeof parsed === "object") {
    const recommendations = parsed.recomendacoes;
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      const lines = recommendations.map((item: any, index: number) => {
        const title = item?.tatica ?? item?.titulo ?? item?.title ?? item?.key ?? `Item ${index + 1}`;
        const priority = item?.prioridade ?? item?.priority ?? "—";
        return `- ${String(title)} (prioridade: ${String(priority)})`;
      });
      return `Resultado:\nRecomendações:\n${lines.join("\n")}`;
    }
    if (typeof parsed.message === "string") {
      return `Resultado:\n${parsed.message}`;
    }
    if (typeof parsed.summary === "string") {
      return `Resultado:\n${parsed.summary}`;
    }
    return `Resultado:\n${JSON.stringify(parsed, null, 2)}`;
  }

  return `Resultado:\n${String(result)}`;
}

function buildOptimizedPrompt(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  return [
    "Contexto: usuário precisa de uma resposta clara e acionável.",
    "Instruções: responda com estrutura, destaque próximos passos e evite jargão.",
    `Pedido: ${cleaned}`,
  ].join("\n");
}

function buildProposalAssistantPrompt(input: string, planHint?: string | null) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  const normalizedPlanHint = planHint?.trim() ? planHint.trim() : "não informado";
  return [
    "Contexto: atendimento comercial do agente EIAH para solicitação de proposta.",
    "Objetivo: recomendar plano e responder perguntas de forma consultiva.",
    "Regras:",
    "- Responder em portugues claro, sem jargao desnecessario.",
    "- Sempre entregar: Resumo do cenario, Plano recomendado, 3 opcoes (economica, equilibrio, escala), Formula de preco, Proximos passos.",
    "- Se faltarem dados (usuarios/runs), perguntar no maximo 2 perguntas objetivas.",
    "- Quando houver dados, calcular usando: total = base + max(0,runs-includedRuns)*overageRun + max(0,users-includedUsers)*extraUser.",
    `Plano sugerido no fluxo de entrada: ${normalizedPlanHint}.`,
    `Pergunta do cliente: ${cleaned}`,
  ].join("\n");
}

function buildHelpAssistantPrompt(input: string, hits: EiahHelpQueryHit[]) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  const knowledge =
    hits.length > 0
      ? hits
          .map(
            (hit, index) =>
              `[${index + 1}] ${hit.title} (${hit.sourcePath})\nTrecho: ${hit.snippet}`
          )
          .join("\n\n")
      : "Nenhum trecho relevante foi encontrado na base interna do EIAH.";

  return [
    "Contexto: voce e o EIAH Central de Ajuda.",
    "Objetivo: responder com base na documentacao oficial interna da plataforma EIAH.",
    "Regras:",
    "- Use os trechos documentais abaixo como fonte primaria.",
    "- Nao invente endpoints ou funcionalidades nao documentadas.",
    "- Se faltar informacao, diga explicitamente o que nao esta documentado.",
    "- Estruture em: Resumo, Como fazer, Limites/observacoes, Proximo passo.",
    "- Finalize com: Fontes consultadas.",
    `Pergunta do solicitante: ${cleaned}`,
    "Base interna consultada:",
    knowledge,
  ].join("\n");
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPlaybookQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "central de ajuda",
    "roteiros principais",
    "diretrizes criticas",
    "diretrizes",
    "checklist",
    "playbook",
    "modo help",
    "modo proposal",
    "solicitar proposta",
    "como criar um run",
    "pagina runs",
    "pagina agentes",
    "pagina billing",
    "pagina marketplace",
    "pagina imob",
    "pagina self-service",
    "pagina perfil",
    "comandos do chat",
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

function isImobGuideQuestion(input: string) {
  const normalized = normalizeIntentText(input);
  const patterns = [
    "imob",
    "como usar imob",
    "como usar o imob",
    "explica imob",
    "explique imob",
    "modulo imob",
    "jornada imobiliaria",
  ];
  return patterns.some((pattern) => normalized.includes(pattern));
}

function buildDeterministicImobReply() {
  return [
    "**IMOB — Guia rapido de uso**",
    "",
    "**Para que serve**",
    "O IMOB organiza a operacao imobiliaria com apoio de IA: leads, proposta, contrato e acompanhamento do processo comercial.",
    "",
    "**Como funciona**",
    "O modulo estrutura as etapas da jornada, reduz retrabalho e ajuda o time a decidir o proximo passo com contexto.",
    "",
    "**Como usar (passo a passo)**",
    "1. Abra o dashboard do IMOB para visualizar pipeline e contexto da operacao.",
    "2. Use o chat IMOB para orientar a proxima acao com base no caso atual.",
    "3. Acompanhe a evolucao das etapas com rastreabilidade.",
    "4. Revise resultados e gargalos para melhorar a rotina do time.",
    "",
    "**Atalhos**",
    "- Dashboard IMOB: `/app/imob/dashboard`",
    "- Chat IMOB: `/app/imob/chat`",
    "- Instalacao (se necessario): `/app/marketplace/imob`",
    "",
    "**Proximo passo recomendado**",
    "Abra `/app/imob/dashboard` e me diga seu objetivo (ex.: captar leads, acelerar proposta ou organizar contratos).",
    "",
    "**Fontes consultadas**",
    "- apps/web/src/pages/app/agents/index.tsx (guia de uso por pagina - IMOB)",
  ].join("\n");
}

function buildDeterministicPlaybookReply() {
  return [
    "**Resumo**",
    "A Central de Ajuda EIAH documenta toda a plataforma em linguagem humana e opera em dois modos: `help` (suporte documental) e `proposal` (solicitacao comercial).",
    "",
    "**Roteiros principais**",
    "- Classificar o atendimento por modo: help (suporte documental) ou proposal (solicitacao de proposta).",
    "- Explicar o funcionamento geral da plataforma: agentes, execucoes, governanca e resultados para o negocio.",
    "- Explicar cada pagina principal: Runs, Agentes, Billing, Marketplace, IMOB, Self-service e Perfil.",
    "- Na pagina Runs, orientar por contexto: criar run (/app/runs#runs-criar), acompanhar status (/app/runs#runs-status), revisar historico (/app/runs#runs-historico) e entender resultado (/app/runs#runs-resultado).",
    "- Explicar comandos do usuario: Interagir com agente, Enviar, Encerrar conversa, Playbook e Solicitar proposta.",
    "- No modo help: responder em passo a passo simples e fechar com Fontes consultadas.",
    "- No modo proposal: coletar perfil, usuarios, runs/mes, vertical, prazo e resultado esperado.",
    "- Entregar proposta estruturada: resumo do cenario, plano recomendado, estimativa de custo, riscos/limites e proximos passos.",
    "",
    "**Diretrizes criticas**",
    "- Usar apenas informacoes documentadas; se faltar dado, declarar explicitamente.",
    "- Priorizar linguagem de negocio e termos humanos; evitar jargao tecnico interno.",
    "- Quando citar um termo tecnico, traduzir em seguida com explicacao simples.",
    "- Explicar cada pagina com: para que serve, quando usar, passos e resultado esperado.",
    "- No modo proposal, usar a formula real de billing (mesma regra do backend) para evitar divergencia de preco.",
    "- Manter resposta objetiva e acionavel, sem bloco tecnico para o usuario final.",
    "- Finalizar atendimento comercial com CTA: abrir proposta, agendar demonstracao ou criar trial assistido.",
    "",
    "**Checklist**",
    "Modo (help/proposal), pagina ou comando solicitado, explicacao humana do fluxo, fontes usadas, calculo validado (quando houver preco) e proximo passo recomendado.",
    "",
    "**Fontes consultadas**",
    "- apps/web/src/pages/app/agents/index.tsx (playbook `eiah`)",
  ].join("\n");
}

function buildDeterministicHelpReply(input: string): string | null {
  const normalized = normalizeIntentText(input);
  if (
    normalized.includes("acompanho o status") ||
    normalized.includes("acompanhar status") ||
    normalized.includes("status de uma run") ||
    normalized.includes("status em tempo real")
  ) {
    return [
      "**Como acompanhar status de run em tempo real**",
      "",
      "1. Abra `Runs` e selecione a execução que deseja acompanhar.",
      "2. Observe os indicadores de andamento (em execução, sucesso, falha ou bloqueio).",
      "3. Use o botão de atualizar para recarregar eventos recentes quando necessário.",
      "4. Abra o resultado da run para validar saída, evidências e próximo passo.",
      "",
      "**Atalhos**",
      "- `/app/runs#runs-status`",
      "- `/app/runs#runs-resultado`",
      "",
      "**Fontes consultadas**",
      "- apps/web/src/pages/app/agents/index.tsx (guia Runs)",
    ].join("\n");
  }
  if (
    normalized.includes("simular primeiro") ||
    normalized.includes("rodar agora") ||
    normalized.includes("diferenca entre simular")
  ) {
    return [
      "**Simular primeiro x Rodar agora**",
      "",
      "- **Simular primeiro**: valida o fluxo com menor risco, ideal para primeiro envio.",
      "- **Rodar agora**: executa direto em produção, ideal quando o fluxo já foi validado.",
      "",
      "**Regra prática**",
      "Se for caso novo ou crítico, simule antes. Se o fluxo já estiver confiável, rode direto.",
      "",
      "**Fontes consultadas**",
      "- apps/web/src/pages/app/agents/index.tsx (guia Runs)",
    ].join("\n");
  }
  if (
    normalized.includes("quais paginas devo usar") ||
    normalized.includes("comecar hoje") ||
    normalized.includes("por onde comecar")
  ) {
    return [
      "**Por onde começar no EIAH (roteiro rápido)**",
      "",
      "1. **Runs**: criar e acompanhar execuções.",
      "2. **Agentes**: selecionar agente e usar o launcher.",
      "3. **Billing**: validar plano, franquia e custos.",
      "4. **Marketplace**: instalar módulos necessários (ex.: IMOB).",
      "5. **Perfil / Self-service**: ajustar configurações de equipe e workspace.",
      "",
      "**Atalhos**",
      "- `/app/runs`",
      "- `/app/agents`",
      "- `/app/billing`",
      "",
      "**Fontes consultadas**",
      "- apps/web/src/pages/app/agents/index.tsx (guia de uso por pagina)",
    ].join("\n");
  }
  if (normalized.includes("como criar um run") || (normalized.includes("criar") && normalized.includes("run"))) {
    return [
      "**Como criar um run no EIAH**",
      "",
      "1. Abra `Runs` no menu principal.",
      "2. Escolha o agente que vai executar a tarefa.",
      "3. Escreva o objetivo em linguagem simples no campo de entrada.",
      "4. Comece por **Simular primeiro** para validar sem risco.",
      "5. Se o resultado estiver ok, clique em **Rodar agora**.",
      "6. Acompanhe status, custo e resultado no histórico da própria página.",
      "",
      "**Atalho**",
      "- `/app/runs#runs-criar`",
      "",
      "**Fontes consultadas**",
      "- apps/web/src/pages/app/agents/index.tsx (guia Runs)",
    ].join("\n");
  }
  if (normalized.includes("billing") || normalized.includes("invoice") || normalized.includes("cobranca")) {
    return [
      "**Billing e Invoices no EIAH**",
      "",
      "**Como funciona**",
      "- O uso mensal (runs e usuários) é consolidado por tenant.",
      "- O valor segue a fórmula oficial: base do plano + excedente de runs + usuários extras.",
      "- O sistema gera invoice mensal com período, base, excedentes e total.",
      "",
      "**Como consultar**",
      "- Resumo e uso: página `Billing`.",
      "- Invoices: listagem por tenant e geração mensal.",
      "",
      "**Atalhos**",
      "- `/app/billing`",
      "",
      "**Fontes consultadas**",
      "- apps/api/src/routes/billing.ts",
      "- apps/web/src/pages/app/billing/index.tsx",
    ].join("\n");
  }
  if (normalized.includes("endpoint") || normalized.includes("api")) {
    return [
      "**API no EIAH (visão rápida)**",
      "",
      "- Runs: execução, eventos e histórico.",
      "- Billing: resumo, usage, quote e invoices.",
      "- Help: consulta da base interna do Central de Ajuda.",
      "",
      "**Exemplos**",
      "- `/api/runs/*`",
      "- `/api/billing/*`",
      "- `/api/help/eiah/query`",
      "",
      "**Próximo passo**",
      "Se quiser, te listo os endpoints por página (Runs, Billing, IMOB, Marketplace).",
      "",
      "**Fontes consultadas**",
      "- apps/api/src/routes",
    ].join("\n");
  }
  return null;
}

function parsePtBrNumber(raw: string): number | null {
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  const multiplier = compact.endsWith("k")
    ? 1_000
    : compact.endsWith("m")
    ? 1_000_000
    : compact.endsWith("mil")
    ? 1_000
    : 1;
  const normalized = compact.replace(/[km]|mil$/g, "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value * multiplier : null;
}

function extractProposalInputs(input: string): { users: number | null; runs: number | null } {
  const normalized = normalizeIntentText(input);
  let users: number | null = null;
  let runs: number | null = null;

  const userMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(usuarios|usuario|users|user|pessoas|equipe)\b/);
  if (userMatch?.[1]) users = parsePtBrNumber(userMatch[1]);

  const runsMatch = normalized.match(/(\d[\d\.,k]*|\d+\s*mil)\s*(runs|run|execucoes|execucoes\/mes|runs\/mes|runs\/m[eê]s)\b/);
  if (runsMatch?.[1]) runs = parsePtBrNumber(runsMatch[1]);

  return {
    users: users !== null ? Math.max(0, Math.round(users)) : null,
    runs: runs !== null ? Math.max(0, Math.round(runs)) : null,
  };
}

function detectRouteIntent(input: string, proposalMode: boolean): "proposal" | "imob" | "playbook" | "help" {
  if (proposalMode) return "proposal";
  const normalized = normalizeIntentText(input);
  const strongProposalSignals = [
    "proposta",
    "plano",
    "preco",
    "preço",
    "valor",
    "custo",
    "quanto vou pagar",
    "quanto custa",
    "mensalidade",
    "orcamento",
    "orçamento",
    "comercial",
  ];
  const secondaryProposalSignals = [
    "usuarios",
    "usuario",
    "pessoas",
    "equipe",
    "runs",
    "run",
    "implantacao",
    "implantar",
    "trial",
    "demonstracao",
    "demonstração",
  ];
  const helpOperationalSignals = [
    "status",
    "tempo real",
    "simular",
    "rodar agora",
    "como criar run",
    "como criar um run",
    "pagina",
    "página",
    "endpoints",
    "api",
    "como funciona imob",
  ];
  const hasStrongProposal = strongProposalSignals.some((signal) => normalized.includes(signal));
  const hasSecondaryProposal = secondaryProposalSignals.some((signal) => normalized.includes(signal));
  const hasOperationalHelp = helpOperationalSignals.some((signal) => normalized.includes(signal));
  if (hasStrongProposal || (hasSecondaryProposal && !hasOperationalHelp)) return "proposal";
  if (isImobGuideQuestion(input)) return "imob";
  if (isPlaybookQuestion(input)) return "playbook";
  return "help";
}

function isRelatedToEiahTopic(input: string) {
  const normalized = normalizeIntentText(input);
  const productTerms = [
    "runs",
    "run",
    "agentes",
    "agente",
    "billing",
    "invoice",
    "imob",
    "marketplace",
    "perfil",
    "self-service",
  ];
  const proposalTerms = [
    "plano",
    "preco",
    "preço",
    "usuarios",
    "usuários",
    "runs/mes",
    "runs/mês",
    "trial",
    "demonstracao",
    "demonstração",
    "proposta",
  ];
  const usageTerms = ["como", "onde", "status", "simular", "rodar"];
  const all = [...productTerms, ...proposalTerms, ...usageTerms];
  return all.some((term) => normalized.includes(term));
}

function deterministicContextualFallback() {
  return "Não entendi essa solicitação dentro do contexto do EIAH. Posso te ajudar em: Runs, Agentes, Billing, IMOB ou proposta comercial.";
}

function centsToBrl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

type LocalPlan = {
  code: "solo" | "starter" | "growth" | "scale";
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  overageRunCents: number;
  extraUserCents: number;
};

const LOCAL_PLANS: LocalPlan[] = [
  { code: "solo", label: "Solo", basePriceCents: 49000, includedUsers: 3, includedRuns: 1500, overageRunCents: 35, extraUserCents: 3900 },
  { code: "starter", label: "Starter", basePriceCents: 149000, includedUsers: 10, includedRuns: 5000, overageRunCents: 30, extraUserCents: 3900 },
  { code: "growth", label: "Growth", basePriceCents: 399000, includedUsers: 25, includedRuns: 25000, overageRunCents: 22, extraUserCents: 2900 },
  { code: "scale", label: "Scale", basePriceCents: 990000, includedUsers: 100, includedRuns: 100000, overageRunCents: 15, extraUserCents: 1900 },
];

function quoteLocalPlan(plan: LocalPlan, users: number, runs: number) {
  const runOverage = Math.max(0, runs - plan.includedRuns);
  const userOverage = Math.max(0, users - plan.includedUsers);
  const totalCents = plan.basePriceCents + runOverage * plan.overageRunCents + userOverage * plan.extraUserCents;
  return { ...plan, totalCents };
}

function buildContextualFallback(input: string, routeIntent: "proposal" | "imob" | "playbook" | "help") {
  if (routeIntent === "proposal") {
    const parsed = extractProposalInputs(input);
    if (parsed.users && !parsed.runs) {
      return "Entendi seu contexto comercial. Para calcular com precisão, me diga apenas os **runs/mês** estimados.";
    }
    if (!parsed.users && parsed.runs) {
      return "Entendi seu contexto comercial. Para calcular com precisão, me diga apenas a quantidade de **usuários**.";
    }
    return "Entendi que você quer proposta comercial. Me passe `usuários` e `runs/mês` para eu calcular agora.";
  }
  if (routeIntent === "help") {
    return "Não entendi sua pergunta com segurança. Se quiser, posso te guiar por página: Runs, Billing, Agentes ou IMOB.";
  }
  return "Não consegui consolidar a resposta neste momento. Tente reformular em uma frase objetiva.";
}

async function buildDeterministicProposalReply(input: string) {
  const parsed = extractProposalInputs(input);
  const normalized = normalizeIntentText(input);
  if ((normalized.includes("reduzir custo") || normalized.includes("reduzir gastos")) && !parsed.users && !parsed.runs) {
    return [
      "**Como reduzir custo mensal no EIAH**",
      "",
      "- Reduza excedentes de runs e usuários extras.",
      "- Use Simular primeiro para evitar execuções desnecessárias.",
      "- Compare plano atual com o volume real do mês.",
      "",
      "**Para calcular economia potencial**",
      "Me informe `usuários` e `runs/mês` estimados.",
    ].join("\n");
  }
  if (!parsed.users || !parsed.runs) {
    const missingUsers = !parsed.users;
    const missingRuns = !parsed.runs;
    const missingQuestions = [
      missingUsers ? "- Quantos usuários você terá no workspace?" : null,
      missingRuns ? "- Quantos runs/mês você estima?" : null,
    ]
      .filter(Boolean)
      .join("\n");
    const formatHint =
      missingUsers && missingRuns
        ? "Responda no formato: `X usuários e Y runs/mês`."
        : missingUsers
        ? "Responda no formato: `X usuários`."
        : "Responda no formato: `Y runs/mês`.";
    return [
      "**Resumo do cenário**",
      "Consigo montar sua proposta agora. Para fechar o cálculo, preciso apenas do dado que falta:",
      "",
      missingQuestions,
      "",
      "**Próximo passo**",
      formatHint,
    ].join("\n");
  }

  try {
    const quote = await apiGetBillingPricingQuote({ users: parsed.users, runs: parsed.runs });
    const eco = quote.data.options.economica.recommended;
    const eq = quote.data.options.equilibrio.recommended;
    const scale = quote.data.options.escala.recommended;
    const best = eq ?? eco ?? scale;
    if (!best) throw new Error("no-recommendation");

    return [
      "**Resumo do cenário**",
      `${parsed.users} usuários e ${parsed.runs} runs/mês.`,
      "",
      "**Plano recomendado**",
      `${best.label} (${best.code.toUpperCase()})`,
      "",
      "**Estimativa de custo mensal**",
      `${centsToBrl(best.totalCents)} (formula oficial: ${quote.data.formula})`,
      "",
      "**3 opções**",
      `- Econômica: ${eco ? `${eco.label} — ${centsToBrl(eco.totalCents)}` : "sob consulta"}`,
      `- Equilíbrio: ${eq ? `${eq.label} — ${centsToBrl(eq.totalCents)}` : "sob consulta"}`,
      `- Escala: ${scale ? `${scale.label} — ${centsToBrl(scale.totalCents)}` : "Enterprise / sob consulta"}`,
      "",
      "**Próximos passos**",
      "- Abrir proposta comercial",
      "- Agendar demonstração",
      "- Criar trial assistido",
    ].join("\n");
  } catch {
    const localQuotes = LOCAL_PLANS.map((plan) => quoteLocalPlan(plan, parsed.users, parsed.runs)).sort(
      (a, b) => a.totalCents - b.totalCents
    );
    const eco = localQuotes.find((item) => item.code === "solo" || item.code === "starter") ?? localQuotes[0];
    const eq = localQuotes.find((item) => item.code === "starter" || item.code === "growth") ?? localQuotes[1] ?? localQuotes[0];
    const scale = localQuotes.find((item) => item.code === "growth" || item.code === "scale") ?? localQuotes[2] ?? localQuotes[0];
    const best = eq ?? eco ?? scale;
    return [
      "**Resumo do cenário**",
      `${parsed.users} usuários e ${parsed.runs} runs/mês.`,
      "",
      "**Plano recomendado**",
      `${best.label} (${best.code.toUpperCase()})`,
      "",
      "**Estimativa de custo mensal (fallback local)**",
      `${centsToBrl(best.totalCents)}`,
      "",
      "**3 opções**",
      `- Econômica: ${eco ? `${eco.label} — ${centsToBrl(eco.totalCents)}` : "sob consulta"}`,
      `- Equilíbrio: ${eq ? `${eq.label} — ${centsToBrl(eq.totalCents)}` : "sob consulta"}`,
      `- Escala: ${scale ? `${scale.label} — ${centsToBrl(scale.totalCents)}` : "Enterprise / sob consulta"}`,
      "",
      "**Próximos passos**",
      "- Abrir proposta comercial",
      "- Agendar demonstração",
      "- Criar trial assistido",
    ].join("\n");
  }
}

function sanitizeAssistantContent(content: string) {
  return content
    .replace(/\"run_id\"\s*:\s*\"[^\"]+\"/gi, "\"run_id\":\"[redacted]\"")
    .replace(/\"trace_id\"\s*:\s*\"[^\"]+\"/gi, "\"trace_id\":\"[redacted]\"")
    .replace(/\"tx_id\"\s*:\s*\"[^\"]+\"/gi, "\"tx_id\":\"[redacted]\"")
    .replace(/\"policy_version\"\s*:\s*\"[^\"]+\"/gi, "\"policy_version\":\"[redacted]\"")
    .replace(/\brun_id:\s*[^\s,]+/gi, "run_id:[redacted]")
    .replace(/\btrace_id:\s*[^\s,]+/gi, "trace_id:[redacted]")
    .replace(/\btx_id:\s*[^\s,]+/gi, "tx_id:[redacted]")
    .replace(/\bpolicy_version:\s*[^\s,]+/gi, "policy_version:[redacted]");
}

type HelpStructuredResponse = {
  mode: "help";
  summary: string;
  steps?: string[];
  sources: string[];
};

type ProposalStructuredResponse = {
  mode: "proposal";
  scenario: string;
  recommended_plan: "solo" | "starter" | "growth" | "scale" | "enterprise";
  estimated_cost: string;
  next_step: string;
};

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isHelpStructuredResponse(input: Record<string, unknown>): input is HelpStructuredResponse {
  return (
    input.mode === "help" &&
    typeof input.summary === "string" &&
    (input.steps === undefined || (Array.isArray(input.steps) && input.steps.every((v) => typeof v === "string"))) &&
    Array.isArray(input.sources) &&
    input.sources.every((v) => typeof v === "string")
  );
}

function isProposalStructuredResponse(input: Record<string, unknown>): input is ProposalStructuredResponse {
  const plan = input.recommended_plan;
  return (
    input.mode === "proposal" &&
    typeof input.scenario === "string" &&
    (plan === "solo" || plan === "starter" || plan === "growth" || plan === "scale" || plan === "enterprise") &&
    typeof input.estimated_cost === "string" &&
    typeof input.next_step === "string"
  );
}

function fallbackHelpMarkdown() {
  return [
    "**Resumo**",
    "Não consegui estruturar a resposta corretamente com base no retorno atual.",
    "",
    "**Como fazer**",
    "- Reformule a pergunta em uma frase objetiva (ex.: Como usar IMOB?).",
    "- Se preferir, escolha uma das sugestões rápidas abaixo.",
    "",
    "**Fontes consultadas**",
    "- fallback",
  ].join("\n");
}

function toMarkdownFromStructuredResponse(
  raw: string,
  modeHint: IntentResult["intent"] | null
): { content: string; rejected: boolean; fallbackUsed: boolean } {
  const divider = "\n---\n";
  if (raw.includes(divider)) {
    const humanPart = raw.split(divider).slice(1).join(divider).trim();
    if (humanPart) {
      return { content: humanPart, rejected: false, fallbackUsed: false };
    }
  }
  const parsed = tryParseJsonObject(raw);
  if (!parsed) return { content: raw, rejected: false, fallbackUsed: false };

  if (modeHint === "help" || modeHint === "product_explain" || modeHint === "unknown") {
    if (isHelpStructuredResponse(parsed)) {
      const steps =
        parsed.steps && parsed.steps.length > 0
          ? `\n\n**Como fazer**\n${parsed.steps.map((step) => `- ${step}`).join("\n")}`
          : "";
      return {
        content: `**Resumo**\n${parsed.summary}${steps}\n\n**Fontes consultadas**\n${parsed.sources
          .map((source) => `- ${source}`)
          .join("\n")}`,
        rejected: false,
        fallbackUsed: false,
      };
    }
    return { content: fallbackHelpMarkdown(), rejected: true, fallbackUsed: true };
  }

  if (modeHint === "proposal") {
    if (isProposalStructuredResponse(parsed)) {
      return {
        content: [
          `**Cenario**\n${parsed.scenario}`,
          `**Plano recomendado**\n${parsed.recommended_plan}`,
          `**Estimativa**\n${parsed.estimated_cost}`,
          `**Proximo passo**\n${parsed.next_step}`,
        ].join("\n\n"),
        rejected: false,
        fallbackUsed: false,
      };
    }
    return { content: fallbackHelpMarkdown(), rejected: true, fallbackUsed: true };
  }

  return { content: raw, rejected: false, fallbackUsed: false };
}

function maskIdentity(value: string, fallbackPrefix: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${fallbackPrefix}_…`;
  const prefix = `${fallbackPrefix}_`;
  if (trimmed.startsWith(prefix)) {
    if (trimmed.length <= prefix.length + 2) return `${prefix}…`;
    return `${trimmed.slice(0, prefix.length + 2)}…${trimmed.slice(-4)}`;
  }
  return `${prefix}…${trimmed.slice(-4)}`;
}

export default function ChatAgentLauncher({
  activeAgentId,
  onLedgerChange,
  onRunIdChange,
  onSseStatusChange,
  onPolicyChange,
  onPlaybookClick,
  headerControls,
  workspaceId,
  launcherContext,
}: {
  activeAgentId?: string;
  onLedgerChange?: (ledger: LedgerEvent[]) => void;
  onRunIdChange?: (runId: string | null) => void;
  onSseStatusChange?: (status: "idle" | "connecting" | "live" | "polling" | "error") => void;
  onPolicyChange?: (state: {
    intent: string | null;
    policy: ConversationPolicy | null;
    status: ConversationStatus;
  }) => void;
  onPlaybookClick?: () => void;
  headerControls?: React.ReactNode;
  workspaceId?: string;
  launcherContext?: {
    topic?: string | null;
    planHint?: string | null;
  };
}) {
  const agents = useMemo(
    () =>
      selfServiceConfigs.map((agent) => ({
        id: agent.agentId,
        slug: agent.slug,
        title: agent.title,
        description: agent.description,
      })),
    []
  );
  const [activeAgent, setActiveAgent] = useState(agents[0]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>(baseLedger());
  const [isStreaming, setIsStreaming] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<"idle" | "connecting" | "live" | "polling" | "error">("idle");
  const [evidenceEvent, setEvidenceEvent] = useState<RunEvent | null>(null);
  const [identityShown, setIdentityShown] = useState(false);
  const [showIdentityDetails] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [showGovernanceReport, setShowGovernanceReport] = useState(false);
  const [governanceItems, setGovernanceItems] = useState<GovernanceItem[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [conversationFinalizing, setConversationFinalizing] = useState(false);
  const [lastRouteIntent, setLastRouteIntent] = useState<"proposal" | "imob" | "playbook" | "help" | null>(null);
  const [selectedAgentLabel, setSelectedAgentLabel] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);
  const runSummaryLoadedRef = useRef<string | null>(null);
  const runPromptRef = useRef<Record<string, string>>({});
  const runIntentRef = useRef<Record<string, IntentResult>>({});
  const runGuardrailRef = useRef<
    Record<
      string,
      {
        rejected: boolean;
        fallbackUsed: boolean;
      }
    >
  >({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const session = useSession();
  const effectiveWorkspaceId = workspaceId ?? session.workspaceId;
  const { executeAgent } = useAgentExecution();
  const conversation = useConversation();
  const threadKey = useMemo(() => {
    const tenant = session.tenantId ?? "tenant";
    const workspace = effectiveWorkspaceId ?? "workspace";
    const agent = activeAgentId ?? FALLBACK_AGENT.id;
    const topic =
      typeof launcherContext?.topic === "string" && launcherContext.topic.trim().length > 0
        ? launcherContext.topic.trim().toLowerCase()
        : "default";
    return `eiah:chat:${tenant}:${workspace}:${agent}:${topic}`;
  }, [session.tenantId, effectiveWorkspaceId, activeAgentId, launcherContext?.topic]);
  const proposalMode =
    (launcherContext?.topic ?? "").trim().toLowerCase() === "proposal" &&
    normalizeAgentKey(activeAgent?.id ?? FALLBACK_AGENT.id) === "eiah";
  const isHelpCenterMode =
    isHelpCenterAgent({
      id: activeAgent?.id ?? FALLBACK_AGENT.id,
      slug: activeAgent?.slug ?? FALLBACK_AGENT.slug,
      title: activeAgent?.title ?? FALLBACK_AGENT.title,
    }) &&
    (launcherContext?.topic ?? "").trim().toLowerCase() !== "proposal";

  useEffect(() => {
    if (identityShown) return;
    if (!session.userId && !session.tenantId) return;
    const storageKey = `eiah:greeted:${session.tenantId ?? "tenant"}:${effectiveWorkspaceId ?? "workspace"}`;
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage;
      if (storage.getItem(storageKey) === "1") {
        setIdentityShown(true);
        return;
      }
      storage.setItem(storageKey, "1");
    }
    const maskedUser = session.userId ? maskIdentity(session.userId, "usr") : "usr_…";
    const maskedTenant = session.tenantId ? maskIdentity(session.tenantId, "ten") : "ten_…";
    pushMessage({
      id: `system-identity-${Date.now()}`,
      role: "system",
      content: `👋 Bem-vindo! Identifiquei seu cadastro: Usuário ${maskedUser} (Empresa ${maskedTenant}).`,
      status: "done",
    });
    setIdentityShown(true);
  }, [identityShown, session.userId, session.tenantId, effectiveWorkspaceId]);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    stopStreaming();
    const raw = window.sessionStorage.getItem(threadKey);
    if (!raw) {
      setMessages([]);
      setRunId(null);
      onRunIdChange?.(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ThreadSnapshot;
      setMessages(parsed.messages ?? []);
      setRunId(parsed.runId ?? null);
      onRunIdChange?.(parsed.runId ?? null);
    } catch {
      setMessages([]);
      setRunId(null);
      onRunIdChange?.(null);
    }
  }, [threadKey, onRunIdChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: ThreadSnapshot = { messages, runId };
    window.sessionStorage.setItem(threadKey, JSON.stringify(payload));
  }, [threadKey, messages, runId]);

  useEffect(() => {
    if (!activeAgentId) {
      setSelectedAgentLabel(null);
      return;
    }
    let cancelled = false;
    apiListAgents()
      .then((response: any) => {
        if (cancelled) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        const found = items.find((item: any) => String(item?.id ?? "") === activeAgentId);
        setSelectedAgentLabel(found ? getCatalogAgentDisplayName(found) : null);
      })
      .catch(() => {
        if (!cancelled) setSelectedAgentLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentId]);

  const updateSseStatus = (next: "idle" | "connecting" | "live" | "polling" | "error") => {
    setSseStatus(next);
    onSseStatusChange?.(next);
  };

  useEffect(() => {
    stopStreaming();
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    setInput("");
    updateSseStatus("idle");

    if (!activeAgentId) {
      setActiveAgent(FALLBACK_AGENT);
      return;
    }

    const normalized = normalizeAgentKey(activeAgentId);
    const next =
      agents.find((agent) => normalizeAgentKey(agent.id) === normalized) ??
      agents.find((agent) => normalizeAgentKey(agent.slug) === normalized) ??
      null;
    setActiveAgent(
      next ?? {
        id: activeAgentId,
        slug: activeAgentId,
        title: activeAgentId,
        description: "",
      }
    );
  }, [activeAgentId, agents]);

  const pushMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const persistHelpdeskSession = useCallback(
    (params: {
      runId?: string | null;
      message: string;
      response: string;
      intentResult: IntentResult;
      responseRejected?: boolean;
      fallbackUsed?: boolean;
      recommendedPlan?: string | null;
      estimatedValue?: number | null;
    }) => {
      if (!session.tenantId || !effectiveWorkspaceId) return;
      void apiCreateHelpdeskSession({
        tenantId: session.tenantId,
        workspaceId: effectiveWorkspaceId,
        runId: params.runId ?? null,
        intent: params.intentResult.intent,
        confidence: params.intentResult.confidence,
        fallbackReason: params.intentResult.fallbackReason ?? null,
        message: params.message,
        response: params.response,
        recommendedPlan: params.recommendedPlan ?? null,
        estimatedValue: params.estimatedValue ?? null,
        metadata: {
          responseRejected: params.responseRejected ?? false,
          fallbackUsed: params.fallbackUsed ?? false,
        },
      }).catch(() => {
        // fire-and-forget sem bloquear UX
      });
    },
    [effectiveWorkspaceId, session.tenantId]
  );

  useEffect(() => {
    if (!proposalMode) return;
    const storageKey = `eiah:proposal-mode-greeted:${threadKey}`;
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage;
      if (storage.getItem(storageKey) === "1") return;
      storage.setItem(storageKey, "1");
    }
    pushMessage({
      id: `assistant-proposal-mode-${Date.now()}`,
      role: "assistant",
      content:
        "Estou em modo atendimento de proposta. Posso te recomendar o melhor plano e estimar valor mensal. Para começar, me diga: quantos usuários e quantos runs/mês você estima?",
      status: "done",
    });
  }, [proposalMode, threadKey]);

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsStreaming(false);
    updateSseStatus("idle");
  };

  const handleIncomingEvent = (event: RunEvent) => {
    if (seenEventsRef.current.has(event.id)) return;
    seenEventsRef.current.add(event.id);
    lastEventIdRef.current = event.id;

    setLedger((prev) => {
      const next = [
        {
          id: event.id,
          runId: event.runId,
          label: event.type,
          detail: formatLedgerDetail(event.payload),
        },
        ...prev,
      ];
      onLedgerChange?.(next);
      return next;
    });

    const message = eventToAssistantMessage(event);
    if (message) {
      pushMessage({ id: `assistant-${event.id}`, role: "assistant", content: message, status: "done" });
    }

    if (event.type === "run.orchestrator.finished") {
      setIsStreaming(false);
    }

    if (event.type === "run.completed") {
      void fetchRunSummary(event.runId);
    }
  };

  const fetchRunSummary = async (targetRunId?: string | null) => {
    if (!targetRunId || runSummaryLoadedRef.current === targetRunId) return;
    runSummaryLoadedRef.current = targetRunId;
    try {
      const run = await apiGetRun(targetRunId);
      const responseText =
        typeof run.response === "string"
          ? run.response
          : JSON.stringify(run.response ?? "");
      const extracted = extractDocAndRecs(responseText);
      const meta = extracted.metaJson
        ? {
            agent: extracted.metaJson.agent,
            run_id: extracted.metaJson.run_id,
            recomendacoes: extracted.metaJson.recomendacoes ?? [],
            diagnostico: extracted.metaJson.diagnostico,
          }
        : null;
      const content = meta
        ? `${JSON.stringify(meta, null, 2)}\n---\n${extracted.docMarkdown}`
        : extracted.docMarkdown;
      if (content) {
        const intentResult = runIntentRef.current[targetRunId] ?? { intent: "unknown", confidence: 0 };
        const guarded = toMarkdownFromStructuredResponse(content, intentResult.intent);
        runGuardrailRef.current[targetRunId] = {
          rejected: guarded.rejected,
          fallbackUsed: guarded.fallbackUsed,
        };
        pushMessage({
          id: `assistant-summary-${targetRunId}`,
          role: "assistant",
          content: guarded.content,
          status: "done",
        });
        persistHelpdeskSession({
          runId: targetRunId,
          message: runPromptRef.current[targetRunId] ?? "",
          response: guarded.content,
          intentResult,
          responseRejected: guarded.rejected,
          fallbackUsed: guarded.fallbackUsed,
        });
      }
    } catch (error) {
      console.warn("[ChatAgentLauncher] falha ao buscar resumo do run", error);
    }
  };

  const startPolling = (targetRunId: string) => {
    updateSseStatus("polling");
    const poll = async () => {
      try {
        const response = await apiListRunEvents(targetRunId, {
          cursor: lastEventIdRef.current ?? undefined,
        });
        response.items.forEach(handleIncomingEvent);
      } catch {
        updateSseStatus("error");
        setIsStreaming(false);
      }
    };
    poll();
    pollTimerRef.current = window.setInterval(poll, 4000);
  };

  const startSse = async (targetRunId: string) => {
    updateSseStatus("connecting");
    try {
      await apiCreateSession();
      const streamUrl = new URL(`${BASE_URL}/runs/${targetRunId}/stream`);
      if (lastEventIdRef.current) {
        streamUrl.searchParams.set("cursor", lastEventIdRef.current);
      }
      const source = new EventSource(streamUrl.toString(), { withCredentials: true });
      eventSourceRef.current = source;

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RunEvent;
          handleIncomingEvent(parsed);
          updateSseStatus("live");
        } catch {
          updateSseStatus("error");
        }
      };

      source.onerror = () => {
        source.close();
        eventSourceRef.current = null;
        startPolling(targetRunId);
      };
    } catch {
      startPolling(targetRunId);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    const resolvedAgentId = activeAgentId ?? FALLBACK_AGENT.id;
    const routeIntent = isHelpCenterMode ? detectRouteIntent(trimmed, proposalMode) : "help";
    const shouldUseDeterministicProposalReply = isHelpCenterMode && routeIntent === "proposal";
    const shouldUseDeterministicImobReply = isHelpCenterMode && routeIntent === "imob";
    const shouldUseDeterministicPlaybookReply = isHelpCenterMode && routeIntent === "playbook";
    if (isHelpCenterMode) setLastRouteIntent(routeIntent);
    setInput("");
    pushMessage({ id: `user-${Date.now()}`, role: "user", content: trimmed });
    const localIntentResult = conversation.analyze(trimmed);
    const relatedToEiah = isRelatedToEiahTopic(trimmed);
    if (isHelpCenterMode && (localIntentResult.intent === "unknown" || !relatedToEiah)) {
      const contextual = deterministicContextualFallback();
      if (isHelpCenterMode) setLastRouteIntent("help");
      pushMessage({
        id: `assistant-unknown-contextual-${Date.now()}`,
        role: "assistant",
        content: contextual,
        status: "done",
      });
      persistHelpdeskSession({
        message: trimmed,
        response: contextual,
        intentResult: {
          intent: "unknown",
          confidence: localIntentResult.confidence,
          fallbackReason: localIntentResult.fallbackReason ?? "out_of_scope",
        },
        responseRejected: true,
        fallbackUsed: true,
      });
      return;
    }
    if (shouldUseDeterministicProposalReply) {
      try {
        const content = await buildDeterministicProposalReply(trimmed);
        pushMessage({
          id: `assistant-proposal-guide-${Date.now()}`,
          role: "assistant",
          content,
          status: "done",
        });
        persistHelpdeskSession({
          message: trimmed,
          response: content,
          intentResult: localIntentResult,
        });
      } catch {
        const content = buildContextualFallback(trimmed, routeIntent);
        pushMessage({
          id: `assistant-proposal-fallback-${Date.now()}`,
          role: "assistant",
          content,
          status: "done",
        });
        persistHelpdeskSession({
          message: trimmed,
          response: content,
          intentResult: localIntentResult,
          responseRejected: true,
          fallbackUsed: true,
        });
      }
      return;
    }
    if (shouldUseDeterministicImobReply) {
      pushMessage({
        id: `assistant-imob-guide-${Date.now()}`,
        role: "assistant",
        content: buildDeterministicImobReply(),
        status: "done",
      });
      return;
    }
    if (shouldUseDeterministicPlaybookReply) {
      pushMessage({
        id: `assistant-playbook-${Date.now()}`,
        role: "assistant",
        content: buildDeterministicPlaybookReply(),
        status: "done",
      });
      return;
    }
    if (isHelpCenterMode && routeIntent === "help") {
      const directHelp = buildDeterministicHelpReply(trimmed);
      if (directHelp) {
        pushMessage({
          id: `assistant-help-direct-${Date.now()}`,
          role: "assistant",
          content: directHelp,
          status: "done",
        });
        persistHelpdeskSession({
          message: trimmed,
          response: directHelp,
          intentResult: localIntentResult,
        });
        return;
      }
    }
    stopStreaming();
    onRunIdChange?.(null);
    setIsStreaming(true);
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    seenEventsRef.current = new Set();
    lastEventIdRef.current = null;
    runSummaryLoadedRef.current = null;
    const intentResult = localIntentResult;
    const isEiahHelpCenter = isHelpCenterMode;

    let helpHits: EiahHelpQueryHit[] = [];
    if (isEiahHelpCenter) {
      try {
        const knowledge = await apiQueryEiahHelp({ query: trimmed, topK: 6 });
        helpHits = knowledge.data.hits ?? [];
      } catch {
        helpHits = [];
      }
    }

    const prompt = proposalMode
      ? buildProposalAssistantPrompt(trimmed, launcherContext?.planHint)
      : isEiahHelpCenter
      ? buildHelpAssistantPrompt(trimmed, helpHits)
      : buildOptimizedPrompt(trimmed);

    try {
      const response = await conversation.executeWithPolicy(resolvedAgentId, {
        agent: resolvedAgentId,
        prompt,
        workspaceId: effectiveWorkspaceId,
        metadata: {
          source: "chat-agent-launcher",
          promptOptimized: !proposalMode && !isEiahHelpCenter,
          proposalMode,
          proposalPlanHint: launcherContext?.planHint ?? null,
          helpKnowledgeHits: helpHits.map((hit) => ({
            title: hit.title,
            sourcePath: hit.sourcePath,
            score: hit.score,
          })),
          originalPrompt: trimmed,
          agentFallback: !activeAgentId,
        },
      });
      const created = response.data;
      setRunId(created.id);
      onRunIdChange?.(created.id);
      runPromptRef.current[created.id] = trimmed;
      runIntentRef.current[created.id] = intentResult;
      pushMessage({
        id: `system-${created.id}`,
        role: "system",
        content: `Run criada: ${created.id}. Aguardando eventos...`,
      });
      await startSse(created.id);
    } catch (error) {
      setIsStreaming(false);
      updateSseStatus("error");
      const message = error instanceof Error ? error.message : "Falha ao iniciar run.";
      pushMessage({ id: `assistant-error-${Date.now()}`, role: "assistant", content: message, status: "done" });
    }
  };

  const handleApprove = async () => {
    if (!runId) return;
    try {
      const response = await apiApproveRun(runId, { parentRunId: runId });
      conversation.markApproved();
      pushMessage({
        id: `system-approve-${runId}`,
        role: "system",
        content: "✅ Ação aprovada. O sistema está finalizando a execução e registrando no Ledger.",
        status: "done",
      });
      setEvidenceEvent(response.event ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar aprovacao.";
      pushMessage({ id: `system-approve-error-${Date.now()}`, role: "system", content: message, status: "done" });
    }
  };

  const handleAdoptRec = async (targetRunId: string, rec: ExtractedRec) => {
    if (!targetRunId) {
      setCopyToast("Run ID nao encontrado.");
      return;
    }
    try {
      await apiAdoptRecommendation(targetRunId, {
        key: rec.key,
        tatica: rec.tatica,
        adopted: true,
      });
      setCopyToast("Recomendacao marcada como adotada.");
    } catch {
      setCopyToast("Falha ao marcar recomendacao.");
    }
  };

  const buildStagedResponse = (docMarkdown: string, recs: ExtractedRec[]) => {
    const text = docMarkdown?.trim() ?? "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const paragraph =
      lines.find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("#") &&
          !line.startsWith("-") &&
          !line.startsWith("•") &&
          !/^\d+\./.test(line)
      ) ??
      recs[0]?.rationale ??
      recs[0]?.tatica ??
      "";

    const bullets = lines
      .filter((line) => line.startsWith("- ") || line.startsWith("• "))
      .map((line) => line.replace(/^[-•]\s*/, ""))
      .slice(0, 4);

    const nextStepsRaw = recs[0]?.proximos_passos ?? "";
    const nextStepsFromText = lines.find((line) => line.toLowerCase().includes("próximos passos"));
    const nextStepsSource =
      typeof nextStepsRaw === "string" && nextStepsRaw.trim()
        ? nextStepsRaw
        : nextStepsFromText ?? "";

    const nextSteps = nextStepsSource
      ? nextStepsSource
          .split(/\d+\.\s+|;\s+/)
          .map((step) => step.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

    return { paragraph, bullets, nextSteps };
  };

  const handleFinalizeConversation = async () => {
    if (!runId || conversationFinalizing) return;
    setConversationFinalizing(true);
    try {
      const transcript = messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => {
          if (msg.role === "assistant") {
            const extracted = extractDocAndRecs(msg.content);
            return `Assistente: ${extracted.docMarkdown || msg.content}`;
          }
          return `Usuario: ${msg.content}`;
        })
        .join("\n\n");
      const runIds = Array.from(
        new Set(
          messages
            .map((msg) => extractDocAndRecs(msg.content).runId)
            .filter((id) => Boolean(id))
        )
      ) as string[];
      await apiFinalizeConversation(runId, {
        document: transcript,
        runIds: runIds.length > 0 ? runIds : [runId],
        policySnapshot: {
          intent: conversation.intent,
          policy: conversation.policy,
        },
      });
      setCopyToast("Documento de conversa gerado no relatorio.");
    } catch {
      setCopyToast("Falha ao gerar documento.");
    } finally {
      setConversationFinalizing(false);
    }
  };

  const handleNewConversation = () => {
    stopStreaming();
    setMessages([]);
    setRunId(null);
    onRunIdChange?.(null);
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    setEvidenceEvent(null);
    setCopyToast("Nova conversa iniciada.");
    seenEventsRef.current = new Set();
    lastEventIdRef.current = null;
    runSummaryLoadedRef.current = null;
    runPromptRef.current = {};
    runIntentRef.current = {};
    runGuardrailRef.current = {};
    setLastRouteIntent(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(threadKey);
    }
  };

  const loadGovernanceReport = async () => {
    setGovernanceLoading(true);
    setGovernanceError(null);
    try {
      const response = await apiGetGovernanceReport({ limit: 200 });
      setGovernanceItems(response.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar relatorio.";
      setGovernanceError(message);
    } finally {
      setGovernanceLoading(false);
    }
  };

  const openGovernanceReport = async () => {
    setShowGovernanceReport(true);
    if (governanceItems.length > 0 || governanceLoading) return;
    await loadGovernanceReport();
  };

  const buildSupportCopy = (items: GovernanceItem[]) => {
    const lines = [
      session.userId ? `User: ${session.userId}` : "User: n/a",
      session.tenantId ? `Tenant: ${session.tenantId}` : "Tenant: n/a",
      effectiveWorkspaceId ? `Workspace: ${effectiveWorkspaceId}` : "Workspace: n/a",
      "",
      "Adotadas:",
    ];
    items
      .filter((item) => item.type === "run.recommendation.adopted")
      .forEach((item) => {
        const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- ${title} | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    lines.push("", "Aprovadas:");
    items
      .filter((item) => item.type === "run.approved")
      .forEach((item) => {
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- Execucao aprovada | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    lines.push("", "Conversas:");
    items
      .filter((item) => item.type === "conversation.finalized")
      .forEach((item) => {
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- Documento de conversa | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    return lines.join("\n");
  };

  const exportGovernanceReport = (items: GovernanceItem[]) => {
    const createdAt = new Date().toLocaleString("pt-BR");
    const adopted = items.filter((item) => item.type === "run.recommendation.adopted");
    const approved = items.filter((item) => item.type === "run.approved");
    const conversations = items.filter((item) => item.type === "conversation.finalized");
    const rows = (list: GovernanceItem[]) =>
      list
        .map((item) => {
          const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
          const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
          return `<tr><td>${title}</td><td>${item.runId}</td><td>${item.agent ?? "-"}</td><td>${hash}</td><td>${item.createdAt}</td></tr>`;
        })
        .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatorio de Governanca</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
    h1 { margin: 0 0 8px; }
    h2 { margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background: #f8fafc; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Relatorio de Governanca</h1>
  <div class="meta">Gerado em ${createdAt}</div>
  <div class="meta">User: ${session.userId ?? "n/a"} | Tenant: ${session.tenantId ?? "n/a"} | Workspace: ${effectiveWorkspaceId ?? "n/a"}</div>
  <h2>Recomendacoes adotadas (${adopted.length})</h2>
  <table>
    <thead><tr><th>Recomendacao</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(adopted)}</tbody>
  </table>
  <h2>Aprovacoes (${approved.length})</h2>
  <table>
    <thead><tr><th>Acao</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(approved)}</tbody>
  </table>
  <h2>Conversas (${conversations.length})</h2>
  <table>
    <thead><tr><th>Documento</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(conversations)}</tbody>
  </table>
</body>
</html>`;

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setCopyToast("Nao foi possivel abrir o relatorio.");
      return;
    }
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  useEffect(() => {
    onPolicyChange?.({
      intent: conversation.intent,
      policy: conversation.policy,
      status: conversation.status,
    });
  }, [conversation.intent, conversation.policy, conversation.status, onPolicyChange]);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const adoptedItems = governanceItems.filter((item) => item.type === "run.recommendation.adopted");
  const approvedItems = governanceItems.filter((item) => item.type === "run.approved");
  const conversationItems = governanceItems.filter((item) => item.type === "conversation.finalized");
  const activeAgentTitle = selectedAgentLabel ?? activeAgent?.title ?? "Curator";
  const quickReplies = useMemo(() => {
    if (!isHelpCenterMode) {
      return ["Mostre um exemplo pratico", "Explique integracao com BullMQ", "Quais riscos comuns?"];
    }
    if (proposalMode || lastRouteIntent === "proposal" || conversation.intentResult.intent === "proposal") {
      return [
        "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
        "Quero abrir proposta comercial.",
        "Quero agendar demonstração.",
        "Quero criar trial assistido.",
      ];
    }
    if (lastRouteIntent === "imob") {
      return [
        "Como funciona IMOB do início ao fim?",
        "Como usar o chat IMOB no dia a dia?",
        "Onde acompanho pipeline e etapas no IMOB?",
        "Quero instalar o IMOB no workspace.",
      ];
    }
    return [
      "Como criar um run no EIAH?",
      "Como funciona billing e invoices?",
      "Quais endpoints da API existem?",
      "Quais são os roteiros principais do playbook?",
    ];
  }, [conversation.intentResult.intent, isHelpCenterMode, proposalMode, lastRouteIntent]);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface/80 p-8 shadow-lg shadow-black/20">
      <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="absolute -right-10 top-40 h-72 w-72 rounded-full bg-white/5 blur-3xl" aria-hidden />

      <header className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Launcher</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">Chat Agent Launcher</h3>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:justify-end">
          {headerControls}
          {onPlaybookClick ? (
            <button
              type="button"
              onClick={onPlaybookClick}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-surface-strong/70 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-lg shadow-black/20 transition hover:border-accent/40"
            >
              Playbook
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 grid gap-6">
        <div className="flex h-full flex-col gap-4">
          <div className="glass-subtle flex-1 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Conversa ativa • {activeAgentTitle}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {copyToast ? (
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-emerald-200">
                      {copyToast}
                    </div>
                  ) : null}
                  {runId ? (
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Run: {runId}
                    </div>
                  ) : null}
                </div>
              </div>

            <div
              ref={scrollRef}
              className="no-scrollbar h-[360px] overflow-y-auto rounded-3xl border border-white/5 bg-black/20 p-4"
            >
              <div className="space-y-4">
                {messages
                  .filter(
                    (message) =>
                      message.role !== "system" || message.id.startsWith("system-identity")
                  )
                  .map((message) => {
                    if (message.role === "assistant") {
                      return (
                        <div
                          key={message.id}
                          className="flex w-full max-w-full animate-in flex-col gap-3 overflow-hidden fade-in slide-in-from-bottom-2"
                        >
                          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-xl backdrop-blur-md">
                            {(() => {
                              const { recs, docMarkdown, technicalRaw, runId: extractedRunId } =
                                extractDocAndRecs(message.content);
                              const displayRunId = extractedRunId || (message as any).runId || "";

                              return (
                                <div className="flex w-full flex-col gap-4 overflow-hidden">
                                  {recs.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                      {recs.map((rec, i) => (
                                        <button
                                          key={i}
                                          onClick={() => handleAdoptRec(displayRunId, rec)}
                                          className="flex flex-col rounded-xl border border-accent/20 bg-accent/5 p-3 text-left transition-all hover:bg-accent/10 active:scale-95"
                                        >
                                          <span className="text-[9px] font-bold uppercase tracking-tighter text-accent">
                                            Sugerido
                                          </span>
                                          <span className="line-clamp-2 text-sm font-semibold text-foreground">
                                            {rec.tatica ?? rec.key ?? "Recomendacao"}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}

                                  <div className="prose prose-invert prose-sm max-w-full break-words leading-relaxed prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/50">
                                    <ReactMarkdown>
                                      {(() => {
                                        if (isHelpCenterMode) {
                                          const helpContent =
                                            (docMarkdown ?? "").trim() ||
                                            sanitizeAssistantContent(message.content).trim() ||
                                            technicalRaw.trim() ||
                                            "Ainda não encontrei conteúdo documental para essa pergunta.";
                                          return helpContent;
                                        }
                                        const staged = buildStagedResponse(docMarkdown ?? "", recs);
                                        const paragraph = staged.paragraph || "Resposta disponivel sem resumo estruturado.";
                                        const bulletsBlock =
                                          staged.bullets.length > 0
                                            ? `\n\n**Pontos-chave**\n${staged.bullets.map((b) => `- ${b}`).join("\n")}`
                                            : "";
                                        const nextStepsBlock =
                                          staged.nextSteps.length > 0
                                            ? `\n\n**Próximos passos**\n${staged.nextSteps.map((step) => `- ${step}`).join("\n")}`
                                            : "";
                                        return `${paragraph}${bulletsBlock}${nextStepsBlock}`;
                                      })()}
                                    </ReactMarkdown>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>Quer aprofundar algo?</span>
                                    <div className="flex flex-wrap gap-2">
                                      {quickReplies.map((reply) => (
                                        <button
                                          key={reply}
                                          type="button"
                                          onClick={() => {
                                            setInput(reply);
                                          }}
                                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/40 hover:text-accent"
                                        >
                                          {reply}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {null}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "ml-auto bg-accent/20 text-foreground"
                            : "mx-auto bg-white/10 text-muted-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-line">{message.content}</p>
                        {message.role === "system" && showIdentityDetails ? (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            {session.userId ? `User ID: ${session.userId}` : null}
                            {session.userId && session.tenantId ? " • " : null}
                            {session.tenantId ? `Company ID: ${session.tenantId}` : null}
                          </div>
                        ) : null}
                        {message.status === "streaming" ? (
                          <span className="mt-2 inline-block text-[10px] uppercase tracking-[0.2em] text-accent/70">
                            streaming...
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                {isStreaming ? (
                  <div className="max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                    Pensando...
                  </div>
                ) : null}
              </div>
            </div>

          </div>

	          <div className="glass-subtle flex items-end gap-3 p-4">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Descreva o objetivo, contexto e restricoes..."
              className="min-h-[64px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
	            <button
	              type="button"
	              onClick={handleNewConversation}
	              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/40"
	            >
	              Nova conversa
	            </button>
	            {conversation.policy?.requiresConfirmation && runId ? (
	              <button
                type="button"
                onClick={handleApprove}
                className="rounded-full border border-accent/60 bg-accent/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:border-accent hover:bg-accent/30"
              >
                Aprovar
              </button>
            ) : null}
	            <button
	              type="button"
	              onClick={handleSend}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!input.trim() || isStreaming}
            >
              Enviar
            </button>
          </div>
        </div>

      </div>

      {showGovernanceReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-surface/95 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Governanca</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Relatorio de Governanca</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  User: {session.userId ?? "n/a"} • Tenant: {session.tenantId ?? "n/a"} • Workspace: {effectiveWorkspaceId ?? "n/a"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em]">
                <button
                  type="button"
                  onClick={() => {
                    const details = buildSupportCopy(governanceItems);
                    navigator.clipboard
                      .writeText(details)
                      .then(() => setCopyToast("IDs completos copiados para suporte."))
                      .catch(() => setCopyToast("Nao foi possivel copiar."));
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-foreground transition hover:border-accent/40"
                >
                  Copiar para suporte
                </button>
                <button
                  type="button"
                  onClick={() => exportGovernanceReport(governanceItems)}
                  className="rounded-full border border-accent/60 bg-accent/20 px-3 py-1.5 font-semibold text-accent transition hover:border-accent hover:bg-accent/30"
                >
                  Exportar PDF de Auditoria
                </button>
                <button
                  type="button"
                  onClick={() => setShowGovernanceReport(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-foreground transition hover:border-accent/40"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              {governanceLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                  Carregando relatorio...
                </div>
              ) : governanceError ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {governanceError}
                </div>
              ) : (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <section className="space-y-3">
                      <header className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Recomendacoes adotadas</h4>
                        <span className="pill text-[11px] text-muted-foreground">{adoptedItems.length}</span>
                      </header>
                      {adoptedItems.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                          Nenhuma recomendacao adotada registrada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {adoptedItems.map((item) => {
                            const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
                            const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                            return (
                              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
                                <p className="text-sm font-semibold text-foreground">{title}</p>
                                <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                                <p className="mt-1">Ledger Hash: {hash}</p>
                                <p className="mt-1">Timestamp: {item.createdAt}</p>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <header className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Acoes aprovadas</h4>
                        <span className="pill text-[11px] text-muted-foreground">{approvedItems.length}</span>
                      </header>
                      {approvedItems.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                          Nenhuma aprovacao registrada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {approvedItems.map((item) => {
                            const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                            return (
                              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
                                <p className="text-sm font-semibold text-foreground">Execucao aprovada</p>
                                <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                                <p className="mt-1">Ledger Hash: {hash}</p>
                                <p className="mt-1">Timestamp: {item.createdAt}</p>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="mt-6 space-y-3">
                    <header className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">Conversas finalizadas</h4>
                      <span className="pill text-[11px] text-muted-foreground">{conversationItems.length}</span>
                    </header>
                    {conversationItems.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                        Nenhuma conversa finalizada registrada.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {conversationItems.map((item) => {
                          const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                          const document = item.payload.document ?? "";
                          return (
                            <article
                              key={item.id}
                              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground"
                            >
                              <p className="text-sm font-semibold text-foreground">Documento de conversa</p>
                              <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                              <p className="mt-1">Ledger Hash: {hash}</p>
                              <p className="mt-1">Timestamp: {item.createdAt}</p>
                              {document ? (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-muted-foreground/60">
                                    Ver documento
                                  </summary>
                                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] text-emerald-200/80">
                                    {document}
                                  </pre>
                                </details>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {evidenceEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Evidência</p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">Registro no Ledger</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceEvent(null)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Evidência ID: {evidenceEvent.id}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Evento: {evidenceEvent.type}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Timestamp: {new Date(evidenceEvent.createdAt).toLocaleString("pt-BR")}
              </div>
              <p className="text-[11px]">
                Esta evidência comprova que a aprovação humana foi registrada e vinculada ao ledger de auditoria.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
